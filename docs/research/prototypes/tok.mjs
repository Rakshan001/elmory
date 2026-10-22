// Elmory §4.3 prototype: tokeniser, quote hash, rolling-hash locate, git blob id.
import { createHash } from 'node:crypto';

const TOK = /[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/gu; // word runs, or one non-space non-word char
export function tokenize(s) { return s.match(TOK) ?? []; }
export const SEP = '\u001f';
export function sha256(s) { return createHash('sha256').update(s).digest('hex'); }
export function quoteHash(tokens) { return sha256(tokens.join(SEP)); }
export function nonSpaceChars(s) { return s.replace(/\s+/g, '').length; }

// 32-bit FNV-1a of a token string
export function tokHash(t) {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// two independent 32-bit polynomial lanes mod 2^32 => ~64-bit rolling hash
const B1 = 0x9E3779B1 | 0, B2 = 0x85EBCA77 | 0;
function powk(b, k) { let p = 1; for (let i = 0; i < k; i++) p = Math.imul(p, b); return p; }

export function rollOf(th) { // th: Uint32Array of token hashes
  let a = 0, b = 0;
  for (let i = 0; i < th.length; i++) { a = (Math.imul(a, B1) + th[i]) | 0; b = (Math.imul(b, B2) + (th[i] ^ 0x5bd1e995)) | 0; }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

// Index a file once: tokens + token hashes + prefix hash arrays (O(1) window hash).
export function indexFile(text) {
  const tokens = tokenize(text);
  const n = tokens.length;
  const th = new Uint32Array(n);
  for (let i = 0; i < n; i++) th[i] = tokHash(tokens[i]);
  const P1 = new Int32Array(n + 1), P2 = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    P1[i + 1] = (Math.imul(P1[i], B1) + th[i]) | 0;
    P2[i + 1] = (Math.imul(P2[i], B2) + (th[i] ^ 0x5bd1e995)) | 0;
  }
  return { tokens, th, P1, P2, n };
}
const powCache = new Map();
function pows(k) { let v = powCache.get(k); if (!v) { v = [powk(B1, k), powk(B2, k)]; powCache.set(k, v); } return v; }
function winKey(ix, i, k, p1, p2) {
  const a = (ix.P1[i + k] - Math.imul(ix.P1[i], p1)) | 0;
  const b = (ix.P2[i + k] - Math.imul(ix.P2[i], p2)) | 0;
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

// quotes: [{ k, roll, sha }]. Groups by k; one O(n) pass per distinct k.
// Returns Map(sha -> count of confirmed occurrences), plus candidate/confirm stats.
export function locateMany(ix, quotes) {
  const byK = new Map();
  for (const q of quotes) { let m = byK.get(q.k); if (!m) byK.set(q.k, m = new Map()); let arr = m.get(q.roll); if (!arr) m.set(q.roll, arr = []); arr.push(q); }
  const out = new Map(quotes.map(q => [q.sha, 0]));
  let cand = 0;
  for (const [k, m] of byK) {
    const [p1, p2] = pows(k);
    for (let i = 0; i + k <= ix.n; i++) {
      const key = winKey(ix, i, k, p1, p2);
      const arr = m.get(key);
      if (!arr) continue;
      cand++;
      const s = sha256(ix.tokens.slice(i, i + k).join(SEP));
      for (const q of arr) if (q.sha === s) out.set(q.sha, out.get(q.sha) + 1);
    }
  }
  return { counts: out, candidates: cand };
}

// Read-time locate when ONLY sha256 + k are stored (spec as written): sha256 every window.
export function locateShaOnly(ix, quotes) {
  const byK = new Map();
  for (const q of quotes) { let s = byK.get(q.k); if (!s) byK.set(q.k, s = new Map()); s.set(q.sha, 0); }
  for (const [k, m] of byK) for (let i = 0; i + k <= ix.n; i++) {
    const s = sha256(ix.tokens.slice(i, i + k).join(SEP));
    if (m.has(s)) m.set(s, m.get(s) + 1);
  }
  return byK;
}

export function makeQuote(text) {
  const t = tokenize(text);
  const th = new Uint32Array(t.length); for (let i = 0; i < t.length; i++) th[i] = tokHash(t[i]);
  return { k: t.length, roll: rollOf(th), sha: quoteHash(t), tokens: t };
}
export function quoteFromTokens(t) {
  const th = new Uint32Array(t.length); for (let i = 0; i < t.length; i++) th[i] = tokHash(t[i]);
  return { k: t.length, roll: rollOf(th), sha: quoteHash(t) };
}

export function gitBlobId(buf) {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}
export function ms(t0) { return Number(process.hrtime.bigint() - t0) / 1e6; }
export const now = () => process.hrtime.bigint();

// ---- v2: numeric 53-bit keys (no string alloc per window) ----
function key53(a, b) { return (a >>> 0) * 2097152 + ((b >>> 11) & 0x1fffff); }
export function roll53(th) {
  let a = 0, b = 0;
  for (let i = 0; i < th.length; i++) { a = (Math.imul(a, B1) + th[i]) | 0; b = (Math.imul(b, B2) + (th[i] ^ 0x5bd1e995)) | 0; }
  return key53(a, b);
}
export function quote2(t) { // stored: k, sha, roll (whole quote), anchor (first 8 tokens)
  const th = new Uint32Array(t.length); for (let i = 0; i < t.length; i++) th[i] = tokHash(t[i]);
  return { k: t.length, sha: quoteHash(t), roll: roll53(th), anchor: roll53(th.subarray(0, 8)) };
}
export function locateMany53(ix, quotes) {
  const byK = new Map();
  for (const q of quotes) { let m = byK.get(q.k); if (!m) byK.set(q.k, m = new Map()); let arr = m.get(q.roll); if (!arr) m.set(q.roll, arr = []); arr.push(q); }
  const out = new Map(quotes.map(q => [q.sha, 0])); let cand = 0;
  const { P1, P2, n } = ix;
  for (const [k, m] of byK) {
    const p1 = powk(B1, k), p2 = powk(B2, k);
    for (let i = 0; i + k <= n; i++) {
      const a = (P1[i + k] - Math.imul(P1[i], p1)) | 0, b = (P2[i + k] - Math.imul(P2[i], p2)) | 0;
      const arr = m.get(key53(a, b)); if (!arr) continue; cand++;
      const s = sha256(ix.tokens.slice(i, i + k).join(SEP));
      for (const q of arr) if (q.sha === s) out.set(q.sha, out.get(q.sha) + 1);
    }
  }
  return { counts: out, candidates: cand };
}
// Anchor design: one pass builds map of every 8-token window -> positions; each quote then O(occurrences).
export function anchorIndex(ix) {
  const { P1, P2, n } = ix; const p1 = powk(B1, 8), p2 = powk(B2, 8);
  const m = new Map();
  for (let i = 0; i + 8 <= n; i++) {
    const a = (P1[i + 8] - Math.imul(P1[i], p1)) | 0, b = (P2[i + 8] - Math.imul(P2[i], p2)) | 0;
    const key = key53(a, b); const v = m.get(key);
    if (v === undefined) m.set(key, i); else if (typeof v === 'number') m.set(key, [v, i]); else v.push(i);
  }
  return m;
}
export function locateAnchored(ix, am, quotes) {
  const out = new Map(); let cand = 0;
  for (const q of quotes) {
    let v = am.get(q.anchor); let c = 0;
    if (v !== undefined) for (const i of (typeof v === 'number' ? [v] : v)) {
      if (i + q.k > ix.n) continue; cand++;
      if (sha256(ix.tokens.slice(i, i + q.k).join(SEP)) === q.sha) c++;
    }
    out.set(q.sha, c);
  }
  return { counts: out, candidates: cand };
}
