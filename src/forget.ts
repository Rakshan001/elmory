// Forget (spec §8): seed → cascade → under the lock tombstone, FTS/rows, files → compact → report.

import fs from 'node:fs';
import path from 'node:path';
import type { Context } from './context.js';
import type { State } from './derive.js';
import { RefusedError, syncStore } from './gate.js';
import { recall } from './recall.js';
import { RecordError, isRecordId, parse } from './record.js';

export type ForgetScope = { ids: string[] } | { query: string; confirm: true } | { all: true; confirm: true };

export interface ForgetReport {
  /** The seeds: ids in scope. */
  deleted: string[];
  /** Records forgotten because they cite a seed (transitively), not already seeds. */
  cascaded: string[];
  /** `done` only when wal_checkpoint(TRUNCATE) returned busy = 0. */
  compaction: 'done' | 'pending';
  /** What forget cannot reach: the seven strings of §8 step 8, in that order. */
  unreachable: string[];
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

/** Exhaustive over State (the compiler checks it), so a query seed sees records in every state. */
const EVERY_STATE: Record<State, true> = {
  candidate: true,
  forgotten: true,
  superseded: true,
  conflict: true,
  stale: true,
  suspect: true,
  unknown: true,
  active: true,
};

const ARCHIVED_FILE = /^(f_[a-z2-7]{26})\.md$/;

/** Ids of the regular record files in the archive area (not indexed, but forget must reach them). */
function archivedIds(ctx: Context): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(ctx.layout.archive);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const n of names) {
    const id = ARCHIVED_FILE.exec(n)?.[1];
    if (id !== undefined) out.push(id);
  }
  return out;
}

/** `supersedes` of an archived record, read from its file; [] when absent or unparseable. */
function archivedSupersedes(ctx: Context, id: string): string[] {
  const file = path.join(ctx.layout.archive, `${id}.md`);
  try {
    if (!fs.lstatSync(file).isFile()) return [];
    return parse(fs.readFileSync(file, 'utf8')).record.supersedes.filter(isRecordId);
  } catch {
    return [];
  }
}

async function seedsOf(ctx: Context, scope: ForgetScope): Promise<string[]> {
  if (typeof scope !== 'object' || scope === null) throw new RefusedError('forget needs a scope', 'shape');
  if ('ids' in scope) {
    if (!Array.isArray(scope.ids)) throw new RefusedError('ids must be a list', 'shape');
    for (const id of scope.ids) if (typeof id !== 'string' || !isRecordId(id)) throw new RecordError(`not a record id: ${String(id)}`, 'id');
    return [...new Set(scope.ids)];
  }
  if ((scope as { confirm?: unknown }).confirm !== true) {
    throw new RefusedError('forget by query or of everything needs confirm: true', 'confirm');
  }
  if ('query' in scope) {
    if (typeof scope.query !== 'string') throw new RefusedError('query must be a string', 'shape');
    const r = await recall(ctx, {
      query: scope.query,
      include: Object.keys(EVERY_STATE) as State[],
      budgetTokens: Number.MAX_SAFE_INTEGER,
    });
    return r.abstain ? [] : r.served.map((s) => s.id);
  }
  if ((scope as { all?: unknown }).all === true) {
    await ctx.sync();
    return [...new Set([...ctx.cache.knownIds(), ...archivedIds(ctx)])].sort();
  }
  throw new RefusedError('forget needs ids, a query, or all', 'shape');
}

/**
 * §8. Seed, cascade over `cites` (records that only supersede a seed are kept), then under the
 * write lock: tombstones for every id (common dir, plus the worktree dir for published records),
 * the FTS delete and row delete, then the files. After the lock: compaction, and every older cache
 * generation is deleted so none keeps the forgotten bytes.
 */
export async function forget(ctx: Context, scope: ForgetScope): Promise<ForgetReport> {
  // 1 seed
  const seeds = await seedsOf(ctx, scope);

  const { deleted, cascaded } = ctx.cache.withWriteLock(() => {
    // Rows as they are now, inside the lock, so a record written meanwhile is cascaded too.
    syncStore(ctx.store, ctx.cache);
    const rows = new Map(ctx.cache.allRecords().map((r) => [r.id, r]));

    // 2 cascade: every record citing a forgotten id, transitively
    const all = new Set(seeds);
    const cascadedIds: string[] = [];
    for (let grew = true; grew; ) {
      grew = false;
      for (const row of rows.values()) {
        if (all.has(row.id) || !row.cites.some((c) => all.has(c))) continue;
        all.add(row.id);
        cascadedIds.push(row.id);
        grew = true;
      }
    }
    cascadedIds.sort();
    const ids = [...seeds, ...cascadedIds];

    // 3 tombstones (fsynced by the store's atomic write). A tombstone already on disk keeps its
    // supersedes, so forgetting an id twice never cuts it out of its chain.
    const earlier = new Map<string, Set<string>>();
    for (const t of ctx.store.readTombstones()) {
      const set = earlier.get(t.id) ?? new Set<string>();
      for (const s of t.supersedes) set.add(s);
      earlier.set(t.id, set);
    }
    for (const id of ids) {
      const row = rows.get(id);
      const supersedes = [...new Set([...(row?.supersedes ?? archivedSupersedes(ctx, id)), ...(earlier.get(id) ?? [])])];
      ctx.store.writeTombstone(id, supersedes, 'local');
      if (row?.area === 'facts') ctx.store.writeTombstone(id, supersedes, 'committed');
    }
    // 4 + 5 FTS delete with the original values, then the row
    for (const id of ids) ctx.cache.deleteRecord(id);
    // 6 files: pending, local, archive and this worktree's facts
    for (const id of ids) ctx.store.unlink(id);
    return { deleted: seeds, cascaded: cascadedIds };
  });

  // 7 compact; 'pending' is kept in meta and retried once on the next open
  const compaction = ctx.cache.compact();
  ctx.cache.sweepOld(0);

  // 8 report
  return { deleted, cascaded, compaction, unreachable: [...UNREACHABLE] };
}
