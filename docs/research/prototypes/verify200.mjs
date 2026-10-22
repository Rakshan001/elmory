// Estimate `verify` after a 200-file checkout: 5000 facts, 25 quotes per changed file, cold cache.
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { indexFile, quote2, anchorIndex, locateAnchored, locateMany53, locateShaOnly, gitBlobId, now, ms } from './tok.mjs';
const R = '~/Desktop/Developer/playground/baton/';
const all = execFileSync('git', ['ls-files', 'src', 'web/src'], { cwd: R }).toString().trim().split('\n').filter(f => /\.tsx?$/.test(f));
const sized = all.map(f => [f, statSync(R + f).size]).sort((a, b) => b[1] - a[1]).slice(0, 200).map(x => x[0]);
let st = 5; const rnd = () => (st = (Math.imul(st, 1103515245) + 12345) >>> 0) / 2 ** 32;
const lens = [8, 12, 16, 23, 32, 48, 64];
// prepare quotes (not timed): 25 per file
const plan = sized.map(f => { const ix = indexFile(readFileSync(R + f, 'utf8')); return [f, Array.from({ length: 25 }, (_, i) => { const L = Math.min(lens[i % 7], ix.n); const p = Math.floor(rnd() * (ix.n - L)); return quote2(ix.tokens.slice(p, p + L)); })]; });
const totalBytes = sized.reduce((s, f) => s + statSync(R + f).size, 0);
for (const variant of ['anchor', 'rolling-per-length', 'sha256-only (spec as written)']) {
  const t0 = now(); let found = 0, n = 0;
  for (const [f, qs] of plan) {
    const buf = readFileSync(R + f); gitBlobId(buf); statSync(R + f);
    const ix = indexFile(buf.toString('utf8'));
    if (variant === 'anchor') { const r = locateAnchored(ix, anchorIndex(ix), qs); for (const q of qs) { n++; if (r.counts.get(q.sha) >= 1) found++; } }
    else if (variant === 'rolling-per-length') { const r = locateMany53(ix, qs); for (const q of qs) { n++; if (r.counts.get(q.sha) >= 1) found++; } }
    else { const r = locateShaOnly(ix, qs); for (const q of qs) { n++; if (r.get(q.k).get(q.sha) >= 1) found++; } }
  }
  console.log(`${variant}: 200 files (${(totalBytes / 1e6).toFixed(2)} MB), ${n} quotes, found ${found}: ${ms(t0).toFixed(0)} ms`);
}
