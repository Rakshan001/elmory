# Phase 2 — cache and git (R1-M3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Tasks 1
> and 2 are disjoint and run in parallel.

**Goal:** the rebuildable SQLite cache with its write lock and generation scheme, and the git
helpers (tracked check, rename lookup, batched signature lookup) behind the injectable `Exec`.

**Architecture:** `cache.ts` owns `lock.db` and `cache-<n>.db` and every table; it exposes small
row APIs and never knows about chains or states (those are Phase 3). `git.ts` is a thin class
over `Exec`; every call is one `git` invocation, and nothing is cached here (the cache layer
caches rename results by (commit, tree)).

**Tech stack:** `node:sqlite` via `createRequire`, FTS5, WAL; `node:child_process` through
`src/exec.ts`.

**Spec:** §3 (dependencies, project id), §4.3 steps at read (stat cache, rename lookup), §4.5
(batched signature lookup), §6.1, §7.2 step 1 (escaped FTS), §8 step 4 (FTS secure-delete), §9.
Global constraints: `docs/plans/2026-10-22-release-1-build-plan.md`.

## Review focus

1. A reader open on generation n during a rebuild to n+1 must see old rows or new rows, never a
   mix, and its next operation must land on n+1 (Task 2 `rebuild while reading`).
2. A stat entry written within 2 s of the file's mtime must not be trusted (Task 2 `racy stat`).
3. An FTS query such as `checkToken() middleware` must not throw (Task 2 `escaped query`).
4. A rename lookup from an unreachable commit (squash-merged branch, shallow clone) must return
   `unknown`, never `deleted` (Task 1 `unreachable commit`).
5. A forged `--author` must not count as a signer; only a verified signature does (Task 1
   `forged author is not a signer`).

---

### Task 1: `git.ts`

**Files:** Create `src/git.ts`; Test `test/git.test.ts`.

**Consumes:** `Exec`, `defaultExec` from `src/exec.ts`.

**Produces:**

```ts
export interface RenameResult { status: 'same' | 'renamed' | 'deleted' | 'unknown'; newPath?: string }
export interface AddedBy { commit: string; authorEmail: string; signer: string | null }  // signer = key fingerprint only when git reports a good signature (%G? === 'G')
export class Git {
  constructor(exec: Exec, worktree: string);
  head(): Promise<string | null>;                         // rev-parse HEAD; null when no commits or not a repo
  tree(): Promise<string | null>;                         // rev-parse HEAD^{tree}
  trackedFiles(): Promise<Set<string>>;                   // ls-files -z, repo-relative, forward slashes
  isTracked(relPath: string): Promise<boolean>;
  renameLookup(fromCommit: string, relPath: string): Promise<RenameResult>;
    // git diff -M --name-status -z <fromCommit> HEAD; non-zero exit → unknown;
    // Rxxx old new with old===relPath → renamed; D relPath → deleted; otherwise same
  addedBy(relDir: string): Promise<Map<string, AddedBy>>;  // key: repo-relative path of each file added under relDir
    // ONE call: git log --show-signature --diff-filter=A --name-only --format=%x1e%H%x1f%G?%x1f%GF%x1f%GK%x1f%ae -- <relDir>
    // signer = %GF if non-empty else %GK, only when %G? is 'G'; otherwise null
}
```

- [ ] **Step 1: Write failing tests** in `test/git.test.ts` (fresh `mkdtemp` repo per test, created
  with `defaultExec('git', ['init','-q'])`, `user.name`/`user.email` set locally in that repo,
  `commit.gpgsign=false`):
  - `head is null before the first commit and a sha after it`.
  - `trackedFiles and isTracked`.
  - `renameLookup reports same, renamed and deleted` (commit a file; rename with `git mv` and
    commit → `renamed` with `newPath`; delete and commit → `deleted`; untouched → `same`).
  - `unreachable commit` → `unknown` (pass a sha of 40 zeros).
  - `addedBy returns author and null signer for unsigned commits`.
  - `forged author is not a signer` (commit with `--author="Mallory <m@x>"` → signer null).
  - `signed commit reports a signer` — SSH signing: generate a key with
    `ssh-keygen -t ed25519 -N '' -f <tmp>/k`, configure `gpg.format=ssh`, `user.signingkey=<tmp>/k.pub`,
    `gpg.ssh.allowedSignersFile=<tmp>/allowed` containing `<email> <pubkey line>`, commit with `-S`;
    expect `signer` non-null. Skip (`it.skip`) when `ssh-keygen` is not on PATH.
- [ ] **Step 2: Run** `npx vitest run test/git.test.ts` → fails.
- [ ] **Step 3: Implement** `src/git.ts`.
- [ ] **Step 4: Run** → PASS; `npm run lint` clean.
- [ ] **Step 5: Commit** `feat(git): head, tracked files, rename lookup and batched signature lookup`.

### Task 2: `cache.ts` (parallel with Task 1)

**Files:** Create `src/cache.ts`, `test/helpers/lock-child.mjs`; Test `test/cache.test.ts`.
Modify `package.json`: add `"pretest": "tsc"` so child processes can import `dist/cache.js`.

**Consumes:** `Source` from `src/record.ts`; `StoredRecord` from `src/store.ts`.

**Produces:**

```ts
export function defaultCacheDir(projectId: string): string;
  // $XDG_CACHE_HOME/elmory/<projectId>, else ~/Library/Caches/elmory/<projectId> on darwin, else ~/.cache/elmory/<projectId>
export type EvidenceResult = 'found' | 'not-found' | 'not-unique';
export interface RecordRow {
  id: string; area: 'facts' | 'pending' | 'local'; type: 'memory/fact' | 'memory/note';
  title: string; body: string; key: string | null; tag: string | null; observer: string; recorded: string;
  supersedes: string[]; cites: string[]; sources: Source[]; paths: string[];
  candidate: string | null;   // reason from the index-time checks, null when clean
  flagged: boolean;           // injection check
  text: string;               // file text as on disk
}
export interface StatKey { mtimeMs: number; ctimeMs: number; size: number; ino: number }
export class Cache {
  static open(projectId: string, dir?: string): Cache;   // mkdir -p; opens lock.db (WAL, busy_timeout 5000), reads generation, opens cache-<n>.db (creating gen 1 with the schema when none)
  readonly dir: string;
  generation: number;
  ensureCurrent(): void;        // re-read generation from lock.db; reopen cache-<n>.db if it changed
  withWriteLock<T>(fn: () => T): T;   // BEGIN IMMEDIATE on lock.db; ensureCurrent(); fn; COMMIT (ROLLBACK + rethrow on error). Throws CacheBusyError after the 5 s busy timeout
  rebuild(fill: (fresh: Cache) => void): void;   // under the lock: create cache-<n+1>.db with the schema, call fill on a Cache bound to it, set generation n+1 in lock.db, record old file for deletion; then ensureCurrent()
  sweepOld(maxAgeMs?: number): string[];           // delete cache-<k>.db (k < current) older than maxAgeMs (default 24 h); returns deleted paths
  close(): void;
  // records
  upsertRecord(row: RecordRow): void;      // delete-then-insert; FTS kept through external-content 'delete' with the original values
  deleteRecord(id: string): { title: string; body: string } | null;   // returns the original values used for the FTS delete
  getRecord(id: string): RecordRow | null;
  allRecords(): RecordRow[];
  knownIds(): Set<string>;
  search(query: string, opts: { limit: number; offset: number; excludeIds?: Set<string> }): { id: string; score: number }[];
    // escape: split on whitespace, drop empty, each term → '"' + term.replaceAll('"','""') + '"', OR-joined; empty → []; bm25(records_fts, 4.0, 1.0, 2.0, 1.0) weights title,body,key,paths
  // derived rows
  getEvidence(contentId: string, quoteHash: string): EvidenceResult | null;
  putEvidence(contentId: string, quoteHash: string, r: EvidenceResult): void;
  statLookup(worktree: string, relPath: string, st: StatKey): string | null;   // content id, or null on miss or when the entry is racy (writtenAt - mtimeMs < 2000)
  statPut(worktree: string, relPath: string, st: StatKey, contentId: string): void;
  getRename(commit: string, tree: string): Record<string, RenameResultJson> | null;
  putRename(commit: string, tree: string, map: Record<string, RenameResultJson>): void;
  getVerifyState(worktree: string, id: string): string | null;
  putVerifyState(worktree: string, id: string, state: string): void;
  getMeta(k: string): string | null; setMeta(k: string, v: string): void;
  compact(): 'done' | 'pending';   // FTS 'optimize'; VACUUM; wal_checkpoint(TRUNCATE) retried up to 20 × 50 ms until busy = 0; 'pending' when still busy; sets meta compaction=pending/done
}
export class CacheBusyError extends Error {}
```

**Schema** (`SCHEMA` constant, applied to every new generation):
`records(id TEXT PRIMARY KEY, area, type, title, body, key, tag, observer, recorded, supersedes TEXT /*json*/, cites TEXT, sources TEXT, paths TEXT /*space-joined*/, candidate, flagged INTEGER, text)`;
`records_fts USING fts5(title, body, key, paths, content='records', content_rowid='rowid')` followed by
`INSERT INTO records_fts(records_fts, rank) VALUES('secure-delete', 1)`;
`evidence(content_id, quote_hash, result, PRIMARY KEY(content_id, quote_hash))`;
`stat(worktree, path, mtime REAL, ctime REAL, size INTEGER, ino INTEGER, content_id, written_at REAL, PRIMARY KEY(worktree, path))`;
`renames(commit, tree, json, PRIMARY KEY(commit, tree))`;
`verify_state(worktree, id, state, PRIMARY KEY(worktree, id))`;
`meta(k TEXT PRIMARY KEY, v)`. Every db: `PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000`.
`lock.db` holds `gen(k TEXT PRIMARY KEY, n INTEGER)` with one row `('generation', n)` and `old(path TEXT PRIMARY KEY, retired_at REAL)`.

`test/helpers/lock-child.mjs`: `node lock-child.mjs <cacheDir> <holdMs>` opens the cache, runs
`withWriteLock` holding for `holdMs`, prints `OK` or `BUSY`, exits 0.

- [ ] **Step 1: Write failing tests** in `test/cache.test.ts` (fresh `mkdtemp` cache dir each):
  - `open creates lock.db and cache-1.db with the schema`.
  - `upsert, get, all, knownIds, delete round-trip` (including `supersedes`/`cites`/`sources` arrays).
  - `escaped query`: `search('checkToken() middleware', …)` returns without throwing and finds a
    row whose body contains `checkToken`.
  - `search excludes ids in excludeIds and pages with offset`.
  - `evidence, stat, rename, verify_state, meta round-trip`.
  - `racy stat`: a `statPut` whose `mtimeMs` is within 2 s of now → `statLookup` returns null;
    an older mtime → returns the content id.
  - `write lock: 10 child processes, one 1500 ms holder` → spawn one child with `holdMs=1500`,
    then after 200 ms nine with `holdMs=0` and a busy timeout the children set to 500 ms via env
    `ELMORY_TEST_BUSY_MS`; expect exactly 1 `OK` from the holder, and the nine either `OK` (they
    waited) — assert all ten exit 0 and no two held the lock at once (child writes
    start/end timestamps into `meta`; assert intervals do not overlap).
  - `rebuild while reading`: open reader A and writer B on the same dir; A reads row x = 'OLD';
    B `rebuild`s with fill inserting x = 'NEW'; A's next `getRecord` (after `ensureCurrent`, which
    every public read calls) returns 'NEW'; `lock.db` generation is 2; `cache-1.db` still exists
    until `sweepOld(0)` removes it.
  - `compact returns done when no reader holds the wal`.
  - `FTS secure-delete leaves no marker bytes`: insert a record with body containing
    `zqxk7marker`, checkpoint, delete it, `compact()`, then assert the marker is absent from
    `cache-1.db` and `cache-1.db-wal` bytes (if present).
- [ ] **Step 2: Run** → fails.
- [ ] **Step 3: Implement** `src/cache.ts` and the helper; add `pretest`.
- [ ] **Step 4: Run** `npm test` → PASS; `npm run lint` clean.
- [ ] **Step 5: Commit** `feat(cache): sqlite cache with write lock, generations, fts and derived rows`.

### Task 3: index export (controller)

- `src/index.ts` re-exports `Git`, `Cache` and their types. `npm test` green. Commit `chore: export cache and git`.
