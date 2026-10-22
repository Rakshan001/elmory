// The Elmory object (spec §3 layer 1) and the Context every flow receives.

import { Cache } from './cache.js';
import type { Deriver, State } from './derive.js';
import { Evidence } from './evidence.js';
import { type Exec, defaultExec, gitCommonDir } from './exec.js';
import * as gate from './gate.js';
import { Git } from './git.js';
import { RecordError, isRecordId } from './record.js';
import { type Layout, Store, resolveLayout } from './store.js';

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

export interface OpenOptions {
  worktree: string;
  observer?: string;
  exec?: Exec;
  /** Overrides `defaultCacheDir(projectId)`. */
  cacheDir?: string;
  now?: () => string;
}

export type { RememberInput, WriteResult } from './gate.js';
export { ConflictError, RefusedError } from './gate.js';

const DEFAULT_OBSERVER = 'agent:unknown';

export class Elmory implements Context {
  readonly #handlers = new Set<(e: ElmoryEvent) => void>();
  readonly #now: () => string;

  private constructor(
    readonly layout: Layout,
    readonly store: Store,
    readonly cache: Cache,
    readonly git: Git | null,
    readonly evidence: Evidence,
    readonly observer: string,
    now: () => string,
  ) {
    this.#now = now;
  }

  /** gitCommonDir → resolveLayout → Store.ensureDirs → Cache.open(projectId, cacheDir) → Git (null without git) → Evidence */
  static async open(opts: OpenOptions): Promise<Elmory> {
    const exec = opts.exec ?? defaultExec;
    const commonDir = await gitCommonDir(exec, opts.worktree);
    const layout = resolveLayout(opts.worktree, commonDir);
    const store = new Store(layout);
    store.ensureDirs();
    const cache = Cache.open(layout.projectId, opts.cacheDir);
    try {
      const git = commonDir === null ? null : new Git(exec, layout.worktree);
      const evidence = new Evidence({ worktree: layout.worktree, cache, git });
      return new Elmory(layout, store, cache, git, evidence, opts.observer ?? DEFAULT_OBSERVER, opts.now ?? (() => new Date().toISOString()));
    } catch (e) {
      cache.close();
      throw e;
    }
  }

  now(): string {
    return this.#now();
  }

  /** Under the write lock, so a row a concurrent writer just indexed is never dropped mid-write. */
  async sync(): Promise<void> {
    this.cache.withWriteLock(() => gate.syncStore(this.store, this.cache));
  }

  /** A new Deriver (and a fresh evidence memo) per request; call `sync()` first. */
  async deriver(): Promise<Deriver> {
    const addedBy = await gate.fetchAddedBy(this);
    this.evidence.resetMemo();
    return gate.buildDeriver(this, addedBy);
  }

  /** Handlers never see record text. A throwing handler does not break the write that emitted. */
  emit(event: ElmoryEvent): void {
    for (const h of this.#handlers) {
      try {
        h(event);
      } catch {
        // a listener's failure is its own
      }
    }
  }

  /** Subscribe; returns the unsubscribe function. */
  on(handler: (e: ElmoryEvent) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  remember(input: gate.RememberInput): Promise<gate.WriteResult> {
    return gate.remember(this, input);
  }

  note(input: Omit<gate.RememberInput, 'quotes'>): Promise<gate.WriteResult> {
    return gate.note(this, input);
  }

  /** Move pending records into this worktree's `.elmory/facts` (all when `ids` is omitted). */
  publish(ids?: string[]): string[] {
    return this.cache.withWriteLock(() => {
      const moved = this.store.publish(ids);
      gate.syncStore(this.store, this.cache);
      return moved;
    });
  }

  /** Every candidate with its reason, except those rejected here (reject hides). */
  async review(): Promise<{ id: string; reason: string; title: string }[]> {
    await this.sync();
    const d = await this.deriver();
    const out: { id: string; reason: string; title: string }[] = [];
    for (const row of this.cache.allRecords()) {
      const s = await d.state(row.id);
      if (s.state !== 'candidate' || s.reason === 'rejected') continue;
      out.push({ id: row.id, reason: s.reason ?? 'untrusted', title: row.title });
    }
    return out;
  }

  /** Append `approved <id>` to the trust ledger. The record must be present in this worktree. */
  async approve(id: string): Promise<void> {
    this.#trustLine('approved', id);
  }

  /** Append `rejected <id>`: hides the record here; the file stays. */
  async reject(id: string): Promise<void> {
    this.#trustLine('rejected', id);
  }

  #trustLine(verb: 'approved' | 'rejected', id: string): void {
    if (!isRecordId(id)) throw new RecordError(`not a record id: ${id}`, 'id');
    this.cache.withWriteLock(() => {
      gate.syncStore(this.store, this.cache);
      if (this.store.readRecord(id) === null) throw new RecordError(`no record ${id} in this worktree`, 'not-found');
      this.store.appendTrust(`${verb} ${id}`);
    });
  }

  /** A fresh cache generation indexed from every record file. */
  async rebuild(): Promise<void> {
    this.cache.rebuild((fresh) => gate.syncStore(this.store, fresh));
  }

  close(): void {
    this.cache.close();
  }
}
