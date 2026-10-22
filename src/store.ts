import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { type ElmoryRecord, RecordError, isRecordId, lint, recordId, serialize } from './record.js';

export type Area = 'facts' | 'pending' | 'local' | 'archive';

/** Where every area lives (spec §5). */
export interface Layout {
  /** realpath of the worktree */
  worktree: string;
  /** realpath of `<git-common-dir>`, null without git */
  commonDir: string | null;
  /** `<worktree>/.elmory/facts`: published records, committed */
  facts: string;
  /** `<worktree>/.elmory/tombstones`: committed forgets */
  tombstones: string;
  /** Under `<commonDir>/elmory/`, or `<worktree>/.elmory/` without git. */
  pending: string;
  local: string;
  archive: string;
  trust: string;
  localTombstones: string;
  /** sha256(commonDir ?? worktree), first 16 hex chars */
  projectId: string;
}

export function resolveLayout(worktree: string, commonDir: string | null): Layout {
  const wt = fs.realpathSync(worktree);
  let common: string | null = null;
  if (commonDir !== null) {
    try {
      common = fs.realpathSync(commonDir);
    } catch {
      common = path.resolve(commonDir);
    }
  }
  const committed = path.join(wt, '.elmory');
  const base = common === null ? committed : path.join(common, 'elmory');
  return {
    worktree: wt,
    commonDir: common,
    facts: path.join(committed, 'facts'),
    tombstones: path.join(committed, 'tombstones'),
    pending: path.join(base, 'pending'),
    local: path.join(base, 'local'),
    archive: path.join(base, 'archive'),
    trust: path.join(base, 'trust'),
    localTombstones: path.join(base, 'tombstones'),
    projectId: createHash('sha256')
      .update(common ?? wt)
      .digest('hex')
      .slice(0, 16),
  };
}

export interface StoredRecord {
  id: string;
  area: Area;
  path: string;
  /** The file's text exactly as on disk (never re-canonicalised), so hand edits stay visible. */
  text: string;
}

export interface Tombstone {
  id: string;
  supersedes: string[];
  committed: boolean;
}

export interface Trust {
  written: Set<string>;
  approved: Set<string>;
  rejected: Set<string>;
  signers: Set<string>;
}

type TrustLine = `written ${string}` | `approved ${string}` | `rejected ${string}` | `signer ${string}`;

const VISIBLE: readonly Area[] = ['facts', 'pending', 'local'];
const ALL_AREAS: readonly Area[] = ['facts', 'pending', 'local', 'archive'];
const RECORD_FILE = /^(f_[a-z2-7]{26})\.md$/;
const TRUST_ID_LINE = /^(written|approved|rejected) f_[a-z2-7]{26}$/;
const TRUST_SIGNER_LINE = /^signer \S[^\r\n]*$/;
const TOMBSTONE_BODY = /^supersedes: \[([^\]\r\n]*)\]\s*$/;

const TMP_MAX_AGE_MS = 60 * 60 * 1000;

const errno = (e: unknown): string | undefined => (e as NodeJS.ErrnoException | null)?.code;

function isMissing(e: unknown): boolean {
  const code = errno(e);
  return code === 'ENOENT' || code === 'ENOTDIR';
}

type EntryKind = 'missing' | 'file' | 'dir' | 'symlink' | 'other';

/** What is at `p`, without following a symlink. */
function kindOf(p: string): EntryKind {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(p);
  } catch (e) {
    if (isMissing(e)) return 'missing';
    throw e;
  }
  if (st.isSymbolicLink()) return 'symlink';
  if (st.isFile()) return 'file';
  if (st.isDirectory()) return 'dir';
  return 'other';
}

function realOrResolved(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function symlinkError(what: string): RecordError {
  return new RecordError(`refusing ${what}: symlinked or outside the Elmory store`, 'symlink');
}

// O_NOFOLLOW closes the gap between the lstat check and the open where the platform has it.
const O_NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;

/** Text of a regular file; null when missing, a symlink, or not a regular file. */
function readRegular(file: string): string | null {
  if (kindOf(file) !== 'file') return null;
  let fd: number;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | O_NOFOLLOW);
  } catch (e) {
    const code = errno(e);
    if (isMissing(e) || code === 'ELOOP' || code === 'EMLINK') return null;
    throw e;
  }
  try {
    if (!fs.fstatSync(fd).isFile()) return null;
    return fs.readFileSync(fd, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/** Flush a directory entry after a rename, where the platform allows it. */
function fsyncDir(dir: string): void {
  let fd: number | undefined;
  try {
    fd = fs.openSync(dir, 'r');
    fs.fsyncSync(fd);
  } catch {
    // Not supported on every platform (e.g. Windows); the rename itself is still atomic.
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * temp → fsync → rename → fsync dir. The temp file is removed on any failure.
 * `dir` must already have passed `Store.writable`.
 */
function atomicWrite(dir: string, id: string, name: string, data: string | Uint8Array): void {
  const tmp = path.join(dir, `.tmp-${id}-${process.pid}-${randomBytes(6).toString('hex')}`);
  let fd: number | undefined;
  try {
    fd = fs.openSync(tmp, 'wx', 0o644);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, path.join(dir, name));
  } catch (e) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      // already gone, or never created
    }
    throw e;
  }
  fsyncDir(dir);
}

/**
 * Rename, falling back to copy + fsync + unlink across filesystems (EXDEV).
 * `toDir` must already have passed `Store.writable`.
 */
function moveFile(from: string, toDir: string, id: string, name: string): void {
  try {
    fs.renameSync(from, path.join(toDir, name));
  } catch (e) {
    if (errno(e) !== 'EXDEV') throw e;
    const data = readRegular(from);
    if (data === null) throw symlinkError(`non-regular record file ${from}`);
    atomicWrite(toDir, id, name, data);
    fs.unlinkSync(from);
  }
  fsyncDir(toDir);
  fsyncDir(path.dirname(from));
}

function assertId(id: string): void {
  if (!isRecordId(id)) throw new RecordError(`not a record id: ${id}`, 'id');
}

type DirState = 'ok' | 'missing' | 'unsafe';

/**
 * Owns every file write under the areas of spec §5. Records are immutable once written.
 *
 * Symlinks are never followed. Every area directory must resolve (realpath) to a real directory
 * under `realpath(worktree)/.elmory` (committed areas) or `<commonDir>/elmory` (private areas),
 * and those roots must not be symlinks themselves. An area that fails this is read as empty and
 * refused on write with `RecordError` (reason `symlink`). Symlinked record, tombstone and trust
 * files are skipped on read and refused on write or move.
 */
export class Store {
  /** Malformed trust lines and tombstone files that were skipped, one message each. */
  readonly warnings: string[] = [];
  private readonly committedRoot: string;
  private readonly privateRoot: string;

  constructor(readonly layout: Layout) {
    this.committedRoot = path.join(realOrResolved(layout.worktree), '.elmory');
    this.privateRoot =
      layout.commonDir === null ? this.committedRoot : path.join(realOrResolved(layout.commonDir), 'elmory');
  }

  private warn(message: string): void {
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }

  private fileOf(area: Area, id: string): string {
    return path.join(this.layout[area], `${id}.md`);
  }

  private rootOf(dir: string): string {
    return dir === this.layout.facts || dir === this.layout.tombstones ? this.committedRoot : this.privateRoot;
  }

  /** Whether `root` (`.elmory` or `<commonDir>/elmory`) is a real directory, missing, or unsafe. */
  private static rootState(root: string): DirState {
    const kind = kindOf(root);
    if (kind === 'dir') return 'ok';
    return kind === 'missing' ? 'missing' : 'unsafe';
  }

  /** `ok` only when `dir` is a real directory whose realpath sits under its store root. */
  private dirState(dir: string): DirState {
    const root = this.rootOf(dir);
    const rootState = Store.rootState(root);
    if (rootState !== 'ok') return rootState;
    const kind = kindOf(dir);
    if (kind === 'missing') return 'missing';
    if (kind !== 'dir') return 'unsafe';
    let real: string;
    try {
      real = fs.realpathSync(dir);
    } catch (e) {
      if (isMissing(e)) return 'missing';
      throw e;
    }
    const rel = path.relative(root, real);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) ? 'ok' : 'unsafe';
  }

  /** `dir` ready for writing: created when missing, refused when unsafe. */
  private writable(dir: string): string {
    let state = this.dirState(dir);
    if (state === 'missing') {
      fs.mkdirSync(dir, { recursive: true });
      state = this.dirState(dir);
    }
    if (state !== 'ok') throw symlinkError(`directory ${dir}`);
    return dir;
  }

  /** Names in an area dir that passes the gate; empty otherwise. */
  private names(dir: string): string[] {
    if (this.dirState(dir) !== 'ok') return [];
    try {
      return fs.readdirSync(dir).sort();
    } catch (e) {
      if (isMissing(e)) return [];
      throw e;
    }
  }

  /** The record file of `id` in `area` when it is a regular file in a safe area dir. */
  private regularRecord(area: Area, id: string): string | null {
    if (this.dirState(this.layout[area]) !== 'ok') return null;
    const file = this.fileOf(area, id);
    return kindOf(file) === 'file' ? file : null;
  }

  private areaDirs(): string[] {
    const l = this.layout;
    return [...new Set([l.facts, l.tombstones, l.pending, l.local, l.archive, l.localTombstones])];
  }

  /**
   * mkdir -p every area (idempotent), refusing unsafe ones, and remove `.tmp-*` files older than
   * an hour left behind by a crash, so they are never committed.
   */
  ensureDirs(): void {
    const cutoff = Date.now() - TMP_MAX_AGE_MS;
    for (const dir of this.areaDirs()) {
      this.writable(dir);
      for (const name of fs.readdirSync(dir)) {
        if (!name.startsWith('.tmp-')) continue;
        const file = path.join(dir, name);
        try {
          const st = fs.lstatSync(file);
          if ((st.isFile() || st.isSymbolicLink()) && st.mtimeMs < cutoff) fs.unlinkSync(file);
        } catch (e) {
          if (!isMissing(e)) throw e;
        }
      }
    }
  }

  /** Lint, then write `<id>.md` atomically. A record whose id is already in the area is a no-op. */
  writeRecord(area: 'pending' | 'local', r: ElmoryRecord): string {
    const problems = lint(r);
    if (problems.length > 0) throw new RecordError(`record fails lint: ${problems.join('; ')}`, 'lint');
    const text = serialize(r);
    const id = recordId(r);
    const dir = this.writable(this.layout[area]);
    const existing = kindOf(this.fileOf(area, id));
    if (existing === 'file') return id;
    if (existing !== 'missing') throw symlinkError(`non-regular entry for ${id} in ${area}`);
    atomicWrite(dir, id, `${id}.md`, text);
    return id;
  }

  /** First match in facts, pending, local (not archive); text exactly as on disk. */
  readRecord(id: string): StoredRecord | null {
    if (!isRecordId(id)) return null;
    for (const area of VISIBLE) {
      const file = this.regularRecord(area, id);
      if (file === null) continue;
      const text = readRegular(file);
      if (text !== null) return { id, area, path: file, text };
    }
    return null;
  }

  /**
   * Record ids named in one visible area, from the directory listing only (no file is read or
   * checked to be regular). An area that fails the store's directory gate lists nothing.
   */
  ids(area: 'facts' | 'pending' | 'local'): string[] {
    const out: string[] = [];
    for (const name of this.names(this.layout[area])) {
      const id = RECORD_FILE.exec(name)?.[1];
      if (id !== undefined) out.push(id);
    }
    return out;
  }

  /** Every regular record file in facts, pending and local; text exactly as on disk. */
  listRecords(): StoredRecord[] {
    const out: StoredRecord[] = [];
    for (const area of VISIBLE) {
      for (const name of this.names(this.layout[area])) {
        const m = RECORD_FILE.exec(name);
        if (!m?.[1]) continue;
        const file = path.join(this.layout[area], name);
        const text = readRegular(file);
        if (text !== null) out.push({ id: m[1], area, path: file, text });
      }
    }
    return out;
  }

  /** Append one line to the trust ledger and fsync it; a missing final newline is repaired first. */
  appendTrust(line: TrustLine): void {
    if (!TRUST_ID_LINE.test(line) && !TRUST_SIGNER_LINE.test(line)) {
      throw new RecordError(`bad trust line: ${JSON.stringify(line)}`, 'trust');
    }
    const trustDir = path.dirname(this.layout.trust);
    if (Store.rootState(this.privateRoot) === 'unsafe') throw symlinkError(`trust directory ${trustDir}`);
    fs.mkdirSync(trustDir, { recursive: true });
    if (Store.rootState(trustDir) !== 'ok') throw symlinkError(`trust directory ${trustDir}`);
    const kind = kindOf(this.layout.trust);
    if (kind !== 'file' && kind !== 'missing') throw symlinkError(`trust file ${this.layout.trust}`);
    const c = fs.constants;
    const fd = fs.openSync(this.layout.trust, c.O_RDWR | c.O_APPEND | c.O_CREAT | O_NOFOLLOW, 0o644);
    try {
      const size = fs.fstatSync(fd).size;
      let prefix = '';
      if (size > 0) {
        const last = Buffer.alloc(1);
        fs.readSync(fd, last, 0, 1, size - 1);
        if (last[0] !== 0x0a) prefix = '\n';
      }
      fs.writeFileSync(fd, `${prefix}${line}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  /** The trust ledger. Lines that do not match the ledger grammar are skipped with a warning. */
  readTrust(): Trust {
    const trust: Trust = { written: new Set(), approved: new Set(), rejected: new Set(), signers: new Set() };
    const rootState = Store.rootState(path.dirname(this.layout.trust));
    if (rootState === 'unsafe' || Store.rootState(this.privateRoot) === 'unsafe') {
      this.warn(`trust: skipped ${this.layout.trust}: symlinked or outside the store`);
      return trust;
    }
    if (rootState === 'missing') return trust;
    const kind = kindOf(this.layout.trust);
    if (kind === 'missing') return trust;
    const text = readRegular(this.layout.trust);
    if (text === null) {
      this.warn(`trust: skipped ${this.layout.trust}: not a regular file`);
      return trust;
    }
    text.split('\n').forEach((raw, n) => {
      const line = raw.trim();
      if (line === '') return;
      if (TRUST_ID_LINE.test(line)) {
        const [verb, id] = line.split(' ') as [string, string];
        // The latest line for an id wins: a `written` or `approved` after a `rejected` re-trusts
        // it (trustOf checks `rejected` first, so it only has to be dropped here).
        if (verb === 'written') trust.written.add(id);
        else if (verb === 'approved') trust.approved.add(id);
        else trust.rejected.add(id);
        if (verb !== 'rejected') trust.rejected.delete(id);
      } else if (TRUST_SIGNER_LINE.test(line)) {
        trust.signers.add(line.slice('signer '.length));
      } else {
        this.warn(`trust: skipped malformed line ${n + 1}: ${JSON.stringify(raw)}`);
      }
    });
    return trust;
  }

  /** One file per forgotten id, body `supersedes: [a, b]\n`. */
  writeTombstone(id: string, supersedes: string[], where: 'local' | 'committed'): void {
    assertId(id);
    for (const s of supersedes) assertId(s);
    const dir = this.writable(where === 'local' ? this.layout.localTombstones : this.layout.tombstones);
    const existing = kindOf(path.join(dir, id));
    if (existing !== 'file' && existing !== 'missing') throw symlinkError(`non-regular tombstone ${id}`);
    atomicWrite(dir, id, id, `supersedes: [${supersedes.join(', ')}]\n`);
  }

  /**
   * Tombstones from both dirs. `committed` is true for the worktree dir. Without git both dirs
   * are the same `.elmory/tombstones`, read once, and nothing there is committed. Only files
   * named by a record id count. One whose body is not `supersedes: [<ids>]` still counts as a
   * tombstone with `supersedes: []` (fail closed: the record stays hidden), plus a warning.
   */
  readTombstones(): Tombstone[] {
    const l = this.layout;
    const dirs: { dir: string; committed: boolean }[] =
      l.tombstones === l.localTombstones
        ? [{ dir: l.tombstones, committed: false }]
        : [
            { dir: l.tombstones, committed: true },
            { dir: l.localTombstones, committed: false },
          ];
    const out: Tombstone[] = [];
    for (const { dir, committed } of dirs) {
      for (const name of this.names(dir)) {
        if (!isRecordId(name)) continue;
        const file = path.join(dir, name);
        const text = readRegular(file);
        if (text === null) continue;
        const inner = TOMBSTONE_BODY.exec(text)?.[1]?.trim();
        const items = inner === undefined ? null : inner === '' ? [] : inner.split(',').map((s) => s.trim());
        if (items === null || !items.every(isRecordId)) {
          // Fail closed: the id stays forgotten, with no supersedes, and the problem is reported.
          this.warn(`tombstone: malformed ${file}; counted as a tombstone with supersedes: []`);
          out.push({ id: name, supersedes: [], committed });
          continue;
        }
        out.push({ id: name, supersedes: items, committed });
      }
    }
    return out;
  }

  /** Move pending records into the worktree facts dir (all pending when `ids` is omitted). */
  publish(ids?: string[]): string[] {
    this.writable(this.layout.facts);
    const wanted =
      ids ??
      this.names(this.layout.pending)
        .map((n) => RECORD_FILE.exec(n)?.[1])
        .filter((id): id is string => id !== undefined);
    const moved: string[] = [];
    for (const id of wanted) {
      if (!isRecordId(id)) continue;
      const from = this.regularRecord('pending', id);
      if (from === null) continue;
      this.moveRecord(from, 'facts', id);
      moved.push(id);
    }
    return moved;
  }

  /** Where an archived local record lives, so a restore puts it back into local (V25). */
  private get archivedLocal(): string {
    return path.join(this.layout.archive, 'local');
  }

  /**
   * pending → `archive/<id>.md`, local → `archive/local/<id>.md`: the origin area is kept so a
   * restore never turns a private record into a publishable one. Returns the areas archived
   * from; throws when the id is in neither.
   */
  archive(id: string): ('pending' | 'local')[] {
    assertId(id);
    const from: ('pending' | 'local')[] = [];
    for (const area of ['pending', 'local'] as const) {
      const file = this.regularRecord(area, id);
      if (file === null) continue;
      this.moveRecordTo(file, area === 'local' ? this.archivedLocal : this.layout.archive, id);
      from.push(area);
    }
    if (from.length === 0) throw new RecordError(`no pending or local record ${id}`, 'not-found');
    return from;
  }

  /**
   * Every archived copy of `id` back into the area it was archived from (`archive/<id>.md` →
   * pending, `archive/local/<id>.md` → local). Returns those areas; throws when none is archived.
   */
  restore(id: string): ('pending' | 'local')[] {
    assertId(id);
    const to: ('pending' | 'local')[] = [];
    const pendingCopy = this.regularRecord('archive', id);
    if (pendingCopy !== null) {
      this.moveRecord(pendingCopy, 'pending', id);
      to.push('pending');
    }
    const localCopy = this.archivedLocalFile(id);
    if (localCopy !== null) {
      this.moveRecord(localCopy, 'local', id);
      to.push('local');
    }
    if (to.length === 0) throw new RecordError(`no archived record ${id}`, 'not-found');
    return to;
  }

  /** `archive/local/<id>.md` when it is a regular file in a safe directory. */
  private archivedLocalFile(id: string): string | null {
    if (this.dirState(this.archivedLocal) !== 'ok') return null;
    const file = path.join(this.archivedLocal, `${id}.md`);
    return kindOf(file) === 'file' ? file : null;
  }

  /** Delete `id` from every area it is found in as a regular file; returns those areas. */
  unlink(id: string): Area[] {
    if (!isRecordId(id)) return [];
    const removed: Area[] = [];
    for (const area of ALL_AREAS) {
      const file = this.regularRecord(area, id);
      if (file === null) continue;
      try {
        fs.unlinkSync(file);
        removed.push(area);
      } catch (e) {
        if (!isMissing(e)) throw e;
      }
    }
    const archivedLocal = this.archivedLocalFile(id);
    if (archivedLocal !== null) {
      try {
        fs.unlinkSync(archivedLocal);
        if (!removed.includes('archive')) removed.push('archive');
      } catch (e) {
        if (!isMissing(e)) throw e;
      }
    }
    return removed;
  }

  /**
   * Records are immutable and named by content, so a regular copy already at the destination is
   * never overwritten (it may be a hand-edited committed file); the source copy is just dropped.
   * An unsafe destination directory or a non-regular destination entry is refused.
   */
  private moveRecord(from: string, to: Area, id: string): void {
    this.moveRecordTo(from, this.layout[to], id);
  }

  private moveRecordTo(from: string, toDir: string, id: string): void {
    const dir = this.writable(toDir);
    const dest = kindOf(path.join(dir, `${id}.md`));
    if (dest === 'file') {
      fs.unlinkSync(from);
      return;
    }
    if (dest !== 'missing') throw symlinkError(`non-regular entry for ${id} in ${toDir}`);
    moveFile(from, dir, id, `${id}.md`);
  }
}
