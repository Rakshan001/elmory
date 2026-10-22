// The Context every flow receives (Phase 4 plan); src/api.ts imports these types from here.
import type { Cache } from './cache.js';
import type { Deriver, State } from './derive.js';
import type { Evidence } from './evidence.js';
import type { Git } from './git.js';
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
  /** incremental load: store ids vs cache.knownIds(); index new files with indexRecord; delete rows whose file is gone */
  sync(): Promise<void>;
  /**
   * Deriver over cache.allRecords(), store.readTombstones(), store.readTrust(),
   * git.addedBy('.elmory') (facts and tombstones; empty map without git), evidence bound to this worktree
   */
  deriver(): Promise<Deriver>;
  emit(event: ElmoryEvent): void;
}

export type ElmoryEvent =
  | { type: 'memory.write'; id: string; worktree: string; state: State }
  | { type: 'memory.state'; id: string; worktree: string; from: State | null; to: State };
