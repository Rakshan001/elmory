import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
const f='ck.db'; for (const x of [f, f+'-wal', f+'-shm']) try{fs.unlinkSync(x)}catch{}
const w = new DatabaseSync(f); w.exec("PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; CREATE TABLE t(x TEXT);");
for (let i=0;i<50;i++) w.prepare("INSERT INTO t VALUES(?)").run(i===3?'zqxjforgetme':'row'+i);
const r = new DatabaseSync(f, {readOnly:true});
r.exec("BEGIN"); r.prepare("SELECT count(*) FROM t").get();   // reader mid-transaction (e.g. a long recall)
w.exec("PRAGMA busy_timeout=200");
w.exec("DELETE FROM t WHERE x='zqxjforgetme'");
console.log('ckpt', w.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get());
try { w.exec("VACUUM"); console.log('vacuum ok'); } catch(e){ console.log('vacuum err:', e.message); }
console.log('wal has text:', fs.existsSync(f+'-wal') && fs.readFileSync(f+'-wal').includes('zqxjforgetme'), 'db has text:', fs.readFileSync(f).includes('zqxjforgetme'));
r.exec("COMMIT");
// --- swap test: rename a new db over a db whose WAL still has un-checkpointed frames
const g='sw.db'; for (const x of [g, g+'-wal', g+'-shm','sw.new']) try{fs.unlinkSync(x)}catch{}
const a = new DatabaseSync(g); a.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE ledger(id TEXT); INSERT INTO ledger VALUES('old1');");
const hold = new DatabaseSync(g); hold.exec("BEGIN"); hold.prepare("SELECT * FROM ledger").all(); // keeps WAL alive
a.exec("INSERT INTO ledger VALUES('old2')");
const n = new DatabaseSync('sw.new'); n.exec("CREATE TABLE ledger(id TEXT); INSERT INTO ledger VALUES('new1'); CREATE TABLE extra(y);"); n.close();
fs.renameSync('sw.new', g);
console.log('after swap, -wal exists:', fs.existsSync(g+'-wal'), 'size', fs.existsSync(g+'-wal')&&fs.statSync(g+'-wal').size);
try { const c = new DatabaseSync(g); console.log('new conn sees:', c.prepare("SELECT * FROM ledger").all().map(x=>x.id), c.prepare("PRAGMA integrity_check").get()); } catch(e){ console.log('open err', e.message); }
// old-inode writer keeps writing into the unlinked file
a.exec("INSERT INTO ledger VALUES('written-after-swap')");
const c2 = new DatabaseSync(g); try { console.log('fresh conn sees:', c2.prepare("SELECT * FROM ledger").all().map(x=>x.id)); } catch(e){console.log('err',e.message)}
