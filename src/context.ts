// The Context every flow receives (Phase 4 plan); src/api.ts imports these types from here.
import type { Cache, RecordRow } from './cache.js';
import type { Deriver, State } from './derive.js';
import type { Evidence } from './evidence.js';
import type { AddedBy, Git } from './git.js';
import type { Layout, Store } from './store.js';

export interface Context {
  layout: Layout;
  store: Store;
  cache: Cache;
  git: Git | null;
  evidence: Evidence;
  /** e.g. 'agent:claude-code' */
  observer: string;
  /** ISO UTC, injectable for tests */
  now(): string;
  /**
   * Incremental load: a no-op without the lock when nothing changed; otherwise index new files
   * with indexRecord and delete rows whose file is gone, under the write lock. Never throws
   * CacheBusyError: when the lock is busy it returns a warning and the cache stays as it was.
   * `full` re-reads every record file even when nothing seems to have changed.
   */
  sync(opts?: { full?: boolean }): Promise<string[]>;
  /** The records this worktree sees (§5): gate.viewOf over the shared cache rows and their file stamps. */
  view(): RecordRow[];
  /**
   * Deriver over `rows` (default view()), store.readTombstones(), store.readTrust(),
   * the addedBy map (empty without git), evidence bound to this worktree
   */
  deriver(rows?: readonly RecordRow[]): Promise<Deriver>;
  /**
   * git.addedBy('.elmory'), fetched now (never memoised), minus paths whose working-tree bytes
   * differ from HEAD; an empty map without git.
   */
  fetchAddedBy(): Promise<Map<string, AddedBy>>;
  /**
   * A Deriver for every other worktree of this repository that exists on disk, over that
   * worktree's own records (built without touching the cache rows); [] without git.
   */
  peerDerivers(): Promise<{ worktree: string; deriver: Deriver }[]>;
  emit(event: ElmoryEvent): void;
}

export type ElmoryEvent =
  | { type: 'memory.write'; id: string; worktree: string; state: State }
  | { type: 'memory.state'; id: string; worktree: string; from: State | null; to: State };
