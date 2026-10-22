import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Exec, defaultExec } from '../src/exec.js';
import { Git } from '../src/git.js';

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
});
