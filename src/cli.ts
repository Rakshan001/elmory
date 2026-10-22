#!/usr/bin/env node
// The `elmory` command (spec §3 front ends): a thin shell over the Elmory api, one verb per
// handler. Exit codes: 0 ok, 1 other error, 2 refused, 3 conflict, 4 abstain. Errors go to stderr
// as one line; `--json` prints the result (or the error) as JSON on stdout.

import os from 'node:os';
import { type ParseArgsConfig, parseArgs } from 'node:util';
import { ConflictError, Elmory, RefusedError } from './api.js';
import type { Abstain, RecallResult, Served } from './api.js';
import type { State } from './derive.js';
import { type ForgetPreviewScope, type ForgetScope, previewForget } from './forget.js';
import type { RememberInput } from './gate.js';
import type { Tag } from './record.js';
import { resolveWorktree } from './worktree.js';

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
  /** one line for stderr, in both modes (like an error) */
  stderr?: string;
  /** e.g. 'index busy; results may be behind': stderr in human mode (`--json` has them in data) */
  warnings?: string[];
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
  if (CONTROL.test(title)) throw new RefusedError('--title must be one line of printable characters', 'title');
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
//
// Record text comes from other people's commits. Before it reaches a terminal every C0/C1
// control character (ESC, CSI, OSC, CR, BEL…) is shown as a visible `\x..` escape, so a record
// cannot move the cursor, rewrite lines, set the title or reach the clipboard. Bidi controls
// (embeddings, overrides, isolates, marks) and the Unicode line and paragraph separators are shown
// as `\u....`, so a record cannot reorder what is displayed ("Trojan Source") or break a line
// where the terminal or a log viewer does. One-line fields (title, observer, key, reason…) escape
// newlines and tabs too, so they cannot forge a line.
// `--json` output is left exactly as the api returned it.

/** Any C0 or C1 control character, DEL included. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
/** Bidi controls (U+061C, U+200E/F, U+202A–202E, U+2066–2069) and U+2028/2029. */
const INVISIBLE = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]/;
const ESCAPED = new RegExp(`${CONTROL.source}|${INVISIBLE.source}`, 'g');

function escapeControls(s: string, keep: string): string {
  return s.replace(ESCAPED, (c) => {
    if (keep.includes(c)) return c;
    const code = c.charCodeAt(0);
    return code <= 0xff ? `\\x${code.toString(16).padStart(2, '0')}` : `\\u${code.toString(16).padStart(4, '0')}`;
  });
}

/** A one-line field: every control character escaped, newlines and tabs included. */
function inline(s: string): string {
  return escapeControls(s, '');
}

/** A body: newlines and tabs kept, every other control character escaped. */
function multiline(s: string): string {
  return escapeControls(s, '\n\t');
}

function block(s: Served): string {
  const meta = [`id: ${s.id}`, `state: ${s.state}`, s.type === 'memory/fact' ? 'fact' : 'note'];
  if (s.tag !== null) meta.push(`tag: ${inline(s.tag)}`);
  if (s.key !== null) meta.push(`key: ${inline(s.key)}`);
  const lines = [`## ${inline(s.title)}`, meta.join(' · ')];
  const labels = [...s.warnings, ...s.labels].map(inline);
  if (labels.length > 0) lines.push(`labels: ${labels.join(', ')}`);
  if (s.paths.length > 0) lines.push(`quotes: ${s.paths.map(inline).join(', ')}`);
  lines.push('', multiline(s.body));
  return lines.join('\n');
}

function served(r: RecallResult | Abstain): Outcome {
  if (r.abstain) {
    return {
      data: r,
      text: [`I don't know: ${inline(r.reason)}`, ...r.hints.map((h) => `  ${inline(h)}`)].join('\n'),
      code: EXIT_ABSTAIN,
      warnings: r.warnings,
    };
  }
  return { data: r, text: r.served.map(block).join('\n\n'), warnings: r.warnings };
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
      return { data: r, text: [`${r.id} ${r.state}`, ...r.notes.map(inline)].join('\n') };
    },
  },
  note: {
    usage: 'note <text> --title <t> [--tag t] [--key k] [--supersedes id,…] [--cites id,…] [--local]',
    summary: 'store a decision or preference (no quotes)',
    options: WRITE,
    async run(e, a) {
      const r = await e.note(writeInput(a, undefined));
      return { data: r, text: [`${r.id} ${r.state}`, ...r.notes.map(inline)].join('\n') };
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
      const rows = h.entries.map(
        (x) =>
          `${x.id} ${x.state}${x.forgotten ? ' (forgotten)' : ''} ${inline(x.recorded)} ${inline(x.observer)} ${inline(x.title)}` +
          (x.supersedes.length > 0 ? ` ← supersedes ${x.supersedes.join(', ')}` : ''),
      );
      return { data: h, text: lines(rows, `no history for ${inline(target)}`), warnings: h.warnings };
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
      return { data: r, text: [...changed, counts === '' ? 'no records' : counts].join('\n'), warnings: r.warnings };
    },
  },
  forget: {
    usage: 'forget <id…> | --query <q> [--confirm] | --all [--confirm]',
    summary: 'delete records and those citing them; --query/--all without --confirm only list them',
    options: { query: { type: 'string' }, all: { type: 'boolean' }, confirm: { type: 'boolean' } },
    async run(e, a) {
      const query = str(a, 'query');
      const all = flag(a, 'all');
      const modes = [a.positionals.length > 0, query !== undefined, all].filter(Boolean).length;
      if (modes !== 1) throw new UsageError('forget takes ids, or --query <q>, or --all');
      let scope: ForgetScope;
      if (a.positionals.length > 0) scope = { ids: a.positionals };
      else if (!flag(a, 'confirm')) {
        const what: ForgetPreviewScope = query !== undefined ? { query } : { all: true };
        return forgetPreview(await previewForget(e, what));
      } else scope = query !== undefined ? { query, confirm: true } : { all: true, confirm: true };
      const r = await e.forget(scope);
      const out = [
        `deleted: ${r.deleted.length === 0 ? 'none' : r.deleted.join(', ')}`,
        `cascaded: ${r.cascaded.length === 0 ? 'none' : r.cascaded.join(', ')}`,
      ];
      if (r.unknown.length > 0) out.push(`unknown (no such record here; nothing written): ${r.unknown.join(', ')}`);
      out.push(`compaction: ${r.compaction}`);
      if (r.unreachable.length > 0) out.push('not reachable from here:', ...r.unreachable.map((u) => `  ${u}`));
      // Every id asked for was unknown: nothing happened, which a script must be able to see.
      if ('ids' in scope && r.deleted.length === 0) {
        return { data: r, text: out.join('\n'), code: EXIT_ERROR, stderr: `no such record here: ${r.unknown.join(', ')}; nothing written` };
      }
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
      return { data: r, text: lines(r.map((c) => `${c.id} ${inline(c.reason)} ${inline(c.title)}`), 'nothing to review') };
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
      const out = [
        ...r.archived.map((id) => `${verb} ${id}`),
        ...r.committed.map((id) => `due (committed, delete in a commit) ${id}`),
        ...r.staleHere.map((id) => `left (still holds in another worktree) ${id}`),
        ...r.skipped.map((x) => `skipped (${inline(x.reason)}) ${x.id}`),
      ];
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

/** `forget --query/--all` without `--confirm`: what would go, and exit 2 (§8 "confirmed first"). */
function forgetPreview(p: { seeds: { id: string; title: string }[]; cascaded: { id: string; title: string }[] }): Outcome {
  const n = p.seeds.length + p.cascaded.length;
  const row = (r: { id: string; title: string }): string => `  ${r.id} ${inline(r.title)}`;
  const out = [p.seeds.length === 0 ? 'matches: none' : 'matches:', ...p.seeds.map(row)];
  out.push(p.cascaded.length === 0 ? 'cascaded (they cite a match): none' : 'cascaded (they cite a match):', ...p.cascaded.map(row));
  const next = n === 0 ? 'nothing matches, nothing to delete' : `re-run with --confirm to delete ${n === 1 ? 'this 1 record' : `these ${n} records`}`;
  out.push(next);
  return {
    data: { preview: true, seeds: p.seeds, cascaded: p.cascaded },
    text: out.join('\n'),
    code: EXIT_REFUSED,
    stderr: `refused (confirm): nothing deleted; ${next}`,
  };
}

const HELP_SUMMARY = 'this list';

function helpText(): string {
  const width = Math.max(...Object.keys(VERBS).map((v) => v.length));
  return [
    'elmory: evidence-checked memory for coding agents',
    '',
    'usage: elmory [--json] [--worktree <path>] [--observer <s>] <verb> [args]',
    '       (--worktree: the git toplevel of that path, default the current directory)',
    '',
    ...Object.entries(VERBS).map(([name, v]) => `  ${name.padEnd(width)}  ${v.summary}\n  ${' '.repeat(width)}  elmory ${v.usage}`),
    `  ${'help'.padEnd(width)}  ${HELP_SUMMARY}`,
    '',
    'forget --query matches records containing ANY of its words (OR); run it without --confirm first to see them.',
    'exit codes: 0 ok, 1 error, 2 refused, 3 conflict, 4 abstain (I don\'t know)',
  ].join('\n');
}

function helpJson(): unknown {
  return {
    verbs: [
      ...Object.entries(VERBS).map(([name, v]) => ({ name, usage: `elmory ${v.usage}`, summary: v.summary })),
      { name: 'help', usage: 'elmory help', summary: HELP_SUMMARY },
    ],
    exitCodes: { ok: EXIT_OK, error: EXIT_ERROR, refused: EXIT_REFUSED, conflict: EXIT_CONFLICT, abstain: EXIT_ABSTAIN },
  };
}

// ---------------------------------------------------------------------------
// main

function oneLine(s: string): string {
  return s.replace(/\s*[\r\n]\s*/g, ' ').trim();
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

/** The global flags; they may come before the verb as well as after it. */
const GLOBAL_VALUE = new Set(['--worktree', '--observer']);

/** Split argv into the verb and its arguments; global flags placed before the verb join the arguments. */
function splitVerb(argv: string[]): { name: string | undefined; rest: string[] } {
  const lead: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i] as string;
    if (a === '--json' || /^--(worktree|observer)=/.test(a)) {
      lead.push(a);
      i += 1;
    } else if (GLOBAL_VALUE.has(a)) {
      lead.push(...argv.slice(i, i + 2));
      i += 2;
    } else break;
  }
  return { name: argv[i], rest: [...lead, ...argv.slice(i + 1)] };
}

/** One printable line, or refused: the observer is stamped into records and printed by history. */
function checkObserver(observer: string): string {
  if (CONTROL.test(observer) || observer.trim() === '') {
    throw new RefusedError('the observer must be one line of printable characters', 'observer');
  }
  return observer;
}

async function main(argv: string[]): Promise<number> {
  const { name, rest } = splitVerb(argv);
  let json = rest.includes('--json');
  if (name === undefined || name === 'help' || name === '--help' || name === '-h') {
    process.stdout.write(`${json ? JSON.stringify(helpJson()) : helpText()}\n`);
    return EXIT_OK;
  }
  const verb = Object.hasOwn(VERBS, name) ? VERBS[name] : undefined;
  const fail = (code: number, kind: string, message: string, extra: Record<string, unknown> = {}): number => {
    process.stderr.write(`elmory ${inline(name)}: ${inline(oneLine(message))}\n`);
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
    const observer = checkObserver(str(args, 'observer') ?? defaultObserver());
    const worktree = await resolveWorktree(str(args, 'worktree') ?? process.cwd());
    e = await Elmory.open({ worktree, observer });
    const out = await verb.run(e, args);
    process.stdout.write(`${json ? JSON.stringify(out.data) : multiline(out.text)}\n`);
    if (!json) for (const w of out.warnings ?? []) process.stderr.write(`elmory ${name}: warning: ${inline(w)}\n`);
    if (out.stderr !== undefined) process.stderr.write(`elmory ${name}: ${out.stderr}\n`);
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
