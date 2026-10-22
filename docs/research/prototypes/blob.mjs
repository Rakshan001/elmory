import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gitBlobId, now, ms } from './tok.mjs';
const [cwd, ...files] = process.argv.slice(2);
for (const f of files) {
  const t0 = now(); const mine = gitBlobId(readFileSync(cwd + '/' + f)); const t = ms(t0);
  const git = execFileSync('git', ['hash-object', f], { cwd }).toString().trim();
  const idx = execFileSync('git', ['ls-files', '-s', f], { cwd }).toString().split(/\s+/)[1] ?? '(untracked)';
  console.log(`${f}: in-process ${mine} (${t.toFixed(2)} ms) | git hash-object ${git} | index ${idx} | equal=${mine === git}`);
}
