# Phase 1 — records, store and quote engine (R1-M1 + R1-M2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Tasks 1–2
> share files and run in sequence by one implementer. Task 3 is disjoint and runs in parallel.

**Goal:** the data layer of Elmory: a record format with a content-addressed id, the on-disk
areas with atomic writes, the trust ledger and tombstone files, and the quote engine that locates
and hashes quoted code.

**Architecture:** three modules with no shared mutable state. `record.ts` is pure (text ↔
object ↔ id). `store.ts` owns the directories of spec §5 and every file write. `quote.ts` is pure
(tokens, hashes, locate). `exec.ts` holds the injectable process runner the whole project uses.

**Tech stack:** TypeScript strict, ESM, Node ≥ 24, `node:crypto`, `node:fs`, vitest.

**Spec:** `docs/specs/2026-10-21-elmory-memory-design.md` §4.1, §4.2, §4.3 (write rules), §4.5
(trust file), §5, §7.5 (publish), §7.6 (archive). Global constraints:
`docs/plans/2026-10-22-release-1-build-plan.md`.

## Review focus

1. A frontmatter value containing `:`, `#`, quotes or a leading space must round-trip through
   `serialize` → `parse` unchanged (Task 1 test `round-trips awkward strings`).
2. `parse` of a record with an unknown higher `x-elmory` version must succeed and report
   `readOnly: true`, never throw (Task 1).
3. A crash between the temp write and the rename must leave no partial file in the area (Task 2
   test `leaves no temp file behind on failure`).
4. Two `writeRecord` calls with byte-identical records must produce one file, not an error
   (same id → idempotent) (Task 2).
5. The quote rules must accept `export const FACT_CAP = 500;` and refuse
   `return x;` (Task 3).

---

### Task 1: `record.ts` — the frontmatter subset, canonical form, id, lint

**Files:**
- Create: `src/record.ts`, `src/base32.ts`
- Test: `test/record.test.ts`

**Interfaces (produces):**

```ts
// src/base32.ts
export function base32(bytes: Uint8Array): string; // lowercase RFC 4648 alphabet a–z 2–7, no padding

// src/record.ts
export const FORMAT_VERSION = 1;
export type RecordType = 'memory/fact' | 'memory/note';
export type Tag = 'decision' | 'gotcha' | 'convention' | 'reference' | 'preference';
export const TAGS: readonly Tag[];
export interface QuoteSource { resource: string; quote: string; anchor: string; tokens: number; commit: string }
export interface LegacyFileSource { resource: string; legacyFile: string }   // sha1(raw)[:12], Baton import
export type Source = QuoteSource | LegacyFileSource;
export interface ElmoryRecord {
  type: RecordType; title: string; version: number; recorded: string; observer: string;
  tag?: Tag; key?: string; supersedes: string[]; cites: string[]; sources: Source[];
  legacyId?: string; imported?: boolean; body: string;
}
export class RecordError extends Error { constructor(message: string, public readonly reason: string) }
export function serialize(r: ElmoryRecord): string;        // canonical text (see below)
export function parse(text: string): { record: ElmoryRecord; readOnly: boolean };
export function recordId(r: ElmoryRecord): string;         // 'f_' + base32(sha256(serialize(r))).slice(0, 26)
export function isRecordId(s: string): boolean;            // /^f_[a-z2-7]{26}$/
export function lint(r: ElmoryRecord): string[];           // [] when clean
```

**Canonical text** (`serialize`): `---\n`, then frontmatter keys in this fixed order (which is
also sorted order of the written key names): `sources`, `title`, `type`, `x-elmory`,
`x-elmory-cites`, `x-elmory-imported`, `x-elmory-key`, `x-elmory-legacy-id`, `x-elmory-observer`,
`x-elmory-recorded`, `x-elmory-supersedes`, `x-elmory-tag`; optional keys are omitted when
absent; then `---\n`, then the body with LF endings, trailing whitespace stripped from every
line, exactly one trailing `\n`. Lists are written as `[a, b]` inline (empty: `[]`). Each
`sources` item is a `- resource: …` block with its `x-elmory-quote`, `x-elmory-anchor`,
`x-elmory-tokens`, `x-elmory-commit` (quote source) or `x-elmory-legacy-file` lines, indented
two spaces, in that order. Strings are written bare when they match `/^[A-Za-z0-9_./@-]+$/`,
otherwise double-quoted with JSON escaping. This is the whole YAML subset; `parse` accepts
exactly this shape plus `#` comments on their own line and any key order, and throws
`RecordError` (`reason: 'frontmatter'`) on anything else.

**Lint rules** (`lint` returns one string per failure): `type` must be a `RecordType`; `title`
1–200 chars; `body` 1–2000 chars; `observer` non-empty; `recorded` must be an ISO 8601 UTC string
ending in `Z`; `tag` in `TAGS` when present; `key` must match `/^[a-z0-9_.-]+$/` when present;
every id in `supersedes`/`cites` passes `isRecordId`; a `memory/fact` has ≥ 1 source; a
`memory/note` has 0 sources; each `resource` is a relative path with no `..` segment and no
leading `/`.

- [ ] **Step 1: Write failing tests** in `test/record.test.ts`:
  - `serialize then parse round-trips a fact` (all fields set) and `… a note`.
  - `round-trips awkward strings` (title `a: b #c "d" 'e'`, body with CRLF and trailing spaces →
    comes back with LF and no trailing spaces).
  - `recordId is stable and has the right shape` (`isRecordId`, same input twice → same id).
  - `recordId changes when recorded changes` (spec L1: every assertion gets its own id).
  - `parse of version 2 is readOnly`.
  - `parse rejects a record whose frontmatter has an unknown key` → throws `RecordError`.
  - `lint` cases: body > 2000 chars; fact with no sources; note with a source; bad key; bad id in
    supersedes; `..` in resource.
- [ ] **Step 2: Run `npx vitest run test/record.test.ts`** → fails (module missing).
- [ ] **Step 3: Implement `src/base32.ts` and `src/record.ts`** to the interfaces above.
- [ ] **Step 4: Run the test file** → PASS. Run `npm run lint` → clean.
- [ ] **Step 5: Commit** `feat(record): frontmatter subset, canonical id and lint`.

### Task 2: `exec.ts` + `store.ts` — areas, atomic writes, trust, tombstones, publish

**Files:**
- Create: `src/exec.ts`, `src/store.ts`
- Test: `test/store.test.ts`

**Interfaces (consumes):** Task 1's `ElmoryRecord`, `serialize`, `parse`, `recordId`.

**Interfaces (produces):**

```ts
// src/exec.ts
export interface ExecResult { stdout: string; stderr: string; code: number }
export type Exec = (file: string, args: string[], opts: { cwd: string }) => Promise<ExecResult>;
export const defaultExec: Exec;   // node:child_process execFile, never a shell; never throws on non-zero exit
export async function gitCommonDir(exec: Exec, worktree: string): Promise<string | null>;
  // `git rev-parse --git-common-dir`, realpath'd, absolute; null when not a git repo

// src/store.ts
export type Area = 'facts' | 'pending' | 'local' | 'archive';
export interface Layout {
  worktree: string;              // realpath
  commonDir: string | null;      // realpath of <git-common-dir>, null without git
  facts: string;                 // <worktree>/.elmory/facts
  tombstones: string;            // <worktree>/.elmory/tombstones   (committed)
  pending: string; local: string; archive: string; trust: string; localTombstones: string;
                                 // under <commonDir>/elmory/ … or <worktree>/.elmory/ without git
  projectId: string;             // sha256(commonDir ?? worktree).slice(0, 16) hex
}
export function resolveLayout(worktree: string, commonDir: string | null): Layout;
export interface StoredRecord { id: string; area: Area; path: string; text: string }
export interface Tombstone { id: string; supersedes: string[]; committed: boolean }
export interface Trust { written: Set<string>; approved: Set<string>; rejected: Set<string>; signers: Set<string> }
export class Store {
  constructor(layout: Layout);
  readonly layout: Layout;
  ensureDirs(): void;                                   // mkdir -p every area (idempotent)
  writeRecord(area: 'pending' | 'local', r: ElmoryRecord): string;   // returns id; temp → fsync → rename; same id already present → no-op
  readRecord(id: string): StoredRecord | null;          // searches facts, pending, local (not archive)
  listRecords(): StoredRecord[];                        // facts + pending + local, text as on disk
  appendTrust(line: `written ${string}` | `approved ${string}` | `rejected ${string}` | `signer ${string}`): void;  // append + fsync
  readTrust(): Trust;
  writeTombstone(id: string, supersedes: string[], where: 'local' | 'committed'): void;  // file body: `supersedes: [..]\n`
  readTombstones(): Tombstone[];                        // both dirs; committed:true for the worktree dir
  publish(ids?: string[]): string[];                    // move pending → facts (all pending when omitted); returns moved ids
  archive(id: string): void;                            // pending|local → archive
  restore(id: string): void;                            // archive → pending
  unlink(id: string): Area[];                           // delete from every area it is found in; returns the areas
}
```

Rules: file name is always `<id>.md`; `writeRecord` computes the id with `recordId` and refuses
(`RecordError`, reason `lint`) when `lint(r)` is non-empty; the temp file is
`<area>/.tmp-<id>-<pid>-<random>` and is removed on any failure; `readTombstones` parses
`supersedes: [a, b]`; `publish` uses `fs.renameSync` (same filesystem is not guaranteed between
common dir and worktree, so fall back to copy + fsync + unlink on `EXDEV`).

- [ ] **Step 1: Write failing tests** in `test/store.test.ts` (each test gets a fresh
  `mkdtemp` worktree; create a real git repo in it with `git init -q` through `defaultExec`
  for the git cases, and use `commonDir: null` for the no-git cases):
  - `resolveLayout puts pending under the common dir with git and under .elmory without`.
  - `writeRecord writes <id>.md whose text equals serialize(r)`.
  - `writeRecord is idempotent for the same record`.
  - `writeRecord refuses a record that fails lint`.
  - `leaves no temp file behind on failure` (make the area dir read-only, expect a throw, expect
    no `.tmp-*` file).
  - `publish moves pending records into the worktree facts dir`.
  - `trust ledger round-trips written, approved, rejected and signer lines`.
  - `tombstones round-trip in both dirs`.
  - `unlink removes a record from every area`.
  - `gitCommonDir returns null outside a repo and the .git dir inside one`.
- [ ] **Step 2: Run** `npx vitest run test/store.test.ts` → fails.
- [ ] **Step 3: Implement** `src/exec.ts` and `src/store.ts`.
- [ ] **Step 4: Run** the file → PASS; `npm run lint` → clean.
- [ ] **Step 5: Commit** `feat(store): storage areas, atomic writes, trust ledger, tombstones, publish`.

### Task 3: `quote.ts` — tokeniser, hashes, write rules, secrets, anchor map (parallel with 1–2)

**Files:**
- Create: `src/quote.ts`
- Test: `test/quote.test.ts`

**Interfaces (produces):**

```ts
export function tokenize(text: string): string[];
  // runs of [A-Za-z0-9_] or single non-space characters; ' " ` all become "; a "," directly
  // before ) ] or } (ignoring whitespace) is dropped; whitespace is never a token
export function quoteHash(tokens: string[]): string;       // 'sha256:' + hex of sha256(tokens.join('\u001f'))
export function anchorHash(tokens: string[]): string;      // 12 hex chars: 53-bit FNV-1a-style rolling hash of the first 8 tokens (fewer when the quote has fewer)
export type QuoteRefusal = 'too-short' | 'not-found' | 'not-unique' | 'secret';
export type WriteCheck =
  | { ok: true; quote: string; anchor: string; tokens: number }
  | { ok: false; reason: QuoteRefusal; count?: number };
export function checkQuoteAtWrite(fileText: string, quoteText: string): WriteCheck;
export function isLongEnough(quoteText: string): boolean;  // ≥ 16 tokens, or one line with ≥ 3 word/literal tokens and ≥ 24 non-space chars
export function containsSecret(text: string): boolean;
export interface AnchorMap { tokens: string[]; positions: Map<string, number[]> }  // anchor → start indexes
export function buildAnchorMap(fileText: string): AnchorMap;
export function locate(map: AnchorMap, q: { quote: string; anchor: string; tokens: number }): 'found' | 'not-found' | 'not-unique';
```

**Secret rule** (`containsSecret`): true when the text matches any of `AKIA[0-9A-Z]{16}`,
`ghp_[A-Za-z0-9]{36}`, `github_pat_[A-Za-z0-9_]{22,}`, `sk-[A-Za-z0-9_-]{20,}`,
`xox[baprs]-[A-Za-z0-9-]{10,}`, `-----BEGIN [A-Z ]*PRIVATE KEY-----`, `AIza[0-9A-Za-z_-]{35}`; or when
any string literal (between matching `'`, `"` or `` ` ``) of ≥ 20 characters has Shannon entropy
> 4.0 bits per character. `apiKey: process.env.STRIPE_API_KEY,` is **not** a secret (V22).

**Write check order:** `isLongEnough` → `containsSecret` (reason `secret`) → count occurrences of
the token sequence in `tokenize(fileText)` (0 → `not-found`, ≥ 2 → `not-unique` with `count`).

- [ ] **Step 1: Write failing tests** in `test/quote.test.ts`:
  - `tokenize` cases: whitespace dropped; `'a'`, `"a"` and `` `a` `` tokenise identically; `foo(a, b,)`
    and `foo(a, b)` tokenise identically; `[1, 2,]` likewise.
  - `isLongEnough accepts export const FACT_CAP = 500;` and `rejects return x;`, accepts 16 short
    tokens.
  - `checkQuoteAtWrite` refuses a duplicate line with `count: 2`, refuses a missing quote, refuses
    `const token = "ghp_` + 36 chars, accepts `apiKey: process.env.STRIPE_API_KEY,`.
  - `locate` survives: re-wrapped whitespace; Prettier single→double quotes; added trailing comma;
    quote moved to the end of the file; and reports `not-found` after an identifier rename and
    after a comment inserted inside the quote; `not-unique` after the line is duplicated.
  - `anchorHash` is 12 hex chars and equal for the same first 8 tokens.
  - `timing: 5000 quotes over 200 files locate in under 2 s` (generate 200 synthetic files of
    ~150 lines, pick 25 unique lines each, build each map once, locate all; assert elapsed < 2000 ms).
- [ ] **Step 2: Run** `npx vitest run test/quote.test.ts` → fails.
- [ ] **Step 3: Implement** `src/quote.ts`.
- [ ] **Step 4: Run** the file → PASS; `npm run lint` → clean.
- [ ] **Step 5: Commit** `feat(quote): tokeniser, quote and anchor hashes, write rules, locate`.

### Task 4: index and README stub (controller, after 1–3)

- `src/index.ts` re-exports the public names of `record.ts`, `store.ts`, `quote.ts`, `exec.ts`.
- `npm run build && npm test` green. Commit `chore: package scaffold and index`.
