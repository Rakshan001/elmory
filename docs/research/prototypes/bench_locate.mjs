import { readFileSync } from 'node:fs';
import { indexFile, makeQuote, quoteFromTokens, locateMany, locateShaOnly, tokenize, now, ms } from './tok.mjs';
const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
function rep(fn, n = 7) { const t = []; let r; for (let i = 0; i < n; i++) { const t0 = now(); r = fn(); t.push(ms(t0)); } return { ms: +med(t).toFixed(2), r }; }
for (const f of process.argv.slice(2)) {
  const text = readFileSync(f, 'utf8');
  const idx = rep(() => indexFile(text));
  const ix = idx.r;
  const tokOnly = rep(() => tokenize(text));
  console.log(`\n== ${f}  bytes=${Buffer.byteLength(text)} lines=${text.split('\n').length} tokens=${ix.n}`);
  console.log(`tokenise only: ${tokOnly.ms} ms; tokenise+index (token hashes + prefix arrays): ${idx.ms} ms`);
  for (const L of [8, 23, 200]) {
    const start = Math.floor(ix.n * 0.61);
    const q = quoteFromTokens(ix.tokens.slice(start, start + L));
    const w = rep(() => locateMany(ix, [q]));            // index reused
    const wFull = rep(() => locateMany(indexFile(text), [q])); // incl. tokenise+index
    const s = rep(() => locateShaOnly(ix, [q]), 3);
    console.log(`L=${L}: rolling locate ${w.ms} ms (count=${w.r.counts.get(q.sha)}, candidates=${w.r.candidates}); incl. index ${wFull.ms} ms; sha256-every-window ${s.ms} ms`);
  }
  // 50 quotes, mixed lengths, against same file
  let st = 7; const rnd = () => (st = (Math.imul(st, 1103515245) + 12345) >>> 0) / 2 ** 32;
  const lens = [8, 12, 16, 23, 32, 48, 64, 100, 200];
  const qs = []; for (let i = 0; i < 50; i++) { const L = lens[i % lens.length]; const p = Math.floor(rnd() * (ix.n - L)); qs.push(quoteFromTokens(ix.tokens.slice(p, p + L))); }
  const m50 = rep(() => locateMany(indexFile(text), qs));
  const m50s = rep(() => locateShaOnly(indexFile(text), qs), 3);
  const qs23 = []; for (let i = 0; i < 50; i++) { const p = Math.floor(rnd() * (ix.n - 23)); qs23.push(quoteFromTokens(ix.tokens.slice(p, p + 23))); }
  const m23 = rep(() => locateMany(indexFile(text), qs23));
  const m23s = rep(() => locateShaOnly(indexFile(text), qs23), 3);
  console.log(`50 quotes (9 distinct lengths) incl. tokenise+index: rolling ${m50.ms} ms; sha-only ${m50s.ms} ms`);
  console.log(`50 quotes (all L=23) incl. tokenise+index: rolling ${m23.ms} ms; sha-only ${m23s.ms} ms`);
}
