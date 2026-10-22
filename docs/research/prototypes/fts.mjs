import { DatabaseSync } from 'node:sqlite';
import { readFileSync, rmSync, statSync, readdirSync } from 'node:fs';
import { now, ms } from './tok.mjs';
const R = '~/Desktop/Developer/playground/baton/';
// realistic vocabulary: identifier words from Baton src, split camelCase, frequency-weighted
const vocab = [];
const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) vocab.push(...(readFileSync(p, 'utf8').match(/[A-Za-z]{3,}/g) ?? []).flatMap(w => w.split(/(?=[A-Z])/)).map(w => w.toLowerCase()).filter(w => w.length > 2)); } };
walk(R + 'src');
const paths = readdirSync(R + 'src', { recursive: true }).filter(p => /\.ts$/.test(p)).map(p => 'src/' + p);
let st = 3; const rnd = () => (st = (Math.imul(st, 1103515245) + 12345) >>> 0) / 2 ** 32;
const w = () => vocab[(rnd() * vocab.length) | 0];
const words = n => Array.from({ length: n }, w).join(' ');
const DB = 'fts_bench.db'; for (const s of ['', '-wal', '-shm']) rmSync(DB + s, { force: true });
const db = new DatabaseSync(DB);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
CREATE TABLE facts(id TEXT PRIMARY KEY, title TEXT, body TEXT, key TEXT, paths TEXT, state TEXT);
CREATE VIRTUAL TABLE facts_fts USING fts5(title, body, key, paths, content='facts', content_rowid='rowid', tokenize='unicode61');
CREATE TABLE evidence(blob TEXT, qhash TEXT, found INTEGER, PRIMARY KEY(blob, qhash)) WITHOUT ROWID;
CREATE TABLE src(fact TEXT, path TEXT, qhash TEXT);`);
const ins = db.prepare('INSERT INTO facts VALUES(?,?,?,?,?,?)'), insf = db.prepare('INSERT INTO facts_fts(rowid,title,body,key,paths) VALUES(last_insert_rowid(),?,?,?,?)');
const insE = db.prepare('INSERT OR IGNORE INTO evidence VALUES(?,?,1)'), insS = db.prepare('INSERT INTO src VALUES(?,?,?)');
let t0 = now(); db.exec('BEGIN');
for (let i = 0; i < 5000; i++) {
  const id = 'f_' + i.toString(36).padStart(8, '0'), title = words(4 + (rnd() * 6 | 0)), body = words(20 + (rnd() * 40 | 0)), key = w() + '.' + w(), p = paths[(rnd() * paths.length) | 0];
  ins.run(id, title, body, key, p, 'active'); insf.run(title, body, key, p);
  const qh = 'q' + i; insS.run(id, p, qh); insE.run('blob' + p, qh);
}
db.exec('COMMIT'); console.log(`insert 5000 facts: ${ms(t0).toFixed(0)} ms; db size ${(statSync(DB).size / 1024).toFixed(0)} KiB (+wal ${(statSync(DB + '-wal').size / 1024).toFixed(0)} KiB)`);
db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close();
const ro = new DatabaseSync(DB, { readOnly: true });
const qry = ro.prepare(`SELECT f.id, f.title, f.paths, bm25(facts_fts, 10.0, 1.0, 5.0, 3.0) AS s FROM facts_fts JOIN facts f ON f.rowid = facts_fts.rowid WHERE facts_fts MATCH ? ORDER BY s LIMIT 50`);
const ev = ro.prepare('SELECT s.qhash, e.found FROM src s LEFT JOIN evidence e ON e.blob = ? AND e.qhash = s.qhash WHERE s.fact = ?');
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const esc = s => s.split(/\s+/).filter(Boolean).map(t => '"' + t.replace(/"/g, '""') + '"');
for (const mode of ['OR', 'AND']) {
  const tq = [], te = [], hits = [];
  for (let i = 0; i < 300; i++) {
    const q = esc(words(2 + (rnd() * 3 | 0))).join(mode === 'OR' ? ' OR ' : ' ');
    let t = now(); const rows = qry.all(q); tq.push(ms(t)); hits.push(rows.length);
    t = now(); const stc = new Map(); for (const r of rows) { let s = stc.get(r.paths); if (!s) { try { s = statSync(R + r.paths); } catch { s = null; } stc.set(r.paths, s); } ev.all('blob' + r.paths, r.id); } te.push(ms(t));
  }
  const tot = tq.map((x, i) => x + te[i]);
  console.log(`${mode} 300 queries (2-4 terms): FTS p50 ${pct(tq, .5).toFixed(2)} p95 ${pct(tq, .95).toFixed(2)} p99 ${pct(tq, .99).toFixed(2)} max ${Math.max(...tq).toFixed(2)} ms | +stat+evidence lookup p95 total ${pct(tot, .95).toFixed(2)} ms | median hits ${pct(hits, .5)}`);
}
// unescaped agent query
try { ro.prepare("SELECT count(*) c FROM facts_fts WHERE facts_fts MATCH ?").get('checkToken() middleware'); console.log('raw query ok'); } catch (e) { console.log('raw agent query "checkToken() middleware" ->', e.message); }
try { ro.prepare("SELECT count(*) c FROM facts_fts WHERE facts_fts MATCH ?").get('auth-token'); console.log('raw "auth-token" ok'); } catch (e) { console.log('raw "auth-token" ->', e.message); }
