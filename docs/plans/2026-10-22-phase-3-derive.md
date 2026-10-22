# Phase 3 — evidence and derivation (R1-M4)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Tasks 1
> and 2 are disjoint (different files; Task 2 takes evidence as an injected function) and run in
> parallel.

**Goal:** from the records a worktree sees, its trust ledger, its tombstones and its file bytes,
derive one `State` per record for that worktree, with the chain rules of §6.3 and the labels of
§4.2 — lazily and memoised, never stored as truth.

**Architecture:** `evidence.ts` answers "does this source hold in this worktree?" using the
stat cache, the content-keyed evidence rows and the quote engine. `derive.ts` is pure: it takes
rows, tombstones, trust, signature info and an evidence function, and computes trust, chains,
heads, the per-worktree member and the state table of §4.6.

**Spec:** §4.2, §4.3 (at read), §4.5, §4.6, §6, §8 (tombstone semantics). Global constraints:
`docs/plans/2026-10-22-release-1-build-plan.md`.

## Review focus

1. A → B → A: three records, the third supersedes the second; head is the third, value A
   (Task 2 `A then B then A`).
2. A candidate (untrusted) record that supersedes X must not hide X (Task 2).
3. Forget B in A ← B ← C leaves C the head and A superseded; forget C → the chain abstains and A
   is not served (Task 2).
4. A quote whose file was renamed in a reachable commit must hold at the new path; from an
   unreachable commit it must be `unknown`, not `stale` (Task 1).
5. The same fact is `active` in worktree A and `suspect` in worktree B over one cache (Task 3).

---

### Task 1: `evidence.ts`

**Files:** Create `src/evidence.ts`; Test `test/evidence.test.ts`.

**Consumes:** `Cache` (`statLookup`, `statPut`, `getEvidence`, `putEvidence`, `getRename`,
`putRename`), `Git` (`head`, `tree`, `renameLookup`), `buildAnchorMap`, `locate` from
`src/quote.ts`, `Source` from `src/record.ts`.

**Produces:**

```ts
export type Outcome = 'holds' | 'suspect' | 'stale' | 'unknown';
export interface EvidenceReport { outcome: Outcome; detail: string; path: string }  // detail: 'found' | 'not-found' | 'not-unique' | 'deleted' | 'renamed' | 'unreachable-commit' | 'too-large' | 'unreadable' | 'legacy-match' | 'legacy-mismatch'
export class Evidence {
  constructor(opts: { worktree: string; cache: Cache; git: Git | null });
  contentId(relPath: string): string | null;    // stat cache (§4.3 read step 1); null when missing/unreadable; sha256 hex of bytes on miss
  check(src: Source): Promise<EvidenceReport>;  // one source
  checkAll(sources: Source[]): Promise<EvidenceReport[]>;
  resetMemo(): void;                            // per-request memo of anchor maps and content ids
}
```

Algorithm for a quote source: `contentId(path)`; if the file is missing → `git.renameLookup(src.commit, path)` cached via `getRename(commit, tree)` (whole map per (commit, tree); store each looked-up path in it): `renamed` → check at `newPath`; `deleted` → `stale`; `unknown` → `unknown`; no git → `stale`. Size > 1 MiB → `unknown: too-large`. Then `getEvidence(contentId, src.quote)`; on a miss build the anchor map once per (contentId) for this request, `locate`, and `putEvidence` for this quote. `found` → `holds`; `not-found` / `not-unique` → `suspect`. A `LegacyFileSource` holds when `sha1(bytes).slice(0,12) === src.legacyFile`, else `suspect: legacy-mismatch`.

- [ ] **Step 1: Write failing tests** in `test/evidence.test.ts` (fresh `mkdtemp` git repo and cache dir):
  - `a quote holds, and the result is served from the evidence cache the second time` (spy: the
    anchor map is built once).
  - `an edited identifier makes it suspect`.
  - `a renamed file holds at the new path` (`git mv`, commit; source `commit` = the old HEAD).
  - `an unreachable commit is unknown` (source commit `0000…`).
  - `a deleted file is stale`.
  - `a file over 1 MiB is unknown`.
  - `legacy-file holds on match and is suspect on mismatch`.
  - `two worktrees with different bytes get different outcomes over one cache` (`git worktree add`,
    edit the file in one).
- [ ] **Step 2: Run** → fails. **Step 3: Implement.** **Step 4: Run** → PASS, lint clean.
- [ ] **Step 5: Commit** `feat(evidence): per-worktree quote and legacy-file checks over the content-keyed cache`.

### Task 2: `derive.ts` (parallel with Task 1)

**Files:** Create `src/derive.ts`; Test `test/derive.test.ts`.

**Consumes:** `RecordRow` (`src/cache.ts`), `Tombstone`, `Trust` (`src/store.ts`), `AddedBy`
(`src/git.ts`), `Outcome`/`EvidenceReport` (`src/evidence.ts` — import the types only).

**Produces:**

```ts
export type State = 'candidate' | 'forgotten' | 'superseded' | 'conflict' | 'stale' | 'suspect' | 'unknown' | 'active';
export type TrustSource = 'written' | 'approved' | 'signed';
export interface Derived {
  id: string; state: State; reason: string | null;          // e.g. 'edited', 'untrusted', 'rejected', 'forget requested by an untrusted commit', 'basis replaced', 'cycle', 'not-found'
  trusted: boolean; trustSource: TrustSource | null;
  head: boolean;                                             // a global head of its chain
  labels: string[];                                          // §4.2 evidence labels + 'a newer value exists but does not hold on this branch' + 'an unreviewed newer value exists'
  evidence: EvidenceReport[];
}
export interface DeriveInput {
  records: Map<string, RecordRow>;                           // everything this worktree sees (facts + pending + local)
  tombstones: Tombstone[];
  trust: Trust;
  addedBy: Map<string, AddedBy>;                             // repo-relative path → who added it (committed records only)
  evidence: (row: RecordRow) => Promise<EvidenceReport[]>;   // the record's own sources, in order
}
export class Deriver {
  constructor(input: DeriveInput);
  trustOf(id: string): { trusted: boolean; source: TrustSource | null; reason: string | null };
  tombstoneTrusted(t: Tombstone): boolean;    // local → true; committed → true when a local twin with the same id exists or addedBy(its path).signer ∈ trust.signers
  chainOf(idOrKey: string): string[];         // ids of the connected component over supersedes edges (records and tombstone nodes), unordered
  heads(chain: string[]): string[];           // members not superseded by a trusted, non-candidate record or a trusted tombstone
  state(id: string): Promise<Derived>;        // memoised; the §4.6 table, first match wins
  all(): Promise<Map<string, Derived>>;
}
```

**Rules, in the order they are applied:**

1. **Trust** (`trustOf`): rejected → `{trusted:false, reason:'rejected'}`; in `written` or
   `approved` → trusted; else if the record's `area === 'facts'` and `addedBy` has its path with a
   `signer` in `trust.signers` → trusted (`signed`); else `untrusted`.
2. **candidate**: `row.candidate` (from the index-time checks) non-null → that reason; not
   trusted → `untrusted`/`rejected`; an untrusted tombstone names it → `forget requested by an
   untrusted commit`.
3. **forgotten**: a trusted tombstone names it.
4. **superseded**: some trusted, non-candidate, non-forgotten record S with `id ∈ S.supersedes`
   exists **and** `state(S)` is `active` or `conflict` (S holds here). A trusted tombstone node
   that supersedes it also counts (the forgotten record "held" the slot: §6.3, V2 — forget B in
   A←B←C keeps A superseded).
5. **own evidence**: every source → `holds`; any `stale` → `stale`; any `suspect` → `suspect`
   (reason from `detail`); any `unknown` → `unknown`. Then **cites**: each cited id must exist
   (else `stale: cited record gone`), be a global head of its chain (else `suspect: basis
   replaced`), and have `state ∈ {active, conflict}` (else inherit `suspect`/`stale`/`unknown`).
   A cycle through `cites` → `suspect: cycle`.
6. **conflict**: the record holds (step 5 clean) and is a global head, and another global head of
   the same chain also holds here.
7. **active** otherwise. A `memory/note` with no sources always passes step 5.

**Labels:** quote sources that hold → `evidence unchanged since <recorded date YYYY-MM-DD>`;
legacy → `whole file unchanged since <date>`; cites → `builds on <cited title>`; note →
`not code-checked · recorded <date>`. A record that is active but not a global head, while every
newer member on its branch does not hold here → add `a newer value exists but does not hold on
this branch`. A record whose superseder is `candidate` → add `an unreviewed newer value exists`.
The chain abstains when a head is forgotten: its ancestors stay `superseded` (step 4 counts the
tombstone), so nothing older is served.

- [ ] **Step 1: Write failing tests** in `test/derive.test.ts` with a small builder
  `rec(id, { supersedes, cites, key, type, area, candidate })` and an evidence stub keyed by id
  (`holds` by default, overridable per test); `trust.written` holds every local id unless a test
  says otherwise:
  - `a lone trusted fact is active and head`.
  - `A then B then A: the third record is the only head and the first two are superseded`.
  - `caller time is ignored` (an older `recorded` on the superseder changes nothing).
  - `fork: two heads that hold are both conflict`.
  - `resolve: a record superseding both heads leaves one head`.
  - `an untrusted superseder does not hide X; X is active with the unreviewed label`.
  - `forget B in A←B←C: C head, A superseded, B forgotten`.
  - `forget the head: chain abstains, A stays superseded`.
  - `newer head does not hold here: older member served with the label`.
  - `citation pin: cited head replaced → suspect basis replaced; cited record forgotten → stale`.
  - `cycle through cites is suspect`.
  - `edited file (row.candidate='edited') is candidate`.
  - `untrusted committed tombstone makes the record candidate, not forgotten`.
  - `signed commit by a trusted signer is trusted; forged author is not`.
  - `a note is active with the not-code-checked label`.
- [ ] **Step 2: Run** → fails. **Step 3: Implement** `src/derive.ts`. **Step 4:** PASS, lint clean.
- [ ] **Step 5: Commit** `feat(derive): trust, chains, heads, per-worktree member and the state table`.

### Task 3: two-worktree integration test (after 1 and 2)

**Files:** Test `test/worktrees.test.ts`.

Real git repo with two worktrees over one cache: write one fact quoting a line; edit that line in
worktree B only. Build `DeriveInput` for each worktree (same `records`, `evidence` bound to that
worktree's `Evidence`). Assert A → `active`, B → `suspect`, in the same process, and that deleting
the cache directory and re-deriving gives the same two answers. Commit
`test: the same fact is active in one worktree and suspect in another`.
