import { readFileSync } from 'node:fs';
import { indexFile, quote2, locateMany53, anchorIndex, locateAnchored, now, ms } from './tok.mjs';
const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
function rep(fn, n = 7) { const t = []; let r; for (let i = 0; i < n; i++) { const t0 = now(); r = fn(); t.push(ms(t0)); } return { ms: +med(t).toFixed(2), r }; }
for (const f of process.argv.slice(2)) {
  const text = readFileSync(f, 'utf8'); const ix = indexFile(text);
  console.log(`\n== ${f} tokens=${ix.n}`);
  for (const L of [8, 23, 200]) {
    const s = Math.floor(ix.n * 0.61); const q = quote2(ix.tokens.slice(s, s + L));
    const w = rep(() => locateMany53(ix, [q])); const wf = rep(() => locateMany53(indexFile(text), [q]));
    const an = rep(() => { const am = anchorIndex(ix); return locateAnchored(ix, am, [q]); });
    console.log(`L=${L}: rolling(53-bit) ${w.ms} ms [count ${w.r.counts.get(q.sha)}, cand ${w.r.candidates}]; incl tokenise+index ${wf.ms} ms; anchor-map+locate ${an.ms} ms [count ${an.r.counts.get(q.sha)}]`);
  }
  let st = 7; const rnd = () => (st = (Math.imul(st, 1103515245) + 12345) >>> 0) / 2 ** 32;
  const lens = [8, 12, 16, 23, 32, 48, 64, 100, 200];
  const qs = []; for (let i = 0; i < 50; i++) { const L = lens[i % 9]; const p = Math.floor(rnd() * (ix.n - L)); qs.push(quote2(ix.tokens.slice(p, p + L))); }
  const r1 = rep(() => locateMany53(indexFile(text), qs));
  const r2 = rep(() => { const i2 = indexFile(text); return locateAnchored(i2, anchorIndex(i2), qs); });
  const ok = qs.every(q => r1.r.counts.get(q.sha) === r2.r.counts.get(q.sha) && r2.r.counts.get(q.sha) >= 1);
  console.log(`50 quotes mixed lengths, incl tokenise+index: rolling-per-length ${r1.ms} ms; anchor ${r2.ms} ms; results agree & all found: ${ok}`);
}
