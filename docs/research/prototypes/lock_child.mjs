import { DatabaseSync } from 'node:sqlite';
const [name, busyMs, holdMs, mode] = process.argv.slice(2);
const sleep = n => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
const db = new DatabaseSync('lock.db');
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=${busyMs}`);
const t0 = Date.now(); const T = () => Date.now() % 100000;
try {
  db.exec('BEGIN IMMEDIATE');
  const waited = Date.now() - t0;
  if (mode === 'cas') {
    const c = new DatabaseSync('cas.db'); c.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
    const head = c.prepare('SELECT head FROM chain').get().head;
    if (head === 'h0') { c.prepare('UPDATE chain SET head=?').run(name); console.log(`${name} OK (waited ${waited} ms)`); }
    else console.log(`${name} CONFLICT head=${head} (waited ${waited} ms)`);
    c.close();
  } else {
    console.log(`${name} acquired at t=${T()} after waiting ${waited} ms; holding ${holdMs} ms`);
    sleep(+holdMs);
  }
  db.exec('COMMIT');
} catch (e) { console.log(`${name} FAILED after ${Date.now() - t0} ms: ${e.code ?? ''} ${e.errcode ?? ''} ${e.message}`); }
