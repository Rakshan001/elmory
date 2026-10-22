import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync, SQLOutputValue, StatementSync } from 'node:sqlite';
import type { RecordType, Source } from './record.js';
import type { StoredRecord } from './store.js';

// Loaded through createRequire so bundlers leave the builtin alone (global constraints).
const sqlite = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

/** The cache dir for a project (spec §5): `$XDG_CACHE_HOME/elmory/<id>`, else the platform default. */
export function defaultCacheDir(projectId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(projectId) || projectId === '.' || projectId === '..') {
    throw new Error(`invalid project id: ${JSON.stringify(projectId)}`);
  }
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg && path.isAbsolute(xdg)) return path.join(xdg, 'elmory', projectId);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'elmory', projectId);
  return path.join(os.homedir(), '.cache', 'elmory', projectId);
}

export type EvidenceResult = 'found' | 'not-found' | 'not-unique';
const EVIDENCE_RESULTS: readonly string[] = ['found', 'not-found', 'not-unique'];

/** One indexed record. Rebuildable from the record files at any time. */
export interface RecordRow {
  id: string;
  area: Exclude<StoredRecord['area'], 'archive'>;
  type: RecordType;
  title: string;
  body: string;
  key: string | null;
  tag: string | null;
  observer: string;
  recorded: string;
  supersedes: string[];
  cites: string[];
  sources: Source[];
  paths: string[];
  /** Reason from the index-time checks, null when clean. */
  candidate: string | null;
  /** Injection check. */
  flagged: boolean;
  /** File text as on disk. */
  text: string;
}

export interface StatKey {
  mtimeMs: number;
  ctimeMs: number;
  size: number;
  ino: number;
}

/** A rename lookup result as cached per (commit, tree); same shape as `git.ts`'s `RenameResult`. */
export interface RenameResultJson {
  status: 'same' | 'renamed' | 'deleted' | 'unknown';
  newPath?: string;
}

export class CacheBusyError extends Error {
  constructor(message = 'the elmory cache is busy: another process holds the write lock') {
    super(message);
    this.name = 'CacheBusyError';
  }
}

/** Applied to every new generation. Idempotent. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS records(
  id TEXT PRIMARY KEY, area TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  key TEXT, tag TEXT, observer TEXT NOT NULL, recorded TEXT NOT NULL,
  supersedes TEXT NOT NULL, cites TEXT NOT NULL, sources TEXT NOT NULL, paths TEXT NOT NULL,
  candidate TEXT, flagged INTEGER NOT NULL, text TEXT NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(title, body, key, paths, content='records', content_rowid='rowid');
INSERT INTO records_fts(records_fts, rank) VALUES('secure-delete', 1);
CREATE TABLE IF NOT EXISTS evidence(content_id TEXT NOT NULL, quote_hash TEXT NOT NULL, result TEXT NOT NULL,
  PRIMARY KEY(content_id, quote_hash));
CREATE TABLE IF NOT EXISTS stat(worktree TEXT NOT NULL, path TEXT NOT NULL, mtime REAL NOT NULL, ctime REAL NOT NULL,
  size INTEGER NOT NULL, ino TEXT NOT NULL, content_id TEXT NOT NULL, written_at REAL NOT NULL,
  PRIMARY KEY(worktree, path));
CREATE TABLE IF NOT EXISTS renames("commit" TEXT NOT NULL, tree TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY("commit", tree));
CREATE TABLE IF NOT EXISTS verify_state(worktree TEXT NOT NULL, id TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(worktree, id));
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;

const LOCK_SCHEMA = `
CREATE TABLE IF NOT EXISTS gen(k TEXT PRIMARY KEY, n INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS old(path TEXT PRIMARY KEY, retired_at REAL NOT NULL);
`;

const DAY_MS = 24 * 60 * 60 * 1000;
/** A stat entry written within this many ms of the file's mtime is not trusted (§4.3 read step 1). */
const RACY_MS = 2000;
const GEN_FILE = /^cache-(\d+)\.db(?:-wal|-shm)?$/;

/** 5 s (spec §9); tests may shorten it through `ELMORY_TEST_BUSY_MS`. */
function busyMs(): number {
  const raw = process.env.ELMORY_TEST_BUSY_MS;
  return raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : 5000;
}

function isBusy(e: unknown): boolean {
  const code = (e as { errcode?: unknown } | null)?.errcode;
  return typeof code === 'number' && (code & 0xff) === 5; // SQLITE_BUSY and its extended codes
}

function openDb(file: string, busy: number): DatabaseSync {
  const db = new sqlite.DatabaseSync(file);
  try {
    db.exec(`PRAGMA busy_timeout=${busy}; PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;`);
  } catch (e) {
    db.close();
    throw e;
  }
  return db;
}

function genPath(dir: string, n: number): string {
  return path.join(dir, `cache-${n}.db`);
}

/** Highest generation number with any file on disk (0 when none). */
function maxGenOnDisk(dir: string): number {
  let max = 0;
  for (const f of fs.readdirSync(dir)) {
    const m = GEN_FILE.exec(f);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function removeDbFiles(file: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(file + suffix, { force: true });
}

function readGen(lock: DatabaseSync): number | null {
  const r = lock.prepare("SELECT n FROM gen WHERE k = 'generation'").get();
  return r ? Number(r.n) : null;
}

/** Run fn in a write transaction on db: BEGIN IMMEDIATE, or a savepoint when one is already open. */
function tx<T>(db: DatabaseSync, fn: () => T): T {
  if (db.isTransaction) {
    db.exec('SAVEPOINT elmory_sp');
    try {
      const out = fn();
      db.exec('RELEASE elmory_sp');
      return out;
    } catch (e) {
      db.exec('ROLLBACK TO elmory_sp');
      db.exec('RELEASE elmory_sp');
      throw e;
    }
  }
  try {
    db.exec('BEGIN IMMEDIATE');
  } catch (e) {
    if (isBusy(e)) throw new CacheBusyError();
    throw e;
  }
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw e;
  }
}

/** Apply the schema unless it is already there (a hand-deleted cache file comes back empty). */
function ensureSchema(db: DatabaseSync): void {
  const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'records'").get();
  if (!has) tx(db, () => db.exec(SCHEMA));
}

function str(v: SQLOutputValue | undefined): string {
  return typeof v === 'string' ? v : String(v);
}

function strOrNull(v: SQLOutputValue | undefined): string | null {
  return v === null || v === undefined ? null : str(v);
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const RECORD_COLS =
  'id, area, type, title, body, key, tag, observer, recorded, supersedes, cites, sources, paths, candidate, flagged, text';

function toRow(r: Record<string, SQLOutputValue>): RecordRow {
  return {
    id: str(r.id),
    area: str(r.area) as RecordRow['area'],
    type: str(r.type) as RecordType,
    title: str(r.title),
    body: str(r.body),
    key: strOrNull(r.key),
    tag: strOrNull(r.tag),
    observer: str(r.observer),
    recorded: str(r.recorded),
    supersedes: JSON.parse(str(r.supersedes)) as string[],
    cites: JSON.parse(str(r.cites)) as string[],
    sources: JSON.parse(str(r.sources)) as Source[],
    paths: JSON.parse(str(r.paths)) as string[],
    candidate: strOrNull(r.candidate),
    flagged: Number(r.flagged) !== 0,
    text: str(r.text),
  };
}

/**
 * The rebuildable SQLite cache (spec §5, §6.1, §9). `lock.db` holds the write lock and the
 * current generation; `cache-<n>.db` holds every table. Rows are a convenience: deleting the
 * whole directory must not change any answer.
 */
export class Cache {
  readonly dir: string;
  generation: number;
  /** null on the Cache handed to `rebuild`'s fill: it is pinned to its new file, and the parent holds the lock. */
  #lock: DatabaseSync | null;
  #db: DatabaseSync;
  #busy: number;
  #stmts = new Map<string, StatementSync>();
  #lockDepth = 0;

  private constructor(dir: string, lock: DatabaseSync | null, db: DatabaseSync, generation: number, busy: number) {
    this.dir = dir;
    this.#lock = lock;
    this.#db = db;
    this.generation = generation;
    this.#busy = busy;
  }

  static open(projectId: string, dir?: string): Cache {
    const root = dir ?? defaultCacheDir(projectId);
    fs.mkdirSync(root, { recursive: true });
    const busy = busyMs();
    const lock = openDb(path.join(root, 'lock.db'), busy);
    try {
      lock.exec(LOCK_SCHEMA);
      let n = readGen(lock);
      if (n === null) n = Cache.#init(root, lock, busy);
      const db = openDb(genPath(root, n), busy);
      try {
        ensureSchema(db);
      } catch (e) {
        db.close();
        throw e;
      }
      return new Cache(root, lock, db, n, busy);
    } catch (e) {
      lock.close();
      throw e;
    }
  }

  /** First open: create the first generation under the lock. Never reuses a file already on disk. */
  static #init(root: string, lock: DatabaseSync, busy: number): number {
    try {
      lock.exec('BEGIN IMMEDIATE');
    } catch (e) {
      if (isBusy(e)) throw new CacheBusyError();
      throw e;
    }
    try {
      let n = readGen(lock);
      if (n === null) {
        n = maxGenOnDisk(root) + 1;
        const db = openDb(genPath(root, n), busy);
        try {
          tx(db, () => db.exec(SCHEMA));
        } finally {
          db.close();
        }
        lock.prepare("INSERT INTO gen(k, n) VALUES('generation', ?)").run(n);
      }
      lock.exec('COMMIT');
      return n;
    } catch (e) {
      if (lock.isTransaction) lock.exec('ROLLBACK');
      throw e;
    }
  }

  /** Re-read the generation from lock.db; reopen cache-<n>.db if it changed. Every public method calls it. */
  ensureCurrent(): void {
    const lock = this.#lock;
    if (lock === null || this.#db.isTransaction) return;
    const n = readGen(lock);
    if (n === null || n === this.generation) return;
    const db = openDb(genPath(this.dir, n), this.#busy);
    try {
      ensureSchema(db);
    } catch (e) {
      db.close();
      throw e;
    }
    this.#stmts.clear();
    this.#db.close();
    this.#db = db;
    this.generation = n;
  }

  /**
   * Run fn holding the write lock (BEGIN IMMEDIATE on lock.db), on the current generation.
   * fn must be synchronous. Throws CacheBusyError after the busy timeout. Re-entrant.
   */
  withWriteLock<T>(fn: () => T): T {
    const lock = this.#lock;
    if (lock === null || this.#lockDepth > 0) return fn();
    try {
      lock.exec('BEGIN IMMEDIATE');
    } catch (e) {
      if (isBusy(e)) throw new CacheBusyError();
      throw e;
    }
    this.#lockDepth++;
    try {
      this.ensureCurrent();
      const out = fn();
      if (out instanceof Promise) throw new TypeError('withWriteLock: fn must be synchronous');
      lock.exec('COMMIT');
      return out;
    } catch (e) {
      if (lock.isTransaction) lock.exec('ROLLBACK');
      throw e;
    } finally {
      this.#lockDepth--;
    }
  }

  /**
   * Under the lock: build a fresh generation, fill it, then publish it in lock.db. Readers keep
   * the old file until their next operation. Nothing is renamed over a db file (§9, V6): the new
   * generation number skips any file already on disk.
   */
  rebuild(fill: (fresh: Cache) => void): void {
    const lock = this.#lock;
    if (lock === null) throw new Error('rebuild: not allowed on a cache that is being rebuilt');
    this.withWriteLock(() => {
      const old = this.generation;
      const n = Math.max(old + 1, maxGenOnDisk(this.dir) + 1);
      const file = genPath(this.dir, n);
      const db = openDb(file, this.#busy);
      const fresh = new Cache(this.dir, null, db, n, this.#busy);
      try {
        tx(db, () => db.exec(SCHEMA));
        tx(db, () => {
          const out: unknown = fill(fresh);
          if (typeof (out as { then?: unknown } | null)?.then === 'function') {
            throw new TypeError('rebuild: fill must be synchronous');
          }
        });
      } catch (e) {
        fresh.close();
        removeDbFiles(file);
        throw e;
      }
      fresh.close();
      lock.prepare("UPDATE gen SET n = ? WHERE k = 'generation'").run(n);
      lock.prepare('INSERT OR REPLACE INTO old(path, retired_at) VALUES(?, ?)').run(genPath(this.dir, old), Date.now());
    });
    this.ensureCurrent();
  }

  /** Delete cache-<k>.db (k < current) older than maxAgeMs (default 24 h). Returns the deleted paths. */
  sweepOld(maxAgeMs: number = DAY_MS): string[] {
    const lock = this.#lock;
    if (lock === null) return [];
    return this.withWriteLock(() => {
      const retired = new Map<string, number>();
      for (const r of lock.prepare('SELECT path, retired_at FROM old').all()) retired.set(str(r.path), Number(r.retired_at));
      const now = Date.now();
      const deleted: string[] = [];
      for (const f of fs.readdirSync(this.dir)) {
        const m = /^cache-(\d+)\.db$/.exec(f);
        if (!m || Number(m[1]) >= this.generation) continue;
        const p = path.join(this.dir, f);
        const at = retired.get(p) ?? fs.statSync(p).mtimeMs;
        if (now - at < maxAgeMs) continue;
        removeDbFiles(p);
        lock.prepare('DELETE FROM old WHERE path = ?').run(p);
        deleted.push(p);
      }
      return deleted;
    });
  }

  close(): void {
    if (this.#db.isOpen) this.#db.close();
    if (this.#lock?.isOpen) this.#lock.close();
    this.#stmts.clear();
  }

  #stmt(sql: string): StatementSync {
    let s = this.#stmts.get(sql);
    if (!s) {
      s = this.#db.prepare(sql);
      this.#stmts.set(sql, s);
    }
    return s;
  }

  // -------------------------------------------------------------------------
  // records

  /** Delete-then-insert. The FTS index is kept through external-content 'delete' with the original values. */
  upsertRecord(row: RecordRow): void {
    this.ensureCurrent();
    tx(this.#db, () => {
      this.#remove(row.id);
      const paths = JSON.stringify(row.paths);
      const res = this.#stmt(`INSERT INTO records(${RECORD_COLS}) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        row.id,
        row.area,
        row.type,
        row.title,
        row.body,
        row.key,
        row.tag,
        row.observer,
        row.recorded,
        JSON.stringify(row.supersedes),
        JSON.stringify(row.cites),
        JSON.stringify(row.sources),
        paths,
        row.candidate,
        row.flagged ? 1 : 0,
        row.text,
      );
      this.#stmt('INSERT INTO records_fts(rowid, title, body, key, paths) VALUES(?, ?, ?, ?, ?)').run(
        res.lastInsertRowid,
        row.title,
        row.body,
        row.key,
        paths,
      );
    });
  }

  /** Returns the original values used for the FTS delete, or null when the id is unknown. */
  deleteRecord(id: string): { title: string; body: string } | null {
    this.ensureCurrent();
    return tx(this.#db, () => this.#remove(id));
  }

  #remove(id: string): { title: string; body: string } | null {
    const r = this.#stmt('SELECT rowid AS rid, title, body, key, paths FROM records WHERE id = ?').get(id);
    if (!r) return null;
    this.#stmt("INSERT INTO records_fts(records_fts, rowid, title, body, key, paths) VALUES('delete', ?, ?, ?, ?, ?)").run(
      r.rid ?? null,
      r.title ?? null,
      r.body ?? null,
      r.key ?? null,
      r.paths ?? null,
    );
    this.#stmt('DELETE FROM records WHERE id = ?').run(id);
    return { title: str(r.title), body: str(r.body) };
  }

  getRecord(id: string): RecordRow | null {
    this.ensureCurrent();
    const r = this.#stmt(`SELECT ${RECORD_COLS} FROM records WHERE id = ?`).get(id);
    return r ? toRow(r) : null;
  }

  allRecords(): RecordRow[] {
    this.ensureCurrent();
    return this.#stmt(`SELECT ${RECORD_COLS} FROM records ORDER BY id`).all().map(toRow);
  }

  knownIds(): Set<string> {
    this.ensureCurrent();
    return new Set(this.#stmt('SELECT id FROM records').all().map((r) => str(r.id)));
  }

  /**
   * Full-text search (spec §7.2 step 1). The query is escaped: every term (split on whitespace and NUL)
   * becomes a quoted phrase, OR-joined, so FTS syntax in the query is never interpreted.
   * score = -bm25(title 4, body 1, key 2, paths 1): higher is better; results are best first.
   */
  search(query: string, opts: { limit: number; offset: number; excludeIds?: Set<string> }): { id: string; score: number }[] {
    for (const [k, v] of [['limit', opts.limit], ['offset', opts.offset]] as const) {
      if (!Number.isSafeInteger(v) || v < 0) throw new RangeError(`search: ${k} must be a non-negative integer`);
    }
    const terms = query
      .replaceAll('\0', ' ') // FTS5 ends a quoted string at a NUL ("unterminated string")
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map((t) => `"${t.replaceAll('"', '""')}"`);
    if (terms.length === 0) return [];
    this.ensureCurrent();
    const rows = this.#stmt(
      `SELECT r.id AS id, bm25(records_fts, 4.0, 1.0, 2.0, 1.0) AS rank
         FROM records_fts JOIN records r ON r.rowid = records_fts.rowid
        WHERE records_fts MATCH ? AND r.id NOT IN (SELECT value FROM json_each(?))
        ORDER BY rank, r.id LIMIT ? OFFSET ?`,
    ).all(terms.join(' OR '), JSON.stringify([...(opts.excludeIds ?? [])]), opts.limit, opts.offset);
    return rows.map((r) => ({ id: str(r.id), score: -Number(r.rank) }));
  }

  // -------------------------------------------------------------------------
  // derived rows (short WAL transactions; keyed by content, so shared safely across worktrees)

  getEvidence(contentId: string, quoteHash: string): EvidenceResult | null {
    this.ensureCurrent();
    const r = this.#stmt('SELECT result FROM evidence WHERE content_id = ? AND quote_hash = ?').get(contentId, quoteHash);
    if (!r) return null;
    const v = str(r.result);
    return EVIDENCE_RESULTS.includes(v) ? (v as EvidenceResult) : null;
  }

  putEvidence(contentId: string, quoteHash: string, r: EvidenceResult): void {
    this.ensureCurrent();
    this.#stmt('INSERT OR REPLACE INTO evidence(content_id, quote_hash, result) VALUES(?, ?, ?)').run(contentId, quoteHash, r);
  }

  /** Content id for an unchanged file, or null on a miss or when the entry is racy (written within 2 s of the mtime). */
  statLookup(worktree: string, relPath: string, st: StatKey): string | null {
    this.ensureCurrent();
    // ino is stored and compared as text: inode numbers above 2^53 (NTFS file ids, overlayfs
    // xino) cannot be read back as a JS number. It is never read back.
    const r = this.#stmt(
      `SELECT content_id, written_at FROM stat
        WHERE worktree = ? AND path = ? AND mtime = ? AND ctime = ? AND size = ? AND ino = ?`,
    ).get(worktree, relPath, st.mtimeMs, st.ctimeMs, st.size, String(st.ino));
    if (!r) return null;
    if (Number(r.written_at) - st.mtimeMs < RACY_MS) return null;
    return str(r.content_id);
  }

  statPut(worktree: string, relPath: string, st: StatKey, contentId: string): void {
    this.ensureCurrent();
    this.#stmt(
      'INSERT OR REPLACE INTO stat(worktree, path, mtime, ctime, size, ino, content_id, written_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(worktree, relPath, st.mtimeMs, st.ctimeMs, st.size, String(st.ino), contentId, Date.now());
  }

  getRename(commit: string, tree: string): Record<string, RenameResultJson> | null {
    this.ensureCurrent();
    const r = this.#stmt('SELECT json FROM renames WHERE "commit" = ? AND tree = ?').get(commit, tree);
    return r ? (JSON.parse(str(r.json)) as Record<string, RenameResultJson>) : null;
  }

  putRename(commit: string, tree: string, map: Record<string, RenameResultJson>): void {
    this.ensureCurrent();
    this.#stmt('INSERT OR REPLACE INTO renames("commit", tree, json) VALUES(?, ?, ?)').run(commit, tree, JSON.stringify(map));
  }

  getVerifyState(worktree: string, id: string): string | null {
    this.ensureCurrent();
    const r = this.#stmt('SELECT state FROM verify_state WHERE worktree = ? AND id = ?').get(worktree, id);
    return r ? str(r.state) : null;
  }

  putVerifyState(worktree: string, id: string, state: string): void {
    this.ensureCurrent();
    this.#stmt('INSERT OR REPLACE INTO verify_state(worktree, id, state) VALUES(?, ?, ?)').run(worktree, id, state);
  }

  getMeta(k: string): string | null {
    this.ensureCurrent();
    const r = this.#stmt('SELECT v FROM meta WHERE k = ?').get(k);
    return r ? str(r.v) : null;
  }

  setMeta(k: string, v: string): void {
    this.ensureCurrent();
    this.#stmt('INSERT OR REPLACE INTO meta(k, v) VALUES(?, ?)').run(k, v);
  }

  /**
   * Erase freed bytes (spec §8 step 7): FTS 'optimize' → VACUUM → wal_checkpoint(TRUNCATE),
   * retried up to 20 × 50 ms until busy = 0. 'pending' when a reader still pins the WAL.
   * Records the outcome in meta `compaction`. Must not be called inside a transaction.
   */
  compact(): 'done' | 'pending' {
    this.ensureCurrent();
    const db = this.#db;
    db.exec("INSERT INTO records_fts(records_fts) VALUES('optimize')");
    db.exec('VACUUM');
    const checkpoint = (): boolean => {
      // A TRUNCATE checkpoint would otherwise wait the full busy timeout per attempt.
      db.exec('PRAGMA busy_timeout=0');
      try {
        return Number(db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()?.busy) === 0;
      } finally {
        db.exec(`PRAGMA busy_timeout=${this.#busy}`);
      }
    };
    let done = false;
    for (let i = 0; i < 20 && !done; i++) {
      done = checkpoint();
      if (!done) sleepSync(50);
    }
    const state = done ? 'done' : 'pending';
    this.setMeta('compaction', state);
    if (done) checkpoint(); // fold the meta write back so the WAL is empty again
    return state;
  }
}
