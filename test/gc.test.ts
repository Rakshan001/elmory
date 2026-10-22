// gc through Elmory: worktree scope (I1), the local area across archive/restore (I2), and the
// recall stamp across a rebuild (I7).
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Elmory } from '../src/api.js';
import { defaultExec } from '../src/exec.js';
import { cleanupDirs, factInput, repo } from './helpers/children.js';

const opened: Elmory[] = [];
const T0 = '2026-01-01T00:00:00.000Z';
const days = (n: number): string => new Date(Date.parse(T0) + n * 24 * 60 * 60 * 1000).toISOString();

afterEach(() => {
  for (const e of opened.splice(0)) e.close();
  cleanupDirs();
});

async function git(cwd: string, ...args: string[]): Promise<void> {
  const res = await defaultExec('git', args, { cwd });
  if (res.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
}

async function open(worktree: string, cacheDir: string, now: () => string = () => T0): Promise<Elmory> {
  const e = await Elmory.open({ worktree, cacheDir, observer: 'agent:test', now });
  opened.push(e);
  return e;
}

describe('gc across worktrees (I1)', () => {
  it('a record stale in one worktree only is reported, not archived; stale in every worktree, it is archived', async () => {
    const { wt, cacheDir } = await repo();
    const main = await open(wt, cacheDir);
    const { id } = await main.remember(factInput('Token check lives in auth.ts'));
    const wt2 = path.join(path.dirname(wt), 'wt2');
    await git(wt, 'worktree', 'add', '-q', '-b', 'other', wt2);
    await git(wt2, 'rm', '-q', 'src/auth.ts');
    await git(wt2, 'commit', '-q', '--no-verify', '-m', 'drop auth');
    const other = await open(wt2, cacheDir);

    await other.sync();
    expect((await (await other.deriver()).state(id)).state).toBe('stale');
    const here = await other.gc({ now: days(100) });
    expect(here).toMatchObject({ archived: [], staleHere: [id] });
    expect(other.store.readRecord(id)?.area).toBe('pending');
    const r = await main.recall({ query: 'checkToken' });
    expect(r.abstain === false && r.served.map((s) => s.id)).toEqual([id]);

    // Now stale in main too: due everywhere, so it is archived.
    await git(wt, 'rm', '-q', 'src/auth.ts');
    await git(wt, 'commit', '-q', '--no-verify', '-m', 'drop auth here too');
    const everywhere = await other.gc({ now: days(100) });
    expect(everywhere).toMatchObject({ archived: [id], staleHere: [] });
    expect(main.store.readRecord(id)).toBeNull();
  }, 30000);
});

describe('gc and the local area (I2)', () => {
  it('an archived local note is restored into local and publish never moves it', async () => {
    const { wt, cacheDir } = await repo();
    const e = await open(wt, cacheDir);
    const n = await e.note({ title: 'Private preference', text: 'I like tabs.', local: true });
    const r = await e.recall({ query: 'tabs' });
    expect(r.abstain).toBe(false);
    expect(await e.gc({ now: days(200) })).toMatchObject({ archived: [n.id] });
    expect(fs.existsSync(path.join(e.layout.archive, 'local', `${n.id}.md`))).toBe(true);

    await e.gcRestore(n.id);
    expect(e.store.readRecord(n.id)?.area).toBe('local');
    expect(e.cache.getRecord(n.id)?.area).toBe('local');
    expect(e.publish()).toEqual([]);
    expect(() => e.publish([n.id])).toThrow(expect.objectContaining({ reason: 'local' }));
    expect(fs.existsSync(path.join(e.layout.facts, `${n.id}.md`))).toBe(false);
  }, 30000);
});

describe('gc and the recall stamp (I7)', () => {
  it('a rebuild does not change gc: stamps are carried, and a note with no stamp is skipped, not archived', async () => {
    const { wt, cacheDir } = await repo();
    let now = T0;
    const e = await open(wt, cacheDir, () => now);
    const used = await e.note({ title: 'Used note', text: 'We deploy on fridays.' });
    const never = await e.note({ title: 'Never recalled', text: 'Nobody asked about this.' });
    now = days(150);
    expect((await e.recall({ query: 'fridays' })).abstain).toBe(false);

    const before = await e.gc({ dryRun: true, now: days(200) });
    expect(before).toMatchObject({ archived: [], skipped: [{ id: never.id, reason: 'no recall history' }] });
    expect(before.skipped.map((s) => s.id)).not.toContain(used.id);
    await e.rebuild();
    expect(await e.gc({ dryRun: true, now: days(200) })).toEqual(before);

    // A cache lost outright (no rebuild to carry stamps): the used note is skipped, never archived.
    e.close();
    opened.splice(opened.indexOf(e), 1);
    fs.rmSync(cacheDir, { recursive: true, force: true });
    const again = await open(wt, cacheDir, () => now);
    const lost = await again.gc({ dryRun: true, now: days(200) });
    expect(lost.archived).toEqual([]);
    expect(lost.skipped.map((s) => s.id).sort()).toEqual([used.id, never.id].sort());
  }, 30000);
});

describe('gc starts the clock on a never-recalled note (R2)', () => {
  it('first gc stamps it, a later gc past the window archives it; a dry run writes nothing', async () => {
    const { wt, cacheDir } = await repo();
    const e = await open(wt, cacheDir);
    const n = await e.note({ title: 'Nobody reads this', text: 'An old decision nobody asks about.' });
    expect(await e.gc({ dryRun: true, now: days(200) })).toMatchObject({ archived: [], skipped: [{ id: n.id, reason: 'no recall history' }] });
    expect(e.cache.getMeta(`recall:${n.id}`)).toBeNull();
    expect(await e.gc({ now: days(200) })).toMatchObject({ archived: [], skipped: [{ id: n.id, reason: 'clock started' }] });
    expect(e.cache.getMeta(`recall:${n.id}`)).toBe(days(200));
    expect(await e.gc({ now: days(300) })).toMatchObject({ archived: [], skipped: [] });
    expect(await e.gc({ now: days(381) })).toMatchObject({ archived: [n.id], skipped: [] });
    expect(e.store.readRecord(n.id)).toBeNull();
  }, 30000);
});

describe('worktrees share the rows, never the view (R1)', () => {
  it('A syncs, B syncs, A reads: A sees only its own facts, and still sees them', async () => {
    const { wt, cacheDir } = await repo();
    const base = (await defaultExec('git', ['rev-parse', 'HEAD'], { cwd: wt })).stdout.trim();
    const A = await open(wt, cacheDir);
    const fa = await A.remember(factInput('alpha rule on branch A'));
    A.publish([fa.id]);
    await git(wt, 'add', '-A');
    await git(wt, 'commit', '-q', '--no-verify', '-m', 'A fact');
    const wtB = path.join(path.dirname(wt), 'wtB');
    await git(wt, 'worktree', 'add', '-q', '-b', 'b', wtB, base);
    const B = await open(wtB, cacheDir);
    const fb = await B.remember(factInput('alpha rule on branch B'));
    B.publish([fb.id]);
    await git(wtB, 'add', '-A');
    await git(wtB, 'commit', '-q', '--no-verify', '-m', 'B fact');

    // Interleave: every time A syncs, B syncs right after, so the shared table holds B's view.
    const syncA = A.sync.bind(A);
    A.sync = async (opts) => {
      const w = await syncA(opts);
      await B.sync();
      return w;
    };
    const ids = (r: Awaited<ReturnType<Elmory['recall']>>) => (r.abstain ? [] : r.served.map((s) => s.id));
    expect(ids(await A.recall({ query: 'alpha' }))).toEqual([fa.id]);
    expect(ids(await A.about('src/auth.ts'))).toEqual([fa.id]);
    expect((await A.history(fb.id)).entries).toEqual([]);
    expect((await A.verify()).states.active).toBe(1);
    expect(ids(await B.recall({ query: 'alpha' }))).toEqual([fb.id]);

    // A write in A while the table holds B's view: the CAS sees A's records only.
    const next = await A.remember({ ...factInput('alpha rule on branch A, v2'), supersedes: [fa.id] });
    expect(next.state).toBe('active');
    expect(ids(await A.recall({ query: 'alpha' }))).toEqual([next.id]);
  }, 30000);
});
