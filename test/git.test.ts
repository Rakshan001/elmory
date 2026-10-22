import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Exec, defaultExec } from '../src/exec.js';
import { type AddedBy, Git } from '../src/git.js';

const dirs: string[] = [];

function tmp(): string {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'elmory-git-')));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const res = await defaultExec('git', args, { cwd });
  if (res.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout;
}

async function repo(): Promise<string> {
  const wt = tmp();
  await git(wt, 'init', '-q');
  await git(wt, 'config', 'user.name', 'Tester');
  await git(wt, 'config', 'user.email', 'tester@example.com');
  await git(wt, 'config', 'commit.gpgsign', 'false');
  return wt;
}

function write(wt: string, rel: string, body: string): void {
  const abs = path.join(wt, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

async function commitAll(wt: string, message: string, ...extra: string[]): Promise<string> {
  await git(wt, 'add', '-A');
  await git(wt, 'commit', '-q', '--no-verify', '-m', message, ...extra);
  return (await git(wt, 'rev-parse', 'HEAD')).trim();
}

function hasSshKeygen(): boolean {
  try {
    execFileSync('ssh-keygen', ['-?'], { stdio: 'ignore' });
    return true;
  } catch (e) {
    // ssh-keygen exits non-zero on -? but exists; only ENOENT means it is missing.
    return (e as NodeJS.ErrnoException).code !== 'ENOENT';
  }
}

/**
 * Configure SSH commit signing in `wt` and return an Exec that points git at an allowed-signers
 * file. The library reads the user's config; only tests pass the allowed-signers file.
 */
async function sshSigning(wt: string): Promise<Exec> {
  const keys = tmp();
  const key = path.join(keys, 'k');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'tester', '-f', key]);
  const [keyType, keyBody] = fs.readFileSync(`${key}.pub`, 'utf8').trim().split(' ');
  const allowed = path.join(keys, 'allowed');
  fs.writeFileSync(allowed, `tester@example.com namespaces="git" ${keyType} ${keyBody}\n`);
  await git(wt, 'config', 'gpg.format', 'ssh');
  await git(wt, 'config', 'user.signingkey', `${key}.pub`);
  return (file, args, opts) => defaultExec(file, ['-c', `gpg.ssh.allowedSignersFile=${allowed}`, ...args], opts);
}

/**
 * On the current branch: merge an unsigned side branch with --no-ff --no-commit, rewrite the
 * tombstone inside the merge ("evil merge"), and commit the merge unsigned. Returns its sha.
 */
async function evilMerge(wt: string, tombstone: string): Promise<string> {
  const main = (await git(wt, 'branch', '--show-current')).trim();
  await git(wt, 'checkout', '-q', '-b', 'side');
  write(wt, 'side.ts', 'export const side = 1;\n');
  await commitAll(wt, 'unsigned side work');
  await git(wt, 'checkout', '-q', main);
  await git(wt, 'merge', '-q', '--no-ff', '--no-commit', 'side');
  write(wt, tombstone, 'supersedes: [f_victim]\n');
  return commitAll(wt, 'merge side');
}

/**
 * A clean --no-ff merge, committed unsigned: branch `side` adds a tombstone (signed when asked)
 * while the current branch adds a fact, so the merge differs from both parents under .elmory/.
 */
async function cleanMerge(
  wt: string,
  signSide: boolean,
): Promise<{ sideAdd: string; mainAdd: string; merge: string }> {
  await commitAll(wt, 'base', '--allow-empty');
  const main = (await git(wt, 'branch', '--show-current')).trim();
  await git(wt, 'checkout', '-q', '-b', 'side');
  write(wt, '.elmory/tombstones/f_x', 'supersedes: []\n');
  const sideAdd = await commitAll(wt, 'side adds tombstone', ...(signSide ? ['-S'] : []));
  await git(wt, 'checkout', '-q', main);
  write(wt, '.elmory/facts/f_main.md', 'main\n');
  const mainAdd = await commitAll(wt, 'main adds fact');
  await git(wt, 'merge', '-q', '--no-ff', '--no-verify', '-m', 'merge side', 'side');
  const merge = (await git(wt, 'rev-parse', 'HEAD')).trim();
  return { sideAdd, mainAdd, merge };
}

/** Commit everything with both author and committer date set to `date` (committer controls both). */
async function commitAt(wt: string, date: string, message: string, ...extra: string[]): Promise<string> {
  await git(wt, 'add', '-A');
  execFileSync('git', ['commit', '-q', '--no-verify', '-m', message, ...extra], {
    cwd: wt,
    stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  return (await git(wt, 'rev-parse', 'HEAD')).trim();
}

/**
 * The reviewer's C1 reproduction. Branch `evil` gets an unsigned commit A, backdated to 2020,
 * that adds the tombstone with `supersedes: [f_victim]`. `main` gets commit S (signed when asked)
 * that adds the same path with `supersedes: []`, plus another file so the merge differs from
 * both parents under .elmory/ and both sides are walked. `evil` then merges `main`, resolves the
 * conflict to `keep`'s version, and commits the merge unsigned. Log order is merge, S, A.
 */
async function sidedMerge(
  wt: string,
  keep: 'ours' | 'theirs',
  signMain: boolean,
): Promise<{ a: string; s: string; merge: string; path: string }> {
  const tomb = '.elmory/tombstones/f_x';
  await commitAt(wt, '2019-01-01T00:00:00Z', 'base', '--allow-empty');
  const main = (await git(wt, 'branch', '--show-current')).trim();
  await git(wt, 'checkout', '-q', '-b', 'evil');
  write(wt, tomb, 'supersedes: [f_victim]\n');
  const a = await commitAt(wt, '2020-01-01T00:00:00Z', 'mallory tombstone', '--author=Mallory <m@x>');
  await git(wt, 'checkout', '-q', main);
  write(wt, tomb, 'supersedes: []\n');
  write(wt, '.elmory/facts/f_main.md', 'main\n');
  const s = await commitAt(wt, '2025-01-01T00:00:00Z', 'signed tombstone', ...(signMain ? ['-S'] : []));
  await git(wt, 'checkout', '-q', 'evil');
  const merging = await defaultExec('git', ['merge', '-q', '--no-ff', '--no-commit', main], { cwd: wt });
  expect(merging.code).not.toBe(0); // add/add conflict on the tombstone
  await git(wt, 'checkout', `--${keep}`, '--', tomb);
  const merge = await commitAt(wt, '2025-02-01T00:00:00Z', 'merge main');
  // The order the old code trusted: S is listed before A.
  const order = (await git(wt, 'log', '--format=%H')).trim().split('\n');
  expect(order.indexOf(s)).toBeLessThan(order.indexOf(a));
  return { a, s, merge, path: tomb };
}

/**
 * Rollback along one line of history: signed S0 writes the tombstone, U replaces it, and on a
 * branch off U, Mallory restores S0's exact bytes in an unsigned commit backdated before S0.
 * `main` adds another file and is merged in cleanly. By committer date S0 is listed before
 * Mallory's commit even though Mallory's commit is S0's descendant.
 */
async function rollbackMerge(wt: string, signS0: boolean): Promise<{ s0: string; restore: string }> {
  const tomb = '.elmory/tombstones/f_x';
  write(wt, tomb, 'supersedes: [f_victim]\n');
  const s0 = await commitAt(wt, '2025-01-01T00:00:00Z', 'signed tombstone', ...(signS0 ? ['-S'] : []));
  write(wt, tomb, 'supersedes: []\n');
  await commitAt(wt, '2025-06-01T00:00:00Z', 'lift tombstone');
  const main = (await git(wt, 'branch', '--show-current')).trim();
  await git(wt, 'checkout', '-q', '-b', 'evil');
  write(wt, tomb, 'supersedes: [f_victim]\n');
  const restore = await commitAt(wt, '2020-01-01T00:00:00Z', 'restore', '--author=Mallory <m@x>');
  await git(wt, 'checkout', '-q', main);
  write(wt, '.elmory/facts/f_main.md', 'main\n');
  await commitAt(wt, '2025-07-01T00:00:00Z', 'main adds fact');
  await git(wt, 'checkout', '-q', 'evil');
  await git(wt, 'merge', '-q', '--no-ff', '--no-verify', '-m', 'merge main', main);
  const order = (await git(wt, 'log', '--format=%H', '--', '.elmory/')).trim().split('\n');
  expect(order.indexOf(s0)).toBeLessThan(order.indexOf(restore));
  return { s0, restore };
}

/**
 * Signed S writes the tombstone on the current branch, then `retract` runs on that branch (it
 * changes or deletes the tombstone). Branch `old` forks at S, adds an unrelated file, and merges
 * the retracting branch back with `merge` (which leaves the merge uncommitted or commits it).
 * Returns S and the branch names; HEAD is `old`'s tip afterwards.
 */
async function staleReplay(
  wt: string,
  retract: () => Promise<void>,
  merge: (main: string) => Promise<void>,
): Promise<{ s: string; main: string }> {
  const tomb = '.elmory/tombstones/f_x';
  write(wt, 'base.txt', 'base\n');
  await commitAll(wt, 'base');
  write(wt, tomb, 'supersedes: [f_victim]\n');
  const s = await commitAll(wt, 'signed tombstone', '-S');
  const main = (await git(wt, 'branch', '--show-current')).trim();
  await git(wt, 'checkout', '-q', '-b', 'old');
  write(wt, 'old.txt', 'old work\n');
  await commitAll(wt, 'unrelated work on old');
  await git(wt, 'checkout', '-q', main);
  await retract();
  await git(wt, 'checkout', '-q', 'old');
  await merge(main);
  return { s, main };
}

describe('Git', () => {
  it('head is null before the first commit and a sha after it', async () => {
    const wt = await repo();
    const g = new Git(defaultExec, wt);
    expect(await g.head()).toBeNull();
    expect(await g.tree()).toBeNull();
    write(wt, 'a.txt', 'a\n');
    const sha = await commitAll(wt, 'first');
    expect(await g.head()).toBe(sha);
    expect(await g.tree()).toMatch(/^[0-9a-f]{40,64}$/);
    expect(await g.tree()).not.toBe(sha);
  });

  it('head is null outside a repository', async () => {
    const g = new Git(defaultExec, tmp());
    expect(await g.head()).toBeNull();
  });

  it('trackedFiles and isTracked', async () => {
    const wt = await repo();
    write(wt, 'src/a.ts', 'a\n');
    write(wt, 'src/deep/b.ts', 'b\n');
    write(wt, '[ab].ts', 'glob-looking name\n');
    await commitAll(wt, 'files');
    write(wt, 'untracked.ts', 'u\n');
    const g = new Git(defaultExec, wt);
    expect(await g.trackedFiles()).toEqual(new Set(['[ab].ts', 'src/a.ts', 'src/deep/b.ts']));
    expect(await g.isTracked('src/a.ts')).toBe(true);
    expect(await g.isTracked('src/deep/b.ts')).toBe(true);
    expect(await g.isTracked('untracked.ts')).toBe(false);
    expect(await g.isTracked('missing.ts')).toBe(false);
    // A directory is not a tracked file, and a pathspec glob is matched literally.
    expect(await g.isTracked('src')).toBe(false);
    expect(await g.isTracked('src/*.ts')).toBe(false);
    expect(await g.isTracked('[ab].ts')).toBe(true);
  });

  it('renameLookup reports same, renamed and deleted', async () => {
    const wt = await repo();
    write(wt, 'keep.ts', 'export const keep = 1;\n');
    write(wt, 'old/name.ts', 'export const moved = "a body long enough to be detected as a rename";\n');
    write(wt, 'gone.ts', 'export const gone = 1;\n');
    const base = await commitAll(wt, 'base');
    const g = new Git(defaultExec, wt);

    fs.mkdirSync(path.join(wt, 'new'));
    await git(wt, 'mv', 'old/name.ts', 'new/name.ts');
    await commitAll(wt, 'rename');
    expect(await g.renameLookup(base, 'old/name.ts')).toEqual({ status: 'renamed', newPath: 'new/name.ts' });
    expect(await g.renameLookup(base, 'keep.ts')).toEqual({ status: 'same' });

    await git(wt, 'rm', '-q', 'gone.ts');
    await commitAll(wt, 'delete');
    expect(await g.renameLookup(base, 'gone.ts')).toEqual({ status: 'deleted' });
    expect(await g.renameLookup(base, 'keep.ts')).toEqual({ status: 'same' });
    expect(await g.renameLookup(base, 'old/name.ts')).toEqual({ status: 'renamed', newPath: 'new/name.ts' });
  });

  it('unreachable commit', async () => {
    const wt = await repo();
    write(wt, 'a.ts', 'a\n');
    await commitAll(wt, 'first');
    const g = new Git(defaultExec, wt);
    expect(await g.renameLookup('0'.repeat(40), 'a.ts')).toEqual({ status: 'unknown' });
  });

  it('a commit from another branch is unknown, not deleted', async () => {
    const wt = await repo();
    write(wt, 'a.ts', 'a\n');
    await commitAll(wt, 'base');
    const main = (await git(wt, 'branch', '--show-current')).trim();
    await git(wt, 'checkout', '-q', '-b', 'feat');
    write(wt, 'new.ts', 'export const onlyOnFeat = 1;\n');
    const x = await commitAll(wt, 'feat adds new.ts');
    await git(wt, 'checkout', '-q', main);
    const g = new Git(defaultExec, wt);
    expect(await g.renameLookup(x, 'new.ts')).toEqual({ status: 'unknown' });
    expect(await g.renameLookup(x, 'a.ts')).toEqual({ status: 'same' });
  });

  it('renameLookup treats a non-sha commit as unknown and never passes it as an option', async () => {
    const wt = await repo();
    write(wt, 'a.ts', 'a\n');
    await commitAll(wt, 'first');
    const calls: string[][] = [];
    const spy: Exec = (file, args, opts) => {
      calls.push(args);
      return defaultExec(file, args, opts);
    };
    const g = new Git(spy, wt);
    const out = path.join(wt, 'pwned');
    expect(await g.renameLookup(`--output=${out}`, 'a.ts')).toEqual({ status: 'unknown' });
    expect(await g.renameLookup('HEAD', 'a.ts')).toEqual({ status: 'unknown' });
    expect(fs.existsSync(out)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('addedBy reports the most recent commit that added or modified each path', async () => {
    const wt = await repo();
    write(wt, '.elmory/facts/f_a.md', 'a\n');
    await commitAll(wt, 'add a');
    write(wt, '.elmory/facts/f_b.md', 'b\n');
    write(wt, 'outside.md', 'not under the dir\n');
    const second = await commitAll(wt, 'add b');
    write(wt, '.elmory/facts/f_a.md', 'a changed\n');
    const third = await commitAll(wt, 'modify a');
    write(wt, 'outside.md', 'a later commit outside the dir changes nothing\n');
    await commitAll(wt, 'outside');
    const g = new Git(defaultExec, wt);
    const added = await g.addedBy('.elmory/');
    expect(added).toEqual(
      new Map([
        ['.elmory/facts/f_a.md', { commit: third, signer: null }],
        ['.elmory/facts/f_b.md', { commit: second, signer: null }],
      ]),
    );
  });

  it('an edit made inside a merge commit is attributed to the merge', async () => {
    const wt = await repo();
    write(wt, '.elmory/tombstones/f_x', 'supersedes: []\n');
    await commitAll(wt, 'add tombstone');
    const merge = await evilMerge(wt, '.elmory/tombstones/f_x');
    const added = await new Git(defaultExec, wt).addedBy('.elmory/');
    expect(added.get('.elmory/tombstones/f_x')).toEqual({ commit: merge, signer: null });
  });

  it('a clean merge is not a touch: each path keeps the branch commit that added it', async () => {
    const wt = await repo();
    const { sideAdd, mainAdd, merge } = await cleanMerge(wt, false);
    const added = await new Git(defaultExec, wt).addedBy('.elmory/');
    expect(added).toEqual(
      new Map([
        ['.elmory/tombstones/f_x', { commit: sideAdd, signer: null }],
        ['.elmory/facts/f_main.md', { commit: mainAdd, signer: null }],
      ]),
    );
    expect([sideAdd, mainAdd]).not.toContain(merge);
  });

  it("merge that keeps one side's version attributes to that side, not to log order", async () => {
    const wt = await repo();
    const { a, s, merge, path: tomb } = await sidedMerge(wt, 'ours', false);
    const added = await new Git(defaultExec, wt).addedBy('.elmory/');
    expect(added.get(tomb)).toEqual({ commit: a, signer: null });
    expect([s, merge]).not.toContain(added.get(tomb)?.commit);
    expect(added.get('.elmory/facts/f_main.md')).toEqual({ commit: s, signer: null });
  });

  it('merge that keeps the other side attributes to that side', async () => {
    const wt = await repo();
    const { s, path: tomb } = await sidedMerge(wt, 'theirs', false);
    const added = await new Git(defaultExec, wt).addedBy('.elmory/');
    expect(added.get(tomb)).toEqual({ commit: s, signer: null });
  });

  it("restoring an older version is attributed to the restore, not the older version's commit", async () => {
    const wt = await repo();
    const { restore } = await rollbackMerge(wt, false);
    const added = await new Git(defaultExec, wt).addedBy('.elmory/');
    expect(added.get('.elmory/tombstones/f_x')).toEqual({ commit: restore, signer: null });
  });

  it('a path no longer in HEAD is absent', async () => {
    const wt = await repo();
    write(wt, '.elmory/facts/f_gone.md', 'g\n');
    write(wt, '.elmory/facts/f_kept.md', 'k\n');
    const add = await commitAll(wt, 'add');
    await git(wt, 'rm', '-q', '.elmory/facts/f_gone.md');
    await commitAll(wt, 'delete');
    const added = await new Git(defaultExec, wt).addedBy('.elmory/');
    expect(added).toEqual(new Map([['.elmory/facts/f_kept.md', { commit: add, signer: null }]]));
  });

  it('addedBy is empty before the first commit', async () => {
    const wt = await repo();
    const g = new Git(defaultExec, wt);
    expect(await g.addedBy('.elmory/')).toEqual(new Map());
  });

  it('forged author is not a signer', async () => {
    // Unsigned variant. The signed-commit-with-forged-author check is in 'signed commit reports
    // a signer' (needs ssh-keygen).
    const wt = await repo();
    write(wt, '.elmory/facts/f_m.md', 'm\n');
    const sha = await commitAll(wt, 'forged', '--author=Mallory <m@x>');
    const g = new Git(defaultExec, wt);
    expect((await g.addedBy('.elmory/')).get('.elmory/facts/f_m.md')).toEqual({
      commit: sha,
      signer: null,
    });
  });

  it('separator characters in author or path cannot forge a signed record', async () => {
    const wt = await repo();
    const fake = `${'a'.repeat(40)}\x1fG\x1fFAKE\x1fFAKE`;
    write(wt, '.elmory/facts/f_e.md', 'e\n');
    await git(wt, 'add', '-A');
    // Git may refuse or rewrite the control characters; either way no path may get a signer.
    const viaAuthor = await defaultExec(
      'git',
      ['commit', '-q', '--no-verify', '-m', 'email', `--author=M <m\x1e${fake}\n.elmory/facts/f_e.md@x>`],
      { cwd: wt },
    );
    if (viaAuthor.code !== 0) {
      await git(wt, 'commit', '-q', '--no-verify', '-m', 'email', `--author=M <m\x1e${fake}@x>`);
    }
    if (process.platform !== 'win32') {
      write(wt, `.elmory/facts/x\x1e${fake}\nf_p.md`, 'p\n');
      await commitAll(wt, 'path');
    }
    const added = await new Git(defaultExec, wt).addedBy('.elmory/');
    expect(added.size).toBeGreaterThan(0);
    for (const [file, entry] of added) {
      expect(entry.signer, file).toBeNull();
      expect(entry.commit, file).toMatch(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
      expect(entry.commit, file).not.toBe('a'.repeat(40));
    }
  });

  it.skipIf(!hasSshKeygen())('signed commit reports a signer', async () => {
    const wt = await repo();
    const withSigners = await sshSigning(wt);
    // Even when the user's config asks log to print signatures, the parse must stay clean.
    await git(wt, 'config', 'log.showSignature', 'true');

    write(wt, '.elmory/facts/f_s.md', 's\n');
    const signed = await commitAll(wt, 'signed', '-S');
    write(wt, '.elmory/facts/f_u.md', 'u\n');
    const unsigned = await commitAll(wt, 'unsigned');
    write(wt, '.elmory/facts/f_t.md', 't\n');
    const signedForged = await commitAll(wt, 'signed, forged author', '-S', '--author=Mallory <m@x>');

    const added = await new Git(withSigners, wt).addedBy('.elmory/');

    expect([...added.keys()].sort()).toEqual(['.elmory/facts/f_s.md', '.elmory/facts/f_t.md', '.elmory/facts/f_u.md']);
    const s = added.get('.elmory/facts/f_s.md');
    expect(s?.commit).toBe(signed);
    expect(s?.signer).toMatch(/^SHA256:/);
    expect(added.get('.elmory/facts/f_u.md')).toEqual({
      commit: unsigned,
      signer: null,
    });
    // The signer is the key, whatever the author line claims.
    const t = added.get('.elmory/facts/f_t.md');
    expect(t?.commit).toBe(signedForged);
    expect(t?.signer).toBe(s?.signer);

    // Without the allowed-signers file the signature is not good, so there is no signer.
    const unverified = await new Git(defaultExec, wt).addedBy('.elmory/');
    expect(unverified.get('.elmory/facts/f_s.md')?.signer).toBeNull();
  });

  it.skipIf(!hasSshKeygen())('an unsigned edit after a signed add drops the signer', async () => {
    const wt = await repo();
    const withSigners = await sshSigning(wt);
    write(wt, '.elmory/tombstones/f_x', 'supersedes: []\n');
    const signed = await commitAll(wt, 'signed tombstone', '-S');
    const g = new Git(withSigners, wt);
    expect((await g.addedBy('.elmory/')).get('.elmory/tombstones/f_x')?.signer).toMatch(/^SHA256:/);

    write(wt, '.elmory/tombstones/f_x', 'supersedes: [f_victim]\n');
    const forged = await commitAll(wt, 'unsigned edit', '--author=Mallory <m@x>');
    expect((await g.addedBy('.elmory/')).get('.elmory/tombstones/f_x')).toEqual({ commit: forged, signer: null });
    expect(forged).not.toBe(signed);
  });

  it.skipIf(!hasSshKeygen())('a clean unsigned merge keeps the signer of the branch commit', async () => {
    const wt = await repo();
    const withSigners = await sshSigning(wt);
    const { sideAdd, mainAdd } = await cleanMerge(wt, true);
    const added = await new Git(withSigners, wt).addedBy('.elmory/');
    const t = added.get('.elmory/tombstones/f_x');
    expect(t?.commit).toBe(sideAdd);
    expect(t?.signer).toMatch(/^SHA256:/);
    expect(added.get('.elmory/facts/f_main.md')).toEqual({ commit: mainAdd, signer: null });
  });

  it.skipIf(!hasSshKeygen())('an unsigned evil merge after a signed add drops the signer', async () => {
    const wt = await repo();
    const withSigners = await sshSigning(wt);
    write(wt, '.elmory/tombstones/f_x', 'supersedes: []\n');
    await commitAll(wt, 'signed tombstone', '-S');
    const g = new Git(withSigners, wt);
    expect((await g.addedBy('.elmory/')).get('.elmory/tombstones/f_x')?.signer).toMatch(/^SHA256:/);

    const merge = await evilMerge(wt, '.elmory/tombstones/f_x');
    expect((await g.addedBy('.elmory/')).get('.elmory/tombstones/f_x')).toEqual({ commit: merge, signer: null });
  });

  it.skipIf(!hasSshKeygen())("an unsigned merge that keeps the unsigned side's version has no signer", async () => {
    const wt = await repo();
    const withSigners = await sshSigning(wt);
    const { a, path: tomb } = await sidedMerge(wt, 'ours', true);
    const added = await new Git(withSigners, wt).addedBy('.elmory/');
    expect(added.get(tomb)).toEqual({ commit: a, signer: null });
    expect(added.get('.elmory/facts/f_main.md')?.signer).toMatch(/^SHA256:/);
  });

  it.skipIf(!hasSshKeygen())("an unsigned merge that keeps the signed side's version keeps its signer", async () => {
    const wt = await repo();
    const withSigners = await sshSigning(wt);
    const { s, path: tomb } = await sidedMerge(wt, 'theirs', true);
    const t = (await new Git(withSigners, wt).addedBy('.elmory/')).get(tomb);
    expect(t?.commit).toBe(s);
    expect(t?.signer).toMatch(/^SHA256:/);
  });

  it.skipIf(!hasSshKeygen())('an unsigned rollback to signed bytes has no signer', async () => {
    const wt = await repo();
    const withSigners = await sshSigning(wt);
    const { restore } = await rollbackMerge(wt, true);
    const added = await new Git(withSigners, wt).addedBy('.elmory/');
    expect(added.get('.elmory/tombstones/f_x')).toEqual({ commit: restore, signer: null });
  });

  it.skipIf(!hasSshKeygen())('a merge that resolves to stale signed bytes has no signer', async () => {
    const wt = await repo();
    const withSigners = await sshSigning(wt);
    const tomb = '.elmory/tombstones/f_x';
    const { s } = await staleReplay(
      wt,
      async () => {
        // a later signed commit replaces the signed statement
        write(wt, tomb, 'supersedes: []\n');
        await commitAll(wt, 'signed retraction', '-S');
      },
      async (main) => {
        await git(wt, 'merge', '-q', '--no-ff', '--no-commit', main);
        await git(wt, 'checkout', 'HEAD', '--', tomb); // resolve to the old, stale bytes
        await commitAll(wt, 'merge main, keep old tombstone');
      },
    );
    expect(fs.readFileSync(path.join(wt, tomb), 'utf8')).toBe('supersedes: [f_victim]\n');
    const t = (await new Git(withSigners, wt).addedBy('.elmory/')).get(tomb);
    expect(t).toEqual({ commit: s, signer: null });
  });

  it.skipIf(!hasSshKeygen())('merge -s ours over a deleted signed tombstone has no signer', async () => {
    const wt = await repo();
    const withSigners = await sshSigning(wt);
    const tomb = '.elmory/tombstones/f_x';
    const g = new Git(withSigners, wt);
    let before: AddedBy | undefined;
    const { s } = await staleReplay(
      wt,
      async () => {
        await git(wt, 'rm', '-q', tomb);
        await commitAll(wt, 'lift the forget', '-S');
      },
      async (main) => {
        // an old branch that never saw the deletion still carries the signed statement
        before = (await g.addedBy('.elmory/')).get(tomb);
        await git(wt, 'merge', '-q', '-s', 'ours', '--no-verify', '-m', 'merge main, ours', main);
      },
    );
    expect(before?.commit).toBe(s);
    expect(before?.signer).toMatch(/^SHA256:/);
    expect(fs.existsSync(path.join(wt, tomb))).toBe(true);
    expect((await g.addedBy('.elmory/')).get(tomb)?.signer).toBeNull();
  });

  it.skipIf(!hasSshKeygen())('a reverted forget re-added on an old branch is untrusted', async () => {
    const wt = await repo();
    const withSigners = await sshSigning(wt);
    const tomb = '.elmory/tombstones/f_x';
    write(wt, 'base.txt', 'base\n');
    await commitAll(wt, 'base');
    const main = (await git(wt, 'branch', '--show-current')).trim();
    await git(wt, 'checkout', '-q', '-b', 'old');
    write(wt, 'old.txt', 'old work\n');
    await commitAll(wt, 'old work');
    await git(wt, 'checkout', '-q', main);
    write(wt, tomb, 'supersedes: [f_victim]\n');
    const s = await commitAll(wt, 'signed forget', '-S');
    await git(wt, 'revert', '--no-edit', '-S', s);
    // Mallory replays the signed bytes on the old branch, then brings main in cleanly.
    await git(wt, 'checkout', '-q', 'old');
    write(wt, tomb, 'supersedes: [f_victim]\n');
    const replay = await commitAll(wt, 'replay', '--author=Mallory <m@x>');
    await git(wt, 'merge', '-q', '--no-ff', '--no-verify', '-m', 'merge main', main);
    const g = new Git(withSigners, wt);
    const onOld = (await g.addedBy('.elmory/')).get(tomb);
    expect([s, replay]).toContain(onOld?.commit);
    expect(onOld?.signer).toBeNull();

    // the same history merged the other way round
    await git(wt, 'checkout', '-q', main);
    await git(wt, 'merge', '-q', '--no-ff', '--no-verify', '-m', 'merge old', 'old');
    const onMain = (await g.addedBy('.elmory/')).get(tomb);
    expect([s, replay]).toContain(onMain?.commit);
    expect(onMain?.signer).toBeNull();
  });

  it.skipIf(!hasSshKeygen())('a signed tombstone carried by clean merges on both sides keeps its signer', async () => {
    const wt = await repo();
    const withSigners = await sshSigning(wt);
    const tomb = '.elmory/tombstones/f_x';
    write(wt, tomb, 'supersedes: [f_old]\n');
    const s = await commitAll(wt, 'signed tombstone', '-S');
    const main = (await git(wt, 'branch', '--show-current')).trim();
    await git(wt, 'checkout', '-q', '-b', 'feat');
    write(wt, '.elmory/facts/f_feat.md', 'feat\n');
    await commitAll(wt, 'feat adds a fact');
    await git(wt, 'checkout', '-q', main);
    write(wt, '.elmory/facts/f_main.md', 'main\n');
    await commitAll(wt, 'main adds a fact');
    await git(wt, 'merge', '-q', '--no-ff', '--no-verify', '-m', 'merge feat', 'feat');
    await git(wt, 'checkout', '-q', 'feat');
    await git(wt, 'merge', '-q', '--no-ff', '--no-verify', '-m', 'merge main', main);
    const t = (await new Git(withSigners, wt).addedBy('.elmory/')).get(tomb);
    expect(t?.commit).toBe(s);
    expect(t?.signer).toMatch(/^SHA256:/);
  });
});
