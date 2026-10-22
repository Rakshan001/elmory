import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Exec } from '../src/exec.js';
import { resolveWorktree } from '../src/worktree.js';
import { cleanupDirs, repo } from './helpers/children.js';

const plain: string[] = [];

afterEach(() => {
  cleanupDirs();
  for (const d of plain.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('resolveWorktree', () => {
  it('a subdirectory of a git work tree resolves to its toplevel', async () => {
    const { wt } = await repo();
    const sub = path.join(wt, 'src');
    expect(await resolveWorktree(sub)).toBe(fs.realpathSync(wt));
    expect(await resolveWorktree(wt)).toBe(fs.realpathSync(wt));
  });

  it('a directory outside git is itself, realpath\'d', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'elmory-nogit-'));
    plain.push(d);
    fs.mkdirSync(path.join(d, 'inner'));
    expect(await resolveWorktree(path.join(d, 'inner', '..', 'inner'))).toBe(fs.realpathSync(path.join(d, 'inner')));
  });

  it('git that cannot run falls back to the directory', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'elmory-nogit-'));
    plain.push(d);
    const broken: Exec = () => Promise.reject(Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }));
    expect(await resolveWorktree(d, broken)).toBe(fs.realpathSync(d));
  });
});
