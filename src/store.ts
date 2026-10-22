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

const errno = (e: unknown): string | undefined => (e as NodeJS.ErrnoException | null)?.code;

function isMissing(e: unknown): boolean {
  return errno(e) === 'ENOENT';
}

function readdirOrEmpty(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch (e) {
    if (isMissing(e)) return [];
    throw e;
  }
}

function readOrNull(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
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

/** temp → fsync → rename → fsync dir. The temp file is removed on any failure. */
function atomicWrite(dir: string, id: string, name: string, data: string | Uint8Array): void {
  fs.mkdirSync(dir, { recursive: true });
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

/** Rename, falling back to copy + fsync + unlink across filesystems (EXDEV). */
function moveFile(from: string, toDir: string, id: string, name: string): void {
  fs.mkdirSync(toDir, { recursive: true });
  try {
    fs.renameSync(from, path.join(toDir, name));
  } catch (e) {
    if (errno(e) !== 'EXDEV') throw e;
    atomicWrite(toDir, id, name, fs.readFileSync(from));
    fs.unlinkSync(from);
  }
  fsyncDir(toDir);
  fsyncDir(path.dirname(from));
}

function assertId(id: string): void {
  if (!isRecordId(id)) throw new RecordError(`not a record id: ${id}`, 'id');
}

/** Owns every file write under the areas of spec §5. Records are immutable once written. */
export class Store {
  constructor(readonly layout: Layout) {}

  private fileOf(area: Area, id: string): string {
    return path.join(this.layout[area], `${id}.md`);
  }

  /** mkdir -p every area (idempotent). */
  ensureDirs(): void {
    const l = this.layout;
    for (const dir of [l.facts, l.tombstones, l.pending, l.local, l.archive, l.localTombstones, path.dirname(l.trust)]) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /** Lint, then write `<id>.md` atomically. A record whose id is already in the area is a no-op. */
  writeRecord(area: 'pending' | 'local', r: ElmoryRecord): string {
    const problems = lint(r);
    if (problems.length > 0) throw new RecordError(`record fails lint: ${problems.join('; ')}`, 'lint');
    const text = serialize(r);
    const id = recordId(r);
    if (fs.existsSync(this.fileOf(area, id))) return id;
    atomicWrite(this.layout[area], id, `${id}.md`, text);
    return id;
  }

  /** First match in facts, pending, local (not archive); text exactly as on disk. */
  readRecord(id: string): StoredRecord | null {
    if (!isRecordId(id)) return null;
    for (const area of VISIBLE) {
      const file = this.fileOf(area, id);
      const text = readOrNull(file);
      if (text !== null) return { id, area, path: file, text };
    }
    return null;
  }

  /** Every record file in facts, pending and local; text exactly as on disk. */
  listRecords(): StoredRecord[] {
    const out: StoredRecord[] = [];
    for (const area of VISIBLE) {
      for (const name of readdirOrEmpty(this.layout[area]).sort()) {
        const m = RECORD_FILE.exec(name);
        if (!m?.[1]) continue;
        const file = path.join(this.layout[area], name);
        const text = readOrNull(file);
        if (text !== null) out.push({ id: m[1], area, path: file, text });
      }
    }
    return out;
  }

  /** Append one line to the trust ledger and fsync it. */
  appendTrust(line: TrustLine): void {
    if (!TRUST_ID_LINE.test(line) && !TRUST_SIGNER_LINE.test(line)) {
      throw new RecordError(`bad trust line: ${JSON.stringify(line)}`, 'trust');
    }
    fs.mkdirSync(path.dirname(this.layout.trust), { recursive: true });
    const fd = fs.openSync(this.layout.trust, 'a', 0o644);
    try {
      fs.writeFileSync(fd, `${line}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  readTrust(): Trust {
    const trust: Trust = { written: new Set(), approved: new Set(), rejected: new Set(), signers: new Set() };
    const text = readOrNull(this.layout.trust) ?? '';
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\r$/, '');
      const sp = line.indexOf(' ');
      if (sp < 0) continue;
      const kind = line.slice(0, sp);
      const value = line.slice(sp + 1);
      if (value === '') continue;
      if (kind === 'written') trust.written.add(value);
      else if (kind === 'approved') trust.approved.add(value);
      else if (kind === 'rejected') trust.rejected.add(value);
      else if (kind === 'signer') trust.signers.add(value);
    }
    return trust;
  }

  /** One file per forgotten id, body `supersedes: [a, b]\n`. */
  writeTombstone(id: string, supersedes: string[], where: 'local' | 'committed'): void {
    assertId(id);
    for (const s of supersedes) assertId(s);
    const dir = where === 'local' ? this.layout.localTombstones : this.layout.tombstones;
    atomicWrite(dir, id, id, `supersedes: [${supersedes.join(', ')}]\n`);
  }

  /**
   * Tombstones from both dirs. `committed` is true for the worktree dir. Without git both dirs
   * are the same `.elmory/tombstones`, read once, and nothing there is committed.
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
      for (const name of readdirOrEmpty(dir).sort()) {
        if (!isRecordId(name)) continue;
        const text = readOrNull(path.join(dir, name));
        if (text === null) continue;
        const m = TOMBSTONE_BODY.exec(text);
        const supersedes = (m?.[1] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(isRecordId);
        out.push({ id: name, supersedes, committed });
      }
    }
    return out;
  }

  /** Move pending records into the worktree facts dir (all pending when `ids` is omitted). */
  publish(ids?: string[]): string[] {
    const wanted =
      ids ??
      readdirOrEmpty(this.layout.pending)
        .map((n) => RECORD_FILE.exec(n)?.[1])
        .filter((id): id is string => id !== undefined)
        .sort();
    const moved: string[] = [];
    for (const id of wanted) {
      if (!isRecordId(id)) continue;
      const from = this.fileOf('pending', id);
      if (!fs.existsSync(from)) continue;
      this.moveRecord(from, 'facts', id);
      moved.push(id);
    }
    return moved;
  }

  /** pending | local → archive. Throws when the id is in neither. */
  archive(id: string): void {
    assertId(id);
    let found = false;
    for (const area of ['pending', 'local'] as const) {
      const from = this.fileOf(area, id);
      if (!fs.existsSync(from)) continue;
      this.moveRecord(from, 'archive', id);
      found = true;
    }
    if (!found) throw new RecordError(`no pending or local record ${id}`, 'not-found');
  }

  /** archive → pending. Throws when the id is not archived. */
  restore(id: string): void {
    assertId(id);
    const from = this.fileOf('archive', id);
    if (!fs.existsSync(from)) throw new RecordError(`no archived record ${id}`, 'not-found');
    this.moveRecord(from, 'pending', id);
  }

  /** Delete `id` from every area it is found in; returns those areas. */
  unlink(id: string): Area[] {
    if (!isRecordId(id)) return [];
    const removed: Area[] = [];
    for (const area of ALL_AREAS) {
      try {
        fs.unlinkSync(this.fileOf(area, id));
        removed.push(area);
      } catch (e) {
        if (!isMissing(e)) throw e;
      }
    }
    return removed;
  }

  /**
   * Records are immutable and named by content, so a copy already at the destination is never
   * overwritten (it may be a hand-edited committed file); the source copy is just dropped.
   */
  private moveRecord(from: string, to: Area, id: string): void {
    if (fs.existsSync(this.fileOf(to, id))) {
      fs.unlinkSync(from);
      return;
    }
    moveFile(from, this.layout[to], id, `${id}.md`);
  }
}
