import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cache } from '../src/cache.js';
import { Evidence } from '../src/evidence.js';
import { defaultExec } from '../src/exec.js';
import { Git } from '../src/git.js';
import { buildAnchorMap, checkQuoteAtWrite } from '../src/quote.js';
import type { QuoteSource } from '../src/record.js';

// Wrap buildAnchorMap so a test can count how often the anchor map is built.
vi.mock('../src/quote.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/quote.js')>();
  return { ...actual, buildAnchorMap: vi.fn(actual.buildAnchorMap) };
});

const dirs: string[] = [];
const caches: Cache[] = [];

function tmp(): string {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'elmory-evidence-')));
  dirs.push(d);
  return d;
}

beforeEach(() => {
  vi.mocked(buildAnchorMap).mockClear();
});

afterEach(() => {
  for (const c of caches.splice(0)) c.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const res = await defaultExec('git', args, { cwd });
  if (res.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout;
}

async function repo(): Promise<string> {
  const wt = path.join(tmp(), 'main');
  fs.mkdirSync(wt);
  await git(wt, 'init', '-q');
  await git(wt, 'config', 'user.name', 'Tester');
  await git(wt, 'config', 'user.email', 'tester@example.com');
  await git(wt, 'config', 'commit.gpgsign', 'false');
  return wt;
}

async function commitAll(wt: string, message: string): Promise<string> {
  await git(wt, 'add', '-A');
  await git(wt, 'commit', '-q', '--no-verify', '-m', message);
  return (await git(wt, 'rev-parse', 'HEAD')).trim();
}

function openCache(): Cache {
  const c = Cache.open('evidence-test', tmp());
  caches.push(c);
  return c;
}

const QUOTE_A = 'export function totalPrice(items: Item[], taxRate: number): number {';
const QUOTE_B = 'export function applyDiscount(price: number, percent: number): number {';
const FILE = [
  'import { Item } from "./item";',
  '',
  QUOTE_A,
  '  return items.reduce((sum, i) => sum + i.price, 0) * (1 + taxRate);',
  '}',
  '',
  QUOTE_B,
  '  return price * (1 - percent / 100);',
  '}',
  '',
].join('\n');

function quoteSource(fileText: string, quoteText: string, resource: string, commit: string): QuoteSource {
  const w = checkQuoteAtWrite(fileText, quoteText);
  if (!w.ok) throw new Error(`write refused: ${w.reason}`);
  return { resource, quote: w.quote, anchor: w.anchor, tokens: w.tokens, commit };
}

/** A repo with src/price.ts committed; returns the worktree, its HEAD and a quote source on it. */
async function setup(): Promise<{ wt: string; head: string; src: QuoteSource }> {
  const wt = await repo();
  fs.mkdirSync(path.join(wt, 'src'));
  fs.writeFileSync(path.join(wt, 'src/price.ts'), FILE);
  const head = await commitAll(wt, 'init');
  return { wt, head, src: quoteSource(FILE, QUOTE_A, 'src/price.ts', head) };
}

function evidence(wt: string, cache: Cache, withGit = true): Evidence {
  return new Evidence({ worktree: wt, cache, git: withGit ? new Git(defaultExec, wt) : null });
}

describe('Evidence', () => {
  it('a quote holds, and the result is served from the evidence cache the second time', async () => {
    const { wt, head, src } = await setup();
    const cache = openCache();
    const second = quoteSource(FILE, QUOTE_B, 'src/price.ts', head);

    const ev = evidence(wt, cache);
    const first = await ev.checkAll([src, second]);
    expect(first).toEqual([
      { outcome: 'holds', detail: 'found', path: 'src/price.ts' },
      { outcome: 'holds', detail: 'found', path: 'src/price.ts' },
    ]);
    // Two quotes over one file: the anchor map is built once for the request.
    expect(buildAnchorMap).toHaveBeenCalledTimes(1);

    const contentId = createHash('sha256').update(fs.readFileSync(path.join(wt, 'src/price.ts'))).digest('hex');
    expect(ev.contentId('src/price.ts')).toBe(contentId);
    expect(cache.getEvidence(contentId, `${src.quote}|${src.anchor}|${src.tokens}`)).toBe('found');

    ev.resetMemo();
    expect(await ev.check(src)).toEqual({ outcome: 'holds', detail: 'found', path: 'src/price.ts' });
    expect(await evidence(wt, cache).check(second)).toMatchObject({ outcome: 'holds' });
    expect(buildAnchorMap).toHaveBeenCalledTimes(1);
  });

  it('a crafted source with the same quote hash but a wrong anchor or token count cannot poison the honest one', async () => {
    const { wt, src } = await setup();
    const cache = openCache();
    const ev = evidence(wt, cache);
    const badAnchor = { ...src, anchor: '000000000000' };
    const badTokens = { ...src, tokens: src.tokens + 1 };
    expect(await ev.check(badAnchor)).toMatchObject({ outcome: 'suspect', detail: 'not-found' });
    expect(await ev.check(badTokens)).toMatchObject({ outcome: 'suspect', detail: 'not-found' });
    expect(await ev.check(src)).toEqual({ outcome: 'holds', detail: 'found', path: 'src/price.ts' });

    // Independent rows over one content id; a fresh request still gets each result from the cache.
    expect(await evidence(wt, cache).check(src)).toMatchObject({ outcome: 'holds' });
    expect(await evidence(wt, cache).check(badAnchor)).toMatchObject({ outcome: 'suspect' });
  });

  it('an unchanged file is served from the stat cache without reading its bytes', async () => {
    const { wt } = await setup();
    const cache = openCache();
    const abs = path.join(wt, 'src/price.ts');
    // Backdate the mtime past the 2 s racy window so the stat entry is trusted.
    const past = new Date(Date.now() - 10_000);
    fs.utimesSync(abs, past, past);

    const ev = evidence(wt, cache);
    const read = vi.spyOn(fs, 'readFileSync');
    try {
      const id = ev.contentId('src/price.ts');
      expect(id).toBe(createHash('sha256').update(FILE).digest('hex'));
      expect(read.mock.calls.filter((c) => c[0] === abs)).toHaveLength(1);

      ev.resetMemo();
      read.mockClear();
      expect(ev.contentId('src/price.ts')).toBe(id);
      expect(evidence(wt, cache).contentId('src/price.ts')).toBe(id);
      expect(read.mock.calls.filter((c) => c[0] === abs)).toHaveLength(0);
    } finally {
      read.mockRestore();
    }
  });

  it('an edited identifier makes it suspect', async () => {
    const { wt, src } = await setup();
    const cache = openCache();
    fs.writeFileSync(path.join(wt, 'src/price.ts'), FILE.replace('totalPrice', 'grandTotal'));
    expect(await evidence(wt, cache).check(src)).toEqual({
      outcome: 'suspect',
      detail: 'not-found',
      path: 'src/price.ts',
    });
  });

  it('a quote that now appears twice is suspect', async () => {
    const { wt, src } = await setup();
    const cache = openCache();
    fs.writeFileSync(path.join(wt, 'src/price.ts'), FILE + '\n' + QUOTE_A + '\n  return 0;\n}\n');
    expect(await evidence(wt, cache).check(src)).toMatchObject({ outcome: 'suspect', detail: 'not-unique' });
  });

  it('a renamed file holds at the new path', async () => {
    const { wt, head, src } = await setup();
    const cache = openCache();
    await git(wt, 'mv', 'src/price.ts', 'src/pricing.ts');
    await commitAll(wt, 'rename');

    expect(await evidence(wt, cache).check(src)).toEqual({
      outcome: 'holds',
      detail: 'renamed',
      path: 'src/pricing.ts',
    });
    const tree = (await git(wt, 'rev-parse', 'HEAD^{tree}')).trim();
    expect(cache.getRename(head, tree)).toEqual({ 'src/price.ts': { status: 'renamed', newPath: 'src/pricing.ts' } });
  });

  it('an unreachable commit is unknown', async () => {
    const { wt, src } = await setup();
    const cache = openCache();
    fs.rmSync(path.join(wt, 'src/price.ts'));
    const report = await evidence(wt, cache).check({ ...src, commit: '0'.repeat(40) });
    expect(report).toEqual({ outcome: 'unknown', detail: 'unreachable-commit', path: 'src/price.ts' });
  });

  it('a deleted file is stale', async () => {
    const { wt, src } = await setup();
    const cache = openCache();
    await git(wt, 'rm', '-q', 'src/price.ts');
    await commitAll(wt, 'delete');
    expect(await evidence(wt, cache).check(src)).toEqual({ outcome: 'stale', detail: 'deleted', path: 'src/price.ts' });
  });

  it('a missing file without git is stale', async () => {
    const { wt, src } = await setup();
    const cache = openCache();
    fs.rmSync(path.join(wt, 'src/price.ts'));
    expect(await evidence(wt, cache, false).check(src)).toEqual({
      outcome: 'stale',
      detail: 'deleted',
      path: 'src/price.ts',
    });
  });

  it('a file over 1 MiB is unknown', async () => {
    const { wt, src } = await setup();
    const cache = openCache();
    fs.writeFileSync(path.join(wt, 'src/price.ts'), FILE + '// pad\n'.repeat(160_000));
    expect(fs.statSync(path.join(wt, 'src/price.ts')).size).toBeGreaterThan(1024 * 1024);
    expect(await evidence(wt, cache).check(src)).toEqual({ outcome: 'unknown', detail: 'too-large', path: 'src/price.ts' });
    expect(buildAnchorMap).not.toHaveBeenCalled();
  });

  it('a resource outside the worktree is unknown', async () => {
    const { wt, src } = await setup();
    const cache = openCache();
    fs.writeFileSync(path.join(path.dirname(wt), 'outside.ts'), FILE);
    fs.symlinkSync(path.join(path.dirname(wt), 'outside.ts'), path.join(wt, 'src/link.ts'));
    const ev = evidence(wt, cache);
    expect(await ev.check({ ...src, resource: '../outside.ts' })).toMatchObject({ outcome: 'unknown', detail: 'unreadable' });
    expect(await ev.check({ ...src, resource: path.join(path.dirname(wt), 'outside.ts') })).toMatchObject({
      outcome: 'unknown',
      detail: 'unreadable',
    });
    expect(await ev.check({ ...src, resource: 'src/link.ts' })).toMatchObject({ outcome: 'unknown', detail: 'unreadable' });
  });

  it('legacy-file holds on match and is suspect on mismatch', async () => {
    const { wt } = await setup();
    const cache = openCache();
    const sha1 = createHash('sha1').update(fs.readFileSync(path.join(wt, 'src/price.ts'))).digest('hex').slice(0, 12);
    const ev = evidence(wt, cache);
    expect(await ev.check({ resource: 'src/price.ts', legacyFile: sha1 })).toEqual({
      outcome: 'holds',
      detail: 'legacy-match',
      path: 'src/price.ts',
    });
    expect(await ev.check({ resource: 'src/price.ts', legacyFile: '000000000000' })).toEqual({
      outcome: 'suspect',
      detail: 'legacy-mismatch',
      path: 'src/price.ts',
    });
    expect(buildAnchorMap).not.toHaveBeenCalled();
  });

  it('two worktrees with different bytes get different outcomes over one cache', async () => {
    const { wt, src } = await setup();
    const cache = openCache();
    const other = path.join(path.dirname(wt), 'other');
    await git(wt, 'worktree', 'add', '-q', '-b', 'other', other);
    fs.writeFileSync(path.join(other, 'src/price.ts'), FILE.replace('taxRate: number', 'taxRate: bigint'));

    const a = evidence(wt, cache);
    const b = evidence(other, cache);
    expect(await a.check(src)).toMatchObject({ outcome: 'holds', detail: 'found' });
    expect(await b.check(src)).toMatchObject({ outcome: 'suspect', detail: 'not-found' });
    expect(a.contentId('src/price.ts')).not.toBe(b.contentId('src/price.ts'));

    // Same bytes again in the second worktree: served from the shared row, no new anchor map.
    fs.writeFileSync(path.join(other, 'src/price.ts'), FILE);
    b.resetMemo();
    vi.mocked(buildAnchorMap).mockClear();
    expect(await b.check(src)).toMatchObject({ outcome: 'holds', detail: 'found' });
    expect(buildAnchorMap).not.toHaveBeenCalled();
  });
});
