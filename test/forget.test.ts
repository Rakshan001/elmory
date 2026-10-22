import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { Elmory, RefusedError } from '../src/api.js';
import { defaultExec } from '../src/exec.js';
import { type ElmoryRecord, FORMAT_VERSION, recordId } from '../src/record.js';

const dirs: string[] = [];
const opened: Elmory[] = [];
const NOW = '2026-10-22T10:00:00.000Z';
const FILE = 'src/auth.ts';
const LINE_A = 'export function checkToken(req: Request, tokenStore: TokenStore): boolean {';
const SOURCE = [LINE_A, '  return tokenStore.has(req.headers.authorization);', '}', ''].join('\n');

function tmp(): string {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'elmory-forget-')));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const e of opened.splice(0)) e.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const res = await defaultExec('git', args, { cwd });
  if (res.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout;
}

async function repo(): Promise<string> {
  const wt = path.join(tmp(), 'repo');
  fs.mkdirSync(path.join(wt, 'src'), { recursive: true });
  await git(wt, 'init', '-q');
  await git(wt, 'config', 'user.name', 'Tester');
  await git(wt, 'config', 'user.email', 'tester@example.com');
  await git(wt, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(wt, FILE), SOURCE);
  await git(wt, 'add', '-A');
  await git(wt, 'commit', '-q', '--no-verify', '-m', 'init');
  return wt;
}

async function open(worktree: string, cacheDir: string): Promise<Elmory> {
  const e = await Elmory.open({ worktree, cacheDir, now: () => NOW, observer: 'agent:test' });
  opened.push(e);
  return e;
}

async function setup(): Promise<{ wt: string; cacheDir: string; e: Elmory }> {
  const wt = await repo();
  const cacheDir = tmp();
  return { wt, cacheDir, e: await open(wt, cacheDir) };
}

const fact = (title: string, extra: { supersedes?: string[]; cites?: string[]; key?: string } = {}) => ({
  title,
  text: `${title}: every request passes through checkToken.`,
  quotes: [{ file: FILE, text: LINE_A }],
  ...extra,
});

function exists(p: string): boolean {
  return fs.existsSync(p);
}

/** Every regular file under `dir`, recursively. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  if (!exists(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...filesUnder(p));
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

/** How many times `needle` occurs in the bytes of every file under `roots`. */
function occurrences(roots: string[], needle: string): number {
  const n = Buffer.from(needle);
  let count = 0;
  for (const f of roots.flatMap(filesUnder)) {
    const buf = fs.readFileSync(f);
    for (let i = buf.indexOf(n); i !== -1; i = buf.indexOf(n, i + 1)) count++;
  }
  return count;
}

describe('forget', () => {
  it('forget by id writes tombstones in the common dir and the worktree for a published record', async () => {
    const { e } = await setup();
    const published = (await e.remember(fact('Published token check'))).id;
    const pending = (await e.note({ title: 'A pending note', text: 'Release notes go out on Fridays.' })).id;
    e.publish([published]);

    const r = await e.forget({ ids: [published, pending] });
    expect(r.deleted).toEqual([published, pending]);
    expect(r.cascaded).toEqual([]);
    expect(r.compaction).toBe('done');

    const l = e.layout;
    expect(fs.readFileSync(path.join(l.localTombstones, published), 'utf8')).toBe('supersedes: []\n');
    expect(exists(path.join(l.tombstones, published))).toBe(true);
    expect(exists(path.join(l.localTombstones, pending))).toBe(true);
    expect(exists(path.join(l.tombstones, pending))).toBe(false); // never published: nothing to commit
    expect(exists(path.join(l.facts, `${published}.md`))).toBe(false);
    expect(exists(path.join(l.pending, `${pending}.md`))).toBe(false);
    expect(e.cache.getRecord(published)).toBeNull();
    expect(e.cache.getRecord(pending)).toBeNull();
  });

  it('cascade: a record citing the seed is forgotten; a record superseding it is kept', async () => {
    const { e } = await setup();
    const a = (await e.remember(fact('Seed fact about tokens'))).id;
    const citer = (await e.note({ title: 'Builds on the seed', text: 'Because of the seed, tokens are short.', cites: [a] })).id;
    const citerOfCiter = (await e.note({ title: 'Builds on the builder', text: 'Second hand restatement.', cites: [citer] })).id;
    const successor = (await e.remember(fact('Successor fact about tokens', { supersedes: [a] }))).id;

    const r = await e.forget({ ids: [a] });
    expect(r.deleted).toEqual([a]);
    expect(r.cascaded).toEqual([citer, citerOfCiter].sort());
    for (const id of [a, citer, citerOfCiter]) {
      expect(e.store.readRecord(id)).toBeNull();
      expect(exists(path.join(e.layout.localTombstones, id))).toBe(true);
    }
    expect(e.store.readRecord(successor)).not.toBeNull();
    const rec = await e.recall({ query: 'Successor' });
    expect(rec.abstain).toBe(false);
    if (!rec.abstain) expect(rec.served.map((s) => s.id)).toEqual([successor]);
  });

  it('forget B in A←B←C: C stays the head and A stays superseded', async () => {
    const { e } = await setup();
    const a = (await e.remember(fact('Algorithm one', { key: 'auth.algo' }))).id;
    const b = (await e.remember(fact('Algorithm two', { key: 'auth.algo', supersedes: [a] }))).id;
    const c = (await e.remember(fact('Algorithm three', { key: 'auth.algo', supersedes: [b] }))).id;

    const r = await e.forget({ ids: [b] });
    expect(r.cascaded).toEqual([]);
    expect(fs.readFileSync(path.join(e.layout.localTombstones, b), 'utf8')).toBe(`supersedes: [${a}]\n`);

    const h = await e.history('auth.algo');
    expect(h.map((x) => x.id)).toEqual([a, b, c]);
    const byId = new Map(h.map((x) => [x.id, x]));
    expect(byId.get(a)?.state).toBe('superseded');
    expect(byId.get(b)).toMatchObject({ state: 'forgotten', forgotten: true });
    expect(byId.get(c)?.state).toBe('active');

    // forgetting again keeps the tombstone's supersedes (the row and file are already gone)
    await e.forget({ ids: [b] });
    expect(fs.readFileSync(path.join(e.layout.localTombstones, b), 'utf8')).toBe(`supersedes: [${a}]\n`);
  });

  it('forget the head: recall abstains, A is not served', async () => {
    const { e } = await setup();
    const a = (await e.remember(fact('Session lifetime one', { key: 'auth.ttl' }))).id;
    const b = (await e.remember(fact('Session lifetime two', { key: 'auth.ttl', supersedes: [a] }))).id;

    await e.forget({ ids: [b] });
    const r = await e.recall({ query: 'Session lifetime' });
    expect(r.abstain).toBe(true);
    if (r.abstain) expect(r.hints.some((h) => h.startsWith(`${a} is superseded`))).toBe(true);
  });

  it('byte-level audit', async () => {
    const { wt, cacheDir, e } = await setup();
    // A second marker whose first letter no other indexed term starts with, so FTS prefix
    // compression cannot hide it: its bytes in a segment would be the whole term.
    const marked = (await e.note({ title: 'Jqwv8solo heading', text: 'the forgotten body zqxk7marker end' })).id;
    e.publish([marked]);
    for (let i = 0; i < 300; i++) {
      const extra = i % 30 === 0 ? ' with zqxk7mapple inside' : '';
      const r: ElmoryRecord = {
        type: 'memory/note',
        title: `Filler record ${i}`,
        version: FORMAT_VERSION,
        recorded: NOW,
        observer: 'agent:test',
        supersedes: [],
        cites: [],
        sources: [],
        body: `Plain filler body number ${i}${extra}.`,
      };
      e.store.appendTrust(`written ${recordId(r)}`);
      e.store.writeRecord('pending', r);
    }
    await e.sync();
    await e.rebuild(); // leaves an older generation holding the marker too
    expect(e.cache.generation).toBe(2);

    const roots = [cacheDir, path.join(wt, '.elmory'), path.join(e.layout.commonDir as string, 'elmory')];
    expect(exists(path.join(cacheDir, 'cache-1.db'))).toBe(true);
    for (const m of ['zqxk7marker', 'jqwv8solo']) expect(occurrences([cacheDir], m)).toBeGreaterThan(0);
    expect(occurrences(roots, 'zqxk7marker')).toBeGreaterThan(0);

    const r = await e.forget({ ids: [marked] });
    expect(r.compaction).toBe('done');

    expect(occurrences(roots, 'zqxk7marker')).toBe(0);
    expect(occurrences(roots, 'jqwv8solo')).toBe(0);
    expect(occurrences(roots, 'Jqwv8solo')).toBe(0);
    expect(occurrences([cacheDir], 'zqxk7mapple')).toBeGreaterThan(0);
    expect(occurrences(roots, 'zqxk7mapple')).toBeGreaterThan(0);
    expect(exists(path.join(cacheDir, 'cache-1.db'))).toBe(false);
    const rec = await e.recall({ query: 'zqxk7mapple' });
    expect(rec.abstain).toBe(false);
  });

  it('compaction pending while a reader holds the wal', async () => {
    const { wt, cacheDir, e } = await setup();
    const id = (await e.note({ title: 'Short lived note', text: 'Pinned by a reader.' })).id;
    const reader = new DatabaseSync(path.join(cacheDir, `cache-${e.cache.generation}.db`));
    try {
      reader.exec('BEGIN');
      reader.prepare('SELECT count(*) AS n FROM records').get();

      const r = await e.forget({ ids: [id] });
      expect(r.compaction).toBe('pending');
      expect(e.cache.getMeta('compaction')).toBe('pending');
    } finally {
      if (reader.isTransaction) reader.exec('COMMIT');
      reader.close();
    }
    e.close();
    opened.splice(opened.indexOf(e), 1);

    const again = await open(wt, cacheDir);
    expect(again.cache.getMeta('compaction')).toBe('done');
  });

  it('query scope requires confirm', async () => {
    const { e } = await setup();
    const id = (await e.note({ title: 'Deploy freeze', text: 'No deploys on Fridays.' })).id;
    // @ts-expect-error confirm is required for a query
    await expect(e.forget({ query: 'Deploy' })).rejects.toMatchObject({ name: 'RefusedError', reason: 'confirm' });
    // @ts-expect-error confirm must be the literal true
    await expect(e.forget({ query: 'Deploy', confirm: false })).rejects.toBeInstanceOf(RefusedError);
    // @ts-expect-error confirm is required for all
    await expect(e.forget({ all: true })).rejects.toMatchObject({ reason: 'confirm' });
    expect(e.store.readRecord(id)).not.toBeNull();

    const r = await e.forget({ query: 'Deploy', confirm: true });
    expect(r.deleted).toEqual([id]);
    expect(e.store.readRecord(id)).toBeNull();
  });

  it('query scope includes records in every state; all forgets everything', async () => {
    const { e } = await setup();
    const a = (await e.remember(fact('Retry budget one', { key: 'retry' }))).id;
    const b = (await e.remember(fact('Retry budget two', { key: 'retry', supersedes: [a] }))).id;
    const other = (await e.note({ title: 'Unrelated', text: 'Coffee is in the kitchen.' })).id;
    const r = await e.forget({ query: 'Retry budget', confirm: true });
    expect([...r.deleted].sort()).toEqual([a, b].sort()); // the superseded one too
    expect(e.store.readRecord(other)).not.toBeNull();

    const all = await e.forget({ all: true, confirm: true });
    expect(all.deleted).toEqual([other]);
    expect(e.store.listRecords()).toEqual([]);
  });

  it('the unreachable list is the seven spec strings', async () => {
    const { e } = await setup();
    const r = await e.forget({ ids: [] });
    expect(r.unreachable).toEqual([
      'other branches/worktrees until the tombstone is committed and merged',
      'git history (commit the tombstone; rewrite history to erase)',
      'other clones until they pull — and only if the tombstone commit is signed by a trusted key',
      'agent transcripts (~/.claude/projects, Cursor, Codex logs)',
      'Baton journal and dashboard views already shown',
      'backups, Time Machine / APFS snapshots',
      'model provider prompt caches',
    ]);
  });
});
