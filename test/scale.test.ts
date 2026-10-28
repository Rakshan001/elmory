// §14 scale (I5): 5 000 records over 200 quoted files. Timing bounds only, so it runs under
// `npm run test:timing` on a quiet machine and is skipped by `npm test` and in CI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Elmory } from '../src/api.js';
import { defaultExec } from '../src/exec.js';
import { checkQuoteAtWrite } from '../src/quote.js';
import { type ElmoryRecord, FORMAT_VERSION, recordId, serialize } from '../src/record.js';

const FILES = 200;
const PER_FILE = 25;
const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa'];

async function git(cwd: string, ...args: string[]): Promise<string> {
  const res = await defaultExec('git', args, { cwd });
  if (res.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] as number;
}

describe.skipIf(process.env.ELMORY_TIMING !== '1')('scale (§14, I5)', () => {
  let root = '';
  let e: Elmory;

  beforeAll(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'elmory-scale-')));
    const wt = path.join(root, 'repo');
    fs.mkdirSync(path.join(wt, 'src', 'm'), { recursive: true });
    await git(wt, 'init', '-q');
    await git(wt, 'config', 'user.name', 'Tester');
    await git(wt, 'config', 'user.email', 'tester@example.com');
    await git(wt, 'config', 'commit.gpgsign', 'false');
    const lines: string[][] = [];
    for (let f = 0; f < FILES; f++) {
      const l: string[] = [];
      for (let i = 0; i < PER_FILE; i++) l.push(`export const value_${f}_${i} = computeSomething(${f}, ${i}, "${WORDS[(f + i) % 16]}");`);
      fs.writeFileSync(path.join(wt, 'src', 'm', `f${f}.ts`), `${l.join('\n')}\n`);
      lines.push(l);
    }
    await git(wt, 'add', '-A');
    await git(wt, 'commit', '-q', '--no-verify', '-m', 'code');
    const head = (await git(wt, 'rev-parse', 'HEAD')).trim();
    const pending = path.join(wt, '.git', 'elmory', 'pending');
    fs.mkdirSync(pending, { recursive: true });
    const ledger: string[] = [];
    let n = 0;
    for (let f = 0; f < FILES; f++) {
      const text = fs.readFileSync(path.join(wt, 'src', 'm', `f${f}.ts`), 'utf8');
      for (let i = 0; i < PER_FILE; i++) {
        const q = checkQuoteAtWrite(text, lines[f]?.[i] as string);
        if (!q.ok) throw new Error(`quote ${q.reason}`);
        const word = WORDS[(f + i) % 16] as string;
        const r: ElmoryRecord = {
          type: 'memory/fact',
          title: `value ${f} ${i} uses ${word}`,
          version: FORMAT_VERSION,
          recorded: '2026-10-01T00:00:00.000Z',
          observer: 'agent:scale',
          supersedes: [],
          cites: [],
          sources: [{ resource: `src/m/f${f}.ts`, quote: q.quote, anchor: q.anchor, tokens: q.tokens, commit: head }],
          body: `The value ${f}/${i} is computed with ${word} and topic${n % 97}.`,
        };
        const id = recordId(r);
        fs.writeFileSync(path.join(pending, `${id}.md`), serialize(r));
        ledger.push(`written ${id}`);
        n++;
      }
    }
    fs.writeFileSync(path.join(wt, '.git', 'elmory', 'trust'), `${ledger.join('\n')}\n`);
    e = await Elmory.open({ worktree: wt, cacheDir: path.join(root, 'cache') });
    await e.sync();
    // Settle the files and directories past the 2 s racy window, as in a session that did not
    // just write 5 000 files: views use the stamps and a no-op sync takes no lock.
    const past = new Date(Date.now() - 10_000);
    for (const name of fs.readdirSync(pending)) fs.utimesSync(path.join(pending, name), past, past);
    for (const p of [pending, path.join(wt, '.git', 'elmory', 'trust'), ...['local', 'tombstones', 'archive'].map((d) => path.join(wt, '.git', 'elmory', d))]) {
      if (fs.existsSync(p)) fs.utimesSync(p, past, past);
    }
    for (const d of ['facts', 'tombstones']) {
      const p = path.join(wt, '.elmory', d);
      if (fs.existsSync(p)) fs.utimesSync(p, past, past);
    }
    await e.sync({ full: true });
  }, 120_000);

  afterAll(() => {
    e?.close();
    if (root !== '') fs.rmSync(root, { recursive: true, force: true });
  });

  it('view of 5 000 records: median under 60 ms', { retry: 3 }, () => {
    expect(e.view()).toHaveLength(FILES * PER_FILE);
    const times: number[] = [];
    for (let k = 0; k < 11; k++) {
      const t = performance.now();
      e.view();
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    expect(percentile(times, 50)).toBeLessThan(60);
  });

  // Retried: under a parallel test run another file's work can land in one sample window.
  it('recall over 5 000 records: p95 under 150 ms', { retry: 3 }, async () => {
    await e.recall({ query: 'alpha topic1' }); // warm-up: evidence and the addedBy walk
    const times: number[] = [];
    for (let k = 0; k < 40; k++) {
      const t = performance.now();
      const r = await e.recall({ query: `${WORDS[k % 16]} topic${k}` });
      times.push(performance.now() - t);
      expect(r.abstain).toBe(false);
    }
    times.sort((a, b) => a - b);
    expect(percentile(times, 95)).toBeLessThan(150);
  }, 60_000);
});
