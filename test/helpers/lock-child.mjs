// node lock-child.mjs <cacheDir> <holdMs> [name]
// Opens the cache, takes the write lock and holds it for holdMs, recording the held interval in
// meta (lock:<name>:start / lock:<name>:end). Prints READY once the lock is held, then OK, or
// BUSY when the busy timeout ran out. Exits 0 for both; any other failure prints the error and
// exits 1. Output uses writeSync: stdout to a pipe is asynchronous on macOS, and READY must reach
// the parent while the lock is still held.
import { writeSync } from 'node:fs';
import { Cache, CacheBusyError } from '../../dist/cache.js';

const [dir, holdArg, name = String(process.pid)] = process.argv.slice(2);
if (!dir || holdArg === undefined) {
  writeSync(2, 'usage: lock-child.mjs <cacheDir> <holdMs> [name]\n');
  process.exit(2);
}
const holdMs = Number(holdArg);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const cache = Cache.open('lock-child', dir);
try {
  cache.withWriteLock(() => {
    cache.setMeta(`lock:${name}:start`, String(Date.now()));
    writeSync(1, 'READY\n');
    if (holdMs > 0) sleep(holdMs);
    cache.setMeta(`lock:${name}:end`, String(Date.now()));
  });
  writeSync(1, 'OK\n');
} catch (e) {
  if (e instanceof CacheBusyError) writeSync(1, 'BUSY\n');
  else {
    writeSync(2, `${e?.stack ?? e}\n`);
    process.exitCode = 1;
  }
} finally {
  cache.close();
}
