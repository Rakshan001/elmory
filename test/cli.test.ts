import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FILE, LINE, cleanupDirs, repo } from './helpers/children.js';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

afterEach(cleanupDirs);

interface Run {
  code: number | null;
  out: string;
  err: string;
}

/** `node dist/cli.js …` in `cwd`, with the cache under `cacheHome` (run `npm run build` first; `npm test` does). */
function cli(cwd: string, cacheHome: string, ...args: string[]): Promise<Run> {
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

async function setup(): Promise<{ run: (...args: string[]) => Promise<Run> }> {
  const { wt, cacheDir } = await repo();
  return { run: (...args) => cli(wt, cacheDir, ...args) };
}

const quoteArg = `${FILE}:${LINE}`;

describe('elmory cli', () => {
  it('dist/cli.js starts with a shebang', () => {
    expect(fs.readFileSync(CLI, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true);
  });

  it('remember then recall --json round-trips', async () => {
    const { run } = await setup();
    const w = await run('remember', 'every request passes through checkToken', '--title', 'auth gate', '--quote', quoteArg, '--tag', 'gotcha', '--json');
    expect(w, w.err).toMatchObject({ code: 0, err: '' });
    const written = JSON.parse(w.out) as { id: string; state: string };
    expect(written.state).toBe('active');

    const r = await run('recall', 'checkToken', '--json');
    expect(r, r.err).toMatchObject({ code: 0 });
    const got = JSON.parse(r.out) as { abstain: boolean; served: { id: string; title: string; body: string; tag: string; paths: string[] }[] };
    expect(got.abstain).toBe(false);
    expect(got.served).toHaveLength(1);
    expect(got.served[0]).toMatchObject({
      id: written.id,
      title: 'auth gate',
      body: 'every request passes through checkToken',
      tag: 'gotcha',
      paths: [FILE],
    });

    const human = await run('recall', 'checkToken');
    expect(human.code).toBe(0);
    expect(human.out).toContain('## auth gate');
    expect(human.out).toContain(`id: ${written.id} · state: active`);
    expect(human.out).toContain('every request passes through checkToken');
  }, 30000);

  it('conflict exits 3', async () => {
    const { run } = await setup();
    const first = await run('note', 'use tabs', '--title', 'indent style', '--key', 'style.indent', '--json');
    expect(first, first.err).toMatchObject({ code: 0 });
    const head = (JSON.parse(first.out) as { id: string }).id;

    const second = await run('note', 'use spaces', '--title', 'indent style', '--key', 'style.indent');
    expect(second.code).toBe(3);
    expect(second.out).toBe('');
    expect(second.err.split('\n')).toHaveLength(1);
    expect(second.err).toContain(head);

    const json = await run('note', 'use spaces', '--title', 'indent style', '--key', 'style.indent', '--json');
    expect(json.code).toBe(3);
    expect(JSON.parse(json.out)).toMatchObject({ error: 'conflict', heads: [head] });

    const ok = await run('note', 'use spaces', '--title', 'indent style', '--key', 'style.indent', '--supersedes', head);
    expect(ok, ok.err).toMatchObject({ code: 0 });
  }, 30000);

  it('refused exits 2 with a one-line reason', async () => {
    const { run } = await setup();
    const r = await run('remember', 'no evidence at all', '--title', 'unquoted fact');
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    expect(r.err.split('\n')).toHaveLength(1);
    expect(r.err).toMatch(/refused \(shape\): a fact needs at least one quote/);

    const json = await run('remember', 'quotes a missing file', '--title', 'missing', '--quote', 'src/nope.ts:whatever text here', '--json');
    expect(json.code).toBe(2);
    expect(json.err.split('\n')).toHaveLength(1);
    expect(JSON.parse(json.out)).toMatchObject({ error: 'refused', reason: 'untracked' });
  }, 30000);

  it("abstain exits 4 and says I don't know", async () => {
    const { run } = await setup();
    const r = await run('recall', 'nothing like this exists');
    expect(r.code).toBe(4);
    expect(r.out).toBe("I don't know: no records match");

    const json = await run('recall', 'nothing like this exists', '--json');
    expect(json.code).toBe(4);
    expect(JSON.parse(json.out)).toEqual({ abstain: true, reason: 'no records match', hints: [] });
  }, 30000);

  it('help lists every verb', async () => {
    const { run } = await setup();
    const r = await run('help');
    expect(r.code).toBe(0);
    for (const verb of ['remember', 'note', 'recall', 'about', 'history', 'verify', 'forget', 'publish', 'review', 'approve', 'reject', 'gc', 'rebuild', 'help']) {
      expect(r.out).toMatch(new RegExp(`^  ${verb}\\b`, 'm'));
    }
  }, 30000);

  it('usage errors exit 1 with one line on stderr', async () => {
    const { run } = await setup();
    const unknown = await run('frobnicate');
    expect(unknown.code).toBe(1);
    expect(unknown.err.split('\n')).toHaveLength(1);

    const badFlag = await run('recall', 'x', '--nope');
    expect(badFlag.code).toBe(1);
    expect(badFlag.err.split('\n')).toHaveLength(1);

    const noConfirm = await run('forget', '--all');
    expect(noConfirm.code).toBe(1);
    expect(noConfirm.err).toContain('--confirm');
  }, 30000);

  it('publish, about, history and forget work end to end', async () => {
    const { run } = await setup();
    const w = await run('remember', 'every request passes through checkToken', '--title', 'auth gate', '--quote', quoteArg, '--key', 'auth.gate', '--json');
    expect(w, w.err).toMatchObject({ code: 0 });
    const id = (JSON.parse(w.out) as { id: string }).id;

    const pub = await run('publish', '--json');
    expect(pub, pub.err).toMatchObject({ code: 0 });
    expect(JSON.parse(pub.out)).toEqual({ published: [id] });

    const about = await run('about', FILE, '--json');
    expect(about, about.err).toMatchObject({ code: 0 });
    expect((JSON.parse(about.out) as { served: { id: string }[] }).served.map((s) => s.id)).toEqual([id]);

    const hist = await run('history', 'auth.gate', '--json');
    expect(hist, hist.err).toMatchObject({ code: 0 });
    expect((JSON.parse(hist.out) as { id: string }[]).map((h) => h.id)).toEqual([id]);

    const f = await run('forget', id, '--json');
    expect(f, f.err).toMatchObject({ code: 0 });
    expect(JSON.parse(f.out)).toMatchObject({ deleted: [id] });

    const after = await run('recall', 'checkToken');
    expect(after.code).toBe(4);
  }, 30000);
});
