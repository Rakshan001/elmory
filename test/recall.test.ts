import { afterEach, describe, expect, it } from 'vitest';
import type { RecordRow } from '../src/cache.js';
import { LABEL_NEWER_FAILS, LABEL_UNREVIEWED } from '../src/derive.js';
import { RefusedError } from '../src/gate.js';
import {
  type Abstain,
  about,
  estimateTokens,
  factsFirstOnTies,
  gc,
  gcRestore,
  history,
  recall,
  type RecallResult,
  verify,
} from '../src/recall.js';
import {
  cleanupContexts,
  FILE,
  FILE_TEXT,
  LINE_CHECK,
  LINE_REFRESH,
  LINE_REVOKE,
  makeContext,
  NOW,
  seed,
} from './helpers/context.js';

afterEach(() => cleanupContexts());

function served(r: RecallResult | Abstain): RecallResult {
  if (r.abstain) throw new Error(`expected records, got abstain: ${r.reason} [${r.hints.join('; ')}]`);
  return r;
}

function abstained(r: RecallResult | Abstain): Abstain {
  if (!r.abstain) throw new Error(`expected abstain, got ${r.served.map((s) => s.id).join(', ')}`);
  return r;
}

describe('recall', () => {
  it('recall finds an active fact and labels it', async () => {
    const ctx = await makeContext();
    const id = seed(ctx, { title: 'Tokens are checked with HS256', body: 'checkToken verifies the bearer header.', tag: 'gotcha' });
    seed(ctx, { type: 'memory/note', title: 'Unrelated note', body: 'The release train leaves on Fridays.' });

    const r = served(await recall(ctx, { query: 'HS256' }));
    expect(r.served).toHaveLength(1);
    const s = r.served[0];
    expect(s).toMatchObject({
      id,
      title: 'Tokens are checked with HS256',
      type: 'memory/fact',
      state: 'active',
      tag: 'gotcha',
      key: null,
      observer: 'agent:test',
      trustSource: 'written',
      paths: [FILE],
      warnings: [],
    });
    expect(s?.labels).toContain('evidence unchanged since 2026-01-01');
    expect(r.tokensUsed).toBe(estimateTokens(s!));
    expect(ctx.cache.getMeta(`recall:${id}`)).toBe(NOW);
  });

  it('escaped query does not throw', async () => {
    const ctx = await makeContext();
    const id = seed(ctx, { title: 'checkToken() middleware order', body: 'Run it before the router.' });
    const r = served(await recall(ctx, { query: 'checkToken() middleware' }));
    expect(r.served.map((s) => s.id)).toEqual([id]);
    for (const q of ['"', 'NEAR(a b)', 'title:x OR', '* AND -', '']) {
      await expect(recall(ctx, { query: q })).resolves.toBeDefined();
    }
  });

  it('superseded records are not served; history shows the chain in order', async () => {
    const ctx = await makeContext();
    const a = seed(ctx, { key: 'auth.algo', title: 'Session algorithm v1', body: 'Sessions use algorithm one.' });
    const b = seed(ctx, { key: 'auth.algo', title: 'Session algorithm v2', body: 'Sessions use algorithm two.', supersedes: [a] });
    const c = seed(ctx, { key: 'auth.algo', title: 'Session algorithm v3', body: 'Sessions use algorithm three.', supersedes: [b] });

    const r = served(await recall(ctx, { query: 'algorithm' }));
    expect(r.served.map((s) => s.id)).toEqual([c]);

    const h = (await history(ctx, 'auth.algo')).entries;
    expect(h.map((e) => e.id)).toEqual([a, b, c]);
    expect(h.map((e) => e.state)).toEqual(['superseded', 'superseded', 'active']);
    expect(h[1]).toMatchObject({ title: 'Session algorithm v2', observer: 'agent:test', supersedes: [a], forgotten: false });
    expect((await history(ctx, b)).entries).toEqual(h);
    expect(await history(ctx, 'no.such.key')).toEqual({ entries: [], warnings: [] });
  });

  it('history orders by supersedes, not by id or time', async () => {
    const ctx = await makeContext();
    // Recorded times run backwards; the order must follow supersedes only.
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      ids.push(
        seed(ctx, {
          key: 'k',
          title: `step ${i}`,
          recorded: `2026-0${9 - i}-01T00:00:00.000Z`,
          ...(i > 0 ? { supersedes: [ids[i - 1] as string] } : {}),
        }),
      );
    }
    expect((await history(ctx, 'k')).entries.map((e) => e.id)).toEqual(ids);
  });

  it('history shows a forgotten member whose file is gone', async () => {
    const ctx = await makeContext();
    const a = seed(ctx, { key: 'k', title: 'first' });
    const b = seed(ctx, { key: 'k', title: 'second', supersedes: [a] });
    ctx.store.writeTombstone(b, [a], 'local');
    ctx.store.unlink(b);
    await ctx.sync();
    const h = (await history(ctx, a)).entries;
    expect(h.map((e) => e.id)).toEqual([a, b]);
    expect(h[1]).toMatchObject({ id: b, state: 'forgotten', forgotten: true, supersedes: [a] });
  });

  it('budget stops packing', async () => {
    const ctx = await makeContext();
    const body = 'Budget filler words that make this note long enough to cost tokens in the pack.';
    seed(ctx, { type: 'memory/note', title: 'Budget item one', body });
    seed(ctx, { type: 'memory/note', title: 'Budget item two', body });

    const all = served(await recall(ctx, { query: 'budget' }));
    expect(all.served).toHaveLength(2);
    const each = estimateTokens(all.served[0]!);
    expect(each).toBeGreaterThan(20);
    expect(each).toBeLessThanOrEqual(40);

    const r = served(await recall(ctx, { query: 'budget', budgetTokens: 40 }));
    expect(r.served).toHaveLength(1);
    expect(r.tokensUsed).toBe(each);
    expect(r.tokensUsed).toBeLessThanOrEqual(40);
  });

  it('nothing fits the budget: abstain says so', async () => {
    const ctx = await makeContext();
    const id = seed(ctx, { type: 'memory/note', title: 'Large note', body: 'large '.repeat(100) });
    const a = abstained(await recall(ctx, { query: 'large', budgetTokens: 5 }));
    expect(a.reason).toContain('budget');
    expect(a.hints.join('\n')).toContain(id);
  });

  it('facts rank before notes on equal score (the reorder itself)', () => {
    const row = (id: string, type: RecordRow['type']) => ({ id, type }) as RecordRow;
    const rows = new Map([
      ['n1', row('n1', 'memory/note')],
      ['f1', row('f1', 'memory/fact')],
      ['n2', row('n2', 'memory/note')],
      ['f2', row('f2', 'memory/fact')],
    ]);
    const hits = [
      { id: 'n1', score: 3 },
      { id: 'f1', score: 3 },
      { id: 'n2', score: 2 },
      { id: 'f2', score: 1 },
    ];
    expect(factsFirstOnTies(hits, rows)).toEqual(['f1', 'n1', 'n2', 'f2']);
  });

  it('facts rank before notes on equal score (through recall)', async () => {
    const ctx = await makeContext();
    // bm25 counts every column's length, so the note carries three extra body tokens to match the
    // fact's path tokens (src, auth, ts): the scores tie whatever order the search returns.
    const body = 'Every webhook retries five times with backoff.';
    const note = seed(ctx, { type: 'memory/note', title: 'Retry policy', body: `${body} alpha beta gamma` });
    const fact = seed(ctx, { type: 'memory/fact', title: 'Retry policy', body });
    const hits = ctx.cache.search('webhook', { limit: 10, offset: 0 });
    expect(hits[0]?.score).toBeCloseTo(hits[1]?.score ?? NaN, 12);
    const r = served(await recall(ctx, { query: 'webhook' }));
    expect(r.served.map((s) => s.id)).toEqual([fact, note]);
  });

  it('paging takes the ordered id list once: a row added mid-recall is never served twice (M4)', async () => {
    const ctx = await makeContext();
    for (let i = 0; i < 60; i++) seed(ctx, { type: 'memory/note', title: `Retry rule ${String(i).padStart(2, '0')}`, body: 'retry backoff' });
    const orig = ctx.cache.search.bind(ctx.cache);
    let calls = 0;
    ctx.cache.search = (q, o) => {
      const res = orig(q, o);
      if (calls++ === 0) seed(ctx, { type: 'memory/note', title: 'retry retry retry', body: 'retry retry backoff' });
      return res;
    };
    const r = served(await recall(ctx, { query: 'retry', budgetTokens: 100000 }));
    const ids = r.served.map((s) => s.id);
    expect(calls).toBe(1);
    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
  });

  it('conflict is served with the warning', async () => {
    const ctx = await makeContext();
    const a = seed(ctx, { key: 'db.pool', title: 'Pool size is 10', body: 'pool size ten', quotes: [LINE_CHECK] });
    const b = seed(ctx, { key: 'db.pool', title: 'Pool size is 20', body: 'pool size twenty', supersedes: [a], quotes: [LINE_REFRESH] });
    const c = seed(ctx, { key: 'db.pool', title: 'Pool size is 30', body: 'pool size thirty', supersedes: [a], quotes: [LINE_REVOKE] });

    const r = served(await recall(ctx, { query: 'pool' }));
    expect(r.served.map((s) => s.id).sort()).toEqual([b, c].sort());
    for (const s of r.served) {
      expect(s.state).toBe('conflict');
      expect(s.warnings).toContain('⚠ conflict');
    }
  });

  it('flagged, older and unreviewed records carry their warnings', async () => {
    const ctx = await makeContext();
    const flagged = seed(ctx, { type: 'memory/note', title: 'Flagged deploy note', body: 'deploy steps', flagged: true });
    // older value: the newer record's quote no longer holds after the edit below
    const old = seed(ctx, { key: 'cache.ttl', title: 'Cache ttl old', body: 'cache ttl', quotes: [LINE_CHECK] });
    seed(ctx, { key: 'cache.ttl', title: 'Cache ttl new', body: 'cache ttl', supersedes: [old], quotes: [LINE_REVOKE] });
    // unreviewed newer value
    const kept = seed(ctx, { type: 'memory/note', title: 'Queue name kept', body: 'queue name' });
    seed(ctx, { type: 'memory/note', title: 'Queue name pulled', body: 'queue name', supersedes: [kept], trusted: false });
    ctx.writeFile(FILE_TEXT.replace(LINE_REVOKE, 'export function revokeEverything(): void {'));

    const f = served(await recall(ctx, { query: 'deploy' })).served;
    expect(f.map((s) => [s.id, s.warnings])).toEqual([[flagged, ['⚠ flagged']]]);

    const o = served(await recall(ctx, { query: 'cache' })).served;
    expect(o.map((s) => s.id)).toEqual([old]);
    expect(o[0]?.labels).toContain(LABEL_NEWER_FAILS);
    expect(o[0]?.warnings).toEqual(['⚠ older value']);

    const u = served(await recall(ctx, { query: 'queue' })).served;
    expect(u.map((s) => s.id)).toEqual([kept]);
    expect(u[0]?.labels).toContain(LABEL_UNREVIEWED);
    expect(u[0]?.warnings).toEqual(['⚠ unreviewed newer value']);
  });

  it('abstain reasons', async () => {
    const ctx = await makeContext();
    expect(abstained(await recall(ctx, { query: 'anything' }))).toEqual({ abstain: true, reason: 'no records match', hints: [], warnings: [] });

    const suspect = seed(ctx, { title: 'Revoke takes a reason', body: 'revocation needs a reason', quotes: [LINE_REVOKE] });
    ctx.writeFile(FILE_TEXT.replace(LINE_REVOKE, 'export function revokeEverything(): void {'));
    const a = abstained(await recall(ctx, { query: 'revocation' }));
    expect(a.reason).toBe('1 matches but none hold: 1 suspect');
    expect(a.hints.join('\n')).toContain(suspect);
    expect(a.hints.join('\n')).toContain('suspect');

    // only superseded: the newer record holds but does not match the query
    const old = seed(ctx, { title: 'Legacy flag name', body: 'flag spelled colour', quotes: [LINE_CHECK] });
    seed(ctx, { title: 'Current flag', body: 'flag spelled color', supersedes: [old], quotes: [LINE_CHECK] });
    const b = abstained(await recall(ctx, { query: 'colour' }));
    expect(b.reason).toContain('superseded');
    expect(b.hints.join('\n')).toContain(old);
  });

  it("include: ['suspect'] serves a suspect record", async () => {
    const ctx = await makeContext();
    const id = seed(ctx, { title: 'Revoke takes a reason', body: 'revocation needs a reason', quotes: [LINE_REVOKE] });
    ctx.writeFile(FILE_TEXT.replace(LINE_REVOKE, 'export function revokeEverything(): void {'));
    expect((await recall(ctx, { query: 'revocation' })).abstain).toBe(true);
    const r = served(await recall(ctx, { query: 'revocation', include: ['suspect'] }));
    expect(r.served.map((s) => [s.id, s.state])).toEqual([[id, 'suspect']]);
  });

  it('include may not name candidate or forgotten (I3)', async () => {
    const ctx = await makeContext();
    seed(ctx, { type: 'memory/note', title: 'Pulled poison', body: 'poison text', trusted: false });
    for (const include of [['candidate'], ['forgotten'], ['suspect', 'candidate'], 'candidate']) {
      const err = await recall(ctx, { query: 'poison', include: include as never }).then(
        () => null,
        (x: unknown) => x,
      );
      expect(err).toBeInstanceOf(RefusedError);
      expect((err as RefusedError).reason).toBe('include');
    }
    expect(abstained(await recall(ctx, { query: 'poison', include: ['superseded', 'stale', 'suspect', 'unknown'] })).reason).toContain(
      'candidate',
    );
  });

  it('candidates are never served by default', async () => {
    const ctx = await makeContext();
    const id = seed(ctx, { type: 'memory/note', title: 'Pulled poison', body: 'poison text', trusted: false });
    const a = abstained(await recall(ctx, { query: 'poison' }));
    expect(a.reason).toBe('1 matches but none hold: 1 candidate');
    expect(a.hints.join('\n')).toContain(id);
  });
});

describe('about', () => {
  it('about by path and by key', async () => {
    const ctx = await makeContext();
    const a = seed(ctx, { key: 'auth.token', title: 'Token v1', body: 'token one' });
    const b = seed(ctx, { key: 'auth.token', title: 'Token v2', body: 'token two', supersedes: [a] });
    const note = seed(ctx, { type: 'memory/note', title: 'A note', body: 'no path' });

    const byPath = served(await about(ctx, FILE));
    expect(byPath.served.map((s) => s.id)).toEqual([b]);
    expect(served(await about(ctx, `./${FILE}`)).served.map((s) => s.id)).toEqual([b]);

    const byKey = served(await about(ctx, 'auth.token'));
    expect(byKey.served.map((s) => s.id)).toEqual([b]);
    expect(byKey.served.map((s) => s.id)).not.toContain(note);

    expect(abstained(await about(ctx, 'src/none.ts')).reason).toBe('no records match');
  });
});

describe('verify', () => {
  it('verify reports transitions and emits memory.state', async () => {
    const ctx = await makeContext();
    const fact = seed(ctx, { title: 'Revoke takes a reason', body: 'revocation needs a reason', quotes: [LINE_REVOKE] });
    const note = seed(ctx, { type: 'memory/note', title: 'A note', body: 'always active' });

    const first = await verify(ctx);
    expect(first.changed).toEqual(
      expect.arrayContaining([
        { id: fact, from: null, to: 'active' },
        { id: note, from: null, to: 'active' },
      ]),
    );
    expect(first.states.active).toBe(2);
    expect(first.states.suspect).toBe(0);

    const again = await verify(ctx);
    expect(again.changed).toEqual([]);

    ctx.events.length = 0;
    ctx.writeFile(FILE_TEXT.replace(LINE_REVOKE, 'export function revokeEverything(): void {'));
    const after = await verify(ctx);
    expect(after.changed).toEqual([{ id: fact, from: 'active', to: 'suspect' }]);
    expect(after.states).toMatchObject({ active: 1, suspect: 1 });
    expect(ctx.events).toEqual([{ type: 'memory.state', id: fact, worktree: ctx.wt, from: 'active', to: 'suspect' }]);
    expect(ctx.cache.getVerifyState(ctx.wt, fact)).toBe('suspect');

    const scoped = await verify(ctx, { files: ['src/other.ts'] });
    expect(scoped.changed).toEqual([]);
    expect(Object.values(scoped.states).reduce((x, y) => x + y, 0)).toBe(0);
    const onFile = await verify(ctx, { files: [FILE] });
    expect(onFile.states.suspect).toBe(1);
    expect(onFile.states.active).toBe(0);
  });
});

describe('gc', () => {
  it('gc archives an old superseded record and an unused note, keeps a young one, skips a never-recalled note, dryRun moves nothing, restore brings it back', async () => {
    const ctx = await makeContext();
    const now = '2026-10-22T00:00:00.000Z';
    const old = seed(ctx, { key: 'k', title: 'old value', recorded: '2026-01-01T00:00:00.000Z' });
    const newer = seed(ctx, { key: 'k', title: 'new value', supersedes: [old], recorded: '2026-01-02T00:00:00.000Z' });
    const youngSup = seed(ctx, { key: 'j', title: 'young old value', recorded: '2026-10-01T00:00:00.000Z' });
    seed(ctx, { key: 'j', title: 'young new value', supersedes: [youngSup], recorded: '2026-10-02T00:00:00.000Z' });
    const staleNote = seed(ctx, { type: 'memory/note', title: 'stale note', recorded: '2026-01-03T00:00:00.000Z' });
    const youngNote = seed(ctx, { type: 'memory/note', title: 'young note', recorded: '2026-09-01T00:00:00.000Z' });
    const recalledNote = seed(ctx, { type: 'memory/note', title: 'recalled note', recorded: '2026-01-04T00:00:00.000Z' });
    ctx.cache.setMeta(`recall:${recalledNote}`, '2026-10-01T00:00:00.000Z');
    const oldRecall = seed(ctx, { type: 'memory/note', title: 'long ago recalled', recorded: '2026-01-05T00:00:00.000Z' });
    ctx.cache.setMeta(`recall:${oldRecall}`, '2026-02-01T00:00:00.000Z');

    // A committed superseded fact is reported, never moved.
    const committedOld = seed(ctx, { key: 'c', title: 'committed old', recorded: '2026-01-06T00:00:00.000Z', quotes: [LINE_REFRESH] });
    seed(ctx, { key: 'c', title: 'committed new', supersedes: [committedOld], recorded: '2026-01-07T00:00:00.000Z', quotes: [LINE_REFRESH] });
    ctx.store.publish([committedOld]);
    ctx.cache.deleteRecord(committedOld);
    await ctx.sync();
    expect(ctx.cache.getRecord(committedOld)?.area).toBe('facts');

    // A note with no recall stamp is not judged unused from missing data: a dry run reports it,
    // a real run starts its clock (R2).
    const expected = [old, oldRecall].sort();
    const dry = await gc(ctx, { dryRun: true, now });
    expect(dry).toEqual({
      archived: expected,
      committed: [committedOld],
      staleHere: [],
      skipped: [{ id: staleNote, reason: 'no recall history' }],
      dryRun: true,
    });
    for (const id of expected) expect(ctx.store.readRecord(id)).not.toBeNull();
    expect(ctx.cache.getMeta(`recall:${staleNote}`)).toBeNull();

    const real = await gc(ctx, { now });
    expect(real).toEqual({
      archived: expected,
      committed: [committedOld],
      staleHere: [],
      skipped: [{ id: staleNote, reason: 'clock started' }],
      dryRun: false,
    });
    expect(ctx.cache.getMeta(`recall:${staleNote}`)).toBe(now);
    for (const id of expected) {
      expect(ctx.store.readRecord(id)).toBeNull();
      expect(ctx.cache.getRecord(id)).toBeNull();
    }
    for (const id of [newer, youngSup, youngNote, recalledNote, committedOld, staleNote]) expect(ctx.store.readRecord(id)).not.toBeNull();
    expect((await history(ctx, 'k')).entries.map((e) => e.id)).toEqual([newer]);

    await gcRestore(ctx, old);
    expect(ctx.store.readRecord(old)?.area).toBe('pending');
    expect(ctx.cache.getRecord(old)).not.toBeNull();
    const h = (await history(ctx, 'k')).entries;
    expect(h.map((e) => [e.id, e.state])).toEqual([
      [old, 'superseded'],
      [newer, 'active'],
    ]);
  });

  it('recall stamps recall meta so a recalled old note survives gc', async () => {
    const ctx = await makeContext({ now: '2026-10-20T00:00:00.000Z' });
    const n = seed(ctx, { type: 'memory/note', title: 'Ancient wisdom', recorded: '2025-01-01T00:00:00.000Z' });
    served(await recall(ctx, { query: 'ancient' }));
    expect(ctx.cache.getMeta(`recall:${n}`)).toBe('2026-10-20T00:00:00.000Z');
    expect((await gc(ctx, { dryRun: true, now: '2026-10-22T00:00:00.000Z' })).archived).toEqual([]);
  });
});
