// A fact's life through the edits a codebase sees, end to end through dist/cli.js: remember on a
// committed file, change the code, recall. Served exits 0; withheld exits 4 and names the reason.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FILE, LINE, cleanupDirs, repo } from './helpers/children.js';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

afterEach(cleanupDirs);

/** `node dist/cli.js …` in `cwd`, with the cache under `cacheHome` (run `npm run build` first; `npm test` does). */
function cli(cwd: string, cacheHome: string, ...args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--no-warnings', CLI, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, XDG_CACHE_HOME: cacheHome },
    });
    let out = '';
    let err = '';
    p.stdout.on('data', (d: Buffer) => (out += d.toString()));
    p.stderr.on('data', (d: Buffer) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

const git = (wt: string, ...args: string[]) => execFileSync('git', args, { cwd: wt, stdio: 'ignore' });
const edit = (wt: string, f: (s: string) => string) => fs.writeFileSync(path.join(wt, FILE), f(fs.readFileSync(path.join(wt, FILE), 'utf8')));
const commit = (wt: string) => {
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '--no-verify', '-m', 'change');
};

type Expect = 'served' | `${'suspect' | 'stale'} (${string})`;

const cases: [string, (wt: string) => void, Expect][] = [
  ['unchanged', () => {}, 'served'],
  ['extra spaces inside the quote', (wt) => edit(wt, (s) => s.replace('req: Request,', 'req:   Request,')), 'served'],
  ['the quote reflowed across lines', (wt) => edit(wt, (s) => s.replace(', tokenStore', ',\n  tokenStore')), 'served'],
  ['an edit elsewhere in the file', (wt) => edit(wt, (s) => `${s}// later\n`), 'served'],
  ['a type changed inside the quote', (wt) => edit(wt, (s) => s.replace('): boolean {', '): number {')), 'suspect (not-found)'],
  ['an identifier renamed inside the quote', (wt) => edit(wt, (s) => s.replaceAll('tokenStore', 'sessions')), 'suspect (not-found)'],
  ['the quote now appears twice', (wt) => edit(wt, (s) => `${s}${LINE}\n}\n`), 'suspect (not-unique)'],
  [
    'a committed move',
    (wt) => {
      fs.mkdirSync(path.join(wt, 'lib'));
      git(wt, 'mv', FILE, 'lib/auth.ts');
      commit(wt);
    },
    'served',
  ],
  [
    'a committed move and edit that keeps the quote',
    (wt) => {
      edit(wt, (s) => `// moved\n${s}`);
      fs.mkdirSync(path.join(wt, 'lib'));
      git(wt, 'mv', FILE, 'lib/auth.ts');
      commit(wt);
    },
    'served',
  ],
  [
    'a move, not committed',
    (wt) => {
      fs.mkdirSync(path.join(wt, 'lib'));
      fs.renameSync(path.join(wt, FILE), path.join(wt, 'lib/auth.ts'));
    },
    'served',
  ],
  [
    'a move, staged with git mv',
    (wt) => {
      fs.mkdirSync(path.join(wt, 'lib'));
      git(wt, 'mv', FILE, 'lib/auth.ts');
    },
    'served',
  ],
  [
    'a move and edit, staged with git add -A',
    (wt) => {
      edit(wt, (s) => `// moved\n${s}`);
      fs.mkdirSync(path.join(wt, 'lib'));
      fs.renameSync(path.join(wt, FILE), path.join(wt, 'lib/auth.ts'));
      git(wt, 'add', '-A');
    },
    'served',
  ],
  [
    'a move, not committed, that changed the quote',
    (wt) => {
      edit(wt, (s) => s.replace('): boolean {', '): number {'));
      fs.mkdirSync(path.join(wt, 'lib'));
      fs.renameSync(path.join(wt, FILE), path.join(wt, 'lib/auth.ts'));
    },
    'suspect (not-found)',
  ],
  ['the file deleted, not committed', (wt) => fs.rmSync(path.join(wt, FILE)), 'stale (deleted)'],
  [
    'the file deleted and committed',
    (wt) => {
      git(wt, 'rm', '-q', FILE);
      commit(wt);
    },
    'stale (deleted)',
  ],
  [
    'the file deleted, then restored',
    (wt) => {
      fs.rmSync(path.join(wt, FILE));
      git(wt, 'checkout', '-q', '--', FILE);
    },
    'served',
  ],
];

describe('fact lifecycle (cli)', () => {
  it.each(cases.map(([name, change, expected]) => ({ name, change, expected })))('$name → $expected', async ({ change, expected }) => {
    const { wt, cacheDir } = await repo();
    const run = (...args: string[]) => cli(wt, cacheDir, ...args);
    const w = await run('remember', 'every request passes through checkToken', '--title', 'auth gate', '--quote', `${FILE}:${LINE}`, '--json');
    expect(w, w.err).toMatchObject({ code: 0 });
    const id = (JSON.parse(w.out) as { id: string }).id;

    change(wt);
    const r = await run('recall', 'checkToken', '--json');
    if (expected === 'served') {
      expect(r, r.err).toMatchObject({ code: 0 });
      expect((JSON.parse(r.out) as { served: { id: string }[] }).served.map((s) => s.id)).toEqual([id]);
    } else {
      expect(r, r.err).toMatchObject({ code: 4 });
      expect(JSON.parse(r.out)).toMatchObject({ abstain: true, hints: [`${id} is ${expected}`] });
    }
  }, 30000);
});
