import { DatabaseSync } from 'node:sqlite';
import { readFileSync, rmSync, existsSync } from 'node:fs';
const M = 'zqxk7marker';           // forgotten text
const DECOY = 'zqxk7mapple';       // shares prefix "zqxk7ma" -> FTS5 term prefix-compression
const cfgs = { 'spec as written': false, 'spec + FTS5 secure-delete option': true };
const hits = (f, s) => { if (!existsSync(f)) return '-'; const b = readFileSync(f); let n = 0, i = -1; while ((i = b.indexOf(s, i + 1)) !== -1) n++; return n; };
for (const [label, ftsSecure] of Object.entries(cfgs)) {
  const DB = 'forget.db'; for (const s of ['', '-wal', '-shm']) rmSync(DB + s, { force: true });
  const db = new DatabaseSync(DB);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
    CREATE TABLE facts(id TEXT PRIMARY KEY, title TEXT, body TEXT);
    CREATE VIRTUAL TABLE facts_fts USING fts5(title, body, content='facts', content_rowid='rowid');
    CREATE VIRTUAL TABLE v USING fts5vocab(facts_fts, 'row');`);
  if (ftsSecure) db.exec(`INSERT INTO facts_fts(facts_fts, rank) VALUES('secure-delete', 1)`);
  const ins = db.prepare('INSERT INTO facts(id,title,body) VALUES(?,?,?)'), insf = db.prepare('INSERT INTO facts_fts(rowid,title,body) VALUES(last_insert_rowid(),?,?)');
  db.exec('BEGIN');
  for (let i = 0; i < 5000; i++) { const t = `fact ${i} about cache blob ${i % 97}`, b = `body text ${i} worktree quote ${i % 13} ${i % 50 === 0 ? DECOY : ''}`; ins.run('f' + i, t, b); insf.run(t, b); }
  db.exec('COMMIT'); db.exec('PRAGMA wal_checkpoint(TRUNCATE)');   // marker-free baseline on disk
  db.exec('BEGIN'); ins.run('fM', 'secret ' + M, 'the forgotten body ' + M + ' end'); insf.run('secret ' + M, 'the forgotten body ' + M + ' end');
  for (let i = 0; i < 300; i++) { const t = `later fact ${i}`, b = `later body ${i} ${i % 7 ? '' : DECOY}`; ins.run('g' + i, t, b); insf.run(t, b); } db.exec('COMMIT');
  const vocab = () => db.prepare('SELECT count(*) c FROM v WHERE term=?').get(M).c;
  const rep = step => console.log(`  ${step.padEnd(34)} db=${hits(DB, M)} wal=${hits(DB + '-wal', M)} | fts5vocab has term: ${vocab() ? 'YES' : 'no'}`);
  console.log(`\n[${label}]`); rep('after insert (in WAL)');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); rep('after checkpoint (marker now in db)');
  // forget: FTS delete with original values, delete row
  const row = db.prepare('SELECT rowid, title, body FROM facts WHERE id=?').get('fM');
  db.exec('BEGIN'); db.prepare(`INSERT INTO facts_fts(facts_fts, rowid, title, body) VALUES('delete', ?, ?, ?)`).run(row.rowid, row.title, row.body);
  db.prepare('DELETE FROM facts WHERE id=?').run('fM'); db.exec('COMMIT'); rep('after FTS delete + row delete');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); rep('after wal_checkpoint(TRUNCATE)');
  db.exec('VACUUM'); rep('after VACUUM');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); rep('after 2nd checkpoint(TRUNCATE)');
  db.exec(`INSERT INTO facts_fts(facts_fts) VALUES('optimize')`); db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.exec('VACUUM'); db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  rep("after FTS 'optimize'+ckpt+VACUUM+ckpt");
  // prefix-compression false negative: count raw bytes for the decoy (present) vs its full term
  db.close();
}
