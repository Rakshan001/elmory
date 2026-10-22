import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('rb/cache.db');
db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0');
db.exec('BEGIN'); const s = db.prepare('INSERT INTO t VALUES(?,?)'); for (let i = 0; i < 2000; i++) s.run(i, 'OLD-' + 'x'.repeat(100)); db.exec('COMMIT');
console.log('child: wrote 2000 OLD rows into WAL, holding connection open 3 s');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
db.close(); console.log('child: closed');
