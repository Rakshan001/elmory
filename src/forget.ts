// Forget (spec §8): seed → cascade → under the lock tombstone, FTS/rows, files → compact → report.

import fs from 'node:fs';
import path from 'node:path';
import type { Context } from './context.js';
import { RefusedError, syncStore } from './gate.js';
import { RecordError, isRecordId, parse } from './record.js';

export type ForgetScope = { ids: string[] } | { query: string; confirm: true } | { all: true; confirm: true };

/** A query or everything, before the human confirms it (see `previewForget`). */
export type ForgetPreviewScope = { ids: string[] } | { query: string } | { all: true };

export interface ForgetReport {
  /** The seeds: ids in scope that exist here (a record, an archived file, a tombstone, or a reference). */
  deleted: string[];
  /** Records forgotten because they cite a seed (transitively), not already seeds; archived ones included. */
  cascaded: string[];
  /** Ids asked for that never existed here: not tombstoned, not in `deleted`. */
  unknown: string[];
  /** `done` only when wal_checkpoint(TRUNCATE) returned busy = 0 and no other cache generation is left. */
  compaction: 'done' | 'pending';
  /** What forget cannot reach: the seven strings of §8 step 8, in that order. */
  unreachable: string[];
}

/** What a forget of the scope would delete, without deleting anything. */
export interface ForgetPreview {
  seeds: { id: string; title: string }[];
  cascaded: { id: string; title: string }[];
  unknown: string[];
}

/** §8 step 8, verbatim. */
export const UNREACHABLE: readonly string[] = [
  'other branches/worktrees until the tombstone is committed and merged',
  'git history (commit the tombstone; rewrite history to erase)',
  'other clones until they pull — and only if the tombstone commit is signed by a trusted key',
  'agent transcripts (~/.claude/projects, Cursor, Codex logs)',
  'Baton journal and dashboard views already shown',
  'backups, Time Machine / APFS snapshots',
  'model provider prompt caches',
];

const ARCHIVED_FILE = /^(f_[a-z2-7]{26})\.md$/;

/** What the cascade needs of a record, indexed or archived. */
interface Node {
  title: string;
  cites: string[];
  supersedes: string[];
  /** published: it needs a committed tombstone too */
  facts: boolean;
}

/**
 * The regular record files in the archive area (never indexed, but forget must reach them, §8
 * steps 2 and 6). A file that does not parse still counts, with no links, so `--all` deletes it.
 */
function archivedNodes(ctx: Context): Map<string, Node> {
  const out = new Map<string, Node>();
  const dir = ctx.layout.archive;
  let names: string[];
  try {
    if (!fs.lstatSync(dir).isDirectory()) return out; // a symlinked area is never followed
    names = fs.readdirSync(dir).sort();
  } catch {
    return out;
  }
  for (const n of names) {
    const id = ARCHIVED_FILE.exec(n)?.[1];
    if (id === undefined) continue;
    const file = path.join(dir, n);
    try {
      if (!fs.lstatSync(file).isFile()) continue;
    } catch {
      continue;
    }
    let node: Node = { title: '', cites: [], supersedes: [], facts: false };
    try {
      const r = parse(fs.readFileSync(file, 'utf8')).record;
      node = { title: r.title, cites: r.cites.filter(isRecordId), supersedes: r.supersedes.filter(isRecordId), facts: false };
    } catch {
      // unparseable: still a file holding text, so still deletable
    }
    out.set(id, node);
  }
  return out;
}

/**
 * Every record forget can see: this worktree's view of the shared rows first (another worktree's
 * facts are not here to delete, §8 step 8), then archived files not also in the view.
 */
function graph(ctx: Context): Map<string, Node> {
  const nodes = new Map<string, Node>();
  for (const r of ctx.view()) {
    nodes.set(r.id, { title: r.title, cites: r.cites, supersedes: r.supersedes, facts: r.area === 'facts' });
  }
  for (const [id, n] of archivedNodes(ctx)) if (!nodes.has(id)) nodes.set(id, n);
  return nodes;
}

interface Plan {
  nodes: Map<string, Node>;
  seeds: string[];
  cascaded: string[];
  unknown: string[];
}

/**
 * Split the asked ids into seeds and ids that never existed here, then cascade over `cites`
 * (records that only supersede a seed are kept). An id exists when it has a record (indexed or
 * archived), a tombstone, or is named by a record's cites or supersedes (it lives elsewhere).
 */
function plan(ctx: Context, asked: string[]): Plan {
  const nodes = graph(ctx);
  const tombstoned = new Set(ctx.store.readTombstones().map((t) => t.id));
  const referenced = new Set<string>();
  for (const n of nodes.values()) for (const x of [...n.cites, ...n.supersedes]) referenced.add(x);
  const seeds: string[] = [];
  const unknown: string[] = [];
  for (const id of asked) {
    const known = nodes.has(id) || tombstoned.has(id) || referenced.has(id) || ctx.store.readRecord(id) !== null;
    (known ? seeds : unknown).push(id);
  }

  const all = new Set(seeds);
  const cascaded: string[] = [];
  for (let grew = true; grew; ) {
    grew = false;
    for (const [id, n] of nodes) {
      if (all.has(id) || !n.cites.some((c) => all.has(c))) continue;
      all.add(id);
      cascaded.push(id);
      grew = true;
    }
  }
  cascaded.sort();
  return { nodes, seeds, cascaded, unknown };
}

async function seedsOf(ctx: Context, scope: ForgetScope | ForgetPreviewScope, confirmed: boolean): Promise<string[]> {
  if (typeof scope !== 'object' || scope === null) throw new RefusedError('forget needs a scope', 'shape');
  if ('ids' in scope) {
    if (!Array.isArray(scope.ids)) throw new RefusedError('ids must be a list', 'shape');
    for (const id of scope.ids) if (typeof id !== 'string' || !isRecordId(id)) throw new RecordError(`not a record id: ${String(id)}`, 'id');
    return [...new Set(scope.ids)];
  }
  if (confirmed && (scope as { confirm?: unknown }).confirm !== true) {
    throw new RefusedError('forget by query or of everything needs confirm: true', 'confirm');
  }
  if ('query' in scope) {
    if (typeof scope.query !== 'string') throw new RefusedError('query must be a string', 'shape');
    // Straight from the search, not through recall: recall serves only the states `include` may
    // name (never candidate or forgotten) and stamps `recall:<id>`, so a preview would count as a
    // use. Every record of this worktree's view that matches is a seed, whatever its state.
    await ctx.sync();
    const mine = new Set(ctx.view().map((r) => r.id));
    return ctx.cache.search(scope.query, { limit: Number.MAX_SAFE_INTEGER, offset: 0 }).flatMap((h) => (mine.has(h.id) ? [h.id] : []));
  }
  if ((scope as { all?: unknown }).all === true) {
    await ctx.sync();
    return [...graph(ctx).keys()].sort();
  }
  throw new RefusedError('forget needs ids, a query, or all', 'shape');
}

/**
 * The seeds and the cascade a forget of `scope` would delete, with titles, deleting nothing.
 * §8 "matches of a query (confirmed first)": show this, then forget with `confirm: true`.
 */
export async function previewForget(ctx: Context, scope: ForgetPreviewScope): Promise<ForgetPreview> {
  const asked = await seedsOf(ctx, scope, false);
  await ctx.sync();
  const p = plan(ctx, asked);
  const titled = (id: string): { id: string; title: string } => ({ id, title: p.nodes.get(id)?.title ?? '' });
  return { seeds: p.seeds.map(titled), cascaded: p.cascaded.map(titled), unknown: p.unknown };
}

/**
 * §8. Seed, cascade over `cites` through indexed and archived records, then under the write
 * lock: tombstones for every id (common dir, plus the worktree dir for published records), the
 * FTS delete and row delete, then the files, and meta `compaction = pending`. After the lock:
 * compaction, and every other cache generation is deleted so none keeps the forgotten bytes.
 */
export async function forget(ctx: Context, scope: ForgetScope): Promise<ForgetReport> {
  // 1 seed
  const asked = await seedsOf(ctx, scope, true);

  const { deleted, cascaded, unknown } = ctx.cache.withWriteLock(() => {
    // Rows as they are now, inside the lock, so a record written meanwhile is cascaded too.
    syncStore(ctx.store, ctx.cache);
    // 2 cascade: every record (indexed or archived) citing a forgotten id, transitively
    const p = plan(ctx, asked);
    const ids = [...p.seeds, ...p.cascaded];

    // 3 tombstones (fsynced by the store's atomic write). A tombstone already on disk keeps its
    // supersedes, so forgetting an id twice never cuts it out of its chain.
    const earlier = new Map<string, Set<string>>();
    for (const t of ctx.store.readTombstones()) {
      const set = earlier.get(t.id) ?? new Set<string>();
      for (const s of t.supersedes) set.add(s);
      earlier.set(t.id, set);
    }
    for (const id of ids) {
      const node = p.nodes.get(id);
      const supersedes = [...new Set([...(node?.supersedes ?? []), ...(earlier.get(id) ?? [])])];
      ctx.store.writeTombstone(id, supersedes, 'local');
      if (node?.facts === true) ctx.store.writeTombstone(id, supersedes, 'committed');
    }
    // 4 + 5 FTS delete with the original values, then the row
    for (const id of ids) ctx.cache.deleteRecord(id);
    // 6 files: pending, local, archive and this worktree's facts
    for (const id of ids) ctx.store.unlink(id);
    // 7 starts here: pending until a compaction says otherwise, so a crash before it is retried
    ctx.cache.setMeta('compaction', 'pending');
    return { deleted: p.seeds, cascaded: p.cascaded, unknown: p.unknown };
  });

  // 7 compact; 'pending' stays in meta and is retried on the next open. The deletion has
  // happened, so a failing compaction is reported as pending, never thrown.
  let compaction: 'done' | 'pending';
  try {
    compaction = ctx.cache.compact();
  } catch {
    compaction = 'pending';
  }
  try {
    ctx.cache.sweepOld(0);
    // a generation still held by another process keeps its bytes: not done
    if (ctx.cache.otherGenerations().length > 0) compaction = 'pending';
  } catch {
    compaction = 'pending';
  }
  if (compaction === 'pending') {
    try {
      ctx.cache.setMeta('compaction', 'pending');
    } catch {
      // meta already says pending unless compact() finished; the report is what counts
    }
  }

  // 8 report
  return { deleted, cascaded, unknown, compaction, unreachable: [...UNREACHABLE] };
}
