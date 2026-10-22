// The Elmory object (spec §3 layer 1) and the Context every flow receives.

import { Cache } from './cache.js';
import type { Context, ElmoryEvent } from './context.js';
import type { Deriver } from './derive.js';
import { Evidence } from './evidence.js';
import { type Exec, defaultExec, gitCommonDir } from './exec.js';
import * as gate from './gate.js';
import { type AddedBy, Git } from './git.js';
import * as flows from './recall.js';
import { RecordError, isRecordId } from './record.js';
import { type Layout, Store, resolveLayout } from './store.js';

export type { Context, ElmoryEvent } from './context.js';

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
export type {
  Abstain,
  GcResult,
  HistoryEntry,
  RecallOptions,
  RecallResult,
  Served,
  VerifyResult,
  Warning,
} from './recall.js';

const DEFAULT_OBSERVER = 'agent:unknown';

export class Elmory implements Context {
  readonly #handlers = new Set<(e: ElmoryEvent) => void>();
  readonly #now: () => string;
  /** git's addedBy('.elmory'), shared by deriver() calls until the next sync() or write. */
  #addedBy: Promise<Map<string, AddedBy>> | null = null;

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
    this.#addedBy = null;
    this.cache.withWriteLock(() => gate.syncStore(this.store, this.cache));
  }

  /**
   * A new Deriver (and a fresh evidence memo) per request; call `sync()` first. git's addedBy is
   * memoised per instance (one `git log` instead of one per call) and dropped by `sync()` and by
   * every write.
   */
  async deriver(): Promise<Deriver> {
    const addedBy = await this.#fetchAddedBy();
    this.evidence.resetMemo();
    return gate.buildDeriver(this, addedBy);
  }

  #fetchAddedBy(): Promise<Map<string, AddedBy>> {
    if (this.#addedBy === null) {
      const p = gate.fetchAddedBy(this);
      this.#addedBy = p;
      // A failed fetch is not remembered: the next call tries again.
      p.catch(() => {
        if (this.#addedBy === p) this.#addedBy = null;
      });
    }
    return this.#addedBy;
  }

  /** Drop the addedBy memo, then run the write (and drop it again once the write is done). */
  async #writing<T>(fn: () => T | Promise<T>): Promise<T> {
    this.#addedBy = null;
    try {
      return await fn();
    } finally {
      this.#addedBy = null;
    }
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
    return this.#writing(() => gate.remember(this, input));
  }

  note(input: Omit<gate.RememberInput, 'quotes'>): Promise<gate.WriteResult> {
    return this.#writing(() => gate.note(this, input));
  }

  /** Move pending records into this worktree's `.elmory/facts` (all when `ids` is omitted). */
  publish(ids?: string[]): string[] {
    this.#addedBy = null;
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
    this.#addedBy = null;
    if (!isRecordId(id)) throw new RecordError(`not a record id: ${id}`, 'id');
    this.cache.withWriteLock(() => {
      gate.syncStore(this.store, this.cache);
      if (this.store.readRecord(id) === null) throw new RecordError(`no record ${id} in this worktree`, 'not-found');
      this.store.appendTrust(`${verb} ${id}`);
    });
  }

  /** §7.2: the records matching `query` that hold here, packed into the token budget, or an abstain. */
  recall(opts: flows.RecallOptions): Promise<flows.RecallResult | flows.Abstain> {
    return flows.recall(this, opts);
  }

  /** The records quoting a path, or in the chain of a key, that hold here. */
  about(pathOrKey: string): Promise<flows.RecallResult | flows.Abstain> {
    return flows.about(this, pathOrKey);
  }

  /** The chain of an id or key, oldest first. */
  history(idOrKey: string): Promise<flows.HistoryEntry[]> {
    return flows.history(this, idOrKey);
  }

  /** Derive every record (or those quoting `files`); report and emit the states that changed. */
  verify(opts: { files?: string[] } = {}): Promise<flows.VerifyResult> {
    return flows.verify(this, opts);
  }

  /** Archive old superseded/stale pending records and unused notes; committed facts are reported. */
  gc(opts: { dryRun?: boolean; now?: string } = {}): Promise<flows.GcResult> {
    return flows.gc(this, opts);
  }

  /** Bring one archived record back into pending and index it. */
  gcRestore(id: string): Promise<void> {
    return this.#writing(() => flows.gcRestore(this, id));
  }

  /** A fresh cache generation indexed from every record file. */
  async rebuild(): Promise<void> {
    this.cache.rebuild((fresh) => gate.syncStore(this.store, fresh));
  }

  close(): void {
    this.cache.close();
  }
}
