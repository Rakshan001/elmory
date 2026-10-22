import type { Exec } from './exec.js';

export interface RenameResult {
  status: 'same' | 'renamed' | 'deleted' | 'unknown';
  newPath?: string;
}

/**
 * The most recent commit that changed a path (other than deleting it). `signer` is that
 * commit's key fingerprint, set only when git reports a good signature (`%G?` is `G`) and no
 * later commit in HEAD's history touched the path again (see `Git.addedBy`).
 */
export interface AddedBy {
  commit: string;
  signer: string | null;
}

const RS = '\x1e';
const US = '\x1f';
/** A full or abbreviated object name. Anything else (refs, options) is refused before git sees it. */
const SHA = /^[0-9a-f]{4,64}$/i;
/** A full object name as `%H` prints it (SHA-1 or SHA-256). */
const FULL_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** One `--raw` change line for one parent (`separate`); captures the post-image blob and the status. */
const RAW_CHANGE = /^:[0-7]{6} [0-7]{6} (?:[0-9a-f]{40}|[0-9a-f]{64}) ([0-9a-f]{40}|[0-9a-f]{64}) ([ACDMTUXB])[0-9]*$/;

/** Pathspec that matches `p` byte for byte: no globs, no magic. */
function literal(p: string): string {
  return `:(literal)${p}`;
}

/** Whether `ancestor` is reachable from any commit in `from` through `parentsOf`. */
function descendsFrom(parentsOf: Map<string, string[]>, from: string[], ancestor: string): boolean {
  const seen = new Set<string>();
  const stack = [...from];
  while (stack.length > 0) {
    const c = stack.pop() as string;
    if (c === ancestor) return true;
    if (seen.has(c)) continue;
    seen.add(c);
    for (const p of parentsOf.get(c) ?? []) stack.push(p);
  }
  return false;
}

function splitZ(out: string): string[] {
  const parts = out.split('\0');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/**
 * Thin wrapper over `git` through an injectable `Exec`. Every method is one git invocation
 * (`addedBy` is two) and nothing is cached here. Paths are repo-relative with forward slashes (git's own form), and
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
   * reachable here (squash-merged branch, shallow clone), is `unknown`, never `deleted`. A commit
   * that exists but is not an ancestor of HEAD (another branch) is `unknown` too: a path it
   * added was never deleted here. Git's rename limit (`diff.renameLimit`) is left alone, so past
   * it an edited-and-moved file reports `deleted` rather than `renamed`.
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
        if (kind === 'D' && parts[i + 1] === relPath) {
          const ancestor = await this.run(['merge-base', '--is-ancestor', fromCommit, 'HEAD']);
          return { status: ancestor.code === 0 ? 'deleted' : 'unknown' };
        }
        i += 2;
      }
    }
    return { status: 'same' };
  }

  /**
   * For each file under `relDir` at HEAD: the most recent commit whose change left the file with
   * exactly HEAD's bytes (added, modified, type-changed), and that commit's signer. A file not at
   * HEAD, or one whose HEAD bytes no commit in the log produced, is absent.
   *
   * Attribution is by content, not by order. Each change record carries its post-image blob, and
   * a record counts only when that blob is the one HEAD has for the path. So when a merge keeps
   * one side's version, the commit on the other side, however recent its date, cannot claim it.
   * The log is in topological order, so a commit that restores older bytes is seen before the
   * older commit that first wrote them, whatever dates the committer chose.
   *
   * Merges are diffed against each parent separately. A merge touches a path only when the path
   * differs from EVERY parent, i.e. the merge itself edited it (an "evil merge"). A path that a
   * clean merge just carries over from one side is not a touch, so it keeps the branch commit
   * that made the change, and its signer.
   *
   * Replay: the signer is kept only while the signed write is still the last word on the path in
   * HEAD's history. If any commit descending from it in that history touched the path again
   * (changed it, or deleted it), HEAD can hold those bytes only because some later merge or
   * commit brought them back, and nobody signed that: `signer` is null. This covers a merge that
   * resolves to stale signed bytes, `merge -s ours` over a deletion, and a reverted forget
   * re-added on an old branch. A concurrent change on a branch that does not descend from the
   * signed commit (the merge chose the signed side) does not drop it.
   *
   * The log walks the full history (`--full-history`: no side of a merge is pruned, so a deletion
   * on the side a merge discarded is still seen) with parents rewritten to the nearest listed
   * commits (`--parents`), which keeps ancestry among the listed commits exact. Deletes are read
   * as touches but never credited.
   *
   * Two git calls: one `ls-tree` for HEAD's blobs, then one `log`. Output is NUL-separated, so
   * paths are taken verbatim and are only ever read from the slot after a change line; nothing a
   * committer writes can be read as a header. The header prints only git-computed fields. As
   * defence in depth, a header that is not exactly five fields with full shas gets
   * `signer: null` (and an empty `commit` when its sha is not valid), is treated as a
   * single-parent commit, and leaves the ancestry incomplete, so every signer that needs the
   * replay check is dropped; a change line that does not parse counts as a touch that did not
   * produce HEAD's bytes; and any token out of place stops the parse, leaving the remaining paths
   * unattributed.
   */
  async addedBy(relDir: string): Promise<Map<string, AddedBy>> {
    const result = new Map<string, AddedBy>();
    // HEAD's blobs first: if HEAD moves before the log runs, the log only gains commits, and a
    // record still counts only when it produced the exact bytes read here.
    const headBlobs = await this.headBlobs(relDir);
    if (headBlobs === null) return result;
    const res = await this.run([
      'log',
      // %G? verifies the signature itself. --show-signature (or log.showSignature) would print
      // the verification text to stdout between records.
      '--no-show-signature',
      // Children before parents, whatever the commit dates say.
      '--topo-order',
      // Every side of every merge, and %P as the nearest listed ancestors (see above).
      '--full-history',
      '--parents',
      // Every change, each path on its own (no rename pairing), and one record per parent for a
      // merge, so a merge's own edits can be told apart from carried-over changes.
      '--no-renames',
      '--diff-merges=separate',
      // One `:<mode> <mode> <old blob> <new blob> <status>` line per path, full object names.
      '--raw',
      '--no-abbrev',
      '-z',
      '--format=%x1e%H%x1f%P%x1f%G?%x1f%GF%x1f%GK',
      '--',
      literal(relDir),
    ]);
    if (res.code !== 0) throw new Error(`git log failed: ${res.stderr.trim() || `exit ${res.code}`}`);

    let commit = '';
    let signer: string | null = null;
    let parentCount = 1;
    let ancestryComplete = true;
    // Listed commit → its listed parents (rewritten by --parents).
    const parentsOf = new Map<string, string[]>();
    // Per path still unattributed: the commits that touched it so far without producing HEAD's
    // bytes. Topological order lists them before (as descendants of, or concurrently with) the
    // commit that is credited later.
    const newer = new Map<string, string[]>();
    // Per (merge, path): how many of the merge's per-parent diffs list the path.
    const mergeSeen = new Map<string, number>();
    const tokens = splitZ(res.stdout);
    for (let i = 0; i < tokens.length; i++) {
      // The first change line after a header starts on a new line.
      const token = (tokens[i] ?? '').replace(/^\n/, '');
      if (token.startsWith(RS)) {
        const fields = token.slice(1).split(US);
        const [hash = '', parentList = '', good = '', fingerprint = '', keyId = ''] = fields;
        const parents = parentList === '' ? [] : parentList.split(' ');
        const wellFormed = fields.length === 5 && FULL_SHA.test(hash) && parents.every((p) => FULL_SHA.test(p));
        commit = FULL_SHA.test(hash) ? hash : '';
        signer = wellFormed && good === 'G' ? fingerprint || keyId || null : null;
        parentCount = wellFormed ? parents.length : 1;
        if (wellFormed) parentsOf.set(hash, parents);
        else ancestryComplete = false;
        continue;
      }
      if (!token.startsWith(':')) break;
      const file = tokens[++i];
      if (file === undefined) break;
      const headBlob = headBlobs.get(file);
      if (headBlob === undefined || result.has(file)) continue;
      if (parentCount > 1) {
        // Merge records for one commit are consecutive and come before its parents, so
        // recording the touch when the last parent's diff lists the path keeps log order.
        const key = `${commit}\0${file}`;
        const seen = (mergeSeen.get(key) ?? 0) + 1;
        mergeSeen.set(key, seen);
        if (seen < parentCount) continue;
      }
      const change = RAW_CHANGE.exec(token);
      if (change !== null && change[2] !== 'D' && change[1] === headBlob) {
        result.set(file, { commit, signer });
      } else {
        const list = newer.get(file) ?? [];
        list.push(commit);
        newer.set(file, list);
      }
    }

    for (const [file, entry] of result) {
      const touches = newer.get(file);
      if (entry.signer === null || touches === undefined) continue;
      if (!ancestryComplete || descendsFrom(parentsOf, touches, entry.commit)) entry.signer = null;
    }
    return result;
  }

  /**
   * Blob id of every file under `relDir` in HEAD's tree (submodules are not files). Null for an
   * unborn HEAD, which has no history to report; any other failure is an error.
   */
  private async headBlobs(relDir: string): Promise<Map<string, string> | null> {
    const res = await this.run(['ls-tree', '-r', '-z', '--full-name', 'HEAD', '--', literal(relDir)]);
    if (res.code !== 0) {
      if ((await this.head()) === null) return null;
      throw new Error(`git ls-tree failed: ${res.stderr.trim() || `exit ${res.code}`}`);
    }
    const blobs = new Map<string, string>();
    for (const entry of splitZ(res.stdout)) {
      const tab = entry.indexOf('\t');
      const [, type, object] = entry.slice(0, tab).split(' ');
      if (tab > 0 && type === 'blob' && object !== undefined && FULL_SHA.test(object)) {
        blobs.set(entry.slice(tab + 1), object);
      }
    }
    return blobs;
  }
}
