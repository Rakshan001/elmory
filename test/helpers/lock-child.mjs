// node lock-child.mjs <cacheDir> <holdMs> [name]
// Opens the cache, takes the write lock and holds it for holdMs, recording the held interval in
// meta (lock:<name>:start / lock:<name>:end). Prints OK, or BUSY when the busy timeout ran out.
// Exits 0 for both; any other failure prints the error and exits 1.
import { Cache, CacheBusyError } from '../../dist/cache.js';

const [dir, holdArg, name = String(process.pid)] = process.argv.slice(2);
if (!dir || holdArg === undefined) {
  console.error('usage: lock-child.mjs <cacheDir> <holdMs> [name]');
  process.exit(2);
}
const holdMs = Number(holdArg);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const cache = Cache.open('lock-child', dir);
try {
  cache.withWriteLock(() => {
    cache.setMeta(`lock:${name}:start`, String(Date.now()));
    if (holdMs > 0) sleep(holdMs);
    cache.setMeta(`lock:${name}:end`, String(Date.now()));
  });
  console.log('OK');
} catch (e) {
  if (e instanceof CacheBusyError) console.log('BUSY');
  else {
    console.error(e);
    process.exitCode = 1;
  }
} finally {
  cache.close();
}
