// node remember-child.mjs <worktree> <cacheDir> <inputJson> [--wait]
// Opens Elmory on the worktree (compiled dist/api.js) and calls remember(input). With --wait it
// prints READY once open and waits for one line on stdin before writing, so a parent can release
// many children at once. Prints OK, or CONFLICT when the compare-and-set lost; exits 0 for both.
// Any other failure prints the error on stderr and exits 1. ELMORY_CRASH_AT is honoured by the
// gate (it exits 99 inside the write).
import { ConflictError, Elmory } from '../../dist/api.js';

const [worktree, cacheDir, inputJson, flag] = process.argv.slice(2);
if (!worktree || !cacheDir || !inputJson) {
  console.error('usage: remember-child.mjs <worktree> <cacheDir> <inputJson> [--wait]');
  process.exit(2);
}

let e;
try {
  e = await Elmory.open({ worktree, cacheDir, observer: `agent:child-${process.pid}` });
  if (flag === '--wait') {
    console.log('READY');
    await new Promise((resolve) => process.stdin.once('data', resolve));
    process.stdin.destroy();
  }
  await e.remember(JSON.parse(inputJson));
  console.log('OK');
} catch (err) {
  if (err instanceof ConflictError) console.log(`CONFLICT ${err.heads.join(',')}`);
  else {
    console.error(err);
    process.exitCode = 1;
  }
} finally {
  e?.close();
}
