// The Elmory object (spec §3 layer 1) and the Context every flow receives.

import fs from 'node:fs';
import path from 'node:path';
import { Cache, type RecordRow } from './cache.js';
import type { Context, ElmoryEvent } from './context.js';
import { Deriver, FORGET_UNTRUSTED, committedTombstoneTrusted, forgetRefusable } from './derive.js';
import { Evidence } from './evidence.js';
import { type Exec, defaultExec, gitCommonDir } from './exec.js';
import * as gate from './gate.js';
import { type ForgetReport, type ForgetScope, forget } from './forget.js';
import { type AddedBy, type Credit, Git } from './git.js';
import * as flows from './recall.js';
import { RecordError, isRecordId } from './record.js';
import { type Layout, Store, resolveLayout } from './store.js';
import { resolveWorktree } from './worktree.js';

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
 * Cache meta key prefix an earlier build used to persist the history walk. Trust never comes from
 * the cache (V1, N1): such rows are deleted on open and never read.
 */
const LEGACY_ADDED_BY_META = 'addedby:';

interface WalkEntry {
  head: string;
  tree: string;
  credits: Map<string, Credit>;
}

/**
 * git's addedBy('.elmory') per worktree. The history walk (which commit each path is credited
 * to) is a function of HEAD's history alone, so it is reused while HEAD and HEAD's `.elmory`
 * tree are the ones it was computed at. It decides trust, so it lives in this process's memory
 * only, never in the cache (N1): a new process walks once. A walk is kept only when HEAD did not
 * move during it. Signatures are never reused: every fetch asks git again for the credited
 * commits (one batched `git log --no-walk`), so a key removed from the keyring or the allowed
 * signers file stops counting at once. `fresh` walks again whatever the key says (verify).
 */
class CommittedAddedBy {
  readonly #memo = new Map<string, WalkEntry>();

  async get(git: Git, worktree: string, fresh: boolean): Promise<Map<string, AddedBy>> {
    return git.signed(await this.#credits(git, worktree, fresh));
  }

  async #credits(git: Git, worktree: string, fresh: boolean): Promise<Map<string, Credit>> {
    const key = await git.headKey('.elmory');
    if (key === null) return git.credited('.elmory');
    const hit = this.#memo.get(worktree);
    if (!fresh && hit !== undefined && hit.head === key.head && hit.tree === key.tree) return hit.credits;
    const credits = await git.credited('.elmory');
    const after = await git.headKey('.elmory');
    if (after !== null && after.head === key.head && after.tree === key.tree) this.#memo.set(worktree, { ...key, credits });
    else this.#memo.delete(worktree);
    return credits;
  }
}

/**
 * git's addedBy for `.elmory` (from `committed`), minus every path whose working-tree bytes
 * differ from HEAD (N0): the signature covers the committed bytes, not an uncommitted edit of
 * them. The diff runs every time: it depends on the working tree, not on HEAD.
 */
async function signedAddedBy(
  exec: Exec,
  git: Git,
  worktree: string,
  committed: CommittedAddedBy,
  fresh = false,
): Promise<Map<string, AddedBy>> {
  const [addedBy, diff] = await Promise.all([
    committed.get(git, worktree, fresh),
    exec('git', ['diff', '--no-relative', '--name-only', '-z', 'HEAD', '--', ':(literal).elmory'], { cwd: worktree }),
  ]);
  if (addedBy.size === 0) return addedBy;
  if (diff.code !== 0) throw new Error(`git diff failed: ${diff.stderr.trim() || `exit ${diff.code}`}`);
  for (const p of diff.stdout.split('\0')) if (p !== '') addedBy.delete(p);
  return addedBy;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
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
  /** signedAddedBy for this worktree, shared by deriver() calls until the next sync() or write. */
  #addedBy: Promise<Map<string, AddedBy>> | null = null;
  /** git's addedBy per worktree: the history walk runs once per (HEAD, `.elmory` tree); signatures every fetch. */
  readonly #committed: CommittedAddedBy;
  /** Set by a full sync (verify): the next fetch walks the history again whatever HEAD is. */
  #freshWalk = false;
  /** gate.liftedForgets as of the last sync: approved records whose untrusted forget is refused (I3). */
  #lifted: ReadonlySet<string> = new Set();

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
    this.#committed = new CommittedAddedBy();
  }

  /**
   * resolveWorktree (the git toplevel) → gitCommonDir → resolveLayout → Store.ensureDirs →
   * Cache.open(projectId, cacheDir) → Git (null without git) → Evidence. Inside a repository but
   * outside any work tree (a bare repo, or inside `.git`) there is no place for `.elmory/facts`:
   * the directory resolveWorktree falls back to has no `.git` entry of its own, and that throws.
   */
  static async open(opts: OpenOptions): Promise<Elmory> {
    const exec = opts.exec ?? defaultExec;
    const worktree = await resolveWorktree(opts.worktree, exec);
    const commonDir = await gitCommonDir(exec, worktree);
    if (commonDir !== null && !fs.existsSync(path.join(worktree, '.git'))) {
      throw new Error(`not inside a git work tree: ${opts.worktree}`);
    }
    const layout = resolveLayout(worktree, commonDir);
    const store = new Store(layout);
    store.ensureDirs();
    const cache = Cache.open(layout.projectId, opts.cacheDir);
    try {
      const git = commonDir === null ? null : new Git(exec, layout.worktree);
      const evidence = new Evidence({ worktree: layout.worktree, cache, git });
      Elmory.#retryCompaction(cache);
      Elmory.#sweepRetired(cache);
      Elmory.#dropLegacyWalks(cache);
      return new Elmory(layout, store, cache, git, evidence, opts.observer ?? DEFAULT_OBSERVER, opts.now ?? (() => new Date().toISOString()), exec);
    } catch (e) {
      cache.close();
      throw e;
    }
  }

  /**
   * §8 step 7: a forget that left compaction pending is retried once here, as forget runs it:
   * compact, then delete every other cache generation. It is `done` only when compaction
   * finished and no other generation is left (one still held elsewhere keeps the forgotten
   * bytes); any failure keeps it pending for the next open.
   */
  static #retryCompaction(cache: Cache): void {
    try {
      if (cache.getMeta('compaction') !== 'pending') return;
    } catch {
      return;
    }
    let done = false;
    try {
      // compact() writes `done` or `pending` itself; `done` is withdrawn below unless the sweep empties.
      done = cache.compact() === 'done';
      cache.sweepOld(0);
      if (cache.otherGenerations().length > 0) done = false;
    } catch {
      done = false;
    }
    if (done) return;
    try {
      cache.setMeta('compaction', 'pending');
    } catch {
      // meta says pending unless compact() finished; the next open checks again either way
    }
  }

  /**
   * §9: delete cache generations retired (or left by a killed rebuild) more than 24 h ago, once
   * per open. Never waits for the lock: a held lock leaves them for the next open.
   */
  static #sweepRetired(cache: Cache): void {
    try {
      if (cache.otherGenerations().length === 0) return;
      cache.tryWithWriteLock(() => {
        cache.sweepOld();
        return true;
      });
    } catch {
      // the sweep is housekeeping: a failure never fails the open
    }
  }

  /** Delete history walks an earlier build kept in cache meta: never read, so never trusted (N1). */
  static #dropLegacyWalks(cache: Cache): void {
    try {
      cache.deleteMetaPrefix(LEGACY_ADDED_BY_META);
    } catch {
      // ignored either way; a busy cache retries on the next open
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
    if (opts.full === true) this.#freshWalk = true;
    // Which untrusted forgets an approval refuses can change without the fingerprint moving (a
    // key leaves the allowed signers): a change re-reads every file.
    const lifted = await this.#liftedNow();
    const liftMoved = !sameSet(lifted, this.#lifted);
    this.#lifted = lifted;
    const full = opts.full === true || liftMoved;
    if (!full && !gate.syncNeeded(this.store, this.cache)) return [];
    // tryWithWriteLock never waits: a held lock is null at once, not the 5 s busy timeout.
    const ran = this.cache.tryWithWriteLock(() => {
      gate.syncIfChanged(this.store, this.cache, full, lifted);
      return true;
    });
    return ran === null ? [INDEX_BUSY] : [];
  }

  /** gate.liftedForgets now; git's addedBy is fetched (and memoised) only when an approval may apply. */
  async #liftedNow(): Promise<ReadonlySet<string>> {
    if (!gate.liftMayApply(this.store)) return new Set();
    return gate.liftedForgets(this.store, await this.#memoAddedBy());
  }

  lifted(): ReadonlySet<string> {
    return this.#lifted;
  }

  /**
   * A new Deriver (and a fresh evidence memo) per request over `rows` (default: the cache now);
   * call `sync()` first. fetchAddedBy is memoised per instance until `sync()` or a write; under
   * it, the history walk is reused while HEAD and its `.elmory` tree stay the same (signatures
   * are checked again on every fetch).
   */
  async deriver(rows?: readonly RecordRow[]): Promise<Deriver> {
    const addedBy = await this.#memoAddedBy();
    this.evidence.resetMemo();
    return gate.buildDeriver(this, addedBy, rows);
  }

  view(): RecordRow[] {
    return gate.viewOfCache(this.store, this.cache, this.#lifted);
  }

  async fetchAddedBy(): Promise<Map<string, AddedBy>> {
    if (this.git === null) return new Map();
    const fresh = this.#freshWalk;
    const out = await signedAddedBy(this.#exec, this.git, this.layout.worktree, this.#committed, fresh);
    if (fresh) this.#freshWalk = false;
    return out;
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
      const addedBy = await signedAddedBy(this.#exec, git, layout.worktree, this.#committed);
      const deriver = new Deriver({
        records: new Map(gate.viewOfCache(store, this.cache, gate.liftedForgets(store, addedBy)).map((r) => [r.id, r])),
        tombstones: store.readTombstones(),
        trust: store.readTrust(),
        addedBy,
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
   * omitted). Only pending moves: naming a local record is refused (`RefusedError('local')`,
   * V25), and naming any other id not in pending is refused (`RefusedError('unknown-id')`).
   * Every id is checked before anything moves.
   */
  publish(ids?: string[]): string[] {
    this.#addedBy = null;
    return this.cache.withWriteLock(() => {
      const pending = new Set(this.store.ids('pending'));
      for (const id of ids ?? []) {
        if (pending.has(id)) continue;
        if (this.store.readRecord(id)?.area === 'local') {
          throw new gate.RefusedError(`${id} is local and is never published`, 'local');
        }
        throw new gate.RefusedError(`no pending record ${id} to publish`, 'unknown-id');
      }
      const moved = this.store.publish(ids);
      gate.syncIfChanged(this.store, this.cache, false, this.#lifted);
      return moved;
    });
  }

  /**
   * Every candidate with its reason, except those rejected here (reject hides). A record withheld
   * by an untrusted forget (reason FORGET_UNTRUSTED) is indexed without text, so its title is read
   * from its file here, for the reviewer only, and never cached.
   */
  async review(): Promise<{ id: string; reason: string; title: string }[]> {
    await this.sync();
    // One snapshot of this worktree's view: the Deriver and the loop see the same rows.
    const rows = this.view();
    const d = await this.deriver(rows);
    const out: { id: string; reason: string; title: string }[] = [];
    for (const row of rows) {
      const s = await d.state(row.id);
      if (s.state !== 'candidate' || s.reason === 'rejected') continue;
      let title = row.title;
      if (s.reason === FORGET_UNTRUSTED) {
        const sr = this.store.readRecord(row.id);
        title = sr === null ? '' : gate.indexRecord(sr).title;
      }
      out.push({ id: row.id, reason: s.reason ?? 'untrusted', title });
    }
    return out;
  }

  /**
   * Append `approved <id>` to the trust ledger. The record must be present in this worktree. The
   * latest ledger line for an id wins, so approving a rejected record re-trusts it. Approving a
   * record withheld by an untrusted forget refuses that forget: the record is indexed with its
   * text again and derived from its evidence, keeping its slot (`reject` accepts the forget).
   */
  async approve(id: string): Promise<void> {
    if (!isRecordId(id)) throw new RecordError(`not a record id: ${id}`, 'id');
    // A trusted forget (a local tombstone, or a committed one signed by a trusted key) always
    // wins: an approval refuses only an untrusted forget (I3).
    const trust = this.store.readTrust();
    const addedBy = await this.fetchAddedBy();
    for (const t of this.store.readTombstones()) {
      if (t.id !== id) continue;
      if (!t.committed || committedTombstoneTrusted(id, addedBy, trust)) {
        throw new gate.RefusedError(`${id} was forgotten by a trusted tombstone; an approval cannot bring it back`, 'forgotten');
      }
      if (!forgetRefusable(id, addedBy, trust)) {
        const status = addedBy.get(`.elmory/tombstones/${id}`)?.status ?? '';
        const why =
          status === 'G'
            ? 'was forgotten by a commit signed with a key the trust ledger does not list'
            : `was forgotten by a signed commit whose signature cannot be checked here (git %G? ${JSON.stringify(status)})`;
        throw new gate.RefusedError(
          `${id} ${why}; the forget stands (only a forget git reports as unsigned can be refused by approval; delete the tombstone in a commit to refuse this one)`,
          'forgotten',
        );
      }
    }
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
    const lifted = await this.#liftedNow();
    this.#lifted = lifted;
    this.cache.rebuild((fresh) => {
      gate.syncStore(this.store, fresh, false, lifted);
      // Last-recall stamps are not in any file; carry them over so gc's answer does not change.
      for (const row of fresh.allRecords()) {
        const stamp = this.cache.getMeta(`recall:${row.id}`);
        if (stamp !== null) fresh.setMeta(`recall:${row.id}`, stamp);
      }
      // A forget's pending compaction is still owed: the old generation holding those bytes is
      // only retired here, and the next open retries (M1).
      if (this.cache.getMeta('compaction') === 'pending') fresh.setMeta('compaction', 'pending');
    });
  }

  close(): void {
    this.cache.close();
  }
}
