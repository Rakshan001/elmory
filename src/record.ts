import { createHash } from 'node:crypto';
import { base32 } from './base32.js';

/** Record format version written as `x-elmory`. A higher version on disk is read-only. */
export const FORMAT_VERSION = 1;

export type RecordType = 'memory/fact' | 'memory/note';
export const RECORD_TYPES: readonly RecordType[] = ['memory/fact', 'memory/note'];

export type Tag = 'decision' | 'gotcha' | 'convention' | 'reference' | 'preference';
export const TAGS: readonly Tag[] = ['decision', 'gotcha', 'convention', 'reference', 'preference'];

/** Evidence by quote: hashes of the quoted token stream, never the code itself (§4.1, §4.3). */
export interface QuoteSource {
  resource: string;
  quote: string;
  anchor: string;
  tokens: number;
  commit: string;
}

/** Baton import only: sha1(raw file bytes)[:12] (§4.2). */
export interface LegacyFileSource {
  resource: string;
  legacyFile: string;
}

export type Source = QuoteSource | LegacyFileSource;

export interface ElmoryRecord {
  type: RecordType;
  title: string;
  version: number;
  recorded: string;
  observer: string;
  tag?: Tag;
  key?: string;
  supersedes: string[];
  cites: string[];
  sources: Source[];
  legacyId?: string;
  imported?: boolean;
  body: string;
}

export class RecordError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = 'RecordError';
  }
}

const BARE = /^[A-Za-z0-9_./@-]+$/;
const KEY_LINE = /^([a-z][a-z0-9-]*):(?: ([^]*))?$/;
const ITEM_START = /^\s+- ([a-z][a-z0-9-]*):(?: ([^]*))?$/;
const ITEM_FIELD = /^\s+([a-z][a-z0-9-]*):(?: ([^]*))?$/;
const ID_RE = /^f_[a-z2-7]{26}$/;
const RECORDED_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const KEY_RE = /^[a-z0-9_.-]+$/;

// ---------------------------------------------------------------------------
// serialize

/**
 * Bare when safe, else JSON-quoted. JSON.stringify leaves U+2028 and U+2029 raw; they are escaped
 * too so every frontmatter value stays on one line for any reader. A non-string (untyped input
 * such as an `undefined` field) is refused rather than written as the text "undefined".
 */
function str(s: string): string {
  if (typeof s !== 'string') throw new RecordError(`expected a string, got ${typeof s}`, 'frontmatter');
  if (BARE.test(s)) return s;
  return JSON.stringify(s).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function list(xs: readonly string[]): string {
  return `[${xs.map(str).join(', ')}]`;
}

function int(n: number, field: string): string {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RecordError(`${field} must be a non-negative integer`, 'frontmatter');
  }
  return String(n);
}

/** LF endings, no trailing whitespace on any line, no trailing blank lines. */
function normalizeBody(body: string): string {
  const lines = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/** A legacy source has a string `legacyFile`; `legacyFile: undefined` counts as absent. */
function isLegacy(s: Source): s is LegacyFileSource {
  return typeof (s as Partial<LegacyFileSource>).legacyFile === 'string';
}

/** The canonical text of a record. Its sha256 is the record id (§4.1). */
export function serialize(r: ElmoryRecord): string {
  const out: string[] = ['---'];
  if (r.sources.length === 0) {
    out.push('sources: []');
  } else {
    out.push('sources:');
    for (const s of r.sources) {
      out.push(`  - resource: ${str(s.resource)}`);
      if (isLegacy(s)) {
        out.push(`    x-elmory-legacy-file: ${str(s.legacyFile)}`);
      } else {
        out.push(`    x-elmory-quote: ${str(s.quote)}`);
        out.push(`    x-elmory-anchor: ${str(s.anchor)}`);
        out.push(`    x-elmory-tokens: ${int(s.tokens, 'x-elmory-tokens')}`);
        out.push(`    x-elmory-commit: ${str(s.commit)}`);
      }
    }
  }
  out.push(`title: ${str(r.title)}`);
  out.push(`type: ${str(r.type)}`);
  out.push(`x-elmory: ${int(r.version, 'x-elmory')}`);
  out.push(`x-elmory-cites: ${list(r.cites)}`);
  if (r.imported !== undefined) out.push(`x-elmory-imported: ${r.imported ? 'true' : 'false'}`);
  if (r.key !== undefined) out.push(`x-elmory-key: ${str(r.key)}`);
  if (r.legacyId !== undefined) out.push(`x-elmory-legacy-id: ${str(r.legacyId)}`);
  out.push(`x-elmory-observer: ${str(r.observer)}`);
  out.push(`x-elmory-recorded: ${str(r.recorded)}`);
  out.push(`x-elmory-supersedes: ${list(r.supersedes)}`);
  if (r.tag !== undefined) out.push(`x-elmory-tag: ${str(r.tag)}`);
  out.push('---');
  return `${out.join('\n')}\n${normalizeBody(r.body)}\n`;
}

// ---------------------------------------------------------------------------
// parse

function fail(message: string): never {
  throw new RecordError(message, 'frontmatter');
}

function parseScalar(raw: string): string {
  const v = raw.replace(/\s+$/, '');
  if (v.startsWith('"')) {
    let out: unknown;
    try {
      out = JSON.parse(v);
    } catch {
      fail(`bad quoted string: ${v}`);
    }
    if (typeof out !== 'string') fail(`bad quoted string: ${v}`);
    return out;
  }
  if (!BARE.test(v)) fail(`value must be bare or double-quoted: ${v}`);
  return v;
}

function parseInteger(raw: string, field: string): number {
  const v = raw.trim();
  if (!/^\d+$/.test(v)) fail(`${field} must be an integer`);
  const n = Number(v);
  if (!Number.isSafeInteger(n)) fail(`${field} is out of range`);
  return n;
}

function parseBool(raw: string, field: string): boolean {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fail(`${field} must be true or false`);
}

function parseList(raw: string): string[] {
  const v = raw.trim();
  if (!v.startsWith('[') || !v.endsWith(']')) fail(`expected an inline list: ${v}`);
  const inner = v.slice(1, -1);
  const items: string[] = [];
  let pos = 0;
  const skipSpaces = (): void => {
    while (pos < inner.length && inner[pos] === ' ') pos++;
  };
  skipSpaces();
  if (pos === inner.length) return items;
  for (;;) {
    skipSpaces();
    if (inner[pos] === '"') {
      let j = pos + 1;
      while (j < inner.length && inner[j] !== '"') j += inner[j] === '\\' ? 2 : 1;
      if (j >= inner.length) fail(`unterminated string in list: ${v}`);
      items.push(parseScalar(inner.slice(pos, j + 1)));
      pos = j + 1;
    } else {
      let j = pos;
      while (j < inner.length && inner[j] !== ',') j++;
      items.push(parseScalar(inner.slice(pos, j)));
      pos = j;
    }
    skipSpaces();
    if (pos === inner.length) return items;
    if (inner[pos] !== ',') fail(`expected , in list: ${v}`);
    pos++;
  }
}

const isSkippable = (line: string): boolean => line.trim() === '' || /^\s*#/.test(line);

const SOURCE_KEYS = new Set([
  'resource',
  'x-elmory-quote',
  'x-elmory-anchor',
  'x-elmory-tokens',
  'x-elmory-commit',
  'x-elmory-legacy-file',
]);

function parseSources(block: readonly string[], lenient: boolean): Source[] {
  const items: Map<string, string>[] = [];
  for (const line of block) {
    if (isSkippable(line)) continue;
    const start = ITEM_START.exec(line);
    const field = start ? null : ITEM_FIELD.exec(line);
    const m = start ?? field;
    if (!m) {
      if (lenient) continue;
      fail(`bad line in sources: ${line}`);
    }
    if (start) items.push(new Map());
    const item = items[items.length - 1];
    if (!item) {
      if (lenient) continue;
      fail(`sources field outside an item: ${line}`);
    }
    const key = m[1] ?? '';
    if (!SOURCE_KEYS.has(key)) {
      if (lenient) continue;
      fail(`unknown sources key: ${key}`);
    }
    if (item.has(key)) {
      if (lenient) continue;
      fail(`duplicate sources key: ${key}`);
    }
    item.set(key, m[2] ?? '');
  }

  const sources: Source[] = [];
  for (const item of items) {
    try {
      sources.push(toSource(item));
    } catch (e) {
      if (!lenient) throw e;
    }
  }
  return sources;
}

function toSource(item: Map<string, string>): Source {
  const get = (k: string): string | undefined => item.get(k);
  const resource = get('resource');
  if (resource === undefined) fail('source item without resource');
  const legacy = get('x-elmory-legacy-file');
  const quote = get('x-elmory-quote');
  const anchor = get('x-elmory-anchor');
  const tokens = get('x-elmory-tokens');
  const commit = get('x-elmory-commit');
  if (legacy !== undefined) {
    if (quote !== undefined || anchor !== undefined || tokens !== undefined || commit !== undefined) {
      fail('source item mixes x-elmory-legacy-file with quote fields');
    }
    return { resource: parseScalar(resource), legacyFile: parseScalar(legacy) };
  }
  if (quote === undefined || anchor === undefined || tokens === undefined || commit === undefined) {
    fail('quote source needs x-elmory-quote, x-elmory-anchor, x-elmory-tokens and x-elmory-commit');
  }
  return {
    resource: parseScalar(resource),
    quote: parseScalar(quote),
    anchor: parseScalar(anchor),
    tokens: parseInteger(tokens, 'x-elmory-tokens'),
    commit: parseScalar(commit),
  };
}

const TOP_KEYS = new Set([
  'sources',
  'title',
  'type',
  'x-elmory',
  'x-elmory-cites',
  'x-elmory-imported',
  'x-elmory-key',
  'x-elmory-legacy-id',
  'x-elmory-observer',
  'x-elmory-recorded',
  'x-elmory-supersedes',
  'x-elmory-tag',
]);

/**
 * Parse a record file. Accepts exactly the shape `serialize` writes, plus `#` comment lines and
 * any key order; anything else throws `RecordError` (reason `frontmatter`). A record with a higher
 * `x-elmory` version is parsed leniently and reported `readOnly`, never thrown on.
 */
export function parse(text: string): { record: ElmoryRecord; readOnly: boolean } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines[0] !== '---') fail('record must start with ---');
  const close = lines.indexOf('---', 1);
  if (close < 0) fail('frontmatter is not closed with ---');
  const fm = lines.slice(1, close);
  const body = normalizeBody(lines.slice(close + 1).join('\n'));

  const versionLine = fm.find((l) => l.startsWith('x-elmory:'));
  if (versionLine === undefined) fail('missing x-elmory');
  const version = parseInteger(versionLine.slice('x-elmory:'.length), 'x-elmory');
  if (version < 1) fail('x-elmory must be at least 1');
  const readOnly = version > FORMAT_VERSION;
  const lenient = readOnly;

  const values = new Map<string, { value: string; block: string[] }>();
  let i = 0;
  while (i < fm.length) {
    const line = fm[i] ?? '';
    i++;
    if (isSkippable(line)) continue;
    const m = KEY_LINE.exec(line);
    const block: string[] = [];
    while (i < fm.length && /^(\s|$)/.test(fm[i] ?? '')) block.push(fm[i++] ?? '');
    if (!m) {
      if (lenient) continue;
      fail(`bad frontmatter line: ${line}`);
    }
    const key = m[1] ?? '';
    if (!TOP_KEYS.has(key)) {
      if (lenient) continue;
      fail(`unknown frontmatter key: ${key}`);
    }
    if (values.has(key)) {
      if (lenient) continue;
      fail(`duplicate frontmatter key: ${key}`);
    }
    if (key !== 'sources' && block.some((l) => !isSkippable(l))) {
      if (lenient) continue;
      fail(`unexpected indented lines after ${key}`);
    }
    values.set(key, { value: m[2] ?? '', block });
  }

  // In lenient (read-only) mode a value that does not parse falls back to the default.
  const read = <T>(key: string, fn: (v: string, block: string[]) => T, fallback: () => T): T => {
    const entry = values.get(key);
    if (entry === undefined) return fallback();
    try {
      return fn(entry.value, entry.block);
    } catch (e) {
      if (lenient) return fallback();
      throw e;
    }
  };
  const required = (key: string) => (): string => (lenient ? '' : fail(`missing ${key}`));
  const none = (): undefined => undefined;

  const record: ElmoryRecord = {
    type: read('type', parseScalar, required('type')) as RecordType,
    title: read('title', parseScalar, required('title')),
    version,
    recorded: read('x-elmory-recorded', parseScalar, required('x-elmory-recorded')),
    observer: read('x-elmory-observer', parseScalar, required('x-elmory-observer')),
    supersedes: read('x-elmory-supersedes', parseList, () => []),
    cites: read('x-elmory-cites', parseList, () => []),
    sources: read(
      'sources',
      (v, block) => {
        if (v.trim() === '') return parseSources(block, lenient);
        if (block.some((l) => !isSkippable(l))) fail('sources has both an inline value and items');
        if (parseList(v).length > 0) fail('sources must be [] or a block of items');
        return [];
      },
      () => [],
    ),
    body,
  };
  const tag = read<string | undefined>('x-elmory-tag', parseScalar, none);
  if (tag !== undefined) record.tag = tag as Tag;
  const key = read<string | undefined>('x-elmory-key', parseScalar, none);
  if (key !== undefined) record.key = key;
  const legacyId = read<string | undefined>('x-elmory-legacy-id', parseScalar, none);
  if (legacyId !== undefined) record.legacyId = legacyId;
  const imported = read<boolean | undefined>('x-elmory-imported', (v) => parseBool(v, 'x-elmory-imported'), none);
  if (imported !== undefined) record.imported = imported;

  return { record, readOnly };
}

// ---------------------------------------------------------------------------
// id and lint

/** `f_` + the first 26 chars of base32(sha256(canonical text)). */
export function recordId(r: ElmoryRecord): string {
  const digest = createHash('sha256').update(serialize(r), 'utf8').digest();
  return 'f_' + base32(digest).slice(0, 26);
}

export function isRecordId(s: string): boolean {
  return ID_RE.test(s);
}

function badResource(resource: string): boolean {
  if (resource === '' || resource.startsWith('/') || resource.startsWith('\\')) return true;
  if (/^[A-Za-z]:/.test(resource)) return true;
  return resource.split(/[/\\]/).includes('..');
}

/** Every lint failure as one message; `[]` when the record is clean. */
export function lint(r: ElmoryRecord): string[] {
  const errors: string[] = [];
  if (!RECORD_TYPES.includes(r.type)) errors.push(`type must be one of ${RECORD_TYPES.join(', ')}`);
  if (!Number.isSafeInteger(r.version) || r.version < 1) errors.push('version must be a positive integer');
  if (r.title.length < 1 || r.title.length > 200) errors.push('title must be 1-200 characters');
  const body = normalizeBody(r.body);
  if (body.length < 1 || body.length > 2000) errors.push('body must be 1-2000 characters');
  if (r.observer.trim() === '') errors.push('observer must not be empty');
  if (!RECORDED_RE.test(r.recorded) || Number.isNaN(Date.parse(r.recorded))) {
    errors.push('recorded must be an ISO 8601 UTC timestamp ending in Z');
  }
  if (r.tag !== undefined && !TAGS.includes(r.tag)) errors.push(`tag must be one of ${TAGS.join(', ')}`);
  if (r.key !== undefined && !KEY_RE.test(r.key)) errors.push('key must match [a-z0-9_.-]+');
  for (const id of r.supersedes) if (!isRecordId(id)) errors.push(`supersedes has a bad id: ${id}`);
  for (const id of r.cites) if (!isRecordId(id)) errors.push(`cites has a bad id: ${id}`);
  if (r.type === 'memory/fact' && r.sources.length === 0) errors.push('a fact needs at least one source');
  if (r.type === 'memory/note' && r.sources.length > 0) errors.push('a note has no sources');
  const filled = (v: unknown): boolean => typeof v === 'string' && v !== '';
  for (const s of r.sources) {
    if (typeof s.resource !== 'string' || badResource(s.resource)) {
      errors.push(`resource must be a relative path without '..': ${String(s.resource)}`);
    }
    if (isLegacy(s)) {
      if (s.legacyFile === '') errors.push(`a legacy source needs x-elmory-legacy-file: ${s.resource}`);
      continue;
    }
    const q = s as Partial<QuoteSource>;
    if (!filled(q.quote) || !filled(q.anchor) || !filled(q.commit)) {
      errors.push(`a quote source needs quote, anchor and commit: ${String(s.resource)}`);
    }
    if (!Number.isSafeInteger(q.tokens) || (q.tokens ?? -1) < 0) {
      errors.push(`tokens must be a non-negative integer: ${String(s.resource)}`);
    }
  }
  return errors;
}
