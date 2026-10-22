import { readFileSync } from 'node:fs';
import { indexFile, quote2, tokenize, locateMany53, nonSpaceChars } from './tok.mjs';
const R = '~/Desktop/Developer/playground/baton/';
const count = (text, q) => locateMany53(indexFile(text), [q]).counts.get(q.sha);

// ---- Part A: transformations on a real snippet ----
const file = readFileSync(R + 'src/server.ts', 'utf8');
const lines = file.split('\n');
// find a multi-line call with string literal + trailing comma context
let at = lines.findIndex((l, i) => /\($/.test(l.trim()) && /'/.test(lines.slice(i, i + 4).join('')) && i > 500);
const quoteText = lines.slice(at, at + 4).join('\n');
console.log('quote (server.ts lines', at + 1, '-', at + 4, '):\n' + quoteText);
const q = quote2(tokenize(quoteText));
console.log('tokens', q.k, 'nonspace chars', nonSpaceChars(quoteText), 'baseline count', count(file, q));
const variants = {
  'rewrap: join 4 lines into one': file.replace(quoteText, quoteText.replace(/\n\s*/g, ' ')),
  'rewrap: re-indent 4 spaces + split at commas': file.replace(quoteText, quoteText.split('\n').map(l => '    ' + l).join('\n').replace(/, /g, ',\n      ')),
  "prettier singleQuote:false ('x' -> \"x\")": file.replace(quoteText, quoteText.replace(/'/g, '"')),
  'prettier trailingComma none (drop trailing comma)': (() => { const v = quoteText.replace(/,(\s*\n\s*\))/, '$1'); if (v === quoteText) throw new Error('no-op'); return file.replace(quoteText, v); })(),
  'rename one identifier inside quote': (() => { const id = tokenize(quoteText).find(t => /^[a-z]\w{3,}$/.test(t)); return file.replace(quoteText, quoteText.replace(new RegExp('\\b' + id + '\\b'), id + 'X')); })(),
  'quote moved to end of file': file.replace(quoteText, '') + '\n' + quoteText + '\n',
  'comment line inserted inside quote': file.replace(quoteText, quoteText.replace('\n', '\n  // note\n')),
};
for (const [name, t] of Object.entries(variants)) console.log(`  ${name}: count=${count(t, q)} -> ${count(t, q) === 1 ? 'MATCH' : 'NO MATCH'}`);
// arrow paren + semicolon variants on a generic sample
const s1 = 'items.map(x => x.id).filter(Boolean)'; const s2 = 'items.map((x) => x.id).filter(Boolean);';
console.log(`  arrowParens "x =>" vs "(x) =>": tokens equal = ${tokenize(s1).join() === tokenize(s2).join()}`);

// ---- Part B: uniqueness of random windows ----
const files = ['src/server.ts','src/team/fold.ts','web/src/lib/api.ts','web/src/lib/teamApi.ts','src/usage.ts','web/src/features/Board.tsx','src/endpoints/config.ts','web/src/features/Canvas.tsx','src/commands/endpoints.ts','src/liveness.ts'];
let st = 99; const rnd = () => (st = (Math.imul(st, 1103515245) + 12345) >>> 0) / 2 ** 32;
const Ls = [8, 10, 12, 16, 20, 24, 32];
const agg = { rand: {}, line: {} }; for (const m of ['rand', 'line']) for (const L of Ls) agg[m][L] = { uniq: 0, n: 0, chars24: 0, uniqAnd24: 0 };
const per = [];
for (const f of files) {
  const text = readFileSync(R + f, 'utf8'); const ix = indexFile(text);
  // token start offsets -> to know line starts & char lengths
  const re = /[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/gu; const off = []; let m; while ((m = re.exec(text))) off.push(m.index);
  const lineStart = []; for (let i = 0; i < off.length; i++) if (i === 0 || text.slice(off[i - 1], off[i]).includes('\n')) lineStart.push(i);
  const counts = new Map(); // memo
  let fu8 = 0;
  for (const mode of ['rand', 'line']) for (let s = 0; s < 200; s++) {
    const p0 = mode === 'rand' ? Math.floor(rnd() * (ix.n - 40)) : lineStart[Math.floor(rnd() * lineStart.length)];
    if (p0 + 32 > ix.n) continue;
    for (const L of Ls) {
      const toks = ix.tokens.slice(p0, p0 + L); const q = quote2(toks);
      const c = locateMany53(ix, [q]).counts.get(q.sha);
      const chars = toks.join('').length;
      const a = agg[mode][L]; a.n++; if (c === 1) a.uniq++; if (chars >= 24) a.chars24++; if (c === 1 && chars >= 24) a.uniqAnd24++;
      if (mode === 'rand' && L === 8 && c === 1) fu8++;
    }
  }
  per.push(`${f}: tokens=${ix.n}, random 8-tok windows unique=${fu8}/200`);
}
console.log('\nper file:\n  ' + per.join('\n  '));
for (const mode of ['rand', 'line']) {
  console.log(`\n${mode === 'rand' ? 'random token offset' : 'line-aligned start'} windows (2000 = 200 x 10 files):`);
  for (const L of Ls) { const a = agg[mode][L]; console.log(`  L=${L}: unique ${(100 * a.uniq / a.n).toFixed(1)}%  | >=24 non-space chars ${(100 * a.chars24 / a.n).toFixed(1)}% | passes both rules AND unique ${(100 * a.uniqAnd24 / a.n).toFixed(1)}%  (n=${a.n})`); }
}
