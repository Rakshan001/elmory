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

/**
 * `git rev-parse --git-common-dir` for `worktree`, realpath'd and absolute.
 * Null when `worktree` is not inside a git repository (or git cannot run).
 */
export async function gitCommonDir(exec: Exec, worktree: string): Promise<string | null> {
  let res: ExecResult;
  try {
    res = await exec('git', ['rev-parse', '--git-common-dir'], { cwd: worktree });
  } catch {
    return null;
  }
  const out = res.stdout.trim();
  if (res.code !== 0 || out === '') return null;
  try {
    return fs.realpathSync(path.resolve(worktree, out));
  } catch {
    return null;
  }
}
