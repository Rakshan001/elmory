import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { Elmory, RefusedError } from '../src/api.js';
import { defaultExec } from '../src/exec.js';
import { previewForget } from '../src/forget.js';
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

    const { entries: h, warnings } = await e.history('auth.algo');
    expect(warnings).toEqual([]);
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
    // a candidate (hand-edited after publishing): recall may not include it, a query forget must
    const edited = (await e.remember(fact('Retry budget edited'))).id;
    expect(e.publish([edited])).toEqual([edited]);
    fs.appendFileSync(path.join(e.layout.facts, `${edited}.md`), 'x');
    await e.sync();
    expect((await e.review()).map((c) => c.id)).toEqual([edited]);
    const other = (await e.note({ title: 'Unrelated', text: 'Coffee is in the kitchen.' })).id;

    // a preview is not a use: no recall stamp
    const p = await previewForget(e, { query: 'Retry budget' });
    expect(p.seeds.map((x) => x.id).sort()).toEqual([a, b, edited].sort());
    for (const id of [a, b, edited]) expect(e.cache.getMeta(`recall:${id}`)).toBeNull();

    const r = await e.forget({ query: 'Retry budget', confirm: true });
    expect([...r.deleted].sort()).toEqual([a, b, edited].sort()); // the superseded one and the candidate too
    expect(e.store.readRecord(other)).not.toBeNull();

    const all = await e.forget({ all: true, confirm: true });
    expect(all.deleted).toEqual([other]);
    expect(e.store.listRecords()).toEqual([]);
  });

  it('an archived record citing the seed is cascaded', async () => {
    const { wt, cacheDir, e } = await setup();
    const a = (await e.note({ title: 'Seed decision', text: 'Releases are cut on Tuesdays.' })).id;
    const b = (await e.note({ title: 'Restates the seed', text: 'Tuesday cut, as the seed says: plover7marker.', cites: [a] })).id;
    const c = (await e.note({ title: 'Restates the restatement', text: 'Second hand: plover7marker again.', cites: [b] })).id;
    const kept = (await e.note({ title: 'Unrelated archived', text: 'Lunch is at noon.' })).id;
    for (const id of [b, c, kept]) e.store.archive(id); // as gc would
    await e.sync();
    const roots = [cacheDir, path.join(wt, '.elmory'), path.join(e.layout.commonDir as string, 'elmory')];
    expect(occurrences(roots, 'plover7marker')).toBeGreaterThan(0);

    const r = await e.forget({ ids: [a] });
    expect(r.deleted).toEqual([a]);
    expect(r.cascaded).toEqual([b, c].sort());
    expect(r.compaction).toBe('done');
    for (const id of [b, c]) {
      expect(exists(path.join(e.layout.archive, `${id}.md`))).toBe(false);
      expect(fs.readFileSync(path.join(e.layout.localTombstones, id), 'utf8')).toBe('supersedes: []\n');
      expect(exists(path.join(e.layout.tombstones, id))).toBe(false); // never published
    }
    expect(exists(path.join(e.layout.archive, `${kept}.md`))).toBe(true);
    expect(occurrences(roots, 'plover7marker')).toBe(0);
    await expect(e.gcRestore(b)).rejects.toMatchObject({ reason: 'not-found' });
  });

  it('forget --all reaches archived records', async () => {
    const { e } = await setup();
    const archived = (await e.note({ title: 'Old note', text: 'Archived long ago.' })).id;
    e.store.archive(archived);
    const r = await e.forget({ all: true, confirm: true });
    expect(r.deleted).toEqual([archived]);
    expect(exists(path.join(e.layout.archive, `${archived}.md`))).toBe(false);
  });

  it('ids that never existed are reported as unknown, not deleted or tombstoned', async () => {
    const { e } = await setup();
    const real = (await e.note({ title: 'Real note', text: 'This one exists.' })).id;
    const typo = `f_${'a'.repeat(26)}`;
    const r = await e.forget({ ids: [real, typo] });
    expect(r.deleted).toEqual([real]);
    expect(r.unknown).toEqual([typo]);
    expect(exists(path.join(e.layout.localTombstones, typo))).toBe(false);
    expect(exists(path.join(e.layout.tombstones, typo))).toBe(false);

    // an id forgotten before still has its tombstone: forgetting it again is not "unknown"
    const again = await e.forget({ ids: [real] });
    expect(again).toMatchObject({ deleted: [real], unknown: [] });
  });

  it('a forget of only unknown ids writes nothing and runs no compaction', async () => {
    const { e } = await setup();
    const typo = `f_${'b'.repeat(26)}`;
    let compactions = 0;
    let sweeps = 0;
    e.cache.compact = () => {
      compactions++;
      return 'done';
    };
    e.cache.sweepOld = () => {
      sweeps++;
      return [];
    };
    const r = await e.forget({ ids: [typo] });
    expect(r).toMatchObject({ deleted: [], cascaded: [], unknown: [typo], compaction: 'done' });
    expect([compactions, sweeps]).toEqual([0, 0]);
    expect(e.cache.getMeta('compaction')).toBeNull();
    expect(exists(path.join(e.layout.localTombstones, typo))).toBe(false);

    // an earlier forget's pending compaction is reported as it stands, not as done
    e.cache.setMeta('compaction', 'pending');
    expect((await e.forget({ ids: [typo] })).compaction).toBe('pending');
    expect(compactions).toBe(0);
  });

  it('--query also seeds archived record files whose text matches, OR per term', async () => {
    const { wt, cacheDir, e } = await setup();
    const live = (await e.note({ title: 'Live note', text: 'The kestrel4 cache is warm.' })).id;
    const archived = (await e.note({ title: 'Archived note', text: 'Old Plover4 deploy notes.' })).id;
    const citer = (await e.note({ title: 'Citer', text: 'See the archived one.', cites: [archived] })).id;
    const kept = (await e.note({ title: 'Kept archived', text: 'Nothing to see.' })).id;
    for (const id of [archived, kept]) e.store.archive(id); // as gc would
    // an archived file that no longer parses still holds text a query must reach
    const broken = `f_${'c'.repeat(26)}`;
    fs.writeFileSync(path.join(e.layout.archive, `${broken}.md`), 'not a record: plover4 again\n');
    await e.sync();

    // same tokenizer as the index: case-folded, and either word is enough
    const p = await previewForget(e, { query: 'PLOVER4 kestrel4' });
    expect(p.seeds.map((x) => x.id)).toEqual([live, ...[archived, broken].sort()]);
    expect(p.seeds.find((x) => x.id === archived)?.title).toBe('Archived note');
    expect(p.cascaded.map((x) => x.id)).toEqual([citer]);
    expect(exists(path.join(e.layout.archive, `${archived}.md`))).toBe(true); // a preview deletes nothing

    const r = await e.forget({ query: 'PLOVER4 kestrel4', confirm: true });
    expect([...r.deleted].sort()).toEqual([live, archived, broken].sort());
    expect(r.cascaded).toEqual([citer]);
    for (const id of [archived, broken]) expect(exists(path.join(e.layout.archive, `${id}.md`))).toBe(false);
    expect(exists(path.join(e.layout.archive, `${kept}.md`))).toBe(true);
    const roots = [cacheDir, path.join(wt, '.elmory'), path.join(e.layout.commonDir as string, 'elmory')];
    expect(occurrences(roots, 'lover4')).toBe(0);
  });

  it('previewForget lists the seeds and the cascade with titles and deletes nothing', async () => {
    const { e } = await setup();
    const a = (await e.note({ title: 'Deploy freeze', text: 'No deploys on Fridays.' })).id;
    const citer = (await e.note({ title: 'Why Fridays', text: 'Because of the freeze.', cites: [a] })).id;
    const archivedCiter = (await e.note({ title: 'Archived why', text: 'Old reasoning.', cites: [a] })).id;
    e.store.archive(archivedCiter);
    const other = (await e.note({ title: 'Lunch', text: 'Noon.' })).id;

    const p = await previewForget(e, { query: 'Deploy' });
    expect(p.seeds).toEqual([{ id: a, title: 'Deploy freeze' }]);
    expect(p.cascaded).toEqual(
      [
        { id: citer, title: 'Why Fridays' },
        { id: archivedCiter, title: 'Archived why' },
      ].sort((x, y) => x.id.localeCompare(y.id)),
    );
    for (const id of [a, citer, other]) expect(e.store.readRecord(id)).not.toBeNull();
    expect(exists(path.join(e.layout.archive, `${archivedCiter}.md`))).toBe(true);

    const all = await previewForget(e, { all: true });
    expect(all.seeds.map((s) => s.id).sort()).toEqual([a, citer, archivedCiter, other].sort());
    expect(all.cascaded).toEqual([]);

    const r = await e.forget({ query: 'Deploy', confirm: true });
    expect(r.deleted).toEqual(p.seeds.map((s) => s.id));
    expect(r.cascaded).toEqual(p.cascaded.map((s) => s.id));
  });

  it('a compaction that throws is reported pending, after the deletion, and kept pending in meta', async () => {
    const { e } = await setup();
    const id = (await e.note({ title: 'Doomed note', text: 'Gone either way.' })).id;
    e.cache.compact = () => {
      throw new Error('SQLITE_BUSY: database is locked');
    };
    const r = await e.forget({ ids: [id] });
    expect(r).toMatchObject({ deleted: [id], compaction: 'pending' });
    expect(e.store.readRecord(id)).toBeNull();
    expect(e.cache.getMeta('compaction')).toBe('pending');
  });

  it('forget removes a newer cache generation left by a killed rebuild; a held one keeps compaction pending', async () => {
    const { cacheDir, e } = await setup();
    const id = (await e.note({ title: 'Stray copy', text: 'heron7marker in the body.' })).id;
    const stray = path.join(cacheDir, `cache-${e.cache.generation + 1}.db`);
    const fill = (file: string): DatabaseSync => {
      const db = new DatabaseSync(file);
      db.exec("PRAGMA journal_mode=WAL; CREATE TABLE records(body TEXT); INSERT INTO records VALUES('heron7marker in the body.')");
      return db;
    };
    fill(stray).close();
    expect(occurrences([cacheDir], 'heron7marker')).toBeGreaterThan(0);
    const r = await e.forget({ ids: [id] });
    expect(r.compaction).toBe('done');
    expect(exists(stray)).toBe(false);
    expect(occurrences([cacheDir], 'heron7marker')).toBe(0);

    const id2 = (await e.note({ title: 'Held copy', text: 'Another body.' })).id;
    const holder = fill(stray);
    try {
      holder.exec('BEGIN');
      holder.prepare('SELECT count(*) AS n FROM records').get();
      const held = await e.forget({ ids: [id2] });
      expect(held.compaction).toBe('pending');
      expect(exists(stray)).toBe(true);
      expect(e.cache.getMeta('compaction')).toBe('pending');
    } finally {
      if (holder.isTransaction) holder.exec('COMMIT');
      holder.close();
    }
  });

  it('archived local records are reached by id, by --query and by --all (C1)', async () => {
    const { wt, cacheDir, e } = await setup();
    const roots = [cacheDir, path.join(wt, '.elmory'), path.join(e.layout.commonDir as string, 'elmory')];
    const archivedLocal = (id: string): string => path.join(e.layout.archive, 'local', `${id}.md`);
    const privateNote = async (title: string, marker: string): Promise<string> => {
      const id = (await e.note({ title, text: `Private: ${marker}.`, local: true })).id;
      expect(e.store.archive(id)).toEqual(['local']); // as gc would
      expect(exists(archivedLocal(id))).toBe(true);
      return id;
    };

    const byId = await privateNote('Private by id', 'zqxprivone');
    const r = await e.forget({ ids: [byId] });
    expect(r).toMatchObject({ deleted: [byId], unknown: [], compaction: 'done' });
    expect(exists(archivedLocal(byId))).toBe(false);
    expect(exists(path.join(e.layout.localTombstones, byId))).toBe(true);
    expect(occurrences(roots, 'zqxprivone')).toBe(0);

    const byQuery = await privateNote('Private by query', 'zqxprivtwo');
    expect((await previewForget(e, { query: 'zqxprivtwo' })).seeds.map((s) => s.id)).toEqual([byQuery]);
    expect((await e.forget({ query: 'zqxprivtwo', confirm: true })).deleted).toEqual([byQuery]);
    expect(exists(archivedLocal(byQuery))).toBe(false);
    expect(occurrences(roots, 'zqxprivtwo')).toBe(0);

    const byAll = await privateNote('Private by all', 'zqxprivthree');
    expect((await e.forget({ all: true, confirm: true })).deleted).toContain(byAll);
    expect(exists(archivedLocal(byAll))).toBe(false);
    expect(occurrences(roots, 'zqxprivthree')).toBe(0);
  });

  it('a record published in another worktree is forgotten from this one: common-dir tombstone, row gone, a note (I1)', async () => {
    const { wt, cacheDir, e: a } = await setup();
    const wtB = path.join(path.dirname(wt), 'b');
    await git(wt, 'worktree', 'add', '-q', '-b', 'side', wtB);
    const b = await open(wtB, cacheDir);
    const id = (await b.note({ title: 'Leaked in B', text: 'the zqxleak token story' })).id;
    b.publish([id]);
    const served = await b.recall({ query: 'zqxleak' });
    expect(served.abstain === false && served.served.map((s) => s.state)).toEqual(['active']);

    expect((await previewForget(a, { ids: [id] })).seeds.map((s) => s.id)).toEqual([id]);
    const r = await a.forget({ ids: [id] });
    expect(r).toMatchObject({ deleted: [id], unknown: [], compaction: 'done' });
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toContain(id);
    expect(exists(path.join(a.layout.localTombstones, id))).toBe(true); // the common dir: every worktree reads it
    expect(exists(path.join(a.layout.tombstones, id))).toBe(true); // committed with A's work, it travels
    expect(a.cache.getRecord(id)).toBeNull();
    expect(occurrences([cacheDir], 'zqxleak')).toBe(0);
    expect(exists(path.join(b.layout.facts, `${id}.md`))).toBe(true); // not A's to unlink

    // B's next sync stops serving it, and its file's text never re-enters the cache.
    const after = await b.recall({ query: 'zqxleak' });
    expect(after.abstain).toBe(true);
    expect((await (await b.deriver()).state(id)).state).toBe('forgotten');
    expect(occurrences([cacheDir], 'zqxleak')).toBe(0);
  });

  it('an id only in HEAD (file deleted from the working tree) is known to forget (I1)', async () => {
    const { wt, e } = await setup();
    const id = (await e.note({ title: 'Committed then removed', text: 'In HEAD only.' })).id;
    e.publish([id]);
    await git(wt, 'add', '-A');
    await git(wt, 'commit', '-q', '--no-verify', '-m', 'publish');
    fs.rmSync(path.join(e.layout.facts, `${id}.md`));
    await e.sync();
    e.cache.deleteRecord(id); // as if never indexed here
    const r = await e.forget({ ids: [id] });
    expect(r).toMatchObject({ deleted: [id], unknown: [] });
    expect(r.notes).toHaveLength(1);
    expect(exists(path.join(e.layout.localTombstones, id))).toBe(true);
    expect(exists(path.join(e.layout.tombstones, id))).toBe(true);
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
