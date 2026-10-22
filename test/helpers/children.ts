// A temp git repo and remember-child.mjs runners, for the cross-process tests.
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RememberInput } from '../../src/api.js';
import { defaultExec } from '../../src/exec.js';

const CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'remember-child.mjs');

export const FILE = 'src/auth.ts';
export const LINE = 'export function checkToken(req: Request, tokenStore: TokenStore): boolean {';
const SOURCE = [LINE, '  return tokenStore.has(req.headers.authorization);', '}', ''].join('\n');

const dirs: string[] = [];

export function cleanupDirs(): void {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  const res = await defaultExec('git', args, { cwd });
  if (res.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
}

/** A committed repo with FILE tracked, and an empty cache dir beside it. */
export async function repo(): Promise<{ wt: string; cacheDir: string }> {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'elmory-proc-')));
  dirs.push(root);
  const wt = path.join(root, 'repo');
  fs.mkdirSync(path.join(wt, 'src'), { recursive: true });
  await git(wt, 'init', '-q');
  await git(wt, 'config', 'user.name', 'Tester');
  await git(wt, 'config', 'user.email', 'tester@example.com');
  await git(wt, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(wt, FILE), SOURCE);
  await git(wt, 'add', '-A');
  await git(wt, 'commit', '-q', '--no-verify', '-m', 'init');
  return { wt, cacheDir: path.join(root, 'cache') };
}

export function factInput(title: string, extra: Partial<RememberInput> = {}): RememberInput {
  return { title, text: `${title}: every request passes through checkToken.`, quotes: [{ file: FILE, text: LINE }], ...extra };
}

export interface ChildResult {
  code: number | null;
  out: string;
  err: string;
}

export interface Child {
  /** Resolves once the child printed READY (only with `wait`). */
  ready: Promise<void>;
  /** Release a waiting child. */
  go(): void;
  done: Promise<ChildResult>;
}

/** Spawn remember-child.mjs on compiled dist/ (run `npm run build` first; `npm test` does). */
export function rememberChild(
  wt: string,
  cacheDir: string,
  input: RememberInput,
  opts: { wait?: boolean; env?: Record<string, string> } = {},
): Child {
  const args = ['--no-warnings', CHILD, wt, cacheDir, JSON.stringify(input)];
  if (opts.wait === true) args.push('--wait');
  const p: ChildProcessWithoutNullStreams = spawn(process.execPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...opts.env },
  });
  let out = '';
  let err = '';
  let signalReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  p.stdout.on('data', (d: Buffer) => {
    out += d.toString();
    if (out.includes('READY\n')) signalReady();
  });
  p.stderr.on('data', (d: Buffer) => (err += d.toString()));
  const done = new Promise<ChildResult>((resolve, reject) => {
    p.on('error', reject);
    p.on('close', (code) => {
      signalReady(); // never leave a waiter hanging on a child that died early
      resolve({ code, out: out.replace('READY\n', '').trim(), err: err.trim() });
    });
  });
  if (opts.wait !== true) p.stdin.end();
  return {
    ready,
    go: () => p.stdin.end('GO\n'),
    done,
  };
}
