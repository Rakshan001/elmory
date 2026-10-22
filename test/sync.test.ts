// The read-side load (I5): a no-op sync takes no lock and reads no record file; a busy lock is a
// warning for readers, never an error; verify re-reads every file.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Elmory, INDEX_BUSY } from '../src/api.js';
import { type ElmoryRecord, recordId, serialize } from '../src/record.js';
import { cleanupDirs, factInput, repo } from './helpers/children.js';

const LOCK_CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'helpers', 'lock-child.mjs');
const opened: Elmory[] = [];

afterEach(() => {
  for (const e of opened.splice(0)) e.close();
  cleanupDirs();
});

async function open(worktree: string, cacheDir: string): Promise<Elmory> {
  const e = await Elmory.open({ worktree, cacheDir, observer: 'agent:test' });
  opened.push(e);
  return e;
}

/** Push every directory and file the sync fingerprint stats out of the racy window. */
function settle(e: Elmory): void {
  const past = new Date(Date.now() - 60_000);
  const l = e.layout;
  for (const p of [l.facts, l.tombstones, l.pending, l.local, l.localTombstones, l.trust]) {
    if (fs.existsSync(p)) fs.utimesSync(p, past, past);
  }
}

function pulled(e: Elmory, title: string): string {
  const r: ElmoryRecord = {
    type: 'memory/note',
    title,
    version: 1,
    recorded: '2026-10-22T10:00:00.000Z',
    observer: 'agent:someone-else',
    supersedes: [],
    cites: [],
    sources: [],
    body: `${title}: a note that arrived with a pull.`,
  };
  const id = recordId(r);
  fs.mkdirSync(e.layout.facts, { recursive: true });
  fs.writeFileSync(path.join(e.layout.facts, `${id}.md`), serialize(r));
  return id;
}

/** Hold the cache write lock from another process for holdMs; resolves once it is held. */
async function holdLock(cacheDir: string, holdMs: number): Promise<{ released: Promise<void> }> {
  const p = spawn(process.execPath, ['--no-warnings', LOCK_CHILD, cacheDir, String(holdMs), 'holder'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const released = new Promise<void>((resolve) => p.on('close', () => resolve()));
  await new Promise<void>((resolve) => p.stdout.on('data', (d: Buffer) => String(d).includes('READY') && resolve()));
  return { released };
}

describe('sync (I5)', () => {
  it('an unchanged store: no lock, no file read; a changed one is indexed', async () => {
    const { wt, cacheDir } = await repo();
    const e = await open(wt, cacheDir);
    await e.remember(factInput('Token check'));
    settle(e);
    await e.sync();

    let reads = 0;
    let locks = 0;
    const listRecords = e.store.listRecords.bind(e.store);
    const withWriteLock = e.cache.withWriteLock.bind(e.cache);
    const tryWithWriteLock = e.cache.tryWithWriteLock.bind(e.cache);
    e.store.listRecords = () => (reads++, listRecords());
    e.cache.withWriteLock = <T>(fn: () => T): T => (locks++, withWriteLock(fn));
    e.cache.tryWithWriteLock = <T>(fn: () => T): T | null => (locks++, tryWithWriteLock(fn));
    expect(await e.sync()).toEqual([]);
    expect(await e.recall({ query: 'checkToken' })).toMatchObject({ abstain: false, warnings: [] });
    expect([reads, locks]).toEqual([0, 0]);

    const id = pulled(e, 'Arrived');
    await e.sync();
    expect([reads, locks]).toEqual([1, 1]);
    expect(e.cache.getRecord(id)).not.toBeNull();
  }, 30000);

  it('readers never throw CacheBusyError: a busy lock is a warning, an unchanged store needs no lock', async () => {
    const { wt, cacheDir } = await repo();
    const e = await open(wt, cacheDir);
    await e.remember(factInput('Token check'));
    settle(e);
    await e.sync();
    const saved = process.env.ELMORY_TEST_BUSY_MS;
    process.env.ELMORY_TEST_BUSY_MS = '200';
    let reader: Elmory;
    try {
      reader = await open(wt, cacheDir);
    } finally {
      if (saved === undefined) delete process.env.ELMORY_TEST_BUSY_MS;
      else process.env.ELMORY_TEST_BUSY_MS = saved;
    }

    const { released } = await holdLock(cacheDir, 4000);
    const t0 = Date.now();
    // Unchanged: served at once, no warning.
    expect(await reader.recall({ query: 'checkToken' })).toMatchObject({ abstain: false, warnings: [] });
    // Changed while the lock is held: the reads go ahead on the cache as it is, and say so.
    pulled(e, 'Arrived while busy');
    expect(await reader.recall({ query: 'checkToken' })).toMatchObject({ abstain: false, warnings: [INDEX_BUSY] });
    expect(await reader.about('src/auth.ts')).toMatchObject({ warnings: [INDEX_BUSY] });
    expect(await reader.history('nothing.here')).toEqual({ entries: [], warnings: [INDEX_BUSY] });
    expect((await reader.verify()).warnings).toEqual([INDEX_BUSY]);
    expect(Date.now() - t0).toBeLessThan(4000); // all of it while the lock was held
    await released;
    expect((await reader.recall({ query: 'checkToken' })).warnings).toEqual([]);
  }, 30000);

  it('a held lock never makes a reader wait the busy timeout: sync uses tryWithWriteLock (N1)', async () => {
    const { wt, cacheDir } = await repo();
    const e = await open(wt, cacheDir); // the default 5 s busy timeout
    await e.remember(factInput('Token check'));
    const { released } = await holdLock(cacheDir, 3000);
    pulled(e, 'Arrived while busy');
    const t0 = Date.now();
    expect(await e.sync()).toEqual([INDEX_BUSY]);
    expect(await e.recall({ query: 'checkToken' })).toMatchObject({ abstain: false, warnings: [INDEX_BUSY] });
    expect(Date.now() - t0).toBeLessThan(1000);
    await released;
    expect(await e.sync()).toEqual([]);
  }, 30000);

  it('verify re-reads every file: a record edited in place is caught', async () => {
    const { wt, cacheDir } = await repo();
    const e = await open(wt, cacheDir);
    const { id } = await e.remember(factInput('Will be edited in place'));
    e.publish([id]);
    settle(e);
    await e.sync();
    fs.appendFileSync(path.join(e.layout.facts, `${id}.md`), 'x'); // in place: no directory change
    settle(e);
    await e.verify();
    expect(e.cache.getRecord(id)?.candidate).toBe('edited');
  }, 30000);
});
