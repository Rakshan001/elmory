// The read flows (spec §7.2–§7.4, §7.6): recall, about, history, verify and gc. Each is a function
// of the Context; state is always derived for the asking worktree, never read back from the cache.

import { CacheBusyError, type RecordRow } from './cache.js';
import type { Context } from './context.js';
import { type Derived, type Deriver, LABEL_NEWER_FAILS, LABEL_UNREVIEWED, type State, type TrustSource } from './derive.js';
import { RefusedError } from './gate.js';
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
/**
 * What `include` may add (§4.6). `candidate` (untrusted, edited, secret, rejected) is seen only
 * through review, and `forgotten` never: neither is one argument away from an agent.
 */
const INCLUDABLE: readonly State[] = ['active', 'conflict', 'superseded', 'stale', 'suspect', 'unknown'];

export type Warning = '⚠ conflict' | '⚠ flagged' | '⚠ older value' | '⚠ unreviewed newer value';

export interface RecallOptions {
  query: string;
  /** default 1500 */
  budgetTokens?: number;
  /** states served in addition to active and conflict: superseded, stale, suspect, unknown */
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
  /** e.g. 'index busy; results may be behind' */
  warnings: string[];
}

/** reason: 'no records match' | 'N matches but none hold: <state counts>' (or none fit the budget); hints name ids and states. */
export interface Abstain {
  abstain: true;
  reason: string;
  hints: string[];
  warnings: string[];
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

export interface HistoryResult {
  /** oldest first */
  entries: HistoryEntry[];
  warnings: string[];
}

export interface VerifyResult {
  changed: { id: string; from: State | null; to: State }[];
  states: Record<State, number>;
  warnings: string[];
}

export interface GcResult {
  /** pending/local records moved to archive (or that would be, on a dry run) */
  archived: string[];
  /** records in the committed facts area that are due: reported, never moved (delete them in a commit) */
  committed: string[];
  /** superseded or stale here, but not in another worktree of this repository: left in place */
  staleHere: string[];
  /**
   * old notes gc cannot judge yet: reason 'clock started' (no recall stamp, so a real gc stamped
   * it now; it is due once the window passes unused) or, on a dry run, 'no recall history'
   */
  skipped: { id: string; reason: string }[];
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

/** `include` checked against the allow-list; anything else is refused (I3). */
function checkInclude(include: unknown): State[] {
  if (include === undefined) return [];
  if (!Array.isArray(include)) throw new RefusedError('include must be a list of states', 'include');
  for (const s of include) {
    if (!(INCLUDABLE as readonly unknown[]).includes(s)) {
      throw new RefusedError(`include cannot name ${JSON.stringify(s)}: candidates are seen through review, forgotten records never`, 'include');
    }
  }
  return include as State[];
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
  warnings: string[],
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
    return { served, abstain: false, tokensUsed, warnings };
  }
  if (matches === 0) return { abstain: true, reason: 'no records match', hints: [], warnings };
  if (overBudget !== null) {
    return {
      abstain: true,
      reason: `${matches} matches but none fit the budget of ${budget} tokens`,
      hints: [`${overBudget.id} is ${overBudget.state} and needs ${estimateTokens(overBudget)} tokens`],
      warnings,
    };
  }
  const summary = STATES.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`)
    .join(', ');
  return {
    abstain: true,
    reason: `${matches} matches but none hold: ${summary}`,
    hints: hintList(held.map((h) => `${h.id} is ${h.state}${h.reason !== null ? ` (${h.reason})` : ''}`)),
    warnings,
  };
}

function sameScore(a: number, b: number): boolean {
  return Math.abs(b - a) <= 1e-9 * Math.abs(a);
}

/** Facts before notes among hits whose scores are equal; otherwise the search order stands. */
export function factsFirstOnTies(hits: { id: string; score: number }[], rows: Map<string, RecordRow>): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < hits.length) {
    const first = hits[i] as { score: number };
    let j = i + 1;
    while (j < hits.length && sameScore(first.score, (hits[j] as { score: number }).score)) j++;
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
  const include = checkInclude(opts.include);
  const warnings = await ctx.sync();
  // This worktree's view (§5), taken once: the search runs over the table every worktree shares,
  // so a hit is kept only when it is one of this worktree's records, and served as that record.
  const view = ctx.view();
  const byId = new Map(view.map((r) => [r.id, r]));
  const d = await ctx.deriver(view);
  // The ordered id list is taken once (M4): a row another process indexes mid-request cannot
  // shift a page boundary and serve a record twice.
  const hits = ctx.cache.search(opts.query, { limit: Number.MAX_SAFE_INTEGER, offset: 0 }).filter((h) => byId.has(h.id));
  function* pages(): Generator<RecordRow[]> {
    for (let i = 0; i < hits.length; ) {
      // A page never splits a run of equal scores, so facts-first holds across page boundaries.
      let j = Math.min(i + PAGE, hits.length);
      while (j < hits.length && sameScore((hits[j - 1] as { score: number }).score, (hits[j] as { score: number }).score)) j++;
      const page = hits.slice(i, j);
      const rows = new Map<string, RecordRow>();
      for (const h of page) rows.set(h.id, byId.get(h.id) as RecordRow);
      yield factsFirstOnTies(page, rows).flatMap((id) => rows.get(id) ?? []);
      i = j;
    }
  }
  return serve(ctx, d, pages(), include, opts.budgetTokens ?? DEFAULT_BUDGET_TOKENS, warnings);
}

/** Records quoting the path, or in the chain of the records with that key; then §7.2 steps 2–5. */
export async function about(ctx: Context, pathOrKey: string): Promise<RecallResult | Abstain> {
  const warnings = await ctx.sync();
  const rows = ctx.view();
  const d = await ctx.deriver(rows);
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
  return serve(ctx, d, [ordered], [], DEFAULT_BUDGET_TOKENS, warnings);
}

/** The chain of an id or key, oldest root first (topological over supersedes; ties by id). */
export async function history(ctx: Context, idOrKey: string): Promise<HistoryResult> {
  const warnings = await ctx.sync();
  const view = new Map(ctx.view().map((r) => [r.id, r]));
  const d = await ctx.deriver([...view.values()]);
  const chain = d.chainOf(idOrKey);
  if (chain.length === 0) return { entries: [], warnings };
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
    const row = view.get(id);
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
  return { entries: order.map((id) => entries.get(id) as HistoryEntry), warnings };
}

/**
 * §7.4: derive every record (or those quoting one of `files`), report and emit state changes.
 * The load is a full one: every record file is re-read, so a record edited in place is caught.
 */
export async function verify(ctx: Context, opts: { files?: string[] } = {}): Promise<VerifyResult> {
  const warnings = await ctx.sync({ full: true });
  const rows = ctx.view();
  const d = await ctx.deriver(rows);
  const worktree = ctx.layout.worktree;
  const files = opts.files === undefined ? null : new Set(opts.files.map(normPath));
  const states = emptyCounts();
  const changed: VerifyResult['changed'] = [];
  for (const row of rows) {
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
  return { changed, states, warnings };
}

/**
 * §7.6: pending/local records that are superseded or stale and older than 90 days, and notes
 * older than 180 days not recalled in 180 days, move to archive (no tombstone). Committed facts
 * that are due are reported only. `recorded` is the age; `recall:<id>` meta is the last recall.
 *
 * pending/ and local/ are shared by every worktree, but superseded and stale depend on the
 * worktree (§6.3): such a record is archived only when it is superseded or stale in every
 * worktree of the repository; otherwise it is reported in `staleHere` and left in place. An old
 * note with no recall stamp is not judged unused from missing data: a real gc stamps it now
 * (`skipped`, 'clock started'), so it is due once 180 more days pass without a recall.
 */
export async function gc(ctx: Context, opts: { dryRun?: boolean; now?: string } = {}): Promise<GcResult> {
  const dryRun = opts.dryRun ?? false;
  const nowMs = Date.parse(opts.now ?? ctx.now());
  if (Number.isNaN(nowMs)) throw new RangeError('gc: now must be an ISO timestamp');
  // gc acts on what it sees: an index that could not be brought up to date is an error here.
  if ((await ctx.sync()).length > 0) throw new CacheBusyError();
  const rows = ctx.view();
  const d = await ctx.deriver(rows);
  const olderThan = (iso: string, days: number): boolean => {
    const t = Date.parse(iso);
    return Number.isNaN(t) || nowMs - t > days * DAY_MS;
  };
  const replacedOrStale = (s: Derived | null): boolean => s !== null && (s.state === 'superseded' || s.state === 'stale');

  const due: string[] = [];
  const committed: string[] = [];
  const staleHere: string[] = [];
  const skipped: GcResult['skipped'] = [];
  const checkElsewhere: string[] = [];
  const startClock: string[] = [];
  for (const row of rows) {
    if (Number.isNaN(Date.parse(row.recorded))) continue;
    const derived = await stateOf(d, row.id);
    if (derived === null) continue;
    const replaced = replacedOrStale(derived) && olderThan(row.recorded, GC_SUPERSEDED_DAYS);
    let unused = false;
    if (row.type === 'memory/note' && olderThan(row.recorded, GC_NOTE_DAYS)) {
      const stamp = ctx.cache.getMeta(`recall:${row.id}`);
      if (stamp !== null) unused = olderThan(stamp, GC_NOTE_DAYS);
      else if (!replaced) {
        // No stamp (never recalled, or the cache was lost): start the clock rather than judge
        // disuse from missing data. A dry run reports it and writes nothing.
        skipped.push({ id: row.id, reason: dryRun ? 'no recall history' : 'clock started' });
        if (!dryRun) startClock.push(row.id);
      }
    }
    if (!replaced && !unused) continue;
    if (row.area === 'facts') committed.push(row.id);
    else if (unused) due.push(row.id);
    else checkElsewhere.push(row.id);
  }
  if (checkElsewhere.length > 0) {
    const peers = await ctx.peerDerivers();
    for (const id of checkElsewhere) {
      let everywhere = true;
      for (const p of peers) {
        if (!replacedOrStale(await stateOf(p.deriver, id))) {
          everywhere = false;
          break;
        }
      }
      (everywhere ? due : staleHere).push(id);
    }
  }
  due.sort();
  committed.sort();
  staleHere.sort();
  if (dryRun) return { archived: due, committed, staleHere, skipped, dryRun };

  const archived = ctx.cache.withWriteLock(() => {
    const stampedAt = new Date(nowMs).toISOString();
    for (const id of startClock) ctx.cache.setMeta(`recall:${id}`, stampedAt);
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
  return { archived, committed, staleHere, skipped, dryRun };
}

/** Bring one archived record back into the area it was archived from (local stays local) and index it. */
export async function gcRestore(ctx: Context, id: string): Promise<void> {
  ctx.cache.withWriteLock(() => ctx.store.restore(id));
  await ctx.sync();
}
