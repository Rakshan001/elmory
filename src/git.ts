import type { Exec } from './exec.js';

export interface RenameResult {
  status: 'same' | 'renamed' | 'deleted' | 'unknown';
  newPath?: string;
}

/** `signer` is the key fingerprint, set only when git reports a good signature (`%G?` is `G`). */
export interface AddedBy {
  commit: string;
  authorEmail: string;
  signer: string | null;
}

const RS = '\x1e';
const US = '\x1f';
/** A full or abbreviated object name. Anything else (refs, options) is refused before git sees it. */
const SHA = /^[0-9a-f]{4,64}$/i;

/** Pathspec that matches `p` byte for byte: no globs, no magic. */
function literal(p: string): string {
  return `:(literal)${p}`;
}

function splitZ(out: string): string[] {
  const parts = out.split('\0');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/**
 * Thin wrapper over `git` through an injectable `Exec`. Every method is one git invocation and
 * nothing is cached here. Paths are repo-relative with forward slashes (git's own form), and
 * `worktree` is the work tree's top level.
 */
export class Git {
  constructor(
    private readonly exec: Exec,
    private readonly worktree: string,
  ) {}

  private run(args: string[]) {
    return this.exec('git', args, { cwd: this.worktree });
  }

  private async revParse(rev: string): Promise<string | null> {
    const res = await this.run(['rev-parse', '--verify', '--quiet', rev]);
    const out = res.stdout.trim();
    return res.code === 0 && out !== '' ? out : null;
  }

  /** `HEAD`'s commit; null when there are no commits or `worktree` is not in a repository. */
  head(): Promise<string | null> {
    return this.revParse('HEAD');
  }

  /** `HEAD`'s tree; null when there are no commits or `worktree` is not in a repository. */
  tree(): Promise<string | null> {
    return this.revParse('HEAD^{tree}');
  }

  async trackedFiles(): Promise<Set<string>> {
    const res = await this.run(['ls-files', '-z']);
    if (res.code !== 0) throw new Error(`git ls-files failed: ${res.stderr.trim() || `exit ${res.code}`}`);
    return new Set(splitZ(res.stdout));
  }

  /** True only when `relPath` is itself a tracked file (not a directory, not a pattern). */
  async isTracked(relPath: string): Promise<boolean> {
    const res = await this.run(['ls-files', '-z', '--', literal(relPath)]);
    if (res.code !== 0) throw new Error(`git ls-files failed: ${res.stderr.trim() || `exit ${res.code}`}`);
    return splitZ(res.stdout).includes(relPath);
  }

  /**
   * Where `relPath` (as of `fromCommit`) is at HEAD. Any failure, including a commit that is not
   * reachable here (squash-merged branch, shallow clone), is `unknown`, never `deleted`.
   */
  async renameLookup(fromCommit: string, relPath: string): Promise<RenameResult> {
    if (!SHA.test(fromCommit)) return { status: 'unknown' };
    const res = await this.run(['diff', '-M', '--name-status', '-z', fromCommit, 'HEAD']);
    if (res.code !== 0) return { status: 'unknown' };
    const parts = splitZ(res.stdout);
    for (let i = 0; i < parts.length; ) {
      const status = parts[i] ?? '';
      const kind = status.charAt(0);
      if (kind === 'R' || kind === 'C') {
        const from = parts[i + 1];
        const to = parts[i + 2];
        if (kind === 'R' && from === relPath && to !== undefined) return { status: 'renamed', newPath: to };
        i += 3;
      } else {
        if (kind === 'D' && parts[i + 1] === relPath) return { status: 'deleted' };
        i += 2;
      }
    }
    return { status: 'same' };
  }

  /**
   * For each file added under `relDir` in HEAD's history: the adding commit, its author email,
   * and its signer. One `git log` call. When a path was added more than once, the first entry in
   * log order (the most recent add) wins.
   */
  async addedBy(relDir: string): Promise<Map<string, AddedBy>> {
    const result = new Map<string, AddedBy>();
    const res = await this.run([
      '-c',
      'core.quotePath=false',
      'log',
      // %G? verifies the signature itself. --show-signature (or log.showSignature) would print
      // the verification text to stdout between records, where it would parse as file paths.
      '--no-show-signature',
      '--diff-filter=A',
      '--name-only',
      '--format=%x1e%H%x1f%G?%x1f%GF%x1f%GK%x1f%ae',
      '--',
      literal(relDir),
    ]);
    if (res.code !== 0) {
      // An unborn HEAD has no history to report; any other failure is an error.
      if ((await this.head()) === null) return result;
      throw new Error(`git log failed: ${res.stderr.trim() || `exit ${res.code}`}`);
    }
    for (const record of res.stdout.split(RS).slice(1)) {
      const lines = record.split('\n');
      const [commit = '', good = '', fingerprint = '', keyId = '', authorEmail = ''] = (lines[0] ?? '').split(US);
      const signer = good === 'G' ? fingerprint || keyId || null : null;
      for (const file of lines.slice(1)) {
        if (file === '' || result.has(file)) continue;
        result.set(file, { commit, authorEmail, signer });
      }
    }
    return result;
  }
}
