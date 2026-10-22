import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Elmory } from '../src/api.js';
import { cleanupDirs, factInput, rememberChild, repo } from './helpers/children.js';

const opened: Elmory[] = [];

afterEach(() => {
  for (const e of opened.splice(0)) e.close();
  cleanupDirs();
});

/** Every `.tmp-*` file under dir, at any depth. */
function tmpFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((rel) => path.basename(rel).startsWith('.tmp-'));
}

/** Crash a child right after `step` of the locked write; return the store reopened normally. */
async function crashAt(step: 'ledger' | 'rename' | 'index'): Promise<{ e: Elmory; id: string; wt: string }> {
  const { wt, cacheDir } = await repo();
  const res = await rememberChild(wt, cacheDir, factInput(`crash at ${step}`), { env: { ELMORY_CRASH_AT: step } }).done;
  expect(res, res.err).toMatchObject({ code: 99, out: '' });
  const e = await Elmory.open({ worktree: wt, cacheDir, observer: 'agent:test' });
  opened.push(e);
  const written = fs
    .readFileSync(e.layout.trust, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('written '))
    .map((l) => l.slice('written '.length));
  expect(written).toHaveLength(1);
  // No temp file is left in the worktree's .elmory or the git common dir's elmory areas.
  expect(tmpFiles(path.join(wt, '.elmory'))).toEqual([]);
  expect(tmpFiles(path.dirname(e.layout.pending))).toEqual([]);
  return { e, id: written[0] as string, wt };
}

describe('crash at each step of the write', () => {
  it('after the ledger: an id with no file, nothing to review', async () => {
    const { e, id } = await crashAt('ledger');
    expect(e.store.readRecord(id)).toBeNull();
    expect(e.store.listRecords()).toEqual([]);
    expect(await e.review()).toEqual([]);
    expect(e.cache.getRecord(id)).toBeNull();
  }, 30000);

  it('after the rename: the record exists and is active on the next sync', async () => {
    const { e, id } = await crashAt('rename');
    expect(e.store.readRecord(id)?.area).toBe('pending');
    await e.sync();
    expect(e.cache.getRecord(id)?.candidate).toBeNull();
    expect((await (await e.deriver()).state(id)).state).toBe('active');
    expect(await e.review()).toEqual([]);
  }, 30000);

  it('after the index: the record exists and is active on the next sync', async () => {
    const { e, id } = await crashAt('index');
    expect(e.store.readRecord(id)?.area).toBe('pending');
    await e.sync();
    expect(e.cache.getRecord(id)?.candidate).toBeNull();
    expect((await (await e.deriver()).state(id)).state).toBe('active');
    expect(await e.review()).toEqual([]);
  }, 30000);
});
