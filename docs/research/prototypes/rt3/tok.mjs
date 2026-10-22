import fs from 'node:fs'; import path from 'node:path';
const tok = s => s.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? [];
const ok = s => tok(s).length >= 8 && s.replace(/\s/g,'').length >= 24;
const root = process.argv[2]; let n=0, pass=0, uniqFail=0;
const files = [];
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if (e.isDirectory()) walk(p); else if (/\.ts$/.test(e.name)) files.push(p);} })(path.join(root,'src'));
for (const f of files) { const lines = fs.readFileSync(f,'utf8').split('\n').filter(l=>l.trim() && !/^\s*(\/\/|\*|\/\*)/.test(l));
  const cnt = new Map(); for (const l of lines){ const k=tok(l).join('\x1f'); cnt.set(k,(cnt.get(k)||0)+1); }
  for (const l of lines) { n++; if (ok(l)) { pass++; if (cnt.get(tok(l).join('\x1f'))>1) uniqFail++; } } }
console.log({codeLines:n, singleLinePasses:pass, pct:(100*pass/n).toFixed(1), passButDuplicateInFile:uniqFail});
for (const s of ['export const FACT_CAP = 500;','const MAX_SCAN_BYTES = 512 * 1024;','"test": "vitest run"','  "engines": { "node": ">=24" },','app.use(authMiddleware);','PASSWORD = process.env.DB_PASSWORD ?? "";','apiKey: process.env.STRIPE_API_KEY,'])
  console.log(JSON.stringify(s), tok(s).length, s.replace(/\s/g,'').length, ok(s));
