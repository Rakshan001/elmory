import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Elmory } from '../src/api.js';
import { type ElmoryRecord, FORMAT_VERSION, recordId } from '../src/record.js';
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

async function setup(): Promise<{ wt: string; cacheDir: string; run: (...args: string[]) => Promise<Run>; runIn: (cwd: string, ...args: string[]) => Promise<Run> }> {
  const { wt, cacheDir } = await repo();
  return { wt, cacheDir, run: (...args) => cli(wt, cacheDir, ...args), runIn: (cwd, ...args) => cli(cwd, cacheDir, ...args) };
}

/** A record as a hostile commit could carry it: written to pending as this clone's own. */
async function plant(wt: string, cacheDir: string, r: Omit<ElmoryRecord, 'version' | 'recorded' | 'supersedes' | 'cites' | 'sources'>): Promise<string> {
  const e = await Elmory.open({ worktree: wt, cacheDir: path.join(cacheDir, 'planter') });
  try {
    const rec: ElmoryRecord = { version: FORMAT_VERSION, recorded: '2026-10-22T10:00:00.000Z', supersedes: [], cites: [], sources: [], ...r };
    e.store.appendTrust(`written ${recordId(rec)}`);
    return e.store.writeRecord('pending', rec);
  } finally {
    e.close();
  }
}

/** Raw C0/C1 control bytes other than newline. */
const RAW_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;

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
    expect(JSON.parse(json.out)).toEqual({ abstain: true, reason: 'no records match', hints: [], warnings: [] });
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

    expect((await run('note', 'something to delete', '--title', 'victim')).code).toBe(0);
    const noConfirm = await run('forget', '--all');
    expect(noConfirm.code).toBe(2);
    expect(noConfirm.err.split('\n')).toHaveLength(1);
    expect(noConfirm.err).toContain('refused (confirm)');
    expect(noConfirm.out).toContain('re-run with --confirm to delete this 1 record');

    const noScope = await run('forget');
    expect(noScope.code).toBe(1);
  }, 30000);

  it('control characters in record text are escaped in human output; --json keeps them', async () => {
    const { wt, cacheDir, run } = await setup();
    const id = await plant(wt, cacheDir, {
      type: 'memory/note',
      title: 'evil \u001b[2Jclear title',
      observer: 'x\ninjected: y',
      body: 'line one \u001b]0;pwned\u0007 tail\r\nline two \u009b31m',
    });

    const r = await run('recall', 'evil');
    expect(r, r.err).toMatchObject({ code: 0 });
    expect(r.out).not.toMatch(RAW_CONTROL);
    expect(r.out).toContain('## evil \\x1b[2Jclear title');
    expect(r.out).toContain('line one \\x1b]0;pwned\\x07 tail');
    expect(r.out).toContain('\\x9b31m');

    const h = await run('history', id);
    expect(h, h.err).toMatchObject({ code: 0 });
    expect(h.out).not.toMatch(RAW_CONTROL);
    expect(h.out.split('\n')).toHaveLength(1); // the observer's newline cannot forge a second line
    expect(h.out).toContain('x\\x0ainjected: y');

    const json = await run('recall', 'evil', '--json');
    const got = JSON.parse(json.out) as { served: { title: string }[] };
    expect(got.served[0]?.title).toBe('evil \u001b[2Jclear title');
  }, 30000);

  it('--title and --observer with control characters are refused', async () => {
    const { run } = await setup();
    const title = await run('note', 'body text', '--title', 't \u001b[2Jclear');
    expect(title.code).toBe(2);
    expect(title.err).toMatch(/refused \(title\)/);
    expect(title.err).not.toMatch(RAW_CONTROL);

    const observer = await run('note', 'body text', '--title', 'fine', '--observer', 'x\ninjected: y', '--json');
    expect(observer.code).toBe(2);
    expect(JSON.parse(observer.out)).toMatchObject({ error: 'refused', reason: 'observer' });
  }, 30000);

  it('forget --query without --confirm previews the seeds and the cascade and deletes nothing', async () => {
    const { run } = await setup();
    const a = JSON.parse((await run('note', 'No deploys on Fridays', '--title', 'deploy freeze', '--json')).out) as { id: string };
    const b = JSON.parse((await run('note', 'Because of the freeze', '--title', 'why fridays', '--cites', a.id, '--json')).out) as { id: string };

    const p = await run('forget', '--query', 'deploys');
    expect(p.code).toBe(2);
    expect(p.out).toContain(`${a.id} deploy freeze`);
    expect(p.out).toContain(`${b.id} why fridays`);
    expect(p.out).toContain('re-run with --confirm to delete these 2 records');
    expect(p.err).toContain('refused (confirm)');

    const pj = await run('forget', '--query', 'deploys', '--json');
    expect(pj.code).toBe(2);
    expect(JSON.parse(pj.out)).toEqual({
      preview: true,
      seeds: [{ id: a.id, title: 'deploy freeze' }],
      cascaded: [{ id: b.id, title: 'why fridays' }],
    });
    expect((await run('recall', 'freeze')).code).toBe(0); // still there

    const done = await run('forget', '--query', 'deploys', '--confirm', '--json');
    expect(done, done.err).toMatchObject({ code: 0 });
    expect(JSON.parse(done.out)).toMatchObject({ deleted: [a.id], cascaded: [b.id], unknown: [] });
    expect((await run('recall', 'freeze')).code).toBe(4);
  }, 30000);

  it('forget of only ids that never existed reports them as unknown and exits 1', async () => {
    const { run } = await setup();
    const typo = `f_${'a'.repeat(26)}`;
    const r = await run('forget', typo, '--json');
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out)).toMatchObject({ deleted: [], unknown: [typo] });
    expect(r.err).toBe(`elmory forget: no such record here: ${typo}; nothing written`);
    const human = await run('forget', typo);
    expect(human.code).toBe(1);
    expect(human.out).toContain(`unknown (no such record here; nothing written): ${typo}`);

    // one real id among them: the forget happened, exit 0
    const real = JSON.parse((await run('note', 'Real one', '--title', 'real', '--json')).out) as { id: string };
    const mixed = await run('forget', real.id, typo, '--json');
    expect(mixed, mixed.err).toMatchObject({ code: 0 });
    expect(JSON.parse(mixed.out)).toMatchObject({ deleted: [real.id], unknown: [typo] });
  }, 30000);

  it('global flags work before the verb; help --json lists the verbs', async () => {
    const { wt, runIn } = await setup();
    const elsewhere = path.dirname(wt);
    const w = await runIn(elsewhere, '--json', '--worktree', path.join(wt, 'src'), 'note', 'Tabs not spaces', '--title', 'indent');
    expect(w, w.err).toMatchObject({ code: 0 });
    const id = (JSON.parse(w.out) as { id: string }).id;
    const r = await runIn(elsewhere, '--worktree', wt, '--json', 'recall', 'Tabs');
    expect(r, r.err).toMatchObject({ code: 0 });
    expect((JSON.parse(r.out) as { served: { id: string }[] }).served.map((s) => s.id)).toEqual([id]);

    for (const args of [['help', '--json'], ['--json', 'help']]) {
      const h = await runIn(elsewhere, ...args);
      expect(h.code).toBe(0);
      const verbs = (JSON.parse(h.out) as { verbs: { name: string; usage: string; summary: string }[] }).verbs;
      expect(verbs.map((v) => v.name)).toContain('forget');
      expect(verbs.map((v) => v.name)).toContain('help');
    }
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
    expect(JSON.parse(hist.out)).toEqual({ entries: [expect.objectContaining({ id })], warnings: [] });

    const f = await run('forget', id, '--json');
    expect(f, f.err).toMatchObject({ code: 0 });
    expect(JSON.parse(f.out)).toMatchObject({ deleted: [id] });

    const after = await run('recall', 'checkToken');
    expect(after.code).toBe(4);
  }, 30000);
});
