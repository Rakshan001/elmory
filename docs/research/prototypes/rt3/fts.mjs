import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
for (const mode of ['plain','securedelete']) {
  const f = `fts-${mode}.db`; for (const x of [f, f+'-wal', f+'-shm']) try{fs.unlinkSync(x)}catch{}
  const d = new DatabaseSync(f);
  d.exec("PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;");
  d.exec("CREATE TABLE r(id INTEGER PRIMARY KEY, body TEXT); CREATE VIRTUAL TABLE ft USING fts5(body, content='r', content_rowid='id');");
  if (mode==='securedelete') d.exec("INSERT INTO ft(ft, rank) VALUES('secure-delete', 1);");
  const ins = d.prepare("INSERT INTO r(id, body) VALUES(?,?)"); const fi = d.prepare("INSERT INTO ft(rowid, body) VALUES(?,?)");
  for (let i=1;i<=200;i++){ const b = i===7 ? 'patient zqxjvegansecret diagnosis' : 'ordinary fact number '+i; ins.run(i,b); fi.run(i,b); }
  const row = d.prepare("SELECT body FROM r WHERE id=7").get();
  d.exec("BEGIN IMMEDIATE");
  d.prepare("INSERT INTO ft(ft, rowid, body) VALUES('delete', 7, ?)").run(row.body);
  d.exec("DELETE FROM r WHERE id=7"); d.exec("COMMIT");
  d.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);");
  console.log(mode, 'match:', d.prepare("SELECT count(*) c FROM ft WHERE ft MATCH 'zqxjvegansecret'").get().c);
  d.close();
  let hits=0; for (const x of [f, f+'-wal']) { try { if (fs.readFileSync(x).includes('zqxjvegansecret')) hits++; console.log(' ', x, fs.readFileSync(x).includes('zqxjvegansecret')); } catch {} }
}
