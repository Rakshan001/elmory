// The quote engine (spec §4.3): tokeniser, quote and anchor hashes, write rules, secret check,
// and the per-file anchor map used to locate stored quotes. Pure: no I/O, no shared state
// except a memo keyed weakly by AnchorMap.

import { createHash } from 'node:crypto';

export type QuoteRefusal = 'too-short' | 'not-found' | 'not-unique' | 'secret';

export type WriteCheck =
  | { ok: true; quote: string; anchor: string; tokens: number }
  | { ok: false; reason: QuoteRefusal; count?: number };

/** Anchor hash → every token index where that anchor starts. */
export interface AnchorMap {
  tokens: string[];
  positions: Map<string, number[]>;
}

const ANCHOR_TOKENS = 8;
const SEP = '\u001f';
const TOKEN_RE = /[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g;
const WORD_RE = /^[A-Za-z0-9_]+$/;

/**
 * Runs of [A-Za-z0-9_] or single non-space characters. ' " ` all become ". A "," directly
 * before ) ] or } (ignoring whitespace) is dropped. Whitespace is never a token.
 */
export function tokenize(text: string): string[] {
  const raw = text.match(TOKEN_RE) ?? [];
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i] as string;
    if (t === ',') {
      const next = raw[i + 1];
      if (next === ')' || next === ']' || next === '}') continue;
    }
    out.push(t === "'" || t === '`' ? '"' : t);
  }
  return out;
}

/** 'sha256:' + hex sha256 of the tokens joined by U+001F. */
export function quoteHash(tokens: string[]): string {
  return 'sha256:' + createHash('sha256').update(tokens.join(SEP), 'utf8').digest('hex');
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_53 = (1n << 53n) - 1n;
const MASK_48 = (1n << 48n) - 1n;
const encoder = new TextEncoder();
const BYTE = Array.from({ length: 256 }, (_, i) => BigInt(i));
const SEP_BYTE = BYTE[0x1f] as bigint;

/**
 * FNV-1a (64-bit parameters, BigInt) over the UTF-8 bytes of tokens[start, end) joined by
 * U+001F (byte 0x1f). The 64-bit state is masked to 53 bits; 53 bits needs 14 hex chars, so
 * the rendered anchor keeps only the low 48 bits of that value, as 12 zero-padded lowercase hex
 * chars. `bytes` caches each distinct token's UTF-8 encoding.
 */
function fnvAnchor(tokens: string[], start: number, end: number, bytes: Map<string, Uint8Array>): string {
  let h = FNV_OFFSET;
  for (let i = start; i < end; i++) {
    if (i > start) h = BigInt.asUintN(64, (h ^ SEP_BYTE) * FNV_PRIME);
    const t = tokens[i] as string;
    let b = bytes.get(t);
    if (b === undefined) {
      b = encoder.encode(t);
      bytes.set(t, b);
    }
    for (const byte of b) h = BigInt.asUintN(64, (h ^ (BYTE[byte] as bigint)) * FNV_PRIME);
  }
  return ((h & MASK_53) & MASK_48).toString(16).padStart(12, '0');
}

/** 12 hex chars: hash of the first 8 tokens (fewer when the quote has fewer). */
export function anchorHash(tokens: string[]): string {
  return fnvAnchor(tokens, 0, Math.min(ANCHOR_TOKENS, tokens.length), new Map());
}

/** ≥ 16 tokens, or one line with ≥ 3 word/literal tokens and ≥ 24 non-space chars. */
export function isLongEnough(quoteText: string): boolean {
  const tokens = tokenize(quoteText);
  if (tokens.length >= 16) return true;
  if (quoteText.trim().includes('\n')) return false;
  const words = tokens.filter((t) => WORD_RE.test(t)).length;
  return words >= 3 && quoteText.replace(/\s/g, '').length >= 24;
}

const SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{36}/,
  /github_pat_[A-Za-z0-9_]{22,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AIza[0-9A-Za-z_-]{35}/,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/,
  /(Bearer|Basic) [A-Za-z0-9._~+/=-]{20,}/,
];

// A literal between matching ' " or ` quotes; backslash escapes are skipped over.
const LITERAL_RE = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

/** Shannon entropy in bits per character (code point). */
function entropy(s: string): number {
  const chars = [...s];
  const counts = new Map<string, number>();
  for (const c of chars) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / chars.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * A known key format anywhere in the text, or a string literal containing a whitespace-free
 * word of ≥ 20 chars with entropy > 4.0 bits/char.
 */
export function containsSecret(text: string): boolean {
  if (SECRET_PATTERNS.some((re) => re.test(text))) return true;
  for (const m of text.matchAll(LITERAL_RE)) {
    const content = m[1] ?? m[2] ?? m[3] ?? '';
    // Checked per word: prose has no qualifying word, but a key embedded in a sentence does.
    if (content.split(/\s+/).some((w) => [...w].length >= 20 && entropy(w) > 4.0)) return true;
  }
  return false;
}

/** Start indexes where `needle` occurs in `hay` (overlapping occurrences count). */
function occurrences(hay: string[], needle: string[]): number {
  let count = 0;
  const last = hay.length - needle.length;
  outer: for (let i = 0; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    count++;
  }
  return count;
}

/** Write rules in order: length → secret → exactly one occurrence in the file. */
export function checkQuoteAtWrite(fileText: string, quoteText: string): WriteCheck {
  if (!isLongEnough(quoteText)) return { ok: false, reason: 'too-short' };
  if (containsSecret(quoteText)) return { ok: false, reason: 'secret' };
  const tokens = tokenize(quoteText);
  const count = occurrences(tokenize(fileText), tokens);
  if (count === 0) return { ok: false, reason: 'not-found' };
  if (count >= 2) return { ok: false, reason: 'not-unique', count };
  return { ok: true, quote: quoteHash(tokens), anchor: anchorHash(tokens), tokens: tokens.length };
}

function anchorsOfLength(tokens: string[], len: number): Map<string, number[]> {
  const positions = new Map<string, number[]>();
  const bytes = new Map<string, Uint8Array>();
  for (let i = 0; i + len <= tokens.length; i++) {
    const a = fnvAnchor(tokens, i, i + len, bytes);
    const list = positions.get(a);
    if (list === undefined) positions.set(a, [i]);
    else list.push(i);
  }
  return positions;
}

/** Tokenise the file once and index every 8-token anchor by its start position. */
export function buildAnchorMap(fileText: string): AnchorMap {
  const tokens = tokenize(fileText);
  return { tokens, positions: anchorsOfLength(tokens, ANCHOR_TOKENS) };
}

// Quotes shorter than 8 tokens carry an anchor over all their tokens, which the 8-token map
// cannot hold. Those maps are built on first use per (map, length) and memoised here.
const shortAnchors = new WeakMap<AnchorMap, Map<number, Map<string, number[]>>>();

function positionsFor(map: AnchorMap, len: number): Map<string, number[]> {
  if (len >= ANCHOR_TOKENS) return map.positions;
  let byLen = shortAnchors.get(map);
  if (byLen === undefined) {
    byLen = new Map();
    shortAnchors.set(map, byLen);
  }
  let positions = byLen.get(len);
  if (positions === undefined) {
    positions = anchorsOfLength(map.tokens, len);
    byLen.set(len, positions);
  }
  return positions;
}

/**
 * Candidate starts come from the anchor map; each is confirmed by recomputing quoteHash over
 * the token slice. 'found' means exactly one confirmed position.
 */
export function locate(
  map: AnchorMap,
  q: { quote: string; anchor: string; tokens: number },
): 'found' | 'not-found' | 'not-unique' {
  if (q.tokens <= 0) return 'not-found';
  const candidates = positionsFor(map, q.tokens).get(q.anchor) ?? [];
  let confirmed = 0;
  for (const start of candidates) {
    if (start + q.tokens > map.tokens.length) continue;
    if (quoteHash(map.tokens.slice(start, start + q.tokens)) === q.quote) confirmed++;
  }
  return confirmed === 0 ? 'not-found' : confirmed === 1 ? 'found' : 'not-unique';
}
