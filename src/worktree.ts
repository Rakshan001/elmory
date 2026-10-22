// Which worktree a front end serves: the git toplevel of a directory, so quotes, `about` paths
// and `.elmory/facts` are the same whether a process starts at the root or in a subdirectory.

import fs from 'node:fs';
import path from 'node:path';
import { type Exec, defaultExec } from './exec.js';

/**
 * `git rev-parse --show-toplevel` of `dir` when it is inside a git work tree, else `dir` itself;
 * realpath'd either way. Throws when `dir` does not exist.
 */
export async function resolveWorktree(dir: string, exec: Exec = defaultExec): Promise<string> {
  const abs = path.resolve(dir);
  try {
    const r = await exec('git', ['rev-parse', '--show-toplevel'], { cwd: abs });
    const top = r.stdout.replace(/\r?\n$/, '');
    if (r.code === 0 && top !== '') return fs.realpathSync(top);
  } catch {
    // git could not run here: the directory itself
  }
  return fs.realpathSync(abs);
}
