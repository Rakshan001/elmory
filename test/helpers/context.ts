// A real Context over a temp git repo, for flow tests that must not depend on src/api.ts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Cache, type RecordRow } from '../../src/cache.js';
import type { Context, ElmoryEvent } from '../../src/context.js';
import { Deriver } from '../../src/derive.js';
import { Evidence } from '../../src/evidence.js';
import { defaultExec, gitCommonDir } from '../../src/exec.js';
import { viewOf } from '../../src/gate.js';
import { Git } from '../../src/git.js';
import { checkQuoteAtWrite } from '../../src/quote.js';
import { type ElmoryRecord, parse, type RecordType, recordId, type Source, type Tag } from '../../src/record.js';
import { resolveLayout, Store, type StoredRecord } from '../../src/store.js';

/** The one tracked file every fact quotes. Each line below is a unique, long-enough quote. */
export const FILE = 'src/auth.ts';
export const LINE_CHECK = 'export function checkToken(req: Request, secretKey: string): boolean {';
export const LINE_REFRESH = 'export function refreshSession(userId: string, ttlSeconds: number): Session {';
export const LINE_REVOKE = 'export function revokeAllSessions(userId: string, reason: string): number {';
export const FILE_TEXT = [
  LINE_CHECK,
  "  const header = req.headers.get('authorization') ?? '';",
  "  return verifySignature(header.slice(7), secretKey, 'HS256');",
  '}',
  '',
  LINE_REFRESH,
  '  return sessions.create({ userId, expiresAt: Date.now() + ttlSeconds * 1000 });',
  '}',
  '',
  LINE_REVOKE,
  '  return sessions.deleteWhere({ userId, reason });',
  '}',
  '',
].join('\n');

export const NOW = '2026-10-22T12:00:00.000Z';

export interface TestContext extends Context {
  events: ElmoryEvent[];
  /** realpath of the worktree */
  wt: string;
  head: string;
  /** Overwrite the tracked file in the working tree (not committed). */
  writeFile(text: string): void;
}

const dirs: string[] = [];
const caches: Cache[] = [];
const counters = new WeakMap<Context, number>();

/** Close every cache and remove every temp dir made since the last call. Call from afterEach. */
export function cleanupContexts(): void {
  for (const c of caches.splice(0)) c.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const res = await defaultExec('git', args, { cwd });
  if (res.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout;
}

/** Parse, paths, candidate null: the minimal indexer (gate.ts owns the real one). */
export function indexInline(sr: StoredRecord, extra: { candidate?: string | null; flagged?: boolean } = {}): RecordRow {
  const { record } = parse(sr.text);
  if (sr.area === 'archive') throw new Error('archived records are not indexed');
  return {
    id: sr.id,
    area: sr.area,
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
    candidate: extra.candidate ?? null,
    flagged: extra.flagged ?? false,
    text: sr.text,
  };
}

export async function makeContext(opts: { now?: string } = {}): Promise<TestContext> {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'elmory-recall-')));
  dirs.push(root);
  const wt = path.join(root, 'repo');
  fs.mkdirSync(path.join(wt, 'src'), { recursive: true });
  await git(wt, 'init', '-q');
  await git(wt, 'config', 'user.name', 'Tester');
  await git(wt, 'config', 'user.email', 'tester@example.com');
  await git(wt, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(wt, FILE), FILE_TEXT);
  await git(wt, 'add', '-A');
  await git(wt, 'commit', '-q', '--no-verify', '-m', 'init');
  const head = (await git(wt, 'rev-parse', 'HEAD')).trim();

  const layout = resolveLayout(wt, await gitCommonDir(defaultExec, wt));
  const store = new Store(layout);
  store.ensureDirs();
  const cache = Cache.open(layout.projectId, path.join(root, 'cache'));
  caches.push(cache);
  const gitObj = new Git(defaultExec, layout.worktree);
  const evidence = new Evidence({ worktree: layout.worktree, cache, git: gitObj });
  const events: ElmoryEvent[] = [];
  const now = opts.now ?? NOW;

  const ctx: TestContext = {
    layout,
    store,
    cache,
    git: gitObj,
    evidence,
    observer: 'agent:test',
    now: () => now,
    async sync() {
      const known = cache.knownIds();
      const seen = new Set<string>();
      for (const sr of store.listRecords()) {
        seen.add(sr.id);
        if (!known.has(sr.id)) cache.upsertRecord(indexInline(sr));
      }
      for (const id of known) if (!seen.has(id)) cache.deleteRecord(id);
      return [];
    },
    view: () => viewOf(store, cache.allRecords()),
    lifted: () => new Set<string>(),
    async deriver(rows) {
      evidence.resetMemo();
      return new Deriver({
        records: new Map((rows ?? viewOf(store, cache.allRecords())).map((r) => [r.id, r])),
        tombstones: store.readTombstones(),
        trust: store.readTrust(),
        addedBy: await gitObj.addedBy('.elmory'),
        evidence: (row) => evidence.checkAll(row.sources),
      });
    },
    fetchAddedBy: () => gitObj.addedBy('.elmory'),
    // One worktree: gc's cross-worktree rule is tested through Elmory (test/gc-worktrees.test.ts).
    peerDerivers: async () => [],
    emit: (e) => {
      events.push(e);
    },
    events,
    wt: layout.worktree,
    head,
    writeFile: (text) => fs.writeFileSync(path.join(layout.worktree, FILE), text),
  };
  counters.set(ctx, 0);
  return ctx;
}

export interface SeedInput {
  type?: RecordType;
  title?: string;
  body?: string;
  tag?: Tag;
  key?: string;
  /** Lines of FILE_TEXT to quote (facts only); defaults to LINE_CHECK for a fact. */
  quotes?: string[];
  supersedes?: string[];
  cites?: string[];
  recorded?: string;
  area?: 'pending' | 'local';
  /** false: no `written` line, so the record is an untrusted candidate. */
  trusted?: boolean;
  flagged?: boolean;
  candidate?: string | null;
}

/** Write a lint-clean record the way the gate would: ledger, file, cache row. Returns its id. */
export function seed(ctx: TestContext, input: SeedInput = {}): string {
  const n = (counters.get(ctx) ?? 0) + 1;
  counters.set(ctx, n);
  const type = input.type ?? 'memory/fact';
  const sources: Source[] = [];
  if (type === 'memory/fact') {
    for (const q of input.quotes ?? [LINE_CHECK]) {
      const w = checkQuoteAtWrite(FILE_TEXT, q);
      if (!w.ok) throw new Error(`seed: quote refused: ${w.reason}`);
      sources.push({ resource: FILE, quote: w.quote, anchor: w.anchor, tokens: w.tokens, commit: ctx.head });
    }
  }
  const record: ElmoryRecord = {
    type,
    title: input.title ?? `record ${n}`,
    version: 1,
    recorded: input.recorded ?? new Date(Date.parse('2026-01-01T00:00:00.000Z') + n * 1000).toISOString(),
    observer: ctx.observer,
    supersedes: input.supersedes ?? [],
    cites: input.cites ?? [],
    sources,
    body: input.body ?? `body of record ${n}`,
  };
  if (input.tag !== undefined) record.tag = input.tag;
  if (input.key !== undefined) record.key = input.key;
  const id = recordId(record);
  if (input.trusted !== false) ctx.store.appendTrust(`written ${id}`);
  ctx.store.writeRecord(input.area ?? 'pending', record);
  const sr = ctx.store.readRecord(id);
  if (sr === null) throw new Error(`seed: ${id} was not written`);
  ctx.cache.upsertRecord(indexInline(sr, { candidate: input.candidate ?? null, flagged: input.flagged ?? false }));
  return id;
}
