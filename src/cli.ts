#!/usr/bin/env node
// The `elmory` command (spec §3 front ends): a thin shell over the Elmory api, one verb per
// handler. Exit codes: 0 ok, 1 other error, 2 refused, 3 conflict, 4 abstain. Errors go to stderr
// as one line; `--json` prints the result (or the error) as JSON on stdout.

import os from 'node:os';
import path from 'node:path';
import { type ParseArgsConfig, parseArgs } from 'node:util';
import { ConflictError, Elmory, RefusedError } from './api.js';
import type { Abstain, RecallResult, Served } from './api.js';
import type { State } from './derive.js';
import { defaultExec } from './exec.js';
import { type ForgetScope, forget } from './forget.js';
import type { RememberInput } from './gate.js';
import type { Tag } from './record.js';

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_REFUSED = 2;
const EXIT_CONFLICT = 3;
const EXIT_ABSTAIN = 4;

/** Every state; the `satisfies` keeps this in step with `State`. */
const STATES = {
  candidate: true,
  forgotten: true,
  superseded: true,
  conflict: true,
  stale: true,
  suspect: true,
  unknown: true,
  active: true,
} as const satisfies Record<State, true>;

type Options = NonNullable<ParseArgsConfig['options']>;

const COMMON: Options = {
  json: { type: 'boolean' },
  worktree: { type: 'string' },
  observer: { type: 'string' },
};

const WRITE: Options = {
  title: { type: 'string' },
  tag: { type: 'string' },
  key: { type: 'string' },
  supersedes: { type: 'string' },
  cites: { type: 'string' },
  local: { type: 'boolean' },
};

interface Verb {
  usage: string;
  summary: string;
  options: Options;
  run(e: Elmory, a: Args): Promise<Outcome>;
}

interface Args {
  values: Record<string, string | boolean | (string | boolean)[] | undefined>;
  positionals: string[];
}

interface Outcome {
  /** what `--json` prints */
  data: unknown;
  /** what a person reads */
  text: string;
  code?: number;
}

class UsageError extends Error {}

// ---------------------------------------------------------------------------
// argument helpers

function str(a: Args, name: string): string | undefined {
  const v = a.values[name];
  return typeof v === 'string' ? v : undefined;
}

function flag(a: Args, name: string): boolean {
  return a.values[name] === true;
}

function list(a: Args, name: string): string[] | undefined {
  const v = str(a, name);
  if (v === undefined) return undefined;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function one(a: Args, what: string): string {
  if (a.positionals.length !== 1) throw new UsageError(`expected one ${what}`);
  return a.positionals[0] as string;
}

function text(a: Args, what: string): string {
  if (a.positionals.length === 0) throw new UsageError(`expected ${what}`);
  return a.positionals.join(' ');
}

function none(a: Args): void {
  if (a.positionals.length > 0) throw new UsageError(`unexpected argument: ${a.positionals[0]}`);
}

/** `<file>:<text>`, split at the first colon. */
function quote(spec: string): { file: string; text: string } {
  const i = spec.indexOf(':');
  if (i <= 0 || i === spec.length - 1) throw new UsageError(`--quote must be <file>:<text>, got ${JSON.stringify(spec)}`);
  return { file: spec.slice(0, i), text: spec.slice(i + 1) };
}

function writeInput(a: Args, quotes: { file: string; text: string }[] | undefined): RememberInput {
  const title = str(a, 'title');
  if (title === undefined) throw new UsageError('--title is required');
  const input: RememberInput = { text: text(a, 'the text to remember'), title };
  if (quotes !== undefined) input.quotes = quotes;
  const tag = str(a, 'tag');
  if (tag !== undefined) input.tag = tag as Tag; // the write gate lints it
  const key = str(a, 'key');
  if (key !== undefined) input.key = key;
  const supersedes = list(a, 'supersedes');
  if (supersedes !== undefined) input.supersedes = supersedes;
  const cites = list(a, 'cites');
  if (cites !== undefined) input.cites = cites;
  if (flag(a, 'local')) input.local = true;
  return input;
}

// ---------------------------------------------------------------------------
// human output

function block(s: Served): string {
  const meta = [`id: ${s.id}`, `state: ${s.state}`, s.type === 'memory/fact' ? 'fact' : 'note'];
  if (s.tag !== null) meta.push(`tag: ${s.tag}`);
  if (s.key !== null) meta.push(`key: ${s.key}`);
  const lines = [`## ${s.title}`, meta.join(' · ')];
  const labels = [...s.warnings, ...s.labels];
  if (labels.length > 0) lines.push(`labels: ${labels.join(', ')}`);
  if (s.paths.length > 0) lines.push(`quotes: ${s.paths.join(', ')}`);
  lines.push('', s.body);
  return lines.join('\n');
}

function served(r: RecallResult | Abstain): Outcome {
  if (r.abstain) {
    return { data: r, text: [`I don't know: ${r.reason}`, ...r.hints.map((h) => `  ${h}`)].join('\n'), code: EXIT_ABSTAIN };
  }
  return { data: r, text: r.served.map(block).join('\n\n') };
}

function lines(items: string[], empty: string): string {
  return items.length === 0 ? empty : items.join('\n');
}

// ---------------------------------------------------------------------------
// verbs

const VERBS: Record<string, Verb> = {
  remember: {
    usage: 'remember <text> --title <t> --quote <file>:<text> … [--tag t] [--key k] [--supersedes id,…] [--cites id,…] [--local]',
    summary: 'store a fact that quotes the code it relies on',
    options: { ...WRITE, quote: { type: 'string', multiple: true } },
    async run(e, a) {
      const raw = a.values.quote;
      const quotes = (Array.isArray(raw) ? raw : []).map((q) => quote(String(q)));
      const r = await e.remember(writeInput(a, quotes));
      return { data: r, text: [`${r.id} ${r.state}`, ...r.notes].join('\n') };
    },
  },
  note: {
    usage: 'note <text> --title <t> [--tag t] [--key k] [--supersedes id,…] [--cites id,…] [--local]',
    summary: 'store a decision or preference (no quotes)',
    options: WRITE,
    async run(e, a) {
      const r = await e.note(writeInput(a, undefined));
      return { data: r, text: [`${r.id} ${r.state}`, ...r.notes].join('\n') };
    },
  },
  recall: {
    usage: 'recall <query> [--budget n] [--include state,…]',
    summary: 'the records matching a query that hold here, or I don\'t know',
    options: { budget: { type: 'string' }, include: { type: 'string' } },
    async run(e, a) {
      const query = text(a, 'a query');
      const opts: { query: string; budgetTokens?: number; include?: State[] } = { query };
      const budget = str(a, 'budget');
      if (budget !== undefined) {
        if (!/^\d+$/.test(budget)) throw new UsageError('--budget must be a non-negative whole number');
        opts.budgetTokens = Number(budget);
      }
      const include = list(a, 'include');
      if (include !== undefined) {
        const bad = include.find((s) => !Object.hasOwn(STATES, s));
        if (bad !== undefined) throw new UsageError(`--include: unknown state ${bad} (one of ${Object.keys(STATES).join(', ')})`);
        opts.include = include as State[];
      }
      return served(await e.recall(opts));
    },
  },
  about: {
    usage: 'about <path|key>',
    summary: 'the records quoting a path, or in the chain of a key',
    options: {},
    async run(e, a) {
      return served(await e.about(one(a, 'path or key')));
    },
  },
  history: {
    usage: 'history <id|key>',
    summary: 'the chain of an id or key, oldest first',
    options: {},
    async run(e, a) {
      const target = one(a, 'id or key');
      const h = await e.history(target);
      const rows = h.map(
        (x) =>
          `${x.id} ${x.state}${x.forgotten ? ' (forgotten)' : ''} ${x.recorded} ${x.observer} ${x.title}` +
          (x.supersedes.length > 0 ? ` ← supersedes ${x.supersedes.join(', ')}` : ''),
      );
      return { data: h, text: lines(rows, `no history for ${target}`) };
    },
  },
  verify: {
    usage: 'verify [--files a,b]',
    summary: 'derive every record (or those quoting the files) and report what changed',
    options: { files: { type: 'string' } },
    async run(e, a) {
      none(a);
      const files = list(a, 'files');
      const r = await e.verify(files === undefined ? {} : { files });
      const counts = Object.entries(r.states)
        .filter(([, n]) => n > 0)
        .map(([s, n]) => `${n} ${s}`)
        .join(', ');
      const changed = r.changed.map((c) => `${c.id} ${c.from ?? 'new'} → ${c.to}`);
      return { data: r, text: [...changed, counts === '' ? 'no records' : counts].join('\n') };
    },
  },
  forget: {
    usage: 'forget <id…> | --query <q> --confirm | --all --confirm',
    summary: 'delete records (and those citing them) and say what could not be reached',
    options: { query: { type: 'string' }, all: { type: 'boolean' }, confirm: { type: 'boolean' } },
    async run(e, a) {
      const query = str(a, 'query');
      const all = flag(a, 'all');
      const modes = [a.positionals.length > 0, query !== undefined, all].filter(Boolean).length;
      if (modes !== 1) throw new UsageError('forget takes ids, or --query <q> --confirm, or --all --confirm');
      let scope: ForgetScope;
      if (a.positionals.length > 0) scope = { ids: a.positionals };
      else {
        if (!flag(a, 'confirm')) throw new UsageError(`forget ${all ? '--all' : '--query'} needs --confirm`);
        scope = query !== undefined ? { query, confirm: true } : { all: true, confirm: true };
      }
      const r = await forget(e, scope);
      const out = [
        `deleted: ${r.deleted.length === 0 ? 'none' : r.deleted.join(', ')}`,
        `cascaded: ${r.cascaded.length === 0 ? 'none' : r.cascaded.join(', ')}`,
        `compaction: ${r.compaction}`,
      ];
      if (r.unreachable.length > 0) out.push('not reachable from here:', ...r.unreachable.map((u) => `  ${u}`));
      return { data: r, text: out.join('\n') };
    },
  },
  publish: {
    usage: 'publish [id…]',
    summary: 'move pending records into .elmory/facts (all when no id is given)',
    options: {},
    async run(e, a) {
      const moved = e.publish(a.positionals.length > 0 ? a.positionals : undefined);
      return { data: { published: moved }, text: lines(moved.map((id) => `published ${id}`), 'nothing to publish') };
    },
  },
  review: {
    usage: 'review',
    summary: 'every candidate with its reason',
    options: {},
    async run(e, a) {
      none(a);
      const r = await e.review();
      return { data: r, text: lines(r.map((c) => `${c.id} ${c.reason} ${c.title}`), 'nothing to review') };
    },
  },
  approve: {
    usage: 'approve <id>',
    summary: 'trust a candidate in this worktree',
    options: {},
    async run(e, a) {
      const id = one(a, 'id');
      await e.approve(id);
      return { data: { approved: id }, text: `approved ${id}` };
    },
  },
  reject: {
    usage: 'reject <id>',
    summary: 'hide a candidate in this worktree (the file stays)',
    options: {},
    async run(e, a) {
      const id = one(a, 'id');
      await e.reject(id);
      return { data: { rejected: id }, text: `rejected ${id}` };
    },
  },
  gc: {
    usage: 'gc [--dry-run] [--restore id]',
    summary: 'archive old superseded or stale pending records and unused notes',
    options: { 'dry-run': { type: 'boolean' }, restore: { type: 'string' } },
    async run(e, a) {
      none(a);
      const restore = str(a, 'restore');
      if (restore !== undefined) {
        if (flag(a, 'dry-run')) throw new UsageError('--restore and --dry-run do not combine');
        await e.gcRestore(restore);
        return { data: { restored: restore }, text: `restored ${restore}` };
      }
      const r = await e.gc({ dryRun: flag(a, 'dry-run') });
      const verb = r.dryRun ? 'would archive' : 'archived';
      const out = [...r.archived.map((id) => `${verb} ${id}`), ...r.committed.map((id) => `due (committed, delete in a commit) ${id}`)];
      return { data: r, text: lines(out, 'nothing to collect') };
    },
  },
  rebuild: {
    usage: 'rebuild',
    summary: 'index every record file into a fresh cache',
    options: {},
    async run(e, a) {
      none(a);
      await e.rebuild();
      return { data: { rebuilt: true }, text: 'rebuilt' };
    },
  },
};

function helpText(): string {
  const width = Math.max(...Object.keys(VERBS).map((v) => v.length));
  return [
    'elmory: evidence-checked memory for coding agents',
    '',
    'usage: elmory <verb> [args] [--json] [--worktree <path>] [--observer <s>]',
    '',
    ...Object.entries(VERBS).map(([name, v]) => `  ${name.padEnd(width)}  ${v.summary}\n  ${' '.repeat(width)}  elmory ${v.usage}`),
    `  ${'help'.padEnd(width)}  this list`,
    '',
    'exit codes: 0 ok, 1 error, 2 refused, 3 conflict, 4 abstain (I don\'t know)',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// main

function oneLine(s: string): string {
  return s.replace(/\s*\n\s*/g, ' ').trim();
}

function defaultObserver(): string {
  let user = process.env.USER ?? process.env.USERNAME;
  if (user === undefined || user === '') {
    try {
      user = os.userInfo().username;
    } catch {
      user = 'unknown';
    }
  }
  return `cli:${user}`;
}

/** The top of the git worktree holding `dir` (quotes and `about` paths are relative to it), else `dir`. */
async function worktreeRoot(dir: string): Promise<string> {
  try {
    const r = await defaultExec('git', ['rev-parse', '--show-toplevel'], { cwd: dir });
    const top = r.stdout.trim();
    if (r.code === 0 && top !== '') return top;
  } catch {
    // no git: the directory itself
  }
  return dir;
}

async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === 'help' || name === '--help' || name === '-h') {
    process.stdout.write(`${helpText()}\n`);
    return EXIT_OK;
  }
  const verb = Object.hasOwn(VERBS, name) ? VERBS[name] : undefined;
  let json = rest.includes('--json');
  const fail = (code: number, kind: string, message: string, extra: Record<string, unknown> = {}): number => {
    process.stderr.write(`elmory ${name}: ${oneLine(message)}\n`);
    if (json) process.stdout.write(`${JSON.stringify({ error: kind, message: oneLine(message), ...extra })}\n`);
    return code;
  };
  if (verb === undefined) return fail(EXIT_ERROR, 'usage', `unknown verb (run elmory help)`);

  let args: Args;
  try {
    const parsed = parseArgs({ args: rest, options: { ...COMMON, ...verb.options }, allowPositionals: true, strict: true });
    args = { values: parsed.values, positionals: parsed.positionals };
    json = flag(args, 'json');
  } catch (e) {
    return fail(EXIT_ERROR, 'usage', `${(e as Error).message}; usage: elmory ${verb.usage}`);
  }

  let e: Elmory | null = null;
  try {
    const dir = path.resolve(str(args, 'worktree') ?? process.cwd());
    e = await Elmory.open({ worktree: await worktreeRoot(dir), observer: str(args, 'observer') ?? defaultObserver() });
    const out = await verb.run(e, args);
    process.stdout.write(`${json ? JSON.stringify(out.data) : out.text}\n`);
    return out.code ?? EXIT_OK;
  } catch (err) {
    if (err instanceof RefusedError) return fail(EXIT_REFUSED, 'refused', `refused (${err.reason}): ${err.message}`, { reason: err.reason });
    if (err instanceof ConflictError) {
      const heads = err.heads.length > 0 ? err.heads.join(', ') : 'none';
      return fail(EXIT_CONFLICT, 'conflict', `conflict: the chain's current heads are ${heads}; pass them in --supersedes`, { heads: err.heads });
    }
    if (err instanceof UsageError) return fail(EXIT_ERROR, 'usage', `${err.message}; usage: elmory ${verb.usage}`);
    return fail(EXIT_ERROR, 'error', err instanceof Error ? err.message : String(err));
  } finally {
    e?.close();
  }
}

process.exitCode = await main(process.argv.slice(2));
