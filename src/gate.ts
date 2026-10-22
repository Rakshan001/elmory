// The gates of spec §3 layer 2: the index-time checks that run on every record (§4.4), and the
// write path of `remember` / `note` with its compare-and-set under the cache write lock (§7.1).

import fs from 'node:fs';
import path from 'node:path';
import type { Context } from './context.js';
import type { Cache, RecordRow } from './cache.js';
import { Deriver, type State } from './derive.js';
import type { AddedBy } from './git.js';
import { checkQuoteAtWrite, containsSecret } from './quote.js';
import {
  type ElmoryRecord,
  FORMAT_VERSION,
  type QuoteSource,
  type RecordType,
  type Source,
  type Tag,
  RecordError,
  isRecordId,
  lint,
  parse,
  recordId,
  serialize,
} from './record.js';
import type { Layout, StoredRecord, Store, Tombstone, Trust } from './store.js';

// ---------------------------------------------------------------------------
// index-time checks (§4.4)

const INJECTION: readonly RegExp[] = [
  /(ignore|disregard|forget) (all |any |the )?(previous|prior|above) (instructions|messages|rules)/i,
  /always run/i,
  /(curl|wget)\b[^\n]*(\||&&|;)\s*(sudo )?(sh|bash|zsh)\b/i,
];
const BASE64_RUN = /[A-Za-z0-9+/]{40,}={0,2}/g;
/** A path-like run: '/'-separated words, each letters optionally followed by digits (`src/v2/ChartPanel`). */
const PATH_SEGMENT = /^[A-Za-z]+[0-9]*$/;

function looksLikePath(run: string): boolean {
  return run.includes('/') && run.split('/').every((seg) => seg === '' || PATH_SEGMENT.test(seg));
}

/**
 * The first phrase that looks like a planted instruction, or null. A flag, never a refusal.
 * Whitespace is collapsed first, so "ignore  previous" matches; a base64-looking run that is
 * really a path is not flagged.
 */
export function injectionFlag(text: string): string | null {
  const flat = text.replace(/\s+/g, ' ');
  for (const re of INJECTION) {
    const m = re.exec(flat);
    if (m) return m[0];
  }
  for (const m of flat.matchAll(BASE64_RUN)) if (!looksLikePath(m[0])) return m[0];
  return null;
}

const QUOTE_HASH = /^sha256:[0-9a-f]{64}$/;
/** x-elmory-anchor: the 12-hex rendering of the 8-token rolling hash (quote.ts). */
const ANCHOR = /^[0-9a-f]{12}$/;
/** x-elmory-legacy-file: sha1(raw bytes)[:12] (§4.2). */
const LEGACY_FILE = /^[0-9a-f]{12}$/;
/** x-elmory-commit: an object name, or `none` when there was no HEAD. */
const COMMIT = /^(?:[0-9a-f]{4,64}|none)$/;
const MAX_PATH_BYTES = 1024;

function isQuote(s: Source): s is QuoteSource {
  return typeof (s as Partial<QuoteSource>).quote === 'string';
}

/** The repo-relative path rule: non-empty, not absolute, no `..` segment, no NUL, ≤ 1024 bytes. */
export function isRepoPath(p: unknown): p is string {
  if (typeof p !== 'string' || p === '' || p.includes('\0')) return false;
  if (Buffer.byteLength(p, 'utf8') > MAX_PATH_BYTES) return false;
  if (p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:/.test(p)) return false;
  return !p.split(/[/\\]/).includes('..');
}

/** Shape problems lint does not catch: path rule, anchor / commit / legacy-file shapes. */
function sourceProblems(sources: readonly Source[]): string[] {
  const out: string[] = [];
  for (const s of sources) {
    if (!isRepoPath(s.resource)) out.push(`resource is not a repo-relative path: ${JSON.stringify(s.resource)}`);
    if ('legacyFile' in s && typeof s.legacyFile === 'string') {
      if (!LEGACY_FILE.test(s.legacyFile)) out.push('x-elmory-legacy-file must be 12 hex characters');
      continue;
    }
    const q = s as Partial<QuoteSource>;
    if (typeof q.anchor !== 'string' || !ANCHOR.test(q.anchor)) out.push('x-elmory-anchor must be 12 hex characters');
    if (typeof q.commit !== 'string' || !COMMIT.test(q.commit)) out.push('x-elmory-commit must be a commit id or none');
  }
  return out;
}

/** Every string a record carries, field by field (checked one at a time, so no literal spans two). */
function recordStrings(r: ElmoryRecord): string[] {
  const out = [r.title, r.body, r.observer, ...r.supersedes, ...r.cites];
  if (r.key !== undefined) out.push(r.key);
  if (r.tag !== undefined) out.push(r.tag);
  if (r.legacyId !== undefined) out.push(r.legacyId);
  for (const s of r.sources) {
    out.push(s.resource);
    if (isQuote(s)) out.push(s.anchor, s.commit);
    else if ('legacyFile' in s) out.push(s.legacyFile);
  }
  return out.filter((x): x is string => typeof x === 'string');
}

/** The fields served as prose: title, body, observer. */
function servedProse(r: { title: string; body: string; observer: string }): string {
  return `${r.title}\n${r.body}\n${r.observer}`;
}

/**
 * The cache row for a record file, with the index-time checks applied. `candidate` is the first
 * failing check: 'lint' (unparseable), 'version' (written by a newer format, read-only),
 * 'edited' (name ≠ hash of the canonical form), 'lint' (lint errors, or a source whose path,
 * anchor or commit has the wrong shape), 'secret' (a secret in any field, or a quote field that
 * is not a hash, i.e. code copied into memory). `flagged` covers title, body and observer.
 *
 * The version check runs before the name check (the plan lists it after): a newer-format record
 * keeps keys this version drops when re-serialising, so its name never matches here and it would
 * otherwise always read 'edited'. Both are candidates either way.
 */
export function indexRecord(sr: StoredRecord): RecordRow {
  if (sr.area === 'archive') throw new RangeError(`indexRecord: archived records are not indexed (${sr.id})`);
  let parsed: { record: ElmoryRecord; readOnly: boolean };
  try {
    parsed = parse(sr.text);
  } catch (e) {
    if (!(e instanceof RecordError)) throw e;
    // Nothing usable: an empty row that is never served, flagged over the raw text.
    return {
      id: sr.id,
      area: sr.area,
      type: 'memory/note',
      title: '',
      body: '',
      key: null,
      tag: null,
      observer: '',
      recorded: '',
      supersedes: [],
      cites: [],
      sources: [],
      paths: [],
      candidate: 'lint',
      flagged: injectionFlag(sr.text) !== null,
      text: sr.text,
    };
  }
  const { record, readOnly } = parsed;
  let candidate: string | null = null;
  if (readOnly) candidate = 'version';
  else if (recordId(record) !== sr.id) candidate = 'edited';
  else if (lint(record).length > 0 || sourceProblems(record.sources).length > 0) candidate = 'lint';
  else if (
    recordStrings(record).some(containsSecret) ||
    record.sources.some((s) => isQuote(s) && !QUOTE_HASH.test(s.quote))
  ) {
    candidate = 'secret';
  }
  return {
    id: sr.id,
    area: sr.area,
    type: record.type,
    title: record.title,
    body: record.body,
    key: record.key ?? null,
    tag: record.tag ?? null,
    observer: record.observer,
    recorded: record.recorded,
    supersedes: record.supersedes,
    cites: record.cites,
    sources: record.sources,
    paths: record.sources.map((s) => s.resource),
    candidate,
    flagged: injectionFlag(servedProse(record)) !== null,
    text: sr.text,
  };
}

/**
 * Incremental load, synchronous so it can run inside the write lock: every record file in
 * facts, pending and local against the cache rows. A file whose id is new, or whose area or text
 * differs from its row (published, or edited by hand in place), is (re)indexed; a row whose file
 * is gone is deleted. When one id is in several areas the first of facts, pending, local wins,
 * as in `Store.readRecord`. `force` re-indexes every file (the index rules changed). The caller
 * holds the write lock (or owns a fresh rebuild cache).
 */
export function syncStore(store: Store, cache: Cache, force = false): void {
  const files = new Map<string, StoredRecord>();
  for (const sr of store.listRecords()) if (!files.has(sr.id)) files.set(sr.id, sr);
  const rows = new Map(cache.allRecords().map((r) => [r.id, r]));
  for (const [id, sr] of files) {
    const row = rows.get(id);
    if (force || row === undefined || row.area !== sr.area || row.text !== sr.text) cache.upsertRecord(indexRecord(sr));
  }
  for (const id of rows.keys()) if (!files.has(id)) cache.deleteRecord(id);
  cache.setMeta(INDEX_RULES_KEY, INDEX_RULES);
}

// ---------------------------------------------------------------------------
// the sync fingerprint (§9: a no-op load must not take the write lock or read every file)

const FINGERPRINT_KEY = 'sync:fingerprint';
const INDEX_RULES_KEY = 'sync:index-rules';
/** Bump when indexRecord's checks change, so rows indexed under older rules are redone. */
const INDEX_RULES = '2';
/** A directory changed this recently may change again within the same mtime tick (racy-clean, V14). */
const RACY_MS = 2000;

function statStamp(p: string, nowMs: number, racy: { hit: boolean } | null): string {
  try {
    const st = fs.statSync(p, { bigint: true });
    if (racy !== null && nowMs - Number(st.mtimeMs) < RACY_MS) racy.hit = true;
    return `${st.ino}:${st.size}:${st.mtimeNs}`;
  } catch {
    return '-';
  }
}

/** This worktree's git dir: `.git` itself, or the `gitdir:` a linked worktree's `.git` file names. */
function gitDirOf(worktree: string): string | null {
  const dotGit = path.join(worktree, '.git');
  try {
    const st = fs.lstatSync(dotGit);
    if (st.isDirectory()) return dotGit;
    if (!st.isFile()) return null;
    const m = /^gitdir: (.+)$/m.exec(fs.readFileSync(dotGit, 'utf8'));
    return m?.[1] === undefined ? null : path.resolve(worktree, m[1].trim());
  } catch {
    return null;
  }
}

/** HEAD as files say it (no git process): HEAD's text, the loose ref it names, packed-refs / reftable stamps. */
function headStamp(layout: Layout, nowMs: number): string {
  if (layout.commonDir === null) return 'no-git';
  const gitDir = gitDirOf(layout.worktree);
  if (gitDir === null) return '?';
  let head: string;
  try {
    head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
  } catch {
    return '?';
  }
  if (!head.startsWith('ref: ')) return head;
  const ref = head.slice('ref: '.length);
  let loose = '';
  if (ref.startsWith('refs/') && !ref.includes('\0') && !ref.split('/').includes('..')) {
    try {
      loose = fs.readFileSync(path.join(layout.commonDir, ref), 'utf8').trim();
    } catch {
      // packed, or unborn
    }
  }
  const packed = statStamp(path.join(layout.commonDir, 'packed-refs'), nowMs, null);
  const reftable = statStamp(path.join(layout.commonDir, 'reftable', 'tables.list'), nowMs, null);
  return `${head}|${loose}|${packed}|${reftable}`;
}

/**
 * A cheap stamp of everything a load reads: the record and tombstone directories (ino, size,
 * mtime: an entry added, removed or renamed changes them), the trust file, and HEAD. `racy` when
 * one of them changed within RACY_MS, so the stamp must not be trusted as "unchanged" later.
 * A record file rewritten in place (not by rename) does not change its directory's stamp.
 */
function fingerprint(layout: Layout): { value: string; racy: boolean } {
  const nowMs = Date.now();
  const racy = { hit: false };
  const dirs = [...new Set([layout.facts, layout.tombstones, layout.pending, layout.local, layout.localTombstones])];
  const parts = [layout.worktree, ...dirs.map((d) => statStamp(d, nowMs, racy)), statStamp(layout.trust, nowMs, racy), headStamp(layout, nowMs)];
  return { value: parts.join('\n'), racy: racy.hit };
}

/** True when the cache may be behind the files (the stamp moved, or the index rules changed). No lock. */
export function syncNeeded(store: Store, cache: Cache): boolean {
  return cache.getMeta(INDEX_RULES_KEY) !== INDEX_RULES || cache.getMeta(FINGERPRINT_KEY) !== fingerprint(store.layout).value;
}

/**
 * Under the write lock: syncStore only when the fingerprint moved (always when `full`); then
 * remember the stamp.
 */
export function syncIfChanged(store: Store, cache: Cache, full = false): void {
  const fp = fingerprint(store.layout);
  const force = cache.getMeta(INDEX_RULES_KEY) !== INDEX_RULES;
  if (!full && !force && cache.getMeta(FINGERPRINT_KEY) === fp.value) return;
  syncStore(store, cache, force);
  // Taken before the scan: a change during the scan leaves the stored stamp behind, so the next
  // load scans again. A racy stamp is not stored at all.
  cache.setMeta(FINGERPRINT_KEY, fp.racy ? '' : fp.value);
}

/** What a Deriver is built from, captured at one moment. */
export interface Snapshot {
  records: Map<string, RecordRow>;
  tombstones: Tombstone[];
  trust: Trust;
}

/** A Deriver over `rows` (default: what the cache holds now). Synchronous: `addedBy` is fetched beforehand. */
export function buildDeriver(ctx: Context, addedBy: Map<string, AddedBy>, rows?: readonly RecordRow[]): Deriver {
  return derive(ctx, addedBy, {
    records: new Map((rows ?? ctx.cache.allRecords()).map((r) => [r.id, r])),
    tombstones: ctx.store.readTombstones(),
    trust: ctx.store.readTrust(),
  });
}

function derive(ctx: Context, addedBy: Map<string, AddedBy>, snap: Snapshot): Deriver {
  return new Deriver({ ...snap, addedBy, evidence: (row) => ctx.evidence.checkAll(row.sources) });
}

// ---------------------------------------------------------------------------
// write gate (§7.1)

export interface RememberInput {
  text: string;
  title: string;
  tag?: Tag;
  key?: string;
  /** required for a fact (≥ 1), forbidden for a note */
  quotes?: { file: string; text: string }[];
  supersedes?: string[];
  cites?: string[];
  local?: boolean;
  observer?: string;
}

export interface WriteResult {
  id: string;
  /** `unknown` when the record was written but its state could not be derived (see `warnings`). */
  state: State;
  labels: string[];
  notes: string[];
  warnings: string[];
}

export class ConflictError extends Error {
  constructor(public readonly heads: string[]) {
    super('CONFLICT');
    this.name = 'ConflictError';
  }
}

/**
 * reasons: 'shape' | 'quote:<QuoteRefusal>' | 'secret' | 'forgotten' | 'untracked' | 'too-large' |
 * 'key' (a key spelled like a record id) | 'unknown-id' (supersedes an id not present here) |
 * 'local-ref' (a shareable record citing or superseding a local one, L7) | 'local' (publish of a
 * local record) | 'include' (a state recall never serves)
 */
export class RefusedError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = 'RefusedError';
  }
}

const MAX_QUOTE_FILE = 1024 * 1024;
const PLACEHOLDER_QUOTE = `sha256:${'0'.repeat(64)}`;
/** Stored as x-elmory-commit when there is no HEAD: never a sha, so a rename lookup is `unknown`. */
const NO_COMMIT = 'none';
// O_NOFOLLOW where the platform has it: the file read is the one realpath resolved.
const O_NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;

/**
 * Test hook only (Phase 4 Task 3 crash tests): when ELMORY_CRASH_AT names this step, the process
 * exits right after it, to prove a crash at any point of the locked write loses nothing. Inert
 * while the variable is unset.
 */
function crashPoint(step: 'ledger' | 'rename' | 'index'): void {
  if (process.env.ELMORY_CRASH_AT === step) process.exit(99);
}

/** Signals that the committed record/tombstone set moved between fetching addedBy and the lock. */
class StaleAddedBy extends Error {}

/** Resolve once, check the resolved path is a regular file inside the worktree, read that same file. */
function readQuoteFile(ctx: Context, file: string): string {
  const root = ctx.layout.worktree;
  let real: string;
  let fd: number;
  try {
    real = fs.realpathSync(path.join(root, file));
  } catch {
    throw new RefusedError(`quote file not found: ${file}`, 'untracked');
  }
  if (!real.startsWith(root + path.sep)) {
    throw new RefusedError(`quote file is not a regular file inside the worktree: ${file}`, 'untracked');
  }
  try {
    fd = fs.openSync(real, fs.constants.O_RDONLY | O_NOFOLLOW);
  } catch {
    throw new RefusedError(`quote file not found: ${file}`, 'untracked');
  }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) throw new RefusedError(`quote file is not a regular file inside the worktree: ${file}`, 'untracked');
    if (st.size > MAX_QUOTE_FILE) throw new RefusedError(`quote file is over 1 MiB: ${file}`, 'too-large');
    return fs.readFileSync(fd, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/** The record as it would be written, with `sources` given (placeholders during the shape check). */
function buildRecord(
  type: RecordType,
  input: RememberInput,
  observer: string,
  recorded: string,
  sources: QuoteSource[],
): ElmoryRecord {
  const r: ElmoryRecord = {
    type,
    title: input.title,
    version: FORMAT_VERSION,
    recorded,
    observer,
    supersedes: [...new Set(input.supersedes ?? [])],
    cites: [...new Set(input.cites ?? [])],
    sources,
    body: input.text,
  };
  if (input.tag !== undefined) r.tag = input.tag;
  if (input.key !== undefined) r.key = input.key;
  return r;
}

function isStringList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** Steps 1–4 of §7.1, no lock: shape, quotes, secrets, injection. Returns the located sources. */
async function prepare(
  ctx: Context,
  type: RecordType,
  input: RememberInput,
  observer: string,
  notes: string[],
): Promise<QuoteSource[]> {
  if (typeof input !== 'object' || input === null) throw new RefusedError('input must be an object', 'shape');
  const quotes = input.quotes ?? [];
  if (!Array.isArray(quotes)) throw new RefusedError('quotes must be a list', 'shape');
  if (type === 'memory/fact' && quotes.length === 0) {
    throw new RefusedError('a fact needs at least one quote; use note() for a decision or preference', 'shape');
  }
  if (type === 'memory/note' && quotes.length > 0) throw new RefusedError('a note takes no quotes', 'shape');
  if (typeof input.text !== 'string' || typeof input.title !== 'string') {
    throw new RefusedError('text and title must be strings', 'shape');
  }
  if (typeof observer !== 'string') throw new RefusedError('observer must be a string', 'shape');
  if (input.key !== undefined && typeof input.key !== 'string') throw new RefusedError('key must be a string', 'shape');
  if (input.tag !== undefined && typeof input.tag !== 'string') throw new RefusedError('tag must be a string', 'shape');
  for (const field of ['supersedes', 'cites'] as const) {
    const v: unknown = input[field];
    // null is read as absent (untyped JSON callers send it for an empty optional field)
    if (v !== undefined && v !== null && !isStringList(v)) throw new RefusedError(`${field} must be a list of record ids`, 'shape');
  }
  // A key spelled like a record id would be read as that id by chainOf (M2).
  if (input.key !== undefined && isRecordId(input.key)) {
    throw new RefusedError('a key must not look like a record id', 'key');
  }

  // 1 shape: lint a provisional record whose sources carry the real paths and placeholder hashes.
  for (const q of quotes) {
    if (typeof q?.file !== 'string' || typeof q.text !== 'string') {
      throw new RefusedError('each quote needs a file and a text', 'shape');
    }
  }
  const placeholders = quotes.map((q) => ({
    resource: q.file,
    quote: PLACEHOLDER_QUOTE,
    anchor: '000000000000',
    tokens: 1,
    commit: NO_COMMIT,
  }));
  let problems: string[];
  try {
    const provisional = buildRecord(type, input, observer, ctx.now(), placeholders);
    problems = [...lint(provisional), ...sourceProblems(provisional.sources)];
  } catch (e) {
    if (e instanceof RecordError) throw new RefusedError(e.message, 'shape');
    throw e;
  }
  if (problems.length > 0) throw new RefusedError(problems.join('; '), 'shape');

  // 2 quotes (§4.3 at write): tracked, ≤ 1 MiB, long enough, no secret, exactly one occurrence.
  const head = ctx.git === null ? null : await ctx.git.head();
  const sources: QuoteSource[] = [];
  for (const q of quotes) {
    // Without git there is nothing to be tracked by; the file must still be in the worktree.
    if (ctx.git !== null && !(await ctx.git.isTracked(q.file))) {
      throw new RefusedError(`quote file is not tracked by git: ${q.file}`, 'untracked');
    }
    const check = checkQuoteAtWrite(readQuoteFile(ctx, q.file), q.text);
    if (!check.ok) {
      const times = check.count === undefined ? '' : ` (found ${check.count} times)`;
      throw new RefusedError(`quote refused in ${q.file}: ${check.reason}${times}`, `quote:${check.reason}`);
    }
    sources.push({ resource: q.file, quote: check.quote, anchor: check.anchor, tokens: check.tokens, commit: head ?? NO_COMMIT });
  }
  const sourceShape = sourceProblems(sources);
  if (sourceShape.length > 0) throw new RefusedError(sourceShape.join('; '), 'shape');

  // 3 secrets: the same rule the index applies to every field, so a written record is never
  // `candidate: secret`.
  if (recordStrings(buildRecord(type, input, observer, ctx.now(), sources)).some(containsSecret)) {
    throw new RefusedError('the record looks like it contains a secret', 'secret');
  }

  // 4 injection: advisory only; the index flags it again on every load.
  const phrase = injectionFlag(servedProse({ title: input.title, body: input.text, observer }));
  if (phrase !== null) notes.push(`flagged: looks like an instruction to the agent ("${phrase}")`);
  return sources;
}

/** The sets addedBy speaks about: committed record files (names only) and committed tombstones. */
function committedSignature(layout: Layout, tombstones: Tombstone[]): string {
  let names: string[];
  try {
    names = fs.readdirSync(layout.facts).filter((n) => /^f_[a-z2-7]{26}\.md$/.test(n));
  } catch {
    names = [];
  }
  const tombs = tombstones.filter((t) => t.committed).map((t) => `t:${t.id}`);
  return [...names, ...tombs].sort().join(',');
}

/**
 * Heads that block a key (N1): the live heads, plus heads withheld only by an untrusted forget,
 * which still hold their slot (§8 V3: an unsigned commit cannot free a key).
 */
function blockingHeads(d: Deriver, records: Map<string, RecordRow>, tombstones: Tombstone[], chain: string[]): string[] {
  const live = new Set(d.liveHeads(chain));
  return d.heads(chain).filter((h) => {
    if (live.has(h)) return true;
    const row = records.get(h);
    if (row === undefined || row.candidate !== null || !d.trustOf(h).trusted) return false;
    const tombs = tombstones.filter((t) => t.id === h);
    return tombs.length > 0 && !tombs.some((t) => d.tombstoneTrusted(t));
  });
}

async function write(ctx: Context, type: RecordType, input: RememberInput): Promise<WriteResult> {
  const notes: string[] = [];
  const observer = input.observer ?? ctx.observer;
  const sources = await prepare(ctx, type, input, observer, notes);
  const area = input.local === true ? 'local' : 'pending';
  const supersedes = [...new Set(input.supersedes ?? [])];
  const cites = [...new Set(input.cites ?? [])];

  // Steps 5–11 under the lock. The lock callback must be synchronous, so the one async input of
  // the CAS, git's addedBy, is fetched first. The CAS needs only `chainOf` / `heads` / `trustOf`,
  // which are synchronous, so the Deriver for it is built inside the lock from rows synced inside
  // the lock. addedBy depends on the committed records and tombstones; if that set changed between
  // the fetch and the lock (a pull or checkout in between), the lock is released, addedBy is
  // fetched again and the write retried once. A second change in that window proceeds with the
  // newer fetch: a record it misses counts as unsigned, so it can only fail to block a write.
  let id = '';
  let addedBy: Map<string, AddedBy>;
  // Assigned inside the lock callback (`as` keeps TS from narrowing it to null).
  let snap = null as Snapshot | null;
  for (let attempt = 0; ; attempt++) {
    addedBy = await ctx.fetchAddedBy();
    const before = committedSignature(ctx.layout, ctx.store.readTombstones());
    try {
      id = ctx.cache.withWriteLock(() => {
        // 5 load
        syncIfChanged(ctx.store, ctx.cache);
        const tombstones = ctx.store.readTombstones();
        if (attempt === 0 && committedSignature(ctx.layout, tombstones) !== before) throw new StaleAddedBy();
        const records = new Map(ctx.cache.allRecords().map((r) => [r.id, r]));
        const trust = ctx.store.readTrust();
        const d = new Deriver({
          records,
          tombstones,
          trust,
          addedBy,
          evidence: () => Promise.reject(new Error('evidence is not used by the CAS')),
        });

        // 6 tombstone
        for (const target of [...supersedes, ...cites]) {
          if (tombstones.some((t) => t.id === target && d.tombstoneTrusted(t))) {
            throw new RefusedError(`${target} was forgotten`, 'forgotten');
          }
        }
        // L7: shared records cite and supersede only shared records; a supersede names a record here
        for (const target of supersedes) {
          if (!records.has(target)) throw new RefusedError(`no record ${target} to supersede`, 'unknown-id');
        }
        if (area !== 'local') {
          for (const target of [...supersedes, ...cites]) {
            if (records.get(target)?.area === 'local') {
              throw new RefusedError(`${target} is local; a shareable record cannot cite or supersede it`, 'local-ref');
            }
          }
        }

        // 7 CAS: every superseded id must be a current head of its chain
        for (const target of supersedes) {
          const heads = d.heads(d.chainOf(target));
          if (!heads.includes(target)) throw new ConflictError(heads);
        }
        // key given: every head of the key's chain must be superseded (no override)
        if (input.key !== undefined) {
          const heads = blockingHeads(d, records, tombstones, d.chainOf(input.key));
          if (heads.some((h) => !supersedes.includes(h))) throw new ConflictError(heads);
        }

        // 8 stamp
        const record = buildRecord(type, { ...input, supersedes, cites }, observer, ctx.now(), sources);
        const newId = recordId(record);
        // 9 ledger, before the file exists: a crash here leaves a harmless id with no file
        ctx.store.appendTrust(`written ${newId}`);
        crashPoint('ledger');
        // 10 write (commit point)
        ctx.store.writeRecord(area, record);
        crashPoint('rename');
        // 11 index, from the file on disk (the same precedence as sync)
        const stored = ctx.store.readRecord(newId) ?? {
          id: newId,
          area,
          path: path.join(ctx.layout[area], `${newId}.md`),
          text: serialize(record),
        };
        const row = indexRecord(stored);
        ctx.cache.upsertRecord(row);
        crashPoint('index');
        // The reply derives from this snapshot, never from a later read of the cache.
        records.set(newId, row);
        trust.written.add(newId);
        trust.rejected.delete(newId);
        snap = { records, tombstones, trust };
        return newId;
      });
      break;
    } catch (e) {
      if (e instanceof StaleAddedBy && attempt === 0) continue;
      throw e;
    }
  }

  // 12 reply: best effort. The write has committed, so a failure here never becomes a rejection
  // (a retrying caller would write a duplicate): the id comes back with state `unknown`.
  let state: State = 'unknown';
  let labels: string[] = [];
  const warnings: string[] = [];
  try {
    if (snap === null) throw new Error('no snapshot');
    ctx.evidence.resetMemo();
    const s = snap;
    const d = derive(ctx, addedBy, s);
    const mine = await d.state(id);
    state = mine.state;
    labels = mine.labels;
    const myPaths = new Set(s.records.get(id)?.paths ?? []);
    const myTitle = input.title.trim().toLowerCase();
    for (const row of s.records.values()) {
      if (row.id === id) continue;
      const sameFile = row.paths.some((p) => myPaths.has(p));
      const sameTitle = row.title.trim().toLowerCase() === myTitle;
      if (!sameFile && !sameTitle) continue;
      if ((await d.state(row.id)).state !== 'active') continue;
      if (sameFile) notes.push(`looks related to ${row.id} (same file)`);
      if (sameTitle) notes.push(`looks related to ${row.id} (same title)`);
    }
  } catch (e) {
    state = 'unknown';
    labels = [];
    warnings.push(`written, but its state could not be derived: ${(e as Error).message}`);
  }

  // 13 emit: never the text
  ctx.emit({ type: 'memory.write', id, worktree: ctx.layout.worktree, state });
  return { id, state, labels, notes, warnings };
}

/** Write a fact (`memory/fact`): needs ≥ 1 quote that locates exactly once in a tracked file. */
export function remember(ctx: Context, input: RememberInput): Promise<WriteResult> {
  return write(ctx, 'memory/fact', input);
}

/** Write a note (`memory/note`): no quotes; holds always, labelled "not code-checked". */
export function note(ctx: Context, input: Omit<RememberInput, 'quotes'>): Promise<WriteResult> {
  return write(ctx, 'memory/note', input);
}
