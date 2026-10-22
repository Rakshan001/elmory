import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Injectable process runner. Every git call in Elmory goes through one of these. */
export type Exec = (file: string, args: string[], opts: { cwd: string }) => Promise<ExecResult>;

const MAX_BUFFER = 64 * 1024 * 1024;

/**
 * `execFile` without a shell. Resolves on any exit status (a non-zero exit is a result, not an
 * error); rejects only when the process could not run (e.g. ENOENT) or its output overflowed.
 * A process killed by a signal resolves with code -1.
 */
export const defaultExec: Exec = (file, args, opts) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { cwd: opts.cwd, maxBuffer: MAX_BUFFER, windowsHide: true, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err === null) {
          resolve({ stdout, stderr, code: 0 });
          return;
        }
        if (typeof err.code === 'number') {
          resolve({ stdout, stderr, code: err.code });
          return;
        }
        if (err.code == null && err.signal != null) {
          resolve({ stdout, stderr, code: -1 });
          return;
        }
        reject(err);
      },
    );
  });

/** True when `dir` or any ancestor has a `.git` entry (directory, or file for a linked worktree). */
function insideRepository(dir: string): boolean {
  let current = path.resolve(dir);
  for (;;) {
    try {
      fs.lstatSync(path.join(current, '.git'));
      return true;
    } catch {
      // keep walking up
    }
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

/**
 * `git rev-parse --git-common-dir` for `worktree`, realpath'd and absolute.
 * Null when `worktree` is not inside a git repository. When git fails (or cannot run) but a
 * `.git` entry exists in `worktree` or an ancestor, this throws instead: trust must never fall
 * back silently to the no-git layout inside a real repository.
 */
export async function gitCommonDir(exec: Exec, worktree: string): Promise<string | null> {
  let detail: string;
  try {
    const res = await exec('git', ['rev-parse', '--git-common-dir'], { cwd: worktree });
    const out = res.stdout.trim();
    if (res.code === 0 && out !== '') {
      try {
        return fs.realpathSync(path.resolve(worktree, out));
      } catch (e) {
        detail = `cannot resolve ${out}: ${(e as Error).message}`;
      }
    } else {
      detail = res.stderr.trim() || `exit code ${res.code}`;
    }
  } catch (e) {
    detail = (e as Error).message;
  }
  if (insideRepository(worktree)) throw new Error(`git failed inside a repository: ${detail}`);
  return null;
}
