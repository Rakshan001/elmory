// The read flows (spec §7.2–§7.4, §7.6): recall, about, history, verify and gc. Each is a function
// of the Context; state is always derived for the asking worktree, never read back from the cache.

import type { RecordRow } from './cache.js';
import type { Context } from './context.js';
import { type Derived, type Deriver, LABEL_NEWER_FAILS, LABEL_UNREVIEWED, type State, type TrustSource } from './derive.js';
import { RecordError, type RecordType } from './record.js';

export const DEFAULT_BUDGET_TOKENS = 1500;
const PAGE = 50;
/** At most this many hints in an abstain; the rest are summarised in one more line. */
const MAX_HINTS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const GC_SUPERSEDED_DAYS = 90;
const GC_NOTE_DAYS = 180;

/** Every state, in the order of the §4.6 table. */
const STATES: readonly State[] = ['candidate', 'forgotten', 'superseded', 'conflict', 'stale', 'suspect', 'unknown', 'active'];
const SERVED_BY_DEFAULT: readonly State[] = ['active', 'conflict'];

export type Warning = '⚠ conflict' | '⚠ flagged' | '⚠ older value' | '⚠ unreviewed newer value';

export interface RecallOptions {
  query: string;
  /** default 1500 */
  budgetTokens?: number;
  /** states served in addition to active and conflict */
  include?: State[];
}

export interface Served {
  id: string;
  title: string;
  body: string;
  type: RecordType;
  state: State;
  tag: string | null;
  key: string | null;
  observer: string;
  recorded: string;
  trustSource: TrustSource | null;
  labels: string[];
  paths: string[];
  warnings: Warning[];
}

export interface RecallResult {
  served: Served[];
  abstain: false;
  tokensUsed: number;
}

/** reason: 'no records match' | 'N matches but none hold: <state counts>' (or none fit the budget); hints name ids and states. */
export interface Abstain {
  abstain: true;
  reason: string;
  hints: string[];
}

export interface HistoryEntry {
  id: string;
  title: string;
  recorded: string;
  observer: string;
  state: State;
  supersedes: string[];
  forgotten: boolean;
}

export interface VerifyResult {
  changed: { id: string; from: State | null; to: State }[];
  states: Record<State, number>;
}

export interface GcResult {
  /** pending/local records moved to archive (or that would be, on a dry run) */
  archived: string[];
  /** records in the committed facts area that are due: reported, never moved (delete them in a commit) */
  committed: string[];
  dryRun: boolean;
}

/** ceil((title + body + labels).length / 4) */
export function estimateTokens(r: { title: string; body: string; labels: readonly string[] }): number {
  let chars = r.title.length + r.body.length;
  for (const l of r.labels) chars += l.length;
  return Math.ceil(chars / 4);
}

function isState(s: string | null): s is State {
  return s !== null && (STATES as readonly string[]).includes(s);
}

function emptyCounts(): Record<State, number> {
  return Object.fromEntries(STATES.map((s) => [s, 0])) as Record<State, number>;
}

/** Repo-relative path as rows store it: forward slashes, no leading './'. */
function normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}

function warningsOf(row: RecordRow, d: Derived): Warning[] {
  const out: Warning[] = [];
  if (d.state === 'conflict') out.push('⚠ conflict');
  if (row.flagged) out.push('⚠ flagged');
  if (d.labels.includes(LABEL_NEWER_FAILS)) out.push('⚠ older value');
  if (d.labels.includes(LABEL_UNREVIEWED)) out.push('⚠ unreviewed newer value');
  return out;
}

function toServed(row: RecordRow, d: Derived): Served {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    state: d.state,
    tag: row.tag,
    key: row.key,
    observer: row.observer,
    recorded: row.recorded,
    trustSource: d.trustSource,
    labels: d.labels,
    paths: row.paths,
    warnings: warningsOf(row, d),
  };
}

/** The state, or null for an id the deriver does not know (a row that vanished mid-request). */
async function stateOf(d: Deriver, id: string): Promise<Derived | null> {
  try {
    return await d.state(id);
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}

function hintList(items: string[]): string[] {
  if (items.length <= MAX_HINTS) return items;
  return [...items.slice(0, MAX_HINTS), `… and ${items.length - MAX_HINTS} more`];
}

/**
 * Steps 2–5 of §7.2 over rows already in rank order: derive, keep the served states, pack until
 * the next record would pass the budget, label, or abstain with the reason.
 */
async function serve(
  ctx: Context,
  d: Deriver,
  batches: AsyncIterable<RecordRow[]> | Iterable<RecordRow[]>,
  include: readonly State[],
  budget: number,
): Promise<RecallResult | Abstain> {
  if (!Number.isFinite(budget) || budget < 0) throw new RangeError('budgetTokens must be a non-negative number');
  const keep = new Set<State>([...SERVED_BY_DEFAULT, ...include]);
  const served: Served[] = [];
  const held: { id: string; state: State; reason: string | null }[] = [];
  const counts = emptyCounts();
  let matches = 0;
  let tokensUsed = 0;
  let overBudget: Served | null = null;

  outer: for await (const batch of batches) {
    for (const row of batch) {
      const derived = await stateOf(d, row.id);
      if (derived === null) continue;
      matches++;
      counts[derived.state]++;
      if (!keep.has(derived.state)) {
        held.push({ id: row.id, state: derived.state, reason: derived.reason });
        continue;
      }
      const s = toServed(row, derived);
      const cost = estimateTokens(s);
      if (tokensUsed + cost > budget) {
        overBudget = s;
        break outer;
      }
      served.push(s);
      tokensUsed += cost;
    }
  }

  if (served.length > 0) {
    const now = ctx.now();
    for (const s of served) ctx.cache.setMeta(`recall:${s.id}`, now);
    return { served, abstain: false, tokensUsed };
  }
  if (matches === 0) return { abstain: true, reason: 'no records match', hints: [] };
  if (overBudget !== null) {
    return {
      abstain: true,
      reason: `${matches} matches but none fit the budget of ${budget} tokens`,
      hints: [`${overBudget.id} is ${overBudget.state} and needs ${estimateTokens(overBudget)} tokens`],
    };
  }
  const summary = STATES.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`)
    .join(', ');
  return {
    abstain: true,
    reason: `${matches} matches but none hold: ${summary}`,
    hints: hintList(held.map((h) => `${h.id} is ${h.state}${h.reason !== null ? ` (${h.reason})` : ''}`)),
  };
}

/** Facts before notes among hits whose scores are equal; otherwise the search order stands. */
function factsFirstOnTies(hits: { id: string; score: number }[], rows: Map<string, RecordRow>): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < hits.length) {
    const first = hits[i] as { score: number };
    let j = i + 1;
    const eps = 1e-9 * Math.abs(first.score);
    while (j < hits.length && Math.abs((hits[j] as { score: number }).score - first.score) <= eps) j++;
    const run = hits.slice(i, j).map((h) => h.id);
    const isFact = (id: string): boolean => rows.get(id)?.type === 'memory/fact';
    out.push(...run.filter(isFact), ...run.filter((id) => !isFact(id)));
    i = j;
  }
  return out;
}

/**
 * §7.2. The search is not pre-filtered by `supersedes`: whether a record is superseded depends on
 * whether its successor holds in this worktree (§6.3), so an older value can still be the one to
 * serve, and an abstain must be able to say the matches were superseded.
 */
export async function recall(ctx: Context, opts: RecallOptions): Promise<RecallResult | Abstain> {
  await ctx.sync();
  const d = await ctx.deriver();
  const cache = ctx.cache;
  async function* pages(): AsyncGenerator<RecordRow[]> {
    for (let offset = 0; ; offset += PAGE) {
      const hits = cache.search(opts.query, { limit: PAGE, offset });
      const rows = new Map<string, RecordRow>();
      for (const h of hits) {
        const row = cache.getRecord(h.id);
        if (row !== null) rows.set(h.id, row);
      }
      yield factsFirstOnTies(hits, rows).flatMap((id) => rows.get(id) ?? []);
      if (hits.length < PAGE) return;
    }
  }
  return serve(ctx, d, pages(), opts.include ?? [], opts.budgetTokens ?? DEFAULT_BUDGET_TOKENS);
}

/** Records quoting the path, or in the chain of the records with that key; then §7.2 steps 2–5. */
export async function about(ctx: Context, pathOrKey: string): Promise<RecallResult | Abstain> {
  await ctx.sync();
  const d = await ctx.deriver();
  const rows = ctx.cache.allRecords();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const target = normPath(pathOrKey);
  const ids = new Set<string>();
  for (const r of rows) if (r.paths.includes(target)) ids.add(r.id);
  for (const r of rows) {
    if (r.key !== pathOrKey) continue;
    for (const m of d.chainOf(r.id)) if (byId.has(m)) ids.add(m);
  }
  const ordered = [...ids]
    .map((id) => byId.get(id) as RecordRow)
    .sort((a, b) => Number(b.type === 'memory/fact') - Number(a.type === 'memory/fact') || (a.id < b.id ? -1 : 1));
  return serve(ctx, d, [ordered], [], DEFAULT_BUDGET_TOKENS);
}

/** The chain of an id or key, oldest root first (topological over supersedes; ties by id). */
export async function history(ctx: Context, idOrKey: string): Promise<HistoryEntry[]> {
  await ctx.sync();
  const d = await ctx.deriver();
  const chain = d.chainOf(idOrKey);
  if (chain.length === 0) return [];
  const members = new Set(chain);
  const tombs = new Map<string, { supersedes: Set<string>; trusted: boolean }>();
  for (const t of ctx.store.readTombstones()) {
    const entry = tombs.get(t.id) ?? { supersedes: new Set<string>(), trusted: false };
    for (const s of t.supersedes) entry.supersedes.add(s);
    entry.trusted ||= d.tombstoneTrusted(t);
    tombs.set(t.id, entry);
  }

  const entries = new Map<string, HistoryEntry>();
  const preds = new Map<string, Set<string>>();
  for (const id of chain) {
    const row = ctx.cache.getRecord(id);
    const tomb = tombs.get(id);
    const supersedes = row?.supersedes ?? [...(tomb?.supersedes ?? [])];
    const derived = await stateOf(d, id);
    if (derived === null) continue;
    entries.set(id, {
      id,
      title: row?.title ?? '',
      recorded: row?.recorded ?? '',
      observer: row?.observer ?? '',
      state: derived.state,
      supersedes,
      forgotten: tomb?.trusted ?? false,
    });
    const p = new Set([...supersedes, ...(tomb?.trusted ? tomb.supersedes : [])].filter((x) => members.has(x) && x !== id));
    preds.set(id, p);
  }

  // Kahn's algorithm, always taking the smallest ready id; members left on a cycle follow by id.
  const order: string[] = [];
  const remaining = new Set(entries.keys());
  for (;;) {
    let next: string | null = null;
    for (const id of remaining) {
      const ready = [...(preds.get(id) ?? [])].every((p) => !remaining.has(p));
      if (ready && (next === null || id < next)) next = id;
    }
    if (next === null) break;
    order.push(next);
    remaining.delete(next);
  }
  order.push(...[...remaining].sort());
  return order.map((id) => entries.get(id) as HistoryEntry);
}

/** §7.4: derive every record (or those quoting one of `files`), report and emit state changes. */
export async function verify(ctx: Context, opts: { files?: string[] } = {}): Promise<VerifyResult> {
  await ctx.sync();
  const d = await ctx.deriver();
  const worktree = ctx.layout.worktree;
  const files = opts.files === undefined ? null : new Set(opts.files.map(normPath));
  const states = emptyCounts();
  const changed: VerifyResult['changed'] = [];
  for (const row of ctx.cache.allRecords()) {
    if (files !== null && !row.paths.some((p) => files.has(p))) continue;
    const derived = await stateOf(d, row.id);
    if (derived === null) continue;
    const to = derived.state;
    states[to]++;
    const kept = ctx.cache.getVerifyState(worktree, row.id);
    const from = isState(kept) ? kept : null;
    if (from === to) continue;
    ctx.cache.putVerifyState(worktree, row.id, to);
    changed.push({ id: row.id, from, to });
    ctx.emit({ type: 'memory.state', id: row.id, worktree, from, to });
  }
  return { changed, states };
}

/**
 * §7.6: pending/local records that are superseded or stale and older than 90 days, and notes
 * older than 180 days not recalled in 180 days, move to archive (no tombstone). Committed facts
 * that are due are reported only. `recorded` is the age; `recall:<id>` meta is the last recall.
 */
export async function gc(ctx: Context, opts: { dryRun?: boolean; now?: string } = {}): Promise<GcResult> {
  const dryRun = opts.dryRun ?? false;
  const nowMs = Date.parse(opts.now ?? ctx.now());
  if (Number.isNaN(nowMs)) throw new RangeError('gc: now must be an ISO timestamp');
  await ctx.sync();
  const d = await ctx.deriver();
  const olderThan = (iso: string | null, days: number): boolean => {
    const t = iso === null ? NaN : Date.parse(iso);
    return Number.isNaN(t) || nowMs - t > days * DAY_MS;
  };

  const due: string[] = [];
  const committed: string[] = [];
  for (const row of ctx.cache.allRecords()) {
    if (Number.isNaN(Date.parse(row.recorded))) continue;
    const derived = await stateOf(d, row.id);
    if (derived === null) continue;
    const replaced = (derived.state === 'superseded' || derived.state === 'stale') && olderThan(row.recorded, GC_SUPERSEDED_DAYS);
    const unused =
      row.type === 'memory/note' &&
      olderThan(row.recorded, GC_NOTE_DAYS) &&
      olderThan(ctx.cache.getMeta(`recall:${row.id}`), GC_NOTE_DAYS);
    if (!replaced && !unused) continue;
    (row.area === 'facts' ? committed : due).push(row.id);
  }
  due.sort();
  committed.sort();
  if (dryRun) return { archived: due, committed, dryRun };

  const archived = ctx.cache.withWriteLock(() => {
    const moved: string[] = [];
    for (const id of due) {
      try {
        ctx.store.archive(id);
      } catch (e) {
        // Moved or removed by another process since the scan.
        if (e instanceof RecordError && e.reason === 'not-found') continue;
        throw e;
      }
      ctx.cache.deleteRecord(id);
      moved.push(id);
    }
    return moved;
  });
  return { archived, committed, dryRun };
}

/** Bring one archived record back into pending and index it. */
export async function gcRestore(ctx: Context, id: string): Promise<void> {
  ctx.cache.withWriteLock(() => ctx.store.restore(id));
  await ctx.sync();
}
