import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync, renameSync, existsSync, statSync } from 'node:fs';
const mode = process.argv[2] ?? 'wal-new';
rmSync('rb', { recursive: true, force: true }); mkdirSync('rb');
const d0 = new DatabaseSync('rb/cache.db'); d0.exec("PRAGMA journal_mode=WAL; CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t VALUES(-1,'seed')"); d0.close();
const ch = spawn(process.execPath, ['--no-warnings', 'rebuild_child.mjs'], { stdio: 'inherit' });
await new Promise(r => setTimeout(r, 800));
// rebuild under "the lock": new file, different content
const n = new DatabaseSync('rb/cache.db.new');
n.exec(`PRAGMA journal_mode=${mode === 'wal-new' ? 'WAL' : 'DELETE'}; CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT); CREATE TABLE extra(a,b,c)`);
n.exec('BEGIN'); const s = n.prepare('INSERT INTO t VALUES(?,?)'); for (let i = 0; i < 50; i++) s.run(i, 'NEW'); n.exec('COMMIT'); n.close();
console.log(`parent: built cache.db.new (journal=${mode}); -wal of old exists: ${existsSync('rb/cache.db-wal')} (${existsSync('rb/cache.db-wal') ? statSync('rb/cache.db-wal').size : 0} B)`);
renameSync('rb/cache.db.new', 'rb/cache.db');
try {
  const r = new DatabaseSync('rb/cache.db', { readOnly: true });
  const c = r.prepare("SELECT count(*) n, sum(v='NEW') nw, sum(v LIKE 'OLD%') old FROM t").get();
  console.log(`parent: reopened renamed cache.db -> rows=${c.n} NEW=${c.nw} OLD=${c.old}; integrity_check=${r.prepare('PRAGMA integrity_check').get().integrity_check}`);
  r.close();
} catch (e) { console.log('parent: reopen/query FAILED:', e.message); }
await new Promise(r => ch.on('exit', r));
try { const r = new DatabaseSync('rb/cache.db'); console.log(`after child exit: rows=${r.prepare('SELECT count(*) n FROM t').get().n}; integrity_check=${r.prepare('PRAGMA integrity_check').get().integrity_check}`); } catch (e) { console.log('after child exit FAILED:', e.message); }
