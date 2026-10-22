import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Cache, type RecordRow } from '../src/cache.js';
import { type Derived, Deriver } from '../src/derive.js';
import { Evidence } from '../src/evidence.js';
import { defaultExec } from '../src/exec.js';
import { Git } from '../src/git.js';
import { checkQuoteAtWrite } from '../src/quote.js';
import { type ElmoryRecord, FORMAT_VERSION, parse, recordId } from '../src/record.js';
import { Store, resolveLayout } from '../src/store.js';

const dirs: string[] = [];
const caches: Cache[] = [];

afterEach(() => {
  for (const c of caches.splice(0)) c.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'elmory-worktrees-')));
  dirs.push(d);
  return d;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const res = await defaultExec('git', args, { cwd });
  if (res.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout.trim();
}

const QUOTE = 'export function totalPrice(items: Item[], taxRate: number): number {';
const FILE = [
  'import { Item } from "./item";',
  '',
  QUOTE,
  '  return items.reduce((sum, i) => sum + i.price, 0) * (1 + taxRate);',
  '}',
  '',
].join('\n');

/** Minimal indexer: every record file the worktree sees, as a cache row (index-time checks: the name only). */
function index(store: Store, cache: Cache): Map<string, RecordRow> {
  const rows = new Map<string, RecordRow>();
  for (const stored of store.listRecords()) {
    if (stored.area === 'archive') continue;
    const { record } = parse(stored.text);
    const row: RecordRow = {
      id: stored.id,
      area: stored.area,
      type: record.type,
      title: record.title,
      body: record.body,
      key: record.key ?? null,
      tag: record.tag ?? null,
      observer: record.observer,
      recorded: record.recorded,
      supersedes: record.supersedes,
      cites: record.cites,
      sources: record.sources,
      paths: record.sources.map((s) => s.resource),
      candidate: recordId(record) === stored.id ? null : 'edited',
      flagged: false,
      text: stored.text,
    };
    cache.upsertRecord(row);
    const back = cache.getRecord(row.id);
    if (back) rows.set(back.id, back);
  }
  return rows;
}

async function derive(worktree: string, commonDir: string, cache: Cache, id: string): Promise<Derived> {
  const store = new Store(resolveLayout(worktree, commonDir));
  const g = new Git(defaultExec, worktree);
  const ev = new Evidence({ worktree, cache, git: g });
  const d = new Deriver({
    records: index(store, cache),
    tombstones: store.readTombstones(),
    trust: store.readTrust(),
    addedBy: await g.addedBy('.elmory/'),
    evidence: (row) => ev.checkAll(row.sources),
  });
  return d.state(id);
}

describe('two worktrees over one cache', () => {
  it('the same fact is active in one worktree and suspect in another, with or without the cache', async () => {
    const root = tmp();
    const a = path.join(root, 'a');
    fs.mkdirSync(path.join(a, 'src'), { recursive: true });
    await git(a, 'init', '-q');
    await git(a, 'config', 'user.name', 'Tester');
    await git(a, 'config', 'user.email', 'tester@example.com');
    await git(a, 'config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(a, 'src/price.ts'), FILE);
    await git(a, 'add', '-A');
    await git(a, 'commit', '-q', '--no-verify', '-m', 'init');
    const head = await git(a, 'rev-parse', 'HEAD');
    const b = path.join(root, 'b');
    await git(a, 'worktree', 'add', '-q', '-b', 'other', b);
    const commonDir = await git(a, 'rev-parse', '--path-format=absolute', '--git-common-dir');

    // One fact, written in A: pending lives in the common dir, so both worktrees see it.
    const check = checkQuoteAtWrite(FILE, QUOTE);
    if (!check.ok) throw new Error(`write refused: ${check.reason}`);
    const fact: ElmoryRecord = {
      type: 'memory/fact',
      title: 'Prices include tax',
      version: FORMAT_VERSION,
      recorded: '2026-10-22T09:00:00.000Z',
      observer: 'agent:test',
      supersedes: [],
      cites: [],
      sources: [{ resource: 'src/price.ts', quote: check.quote, anchor: check.anchor, tokens: check.tokens, commit: head }],
      body: 'totalPrice applies the tax rate to the summed item prices.',
    };
    const storeA = new Store(resolveLayout(a, commonDir));
    storeA.ensureDirs();
    const id = storeA.writeRecord('pending', fact);
    storeA.appendTrust(`written ${id}`);

    // Edit the quoted identifier in B only.
    fs.writeFileSync(path.join(b, 'src/price.ts'), FILE.replace('totalPrice', 'grandTotal'));

    const cacheDir = path.join(root, 'cache');
    const first = Cache.open('worktrees-test', cacheDir);
    caches.push(first);
    const inA = await derive(a, commonDir, first, id);
    const inB = await derive(b, commonDir, first, id);
    expect(inA).toMatchObject({ state: 'active', reason: null, trusted: true, head: true });
    expect(inA.labels).toEqual(['evidence unchanged since 2026-10-22']);
    expect(inB).toMatchObject({ state: 'suspect', reason: 'not-found', trusted: true, head: true });

    // State is derived, never stored: deleting the cache must not change either answer.
    first.close();
    caches.splice(caches.indexOf(first), 1);
    fs.rmSync(cacheDir, { recursive: true, force: true });
    const second = Cache.open('worktrees-test', cacheDir);
    caches.push(second);
    expect(await derive(b, commonDir, second, id)).toEqual(inB);
    expect(await derive(a, commonDir, second, id)).toEqual(inA);
  });
});
