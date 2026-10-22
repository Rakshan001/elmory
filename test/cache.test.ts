import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Cache, CacheBusyError, type RecordRow, defaultCacheDir } from '../src/cache.js';

const { DatabaseSync: Database } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCK_CHILD = path.join(HERE, 'helpers', 'lock-child.mjs');

const dirs: string[] = [];
const caches: Cache[] = [];

function tmp(): string {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'elmory-cache-')));
  dirs.push(d);
  return d;
}

function open(dir: string): Cache {
  const c = Cache.open('p0123456789abcdef', dir);
  caches.push(c);
  return c;
}

afterEach(() => {
  for (const c of caches.splice(0)) c.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function row(id: string, over: Partial<RecordRow> = {}): RecordRow {
  return {
    id,
    area: 'pending',
    type: 'memory/fact',
    title: `title of ${id}`,
    body: `body of ${id}`,
    key: null,
    tag: null,
    observer: 'tester',
    recorded: '2026-10-22T00:00:00Z',
    supersedes: [],
    cites: [],
    sources: [],
    paths: [],
    candidate: null,
    flagged: false,
    text: `---\nid: ${id}\n---\n`,
    ...over,
  };
}

function tables(file: string): string[] {
  const db: DatabaseSync = new Database(file, { readOnly: true });
  try {
    return db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table') ORDER BY name")
      .all()
      .map((r) => String(r.name));
  } finally {
    db.close();
  }
}

function count(file: string, needle: string): number {
  if (!fs.existsSync(file)) return 0;
  const buf = fs.readFileSync(file);
  let n = 0;
  let i = buf.indexOf(needle);
  while (i !== -1) {
    n++;
    i = buf.indexOf(needle, i + 1);
  }
  return n;
}

interface ChildResult {
  code: number | null;
  out: string;
}

function runChild(dir: string, holdMs: number, name: string, env: Record<string, string> = {}): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--no-warnings', LOCK_CHILD, dir, String(holdMs), name], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    let out = '';
    let err = '';
    p.stdout.on('data', (d: Buffer) => (out += d.toString()));
    p.stderr.on('data', (d: Buffer) => (err += d.toString()));
    p.on('error', reject);
    p.on('exit', (code) => resolve({ code, out: (out + err).trim() }));
  });
}

describe('defaultCacheDir', () => {
  it('honours XDG_CACHE_HOME, else the platform default', () => {
    const saved = process.env.XDG_CACHE_HOME;
    try {
      process.env.XDG_CACHE_HOME = '/x/cache';
      expect(defaultCacheDir('abc')).toBe(path.join('/x/cache', 'elmory', 'abc'));
      delete process.env.XDG_CACHE_HOME;
      const expected =
        process.platform === 'darwin'
          ? path.join(os.homedir(), 'Library', 'Caches', 'elmory', 'abc')
          : path.join(os.homedir(), '.cache', 'elmory', 'abc');
      expect(defaultCacheDir('abc')).toBe(expected);
      expect(() => defaultCacheDir('../evil')).toThrow();
    } finally {
      if (saved === undefined) delete process.env.XDG_CACHE_HOME;
      else process.env.XDG_CACHE_HOME = saved;
    }
  });
});

describe('Cache', () => {
  it('open creates lock.db and cache-1.db with the schema', () => {
    const dir = path.join(tmp(), 'nested', 'dir');
    const c = open(dir);
    expect(c.dir).toBe(dir);
    expect(c.generation).toBe(1);
    expect(fs.existsSync(path.join(dir, 'lock.db'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'cache-1.db'))).toBe(true);
    const t = tables(path.join(dir, 'cache-1.db'));
    for (const name of ['records', 'records_fts', 'evidence', 'stat', 'renames', 'verify_state', 'meta']) {
      expect(t).toContain(name);
    }
    expect(tables(path.join(dir, 'lock.db'))).toEqual(expect.arrayContaining(['gen', 'old']));
    // a second open on the same dir shares the generation
    expect(open(dir).generation).toBe(1);
  });

  it('upsert, get, all, knownIds, delete round-trip', () => {
    const c = open(tmp());
    const a = row('f_a', {
      key: 'auth.token',
      tag: 'decision',
      supersedes: ['f_old'],
      cites: ['f_c1', 'f_c2'],
      sources: [
        { resource: 'src/a.ts', quote: 'q1', anchor: 'a1', tokens: 17, commit: 'c0' },
        { resource: 'src/b.ts', legacyFile: '0123456789ab' },
      ],
      paths: ['src/a.ts', 'src/b.ts'],
      candidate: 'edited',
      flagged: true,
    });
    c.upsertRecord(a);
    c.upsertRecord(row('f_b'));
    expect(c.getRecord('f_a')).toEqual(a);
    expect(c.getRecord('f_missing')).toBeNull();
    expect(c.allRecords().map((r) => r.id).sort()).toEqual(['f_a', 'f_b']);
    expect(c.knownIds()).toEqual(new Set(['f_a', 'f_b']));

    // upsert replaces, and the FTS follows the new values
    c.upsertRecord({ ...a, title: 'renamed title', body: 'brandnewword' });
    expect(c.getRecord('f_a')?.body).toBe('brandnewword');
    expect(c.search('brandnewword', { limit: 10, offset: 0 }).map((r) => r.id)).toEqual(['f_a']);
    expect(c.search('q1', { limit: 10, offset: 0 })).toEqual([]);

    expect(c.deleteRecord('f_a')).toEqual({ title: 'renamed title', body: 'brandnewword' });
    expect(c.deleteRecord('f_a')).toBeNull();
    expect(c.getRecord('f_a')).toBeNull();
    expect(c.knownIds()).toEqual(new Set(['f_b']));
    expect(c.search('brandnewword', { limit: 10, offset: 0 })).toEqual([]);
  });

  it('escaped query', () => {
    const c = open(tmp());
    c.upsertRecord(row('f_tok', { body: 'call checkToken before the handler' }));
    c.upsertRecord(row('f_other', { body: 'nothing to see' }));
    let hits: { id: string; score: number }[] = [];
    expect(() => {
      hits = c.search('checkToken() middleware', { limit: 10, offset: 0 });
    }).not.toThrow();
    expect(hits.map((h) => h.id)).toEqual(['f_tok']);
    expect(Number.isFinite(hits[0]?.score)).toBe(true);
    for (const q of ['', '   ', '"', 'a"b OR NOT', 'col:x', '* ^ -', 'AND']) {
      expect(() => c.search(q, { limit: 10, offset: 0 })).not.toThrow();
    }
    expect(c.search('   ', { limit: 10, offset: 0 })).toEqual([]);
  });

  it('search excludes ids in excludeIds and pages with offset', () => {
    const c = open(tmp());
    for (let i = 0; i < 6; i++) c.upsertRecord(row(`f_${i}`, { body: `shared term ${'pad '.repeat(i)}` }));
    // title weight beats body weight
    c.upsertRecord(row('f_title', { title: 'shared', body: 'x' }));
    const all = c.search('shared', { limit: 50, offset: 0 });
    expect(all).toHaveLength(7);
    expect(all[0]?.id).toBe('f_title');
    for (let i = 1; i < all.length; i++) expect(all[i - 1]!.score).toBeGreaterThanOrEqual(all[i]!.score);

    const page1 = c.search('shared', { limit: 3, offset: 0 });
    const page2 = c.search('shared', { limit: 3, offset: 3 });
    const page3 = c.search('shared', { limit: 3, offset: 6 });
    expect([...page1, ...page2, ...page3].map((r) => r.id)).toEqual(all.map((r) => r.id));

    const excluded = new Set(['f_title', 'f_0', 'f_1']);
    const rest = c.search('shared', { limit: 2, offset: 0, excludeIds: excluded });
    const rest2 = c.search('shared', { limit: 2, offset: 2, excludeIds: excluded });
    const ids = [...rest, ...rest2].map((r) => r.id);
    expect(ids).toHaveLength(4);
    expect(ids.some((id) => excluded.has(id))).toBe(false);
    expect(new Set(ids)).toEqual(new Set(['f_2', 'f_3', 'f_4', 'f_5']));
  });

  it('evidence, stat, rename, verify_state, meta round-trip', () => {
    const c = open(tmp());
    expect(c.getEvidence('cid', 'qh')).toBeNull();
    c.putEvidence('cid', 'qh', 'found');
    c.putEvidence('cid', 'qh2', 'not-unique');
    expect(c.getEvidence('cid', 'qh')).toBe('found');
    c.putEvidence('cid', 'qh', 'not-found');
    expect(c.getEvidence('cid', 'qh')).toBe('not-found');
    expect(c.getEvidence('cid', 'qh2')).toBe('not-unique');

    const st = { mtimeMs: Date.now() - 60_000, ctimeMs: Date.now() - 60_000, size: 42, ino: 1234567 };
    expect(c.statLookup('/wt', 'src/a.ts', st)).toBeNull();
    c.statPut('/wt', 'src/a.ts', st, 'content-1');
    expect(c.statLookup('/wt', 'src/a.ts', st)).toBe('content-1');
    expect(c.statLookup('/wt2', 'src/a.ts', st)).toBeNull();
    expect(c.statLookup('/wt', 'src/a.ts', { ...st, size: 43 })).toBeNull();
    expect(c.statLookup('/wt', 'src/a.ts', { ...st, ino: 7 })).toBeNull();
    expect(c.statLookup('/wt', 'src/a.ts', { ...st, ctimeMs: st.ctimeMs + 1 })).toBeNull();

    expect(c.getRename('c1', 't1')).toBeNull();
    const map = { 'a.ts': { status: 'renamed' as const, newPath: 'b.ts' }, 'c.ts': { status: 'deleted' as const } };
    c.putRename('c1', 't1', map);
    expect(c.getRename('c1', 't1')).toEqual(map);
    expect(c.getRename('c1', 't2')).toBeNull();

    expect(c.getVerifyState('/wt', 'f_a')).toBeNull();
    c.putVerifyState('/wt', 'f_a', 'active');
    c.putVerifyState('/wt', 'f_a', 'suspect');
    expect(c.getVerifyState('/wt', 'f_a')).toBe('suspect');
    expect(c.getVerifyState('/other', 'f_a')).toBeNull();

    expect(c.getMeta('k')).toBeNull();
    c.setMeta('k', 'v1');
    c.setMeta('k', 'v2');
    expect(c.getMeta('k')).toBe('v2');
  });

  it('racy stat', () => {
    const c = open(tmp());
    const fresh = { mtimeMs: Date.now() - 500, ctimeMs: Date.now() - 500, size: 1, ino: 1 };
    c.statPut('/wt', 'racy.ts', fresh, 'cid-racy');
    expect(c.statLookup('/wt', 'racy.ts', fresh)).toBeNull();
    const old = { mtimeMs: Date.now() - 5_000, ctimeMs: Date.now() - 5_000, size: 1, ino: 2 };
    c.statPut('/wt', 'old.ts', old, 'cid-old');
    expect(c.statLookup('/wt', 'old.ts', old)).toBe('cid-old');
  });

  it('write lock: 10 child processes, one 1500 ms holder', async () => {
    const dir = tmp();
    open(dir); // create the cache before the race
    const holder = runChild(dir, 1500, 'holder');
    await new Promise((r) => setTimeout(r, 200));
    const others = Array.from({ length: 9 }, (_, i) => runChild(dir, 0, `w${i}`, { ELMORY_TEST_BUSY_MS: '500' }));
    const results = await Promise.all([holder, ...others]);
    for (const r of results) expect(r.code, r.out).toBe(0);
    expect(results[0]?.out).toBe('OK');
    for (const r of results.slice(1)) expect(['OK', 'BUSY']).toContain(r.out);

    // every child that held the lock recorded its interval; no two overlap
    const c = open(dir);
    const names = ['holder', ...Array.from({ length: 9 }, (_, i) => `w${i}`)];
    const intervals: [number, number][] = [];
    results.forEach((r, i) => {
      const start = c.getMeta(`lock:${names[i]}:start`);
      const end = c.getMeta(`lock:${names[i]}:end`);
      if (r.out === 'OK') {
        expect(start).not.toBeNull();
        expect(end).not.toBeNull();
        intervals.push([Number(start), Number(end)]);
      } else {
        expect(start).toBeNull();
      }
    });
    expect(intervals.length).toBeGreaterThanOrEqual(1);
    intervals.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]![0]).toBeGreaterThanOrEqual(intervals[i - 1]![1]);
    const [hs, he] = [Number(c.getMeta('lock:holder:start')), Number(c.getMeta('lock:holder:end'))];
    expect(he - hs).toBeGreaterThanOrEqual(1400);
  });

  it('withWriteLock throws CacheBusyError when another holder outlasts the busy timeout', async () => {
    const dir = tmp();
    open(dir);
    const holder = runChild(dir, 1200, 'holder');
    await new Promise((r) => setTimeout(r, 300));
    const saved = process.env.ELMORY_TEST_BUSY_MS;
    process.env.ELMORY_TEST_BUSY_MS = '100';
    try {
      const c = open(dir);
      let ran = false;
      expect(() => c.withWriteLock(() => (ran = true))).toThrow(CacheBusyError);
      expect(ran).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.ELMORY_TEST_BUSY_MS;
      else process.env.ELMORY_TEST_BUSY_MS = saved;
    }
    expect((await holder).out).toBe('OK');
  });

  it('withWriteLock rolls back the lock and rethrows on error, and nests', () => {
    const c = open(tmp());
    expect(() =>
      c.withWriteLock(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    // the lock was released: taking it again works, and nesting does not deadlock
    expect(c.withWriteLock(() => c.withWriteLock(() => 7))).toBe(7);
  });

  it('rebuild while reading', () => {
    const dir = tmp();
    const a = open(dir);
    const b = open(dir);
    b.withWriteLock(() => b.upsertRecord(row('f_x', { body: 'OLD' })));
    expect(a.getRecord('f_x')?.body).toBe('OLD');

    b.rebuild((fresh) => {
      expect(fresh.generation).toBe(2);
      // the old generation is still what everyone else sees while fill runs
      expect(a.getRecord('f_x')?.body).toBe('OLD');
      fresh.upsertRecord(row('f_x', { body: 'NEW' }));
      fresh.upsertRecord(row('f_y', { body: 'NEW too' }));
    });
    expect(b.generation).toBe(2);

    const lock: DatabaseSync = new Database(path.join(dir, 'lock.db'), { readOnly: true });
    expect(lock.prepare("SELECT n FROM gen WHERE k='generation'").get()?.n).toBe(2);
    lock.close();

    expect(a.getRecord('f_x')?.body).toBe('NEW');
    expect(a.generation).toBe(2);
    expect(a.allRecords().map((r) => r.id).sort()).toEqual(['f_x', 'f_y']);
    expect(a.search('NEW', { limit: 10, offset: 0 })).toHaveLength(2);

    expect(fs.existsSync(path.join(dir, 'cache-1.db'))).toBe(true);
    expect(b.sweepOld()).toEqual([]); // younger than 24 h
    const removed = b.sweepOld(0);
    expect(removed).toContain(path.join(dir, 'cache-1.db'));
    expect(fs.existsSync(path.join(dir, 'cache-1.db'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'cache-2.db'))).toBe(true);
    expect(a.getRecord('f_x')?.body).toBe('NEW');
  });

  it('rebuild that throws keeps the old generation and leaves no new file', () => {
    const dir = tmp();
    const c = open(dir);
    c.upsertRecord(row('f_x', { body: 'OLD' }));
    expect(() =>
      c.rebuild((fresh) => {
        fresh.upsertRecord(row('f_x', { body: 'NEW' }));
        throw new Error('fill failed');
      }),
    ).toThrow('fill failed');
    expect(c.generation).toBe(1);
    expect(c.getRecord('f_x')?.body).toBe('OLD');
    expect(fs.existsSync(path.join(dir, 'cache-2.db'))).toBe(false);
  });

  it('rebuild never reuses a db file left behind by a crashed rebuild', () => {
    const dir = tmp();
    const c = open(dir);
    const stray: DatabaseSync = new Database(path.join(dir, 'cache-2.db'));
    stray.exec("CREATE TABLE junk(x); INSERT INTO junk VALUES('stale')");
    stray.close();
    c.rebuild((fresh) => fresh.upsertRecord(row('f_new')));
    expect(c.generation).toBe(3);
    expect(c.getRecord('f_new')).not.toBeNull();
    expect(tables(path.join(dir, 'cache-2.db'))).toEqual(['junk']);
  });

  it('compact returns done when no reader holds the wal', () => {
    const c = open(tmp());
    c.upsertRecord(row('f_a'));
    expect(c.compact()).toBe('done');
    expect(c.getMeta('compaction')).toBe('done');
  });

  it('compact returns pending while another connection holds a read snapshot', () => {
    const dir = tmp();
    const c = open(dir);
    c.upsertRecord(row('f_a'));
    const reader: DatabaseSync = new Database(path.join(dir, 'cache-1.db'));
    try {
      reader.exec('BEGIN');
      reader.prepare('SELECT count(*) AS n FROM records').get();
      c.upsertRecord(row('f_b'));
      expect(c.compact()).toBe('pending');
      expect(c.getMeta('compaction')).toBe('pending');
      reader.exec('COMMIT');
    } finally {
      reader.close();
    }
    expect(c.compact()).toBe('done');
  });

  it('FTS secure-delete leaves no marker bytes', () => {
    const dir = tmp();
    const c = open(dir);
    const db = path.join(dir, 'cache-1.db');
    for (let i = 0; i < 200; i++) {
      c.upsertRecord(row(`f_${i}`, { body: `filler body ${i} ${i % 10 === 0 ? 'zqxk7mapple' : ''}` }));
    }
    c.upsertRecord(row('f_secret', { title: 'secret zqxk7marker', body: 'the forgotten zqxk7marker body' }));
    expect(c.compact()).toBe('done'); // checkpoint: the marker is now in the main db file
    expect(count(db, 'zqxk7marker')).toBeGreaterThan(0);
    expect(c.deleteRecord('f_secret')).toEqual({ title: 'secret zqxk7marker', body: 'the forgotten zqxk7marker body' });
    expect(c.compact()).toBe('done');
    expect(count(db, 'zqxk7marker')).toBe(0);
    expect(count(`${db}-wal`, 'zqxk7marker')).toBe(0);
    expect(c.search('zqxk7mapple', { limit: 50, offset: 0 })).toHaveLength(20);
  });
});
