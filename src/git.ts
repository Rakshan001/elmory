import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  /**
   * git's `%G?` for `commit`, set only when its signature was asked about (the replay check let
   * the credit count): `G` good; `N` the commit object carries no signature at all (git also
   * says `N` for a signature it cannot check, e.g. ssh without an allowed signers file, so `N` is
   * kept only after the raw commit shows no `gpgsig` header, and becomes `?` otherwise);
   * anything else (`B`, `E`, `U`, `X`, `Y`, `R`, `?`, or '' when git gave no answer) means the
   * signature could not be judged here.
   */
  status?: string;
}

/** git's word on one commit's signature: `%G?` and, when good, the key. */
export interface Verdict {
  status: string;
  signer: string | null;
}

/**
 * The history walk's answer for one path (see `Git.credited`): the credited commit, and whether
 * its signature may count (`verify`: the header was well formed and the replay check kept it).
 * It holds no signature: whether a key is good is asked of git each time (`Git.signed`).
 */
export interface Credit {
  commit: string;
  verify: boolean;
}

/** Commits per signature lookup: keeps the argument list far below any ARG_MAX. */
const SIGNATURE_BATCH = 500;
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
 * (`addedBy` is up to three) and nothing is cached here. Paths are repo-relative with forward slashes (git's own form), and
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
   * Moves from HEAD to the working tree that are not committed yet, staged or not: HEAD path →
   * working-tree path. Git pairs a rename only between paths it tracks, and a plain `mv` leaves
   * the new path untracked, so the diff runs over a throwaway index holding HEAD's tree plus
   * every non-ignored file as intent-to-add. The user's index is never written, and no file's
   * bytes are stored: intent-to-add entries point at the empty blob, which git writes once if
   * the repository lacks it. Any failure is an empty map, i.e. no move known.
   */
  async worktreeRenames(): Promise<Map<string, string>> {
    const moves = new Map<string, string>();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elmory-index-'));
    const env = { GIT_INDEX_FILE: path.join(dir, 'index') };
    try {
      for (const args of [['read-tree', 'HEAD'], ['add', '--all', '--intent-to-add']]) {
        if ((await this.exec('git', args, { cwd: this.worktree, env })).code !== 0) return moves;
      }
      const res = await this.exec('git', ['diff', '-M', '--name-status', '-z', 'HEAD'], { cwd: this.worktree, env });
      if (res.code !== 0) return moves;
      const parts = splitZ(res.stdout);
      for (let i = 0; i < parts.length; ) {
        const kind = (parts[i] ?? '').charAt(0);
        if (kind === 'R' || kind === 'C') {
          const from = parts[i + 1];
          const to = parts[i + 2];
          if (kind === 'R' && from !== undefined && to !== undefined) moves.set(from, to);
          i += 3;
        } else {
          i += 2;
        }
      }
      return moves;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
   * Replay: the signer is kept only while the signed bytes are the path's bytes in every commit
   * of HEAD's history that descends from the signed commit. If any such commit left the path with
   * other bytes or none (an edit, a delete, or a merge that adopted another side's version: a
   * merge whose result differs from at least one parent), HEAD can hold the signed bytes only
   * because some later merge or commit brought them back, and nobody signed that: `signer` is
   * null. This covers a merge that resolves to stale signed bytes, `merge -s ours` over a
   * deletion, a reverted forget re-added on an old branch, and a merge that adopts another
   * version followed by one that adopts the signed bytes again. A change on a branch that does
   * not descend from the signed commit, discarded by a merge that kept the signed bytes, does not
   * drop it.
   *
   * The log walks the full history (`--full-history`: no side of a merge is pruned, so a deletion
   * on the side a merge discarded is still seen) with parents rewritten to the nearest listed
   * commits (`--parents`), which keeps ancestry among the listed commits exact. Deletes are read
   * as touches but never credited.
   *
   * Signatures are not read during the walk: `--full-history` lists every merge in history, and
   * asking for `%G?` there would run gpg or ssh-keygen once per signed merge. The walk decides
   * which commit each path is credited to and which credits survive the replay check; only those
   * commits are then verified, in one `git log --no-walk` (see `signers`).
   *
   * `credited` is the walk (it depends on HEAD's history only, so a caller may reuse it while
   * HEAD stays put); `signed` adds the signatures. Never reuse a signer: a key removed from the
   * keyring or the allowed signers file must stop counting at once.
   *
   * Three git calls at most: one `ls-tree` for HEAD's blobs, one `log` for the walk, and one
   * `log --no-walk` for the signatures (none when no credit survives). Output is NUL-separated,
   * so paths are taken verbatim and are only ever read from the slot after a change line;
   * nothing a committer writes can be read as a header. Headers print only git-computed fields.
   * As defence in depth, a walk header that is not exactly two fields with full shas gets
   * `signer: null` (and an empty `commit` when its sha is not valid), is treated as a
   * single-parent commit, and leaves the ancestry incomplete, so every signer that needs the
   * replay check is dropped; a change line that does not parse counts as a touch that did not
   * produce HEAD's bytes; and any token out of place stops the parse, leaving the remaining paths
   * unattributed.
   */
  async addedBy(relDir: string): Promise<Map<string, AddedBy>> {
    return this.signed(await this.credited(relDir));
  }

  /** The walk half of `addedBy`: per path, the credited commit and whether its signature may count. */
  async credited(relDir: string): Promise<Map<string, Credit>> {
    const result = new Map<string, Credit>();
    // HEAD's blobs first: if HEAD moves before the log runs, the log only gains commits, and a
    // record still counts only when it produced the exact bytes read here.
    const headBlobs = await this.headBlobs(relDir);
    if (headBlobs === null) return result;
    const res = await this.run([
      'log',
      // No signature is read here (see above); this also keeps log.showSignature from printing
      // verification text to stdout between records.
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
      '--format=%x1e%H%x1f%P',
      '--',
      literal(relDir),
    ]);
    if (res.code !== 0) throw new Error(`git log failed: ${res.stderr.trim() || `exit ${res.code}`}`);

    let commit = '';
    let wellFormed = false;
    let parentCount = 1;
    let ancestryComplete = true;
    // Listed commit → its listed parents (rewritten by --parents).
    const parentsOf = new Map<string, string[]>();
    // Per path still unattributed: the commits seen so far that left it with other bytes than
    // HEAD's. Topological order lists every descendant of the commit credited later among them.
    const newer = new Map<string, string[]>();
    // Per (merge, path): how many of the merge's per-parent diffs list the path.
    const mergeSeen = new Map<string, number>();
    // Credited paths whose header was well formed: only these may get a signer.
    const eligible = new Set<string>();
    const tokens = splitZ(res.stdout);
    for (let i = 0; i < tokens.length; i++) {
      // The first change line after a header starts on a new line.
      const token = (tokens[i] ?? '').replace(/^\n/, '');
      if (token.startsWith(RS)) {
        const fields = token.slice(1).split(US);
        const [hash = '', parentList = ''] = fields;
        const parents = parentList === '' ? [] : parentList.split(' ');
        wellFormed = fields.length === 2 && FULL_SHA.test(hash) && parents.every((p) => FULL_SHA.test(p));
        commit = FULL_SHA.test(hash) ? hash : '';
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
      const change = RAW_CHANGE.exec(token);
      if (change === null || change[2] === 'D' || change[1] !== headBlob) {
        // The commit left the path with other bytes than HEAD's (or none). A merge counts as soon
        // as it differs from ONE parent: adopting another side's version replaces the bytes on
        // this line of history just as an edit does. (All of a merge's lines carry its own blob.)
        const list = newer.get(file) ?? [];
        if (list[list.length - 1] !== commit) list.push(commit);
        newer.set(file, list);
        continue;
      }
      if (parentCount > 1) {
        // Credit needs the merge to differ from EVERY parent. Merge records for one commit are
        // consecutive and come before its parents, so crediting when the last parent's diff lists
        // the path keeps log order.
        const key = `${commit}\0${file}`;
        const seen = (mergeSeen.get(key) ?? 0) + 1;
        mergeSeen.set(key, seen);
        if (seen < parentCount) continue;
      }
      result.set(file, { commit, verify: false });
      if (wellFormed) eligible.add(file);
    }

    // Replay check: only the credits that survive it are worth a signature check.
    for (const [file, entry] of result) {
      if (!eligible.has(file)) continue;
      const touches = newer.get(file);
      if (touches !== undefined && (!ancestryComplete || descendsFrom(parentsOf, touches, entry.commit))) continue;
      entry.verify = true;
    }
    return result;
  }

  /**
   * The signature half of `addedBy`: every credit with its signer, asked of git now for the
   * commits whose `verify` is set (one batched `signers` lookup; none when no credit may count).
   */
  async signed(credits: ReadonlyMap<string, Credit>): Promise<Map<string, AddedBy>> {
    const commits = new Set<string>();
    for (const c of credits.values()) if (c.verify) commits.add(c.commit);
    const verdicts = commits.size === 0 ? new Map<string, Verdict>() : await this.signers([...commits]);
    // git's `N` covers "cannot check" too: confirm it on the raw commit (one more call, only when
    // some credited commit got an `N`).
    const saidN = [...verdicts].filter(([, v]) => v.status === 'N').map(([c]) => c);
    if (saidN.length > 0) {
      const bare = await this.unsignedCommits(saidN);
      for (const c of saidN) if (!bare.has(c)) (verdicts.get(c) as Verdict).status = '?';
    }
    const out = new Map<string, AddedBy>();
    for (const [file, c] of credits) {
      if (!c.verify) {
        out.set(file, { commit: c.commit, signer: null });
        continue;
      }
      const v = verdicts.get(c.commit);
      out.set(file, { commit: c.commit, signer: v?.signer ?? null, status: v?.status ?? '' });
    }
    return out;
  }

  /**
   * git's verdict on each commit in `commits` (full shas): `%G?`, and for a good signature (`G`)
   * its key fingerprint, else its key id. One `git log --no-walk` per 500 commits, so gpg or
   * ssh-keygen runs once per commit asked about and never for the rest of history. A record whose
   * header is not exactly four fields, or names a commit not asked about, is skipped (no verdict).
   */
  async signers(commits: readonly string[]): Promise<Map<string, Verdict>> {
    const out = new Map<string, Verdict>();
    const asked = commits.filter((c) => FULL_SHA.test(c));
    for (let i = 0; i < asked.length; i += SIGNATURE_BATCH) {
      const batch = asked.slice(i, i + SIGNATURE_BATCH);
      const wanted = new Set(batch);
      const res = await this.run([
        'log',
        '--no-show-signature',
        '--no-walk=unsorted',
        '-z',
        '--format=%x1e%H%x1f%G?%x1f%GF%x1f%GK',
        ...batch,
        '--',
      ]);
      if (res.code !== 0) throw new Error(`git log failed: ${res.stderr.trim() || `exit ${res.code}`}`);
      for (const raw of splitZ(res.stdout)) {
        const token = raw.replace(/^\n/, '').replace(/\n$/, '');
        if (!token.startsWith(RS)) continue;
        const fields = token.slice(1).split(US);
        if (fields.length !== 4) continue;
        const [hash = '', good = '', fingerprint = '', keyId = ''] = fields;
        if (!wanted.has(hash)) continue;
        const signer = good === 'G' ? fingerprint || keyId : '';
        out.set(hash, { status: good, signer: signer === '' ? null : signer });
      }
    }
    return out;
  }

  /**
   * The commits in `commits` (full shas) whose raw object has no signature header (`gpgsig`,
   * `gpgsig-sha256`), from `git log --no-walk --pretty=raw`, one call per 500. Headers are read
   * only up to the blank line that ends them (the message after it is indented and never read),
   * and a block is attributed only to a commit asked about; anything unparsed counts as signed.
   */
  async unsignedCommits(commits: readonly string[]): Promise<Set<string>> {
    const out = new Set<string>();
    const asked = commits.filter((c) => FULL_SHA.test(c));
    for (let i = 0; i < asked.length; i += SIGNATURE_BATCH) {
      const batch = asked.slice(i, i + SIGNATURE_BATCH);
      const wanted = new Set(batch);
      const res = await this.run(['log', '--no-show-signature', '--no-walk=unsorted', '--pretty=raw', '-z', ...batch, '--']);
      if (res.code !== 0) throw new Error(`git log failed: ${res.stderr.trim() || `exit ${res.code}`}`);
      for (const block of splitZ(res.stdout)) {
        const lines = block.replace(/^\n/, '').split('\n');
        const hash = /^commit ([0-9a-f]{40}|[0-9a-f]{64})$/.exec(lines[0] ?? '')?.[1];
        if (hash === undefined || !wanted.has(hash)) continue;
        let signed = false;
        let ended = false;
        for (const line of lines.slice(1)) {
          if (line === '') {
            ended = true;
            break;
          }
          if (/^gpgsig(?:-sha256)? /.test(line)) signed = true;
        }
        if (ended && !signed) out.add(hash);
      }
    }
    return out;
  }

  /**
   * HEAD's commit and the tree id of `relDir` in it (`-` when HEAD has no such path), in one
   * `rev-parse`; null for an unborn HEAD or outside a repository. A key for results that are a
   * function of HEAD's history, such as `addedBy`.
   */
  async headKey(relDir: string): Promise<{ head: string; tree: string } | null> {
    const res = await this.run(['rev-parse', 'HEAD', `HEAD:${relDir}`]);
    const [head = '', tree = ''] = res.stdout.split('\n');
    if (!FULL_SHA.test(head)) return null;
    return { head, tree: res.code === 0 && FULL_SHA.test(tree) ? tree : '-' };
  }

  /**
   * Blob id of every file under `relDir` in HEAD's tree (submodules are not files), keyed by its
   * repo-relative path. Null for an unborn HEAD, which has no history to report; any other
   * failure is an error.
   */
  async headBlobs(relDir: string): Promise<Map<string, string> | null> {
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
