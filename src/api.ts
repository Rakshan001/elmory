// The Elmory object (spec §3 layer 1) and the Context every flow receives.

import fs from 'node:fs';
import { Cache, CacheBusyError, type RecordRow } from './cache.js';
import type { Context, ElmoryEvent } from './context.js';
import { Deriver } from './derive.js';
import { Evidence } from './evidence.js';
import { type Exec, defaultExec, gitCommonDir } from './exec.js';
import * as gate from './gate.js';
import { type ForgetReport, type ForgetScope, forget } from './forget.js';
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
export type { ForgetReport, ForgetScope } from './forget.js';
export type {
  Abstain,
  GcResult,
  HistoryEntry,
  HistoryResult,
  RecallOptions,
  RecallResult,
  Served,
  VerifyResult,
  Warning,
} from './recall.js';

const DEFAULT_OBSERVER = 'agent:unknown';
/** The warning a read carries when the index could not be brought up to date (§9). */
export const INDEX_BUSY = 'index busy; results may be behind';

/**
 * The top level of the work tree containing `dir` (git rev-parse --show-toplevel); `dir` itself
 * outside git. Inside a repository but outside any work tree (a bare repo, or inside `.git`)
 * there is no place for `.elmory/facts`, so that throws.
 */
async function workTreeRoot(exec: Exec, dir: string): Promise<string> {
  let top: string | null = null;
  try {
    const res = await exec('git', ['rev-parse', '--show-toplevel'], { cwd: dir });
    const out = res.stdout.replace(/\r?\n$/, '');
    if (res.code === 0 && out !== '') top = out;
  } catch {
    // git could not run: gitCommonDir decides below
  }
  if (top !== null) return top;
  if ((await gitCommonDir(exec, dir)) !== null) throw new Error(`not inside a git work tree: ${dir}`);
  return dir;
}

/**
 * git's addedBy for `.elmory`, minus every path whose working-tree bytes differ from HEAD (N0):
 * the signature covers the committed bytes, not an uncommitted edit of them.
 */
async function signedAddedBy(exec: Exec, git: Git, worktree: string): Promise<Map<string, AddedBy>> {
  const [addedBy, diff] = await Promise.all([
    git.addedBy('.elmory'),
    exec('git', ['diff', '--no-relative', '--name-only', '-z', 'HEAD', '--', ':(literal).elmory'], { cwd: worktree }),
  ]);
  if (addedBy.size === 0) return addedBy;
  if (diff.code !== 0) throw new Error(`git diff failed: ${diff.stderr.trim() || `exit ${diff.code}`}`);
  for (const p of diff.stdout.split('\0')) if (p !== '') addedBy.delete(p);
  return addedBy;
}

/** Every worktree `git worktree list` names that exists on disk (bare entries skipped), realpath'd. */
async function listWorktrees(exec: Exec, worktree: string): Promise<string[]> {
  const res = await exec('git', ['worktree', 'list', '--porcelain', '-z'], { cwd: worktree });
  if (res.code !== 0) throw new Error(`git worktree list failed: ${res.stderr.trim() || `exit ${res.code}`}`);
  const out: string[] = [];
  let current: string | null = null;
  const flush = (): void => {
    if (current === null) return;
    try {
      if (fs.statSync(current).isDirectory()) out.push(fs.realpathSync(current));
    } catch {
      // listed but gone (prunable)
    }
    current = null;
  };
  for (const token of res.stdout.split('\0')) {
    if (token.startsWith('worktree ')) {
      flush();
      current = token.slice('worktree '.length);
    } else if (token === 'bare') {
      current = null;
    }
  }
  flush();
  return [...new Set(out)];
}

export class Elmory implements Context {
  readonly #handlers = new Set<(e: ElmoryEvent) => void>();
  readonly #now: () => string;
  readonly #exec: Exec;
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
    exec: Exec,
  ) {
    this.#now = now;
    this.#exec = exec;
  }

  /** show-toplevel → gitCommonDir → resolveLayout → Store.ensureDirs → Cache.open(projectId, cacheDir) → Git (null without git) → Evidence */
  static async open(opts: OpenOptions): Promise<Elmory> {
    const exec = opts.exec ?? defaultExec;
    const worktree = await workTreeRoot(exec, opts.worktree);
    const commonDir = await gitCommonDir(exec, worktree);
    const layout = resolveLayout(worktree, commonDir);
    const store = new Store(layout);
    store.ensureDirs();
    const cache = Cache.open(layout.projectId, opts.cacheDir);
    try {
      const git = commonDir === null ? null : new Git(exec, layout.worktree);
      const evidence = new Evidence({ worktree: layout.worktree, cache, git });
      Elmory.#retryCompaction(cache);
      return new Elmory(layout, store, cache, git, evidence, opts.observer ?? DEFAULT_OBSERVER, opts.now ?? (() => new Date().toISOString()), exec);
    } catch (e) {
      cache.close();
      throw e;
    }
  }

  /** §8 step 7: a forget that left compaction pending is retried once here; failure keeps it pending. */
  static #retryCompaction(cache: Cache): void {
    try {
      if (cache.getMeta('compaction') === 'pending') cache.compact();
    } catch {
      // still pending: meta keeps saying so, and the next open tries again
    }
  }

  now(): string {
    return this.#now();
  }

  /**
   * The incremental load (§9). When the fingerprint of the record directories, the trust file and
   * HEAD is unchanged it returns at once, with no lock and no file read. Otherwise it indexes
   * under the write lock (rows are only ever written there, so a row a concurrent writer just
   * indexed is never dropped). `full` re-reads every record file even when the fingerprint is
   * unchanged (a record edited in place, not by rename, does not move it). A busy lock is not an
   * error for a read: the cache is used as it is and the warning says so.
   */
  async sync(opts: { full?: boolean } = {}): Promise<string[]> {
    this.#addedBy = null;
    if (opts.full !== true && !gate.syncNeeded(this.store, this.cache)) return [];
    try {
      this.cache.withWriteLock(() => gate.syncIfChanged(this.store, this.cache, opts.full === true));
    } catch (e) {
      if (e instanceof CacheBusyError) return [INDEX_BUSY];
      throw e;
    }
    return [];
  }

  /**
   * A new Deriver (and a fresh evidence memo) per request over `rows` (default: the cache now);
   * call `sync()` first. git's addedBy is memoised per instance (one `git log` instead of one per
   * call) and dropped by `sync()` and by every write.
   */
  async deriver(rows?: readonly RecordRow[]): Promise<Deriver> {
    const addedBy = await this.#memoAddedBy();
    this.evidence.resetMemo();
    return gate.buildDeriver(this, addedBy, rows);
  }

  view(): RecordRow[] {
    return gate.viewOf(this.store, this.cache.allRecords());
  }

  fetchAddedBy(): Promise<Map<string, AddedBy>> {
    return this.git === null ? Promise.resolve(new Map()) : signedAddedBy(this.#exec, this.git, this.layout.worktree);
  }

  #memoAddedBy(): Promise<Map<string, AddedBy>> {
    if (this.#addedBy === null) {
      const p = this.fetchAddedBy();
      this.#addedBy = p;
      // A failed fetch is not remembered: the next call tries again.
      p.catch(() => {
        if (this.#addedBy === p) this.#addedBy = null;
      });
    }
    return this.#addedBy;
  }

  /**
   * Every other worktree of this repository, each with a Deriver over its own facts and
   * tombstones plus the shared pending/local records, trust and cache-backed evidence. Its view
   * reuses the shared rows where they match and indexes the rest in memory; the cache is not written.
   */
  async peerDerivers(): Promise<{ worktree: string; deriver: Deriver }[]> {
    if (this.git === null || this.layout.commonDir === null) return [];
    const out: { worktree: string; deriver: Deriver }[] = [];
    for (const wt of await listWorktrees(this.#exec, this.layout.worktree)) {
      if (wt === this.layout.worktree) continue;
      const layout = resolveLayout(wt, this.layout.commonDir);
      const store = new Store(layout);
      const git = new Git(this.#exec, layout.worktree);
      const evidence = new Evidence({ worktree: layout.worktree, cache: this.cache, git });
      const deriver = new Deriver({
        records: new Map(gate.viewOf(store, this.cache.allRecords()).map((r) => [r.id, r])),
        tombstones: store.readTombstones(),
        trust: store.readTrust(),
        addedBy: await signedAddedBy(this.#exec, git, layout.worktree),
        evidence: (row) => evidence.checkAll(row.sources),
      });
      out.push({ worktree: layout.worktree, deriver });
    }
    return out;
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

  /**
   * Move pending records into this worktree's `.elmory/facts` (all pending when `ids` is
   * omitted). Only pending moves: naming a local record is refused (`RefusedError('local')`, V25).
   */
  publish(ids?: string[]): string[] {
    this.#addedBy = null;
    return this.cache.withWriteLock(() => {
      for (const id of ids ?? []) {
        if (this.store.readRecord(id)?.area === 'local') {
          throw new gate.RefusedError(`${id} is local and is never published`, 'local');
        }
      }
      const moved = this.store.publish(ids);
      gate.syncIfChanged(this.store, this.cache);
      return moved;
    });
  }

  /** Every candidate with its reason, except those rejected here (reject hides). */
  async review(): Promise<{ id: string; reason: string; title: string }[]> {
    await this.sync();
    // One snapshot of this worktree's view: the Deriver and the loop see the same rows.
    const rows = this.view();
    const d = await this.deriver(rows);
    const out: { id: string; reason: string; title: string }[] = [];
    for (const row of rows) {
      const s = await d.state(row.id);
      if (s.state !== 'candidate' || s.reason === 'rejected') continue;
      out.push({ id: row.id, reason: s.reason ?? 'untrusted', title: row.title });
    }
    return out;
  }

  /**
   * Append `approved <id>` to the trust ledger. The record must be present in this worktree. The
   * latest ledger line for an id wins, so approving a rejected record re-trusts it.
   */
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
  history(idOrKey: string): Promise<flows.HistoryResult> {
    return flows.history(this, idOrKey);
  }

  /** Derive every record (or those quoting `files`); report and emit the states that changed. */
  verify(opts: { files?: string[] } = {}): Promise<flows.VerifyResult> {
    return flows.verify(this, opts);
  }

  /**
   * Archive old superseded/stale pending/local records (only when due in every worktree) and
   * unused notes; committed facts are reported.
   */
  gc(opts: { dryRun?: boolean; now?: string } = {}): Promise<flows.GcResult> {
    return flows.gc(this, opts);
  }

  /** Bring one archived record back into the area it was archived from and index it. */
  gcRestore(id: string): Promise<void> {
    return this.#writing(() => flows.gcRestore(this, id));
  }

  /** §8: delete the scope and every record citing it; report what could not be reached. */
  forget(scope: ForgetScope): Promise<ForgetReport> {
    return this.#writing(() => forget(this, scope));
  }

  /** A fresh cache generation indexed from every record file. */
  async rebuild(): Promise<void> {
    this.cache.rebuild((fresh) => {
      gate.syncStore(this.store, fresh);
      // Last-recall stamps are not in any file; carry them over so gc's answer does not change.
      for (const row of fresh.allRecords()) {
        const stamp = this.cache.getMeta(`recall:${row.id}`);
        if (stamp !== null) fresh.setMeta(`recall:${row.id}`, stamp);
      }
    });
  }

  close(): void {
    this.cache.close();
  }
}
