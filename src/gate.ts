// The gates of spec §3 layer 2: the index-time checks that run on every record (§4.4), and the
// write path of `remember` / `note` with its compare-and-set under the cache write lock (§7.1).

import fs from 'node:fs';
import path from 'node:path';
import type { Context } from './api.js';
import type { Cache, RecordRow } from './cache.js';
import { Deriver, type State } from './derive.js';
import type { AddedBy } from './git.js';
import { checkQuoteAtWrite, containsSecret } from './quote.js';
import {
  type ElmoryRecord,
  FORMAT_VERSION,
  type QuoteSource,
  type RecordType,
  type Tag,
  RecordError,
  lint,
  parse,
  recordId,
  serialize,
} from './record.js';
import type { StoredRecord, Store, Tombstone } from './store.js';

// ---------------------------------------------------------------------------
// index-time checks (§4.4)

const INJECTION: readonly RegExp[] = [
  /ignore (all |any )?(previous|prior|above) (instructions|messages)/i,
  /always run/i,
  /(curl|wget)\b[^\n]*\|\s*(sh|bash|zsh)\b/i,
  /[A-Za-z0-9+/]{40,}={0,2}/, // base64 blob
];

/** The first phrase that looks like a planted instruction, or null. A flag, never a refusal. */
export function injectionFlag(text: string): string | null {
  for (const re of INJECTION) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

const QUOTE_HASH = /^sha256:[0-9a-f]{64}$/;

function isQuote(s: ElmoryRecord['sources'][number]): s is QuoteSource {
  return typeof (s as Partial<QuoteSource>).quote === 'string';
}

/**
 * The cache row for a record file, with the index-time checks applied. `candidate` is the first
 * failing check: 'lint' (unparseable), 'version' (written by a newer format, read-only),
 * 'edited' (name ≠ hash of the canonical form), 'lint' (lint errors), 'secret' (a secret in the
 * title or body, or a quote field that is not a hash, i.e. code copied into memory).
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
  else if (lint(record).length > 0) candidate = 'lint';
  else if (
    containsSecret(`${record.title}\n${record.body}`) ||
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
    flagged: injectionFlag(`${record.title}\n${record.body}`) !== null,
    text: sr.text,
  };
}

/**
 * Incremental load, synchronous so it can run inside the write lock: every record file in
 * facts, pending and local against the cache rows. A file whose id is new, or whose area or text
 * differs from its row (published, or edited by hand in place), is (re)indexed; a row whose file
 * is gone is deleted. When one id is in several areas the first of facts, pending, local wins,
 * as in `Store.readRecord`. The caller holds the write lock (or owns a fresh rebuild cache).
 */
export function syncStore(store: Store, cache: Cache): void {
  const files = new Map<string, StoredRecord>();
  for (const sr of store.listRecords()) if (!files.has(sr.id)) files.set(sr.id, sr);
  const rows = new Map(cache.allRecords().map((r) => [r.id, r]));
  for (const [id, sr] of files) {
    const row = rows.get(id);
    if (row === undefined || row.area !== sr.area || row.text !== sr.text) cache.upsertRecord(indexRecord(sr));
  }
  for (const id of rows.keys()) if (!files.has(id)) cache.deleteRecord(id);
}

/** A Deriver over what the cache and store hold now. Synchronous: `addedBy` is fetched beforehand. */
export function buildDeriver(ctx: Context, addedBy: Map<string, AddedBy>): Deriver {
  return new Deriver({
    records: new Map(ctx.cache.allRecords().map((r) => [r.id, r])),
    tombstones: ctx.store.readTombstones(),
    trust: ctx.store.readTrust(),
    addedBy,
    evidence: (row) => ctx.evidence.checkAll(row.sources),
  });
}

/** Who added each committed record and tombstone; an empty map without git. */
export async function fetchAddedBy(ctx: Context): Promise<Map<string, AddedBy>> {
  return ctx.git === null ? new Map() : ctx.git.addedBy('.elmory');
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
  state: State;
  notes: string[];
}

export class ConflictError extends Error {
  constructor(public readonly heads: string[]) {
    super('CONFLICT');
    this.name = 'ConflictError';
  }
}

/** reasons: 'shape' | 'quote:<QuoteRefusal>' | 'secret' | 'forgotten' | 'untracked' | 'too-large' */
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

/**
 * Test hook only (Phase 4 Task 3 crash tests): when ELMORY_CRASH_AT names this step, the process
 * exits right after it, to prove a crash at any point of the locked write loses nothing.
 */
function crashPoint(step: 'ledger' | 'rename' | 'index'): void {
  if (process.env.ELMORY_CRASH_AT === step) process.exit(99);
}

/** Signals that the committed record/tombstone set moved between fetching addedBy and the lock. */
class StaleAddedBy extends Error {}

function readQuoteFile(ctx: Context, file: string): string {
  const root = ctx.layout.worktree;
  const abs = path.join(root, file);
  let st: fs.Stats;
  let real: string;
  try {
    st = fs.statSync(abs);
    real = fs.realpathSync(abs);
  } catch {
    throw new RefusedError(`quote file not found: ${file}`, 'untracked');
  }
  if (!st.isFile() || !real.startsWith(root + path.sep)) {
    throw new RefusedError(`quote file is not a regular file inside the worktree: ${file}`, 'untracked');
  }
  if (st.size > MAX_QUOTE_FILE) throw new RefusedError(`quote file is over 1 MiB: ${file}`, 'too-large');
  return fs.readFileSync(abs, 'utf8');
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
    problems = lint(buildRecord(type, input, observer, ctx.now(), placeholders));
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

  // 3 secrets: the same rule the index applies, so a written record is never `candidate: secret`.
  if (containsSecret(`${input.title}\n${input.text}`)) {
    throw new RefusedError('the text looks like it contains a secret', 'secret');
  }

  // 4 injection: advisory only; the index flags it again on every load.
  const phrase = injectionFlag(`${input.title}\n${input.text}`);
  if (phrase !== null) notes.push(`flagged: looks like an instruction to the agent ("${phrase}")`);
  return sources;
}

/** The sets addedBy speaks about: committed record files and committed tombstones. */
function committedSignature(store: Store, tombstones: Tombstone[]): string {
  const facts = store
    .listRecords()
    .filter((r) => r.area === 'facts')
    .map((r) => r.id);
  const tombs = tombstones.filter((t) => t.committed).map((t) => `t:${t.id}`);
  return [...facts, ...tombs].sort().join(',');
}

/** Heads that block a key: trusted, served-able records (not tombstone nodes, not candidates). */
function blockingHeads(d: Deriver, records: Map<string, RecordRow>, heads: string[]): string[] {
  return heads.filter((h) => {
    const row = records.get(h);
    return row !== undefined && row.candidate === null && d.trustOf(h).trusted;
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
  for (let attempt = 0; ; attempt++) {
    const addedBy = await fetchAddedBy(ctx);
    const before = committedSignature(ctx.store, ctx.store.readTombstones());
    try {
      id = ctx.cache.withWriteLock(() => {
        // 5 load
        syncStore(ctx.store, ctx.cache);
        const tombstones = ctx.store.readTombstones();
        if (attempt === 0 && committedSignature(ctx.store, tombstones) !== before) throw new StaleAddedBy();
        const records = new Map(ctx.cache.allRecords().map((r) => [r.id, r]));
        const d = new Deriver({
          records,
          tombstones,
          trust: ctx.store.readTrust(),
          addedBy,
          evidence: () => Promise.reject(new Error('evidence is not used by the CAS')),
        });

        // 6 tombstone
        for (const target of [...supersedes, ...cites]) {
          if (tombstones.some((t) => t.id === target && d.tombstoneTrusted(t))) {
            throw new RefusedError(`${target} was forgotten`, 'forgotten');
          }
        }

        // 7 CAS: every superseded id must be a current head of its chain
        for (const target of supersedes) {
          const heads = records.has(target) ? d.heads(d.chainOf(target)) : [];
          if (!heads.includes(target)) throw new ConflictError(heads);
        }
        // key given: every head of the key's chain must be superseded (no override)
        if (input.key !== undefined) {
          const heads = blockingHeads(d, records, d.heads(d.chainOf(input.key)));
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
        ctx.cache.upsertRecord(indexRecord(stored));
        crashPoint('index');
        return newId;
      });
      break;
    } catch (e) {
      if (e instanceof StaleAddedBy && attempt === 0) continue;
      throw e;
    }
  }

  // 12 reply
  const d = await ctx.deriver();
  const state = (await d.state(id)).state;
  const mine = ctx.cache.getRecord(id);
  const myPaths = new Set(mine?.paths ?? []);
  const myTitle = input.title.trim().toLowerCase();
  for (const row of ctx.cache.allRecords()) {
    if (row.id === id) continue;
    const sameFile = row.paths.some((p) => myPaths.has(p));
    const sameTitle = row.title.trim().toLowerCase() === myTitle;
    if (!sameFile && !sameTitle) continue;
    if ((await d.state(row.id)).state !== 'active') continue;
    if (sameFile) notes.push(`looks related to ${row.id} (same file)`);
    if (sameTitle) notes.push(`looks related to ${row.id} (same title)`);
  }

  // 13 emit: never the text
  ctx.emit({ type: 'memory.write', id, worktree: ctx.layout.worktree, state });
  return { id, state, notes };
}

/** Write a fact (`memory/fact`): needs ≥ 1 quote that locates exactly once in a tracked file. */
export function remember(ctx: Context, input: RememberInput): Promise<WriteResult> {
  return write(ctx, 'memory/fact', input);
}

/** Write a note (`memory/note`): no quotes; holds always, labelled "not code-checked". */
export function note(ctx: Context, input: Omit<RememberInput, 'quotes'>): Promise<WriteResult> {
  return write(ctx, 'memory/note', input);
}
