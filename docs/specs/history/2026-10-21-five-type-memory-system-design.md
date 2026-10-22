# Five-type memory system — architecture and design

- **Status:** v2, finalised draft for owner approval. Not approved, not built. No code until
  the owner approves this spec and then a written implementation plan.
- **Date:** 2026-10-21
- **Combines:** the hash + OKF + graph plan of 2026-10-08 (councils 1–4) and the five-type
  design of 2026-10-21 (councils 6–7). Both are advisory.
- **Research behind it:** [combined report](../../research/2026-10-21-memory-types-research.md),
  [source reports](../../research/memory-types/), and §17 (sources re-checked on
  the web today).
- **Builds on (Baton):** `src/memory.ts`, `src/memory-rank.ts`, `src/memory-repair.ts`,
  `src/events.ts`, `web/src/components/GraphCanvas.tsx`, `web/src/styles/tokens.css`.

## What changed from v1 (and why)

| # | v1 logic | Problem | v2 logic |
|---|---|---|---|
| 1 | State, `valid-to` and OKF `status` stored in each file and rewritten on change | every code edit rewrote memory files → git churn, merge conflicts between branches, and a wrong state on a branch whose code differs | **Records are immutable.** Only content and evidence are stored. State, `valid-to` and current-value are **derived** at load, per worktree (§4.2) |
| 2 | Evidence = whole-file hash plus line numbers | any edit anywhere in the file marked the fact suspect; line numbers shift when lines are added above | **Excerpt anchor:** file hash + hash of the cited lines + a line hint. A changed file is re-searched for the excerpt; if found, the fact stays live and re-anchors (§4.3) |
| 3 | Suspect walk marked first, re-checked second, never restored the descendants | a fact restored by re-check left its dependents suspect for ever | **Re-evaluate, then propagate only real changes, in both directions** (§8.3) |
| 4 | Forget: a record citing a forgotten source drops that source and survives on the others | the surviving text may still contain the forgotten person's data → the forget report would lie | **Any record citing a forgotten source is deleted.** Remaining evidence can be re-derived by an agent later (§8.6) |
| 5 | Compare-and-swap on an in-memory map | each agent runs its own MCP server process; an in-memory check doesn't protect across processes (Baton's own `src/memory.ts` notes there is no cross-process interlock) | **SQLite `BEGIN IMMEDIATE` is the write lock; the file rename is the commit point**; startup reconciles (§9) |
| 6 | Supersession wrote `valid-to` into the old file | mutation, plus two branches could each pick a different "current" | **Current value is derived by one deterministic order** — every machine and branch gets the same answer, nothing rewritten (§8.4) |
| 7 | Links stored inside records; unlink deleted them | breaks immutability; an unlink left no trace or evidence | **Link and unlink are records with evidence.** Edges = links minus unlinks. Your algorithm writes both (§8.5) |
| 8 | Recall merged BM25 hits and entity hits by an unstated rule | undefined ranking | **Entities are an FTS column** → one ranked list. The entity map is for exact lookups and the graph (§8.2) |
| 9 | No branch-merge story | open gap from council 5 | **Content-addressed filenames + a git merge driver** that unions sources (§10) |
| 10 | URL evidence = hash of the page | dynamic pages change on every fetch → permanent false suspects; offline → suspect | **URL evidence uses the excerpt check too; offline = "unknown", never suspect** (§4.3) |

---

## 1. Goal

A standalone, open-source memory package that Baton later uses as its memory store. It serves
two consumers with one model:

- **Coding agents.** What earlier sessions learned about a codebase, tied to the code by hash.
  When the code under a fact changes, the fact goes suspect.
- **Chat / RAG bots.** Personalisation across conversations, resuming a stopped chat, and a
  truthful "forget me".

It covers five memory types and links and unlinks memories on evidence. Everything is stored as
readable Markdown (OKF). Hash maps and a keyword index keep it cheap at scale. The whole thing
is shown as a graph in Baton's theme.

**Non-goals for release 1:** embeddings, an LLM inside the core, automatic consolidation, a
graph database, cloud sync, A2A serving, Jev inside the core. Each has a trigger in §15.

## 2. Principles

1. **Files are the truth; every index is a rebuildable cache.**
2. **Records are immutable.** A change is a new record. The only real deletion is forget.
3. **Every state is derived from files + evidence**, never trusted from a file.
4. **No claim without live evidence.** Semantic, procedural, profile and link records cite at
   least one evidence ref. They are served only while all of it verifies.
5. **Supersession is code, not a model.** Deterministic supersession serves the current value
   0.95–1.00 of the time, against 0.20–0.47 for plain RAG (§17).
6. **Memory is untrusted data.** It is scanned, quoted, and never labelled "authoritative".
7. **"I don't know" is a valid answer.**
8. **Forget means delete, and the report tells the truth.** Person data never enters git.
9. **The release must beat memory-off.** 11 of 12 coding-memory setups did not (§17).

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1 ACCESS      MCP server · CLI · library API                           │
│               remember · recall · verify · link · unlink · forget ·    │
│               flush · snapshot · resume · graph · rebuild              │
├────────────────────────────────────────────────────────────────────────┤
│ 2 GATES       write gate: lint · evidence · secrets · injection ·      │
│  (plain code)            store rule · tombstone · duplicate            │
│               read gate:  derived state = active? → budget → abstain   │
├────────────────────────────────────────────────────────────────────────┤
│ 3 DERIVE      state engine: evidence verify · suspect walk ·           │
│  (plain code) supersession order · edge set (links − unlinks)          │
├────────────────────────────────────────────────────────────────────────┤
│ 4 INDEXES     id → record          entity → ids                        │
│  (memory +    evidence → dependents (subject, relation) → head         │
│   SQLite      FTS5 BM25 (title, body, entities, paths)                 │
│   cache)      file cache (path, mtime, size, sha256) · write lock      │
├────────────────────────────────────────────────────────────────────────┤
│ 5 TRUTH       immutable OKF Markdown records, content-addressed names  │
│               shared store → repo (git)                                │
│               person store → app-data, never in a git work tree        │
│               tombstones   → HMAC of forgotten ids                     │
├────────────────────────────────────────────────────────────────────────┤
│ 6 VIEWS       graph · recall pack · forget report · health · events    │
└────────────────────────────────────────────────────────────────────────┘
```

Only layer 5 is data. Layers 3–4 are rebuilt from it, re-reading only files whose
(mtime, size) changed. Layer 3 runs per worktree: the same records can be `active` on one branch
and `suspect` on another, because the code under them differs.

## 4. Data model

### 4.1 The record (one envelope for every kind)

OKF v0.2 frontmatter, our keys under `x-mem-` (working prefix, renamed once when the package is
named), prose body. OKF: "Consumers SHOULD preserve unknown keys when round-tripping and MUST
NOT reject documents with unrecognized fields" (SPEC §4.1).

```markdown
---
type: memory/semantic
title: Auth tokens are checked in middleware
status: stable                     # mirror for OKF-only tools (§4.2), never read back
generated: { by: "agent:claude", at: "2026-10-21T10:02:00Z" }
sources:
  - resource: src/auth/middleware.ts
    x-mem-file: "sha256:7b1e…"     # whole file at learn time
    x-mem-excerpt: "sha256:a90c…"  # cited lines, normalised
    x-mem-lines: 12                # excerpt length in lines
    x-mem-hint: 40                 # where it was; a hint only
  - resource: "mem:sha256:41ab…"   # another record (here: an episode)
x-mem-format: 1
x-mem-kind: semantic
x-mem-subject: "repo:baton"
x-mem-observer: "agent:claude"
x-mem-recorded-at: "2026-10-21T10:02:00Z"
x-mem-valid-from: "2026-10-21T10:02:00Z"
x-mem-claim: { relation: "auth.check_location", value: "middleware" }   # optional
---
Every API request goes through `checkToken()` in the auth middleware.
```

The filename is the id: `semantic/sha256-9f2c….md`.

### 4.2 Stored versus derived

| Field | Stored / derived | Rule |
|---|---|---|
| `x-mem-format` | stored | An unknown higher version is read-only |
| kind, subject, observer, claim, valid-from, recorded-at, body | stored, immutable | |
| `sources[]` | stored | The only stored field that can change, by union when the same id is written again (§8.1) |
| **id** | derived | sha256 over (kind, subject, claim or normalised body); frontmatter is never hashed |
| **state** | derived | §4.4, from evidence + supersession + tombstones + gate |
| **valid-to** | derived | the next record's valid-from in the supersession order (§8.4) |
| **current value** | derived | the head of the supersession order |
| **edges** | derived | link records minus unlink records (§8.5) |
| OKF `status` | derived mirror | Written only so OKF-only tools see distrust (§10). Never read |
| `generated` | written for OKF tools | Never read as origin; some tools overwrite it on save |

### 4.3 Evidence refs and how each is verified

| Ref | Example | Verifies when |
|---|---|---|
| file + excerpt | `src/a.ts` + excerpt hash | the file hash is unchanged, **or** the excerpt is found in the current file |
| whole file | `src/a.ts`, no excerpt | the file hash is unchanged |
| record | `mem:sha256:…` | the cited record's derived state is `active` |
| URL + excerpt | `https://…` + excerpt hash | the fetched text contains the excerpt; offline/unreachable → **unknown** (keeps its last result, never flips to suspect) |

**Excerpt check (replaces line numbers).**
- At write, the agent cites a line range. The gate reads those lines, normalises them (trims
  each line, collapses runs of whitespace, uses LF line endings) and stores only the hash and
  the line count. The code text itself is not copied into memory.
- At verify, the file hash is compared first. If it differs, a window of `x-mem-lines` lines
  slides over the new file, starting near `x-mem-hint`, and each window is hashed.
- A match means the fact stays live and re-anchors (new file hash and hint, in the cache only).
- The cost is one hash per line of the file. No parser is needed.
- Symbol-level hashing stays deferred (trigger in §15).

### 4.4 Kinds and derived states

| Kind | Holds | Required evidence | Lifetime |
|---|---|---|---|
| `working` | task state, scratch, todos for one session | none | until `flush` / session end |
| `episodic` | one utterance, tool call or outcome per record, tagged with the speaker's subject | none (it *is* evidence) | append-only; deleted by forget or retention |
| `semantic` | what is true about a repo or a person (profile, preference) | ≥ 1 ref | immutable; superseded or forgotten |
| `procedural` | `SKILL.md` + this frontmatter | its episodes/tests + an approval ref (§11) | immutable |
| `external` | a URL or path + summary | the URL/path with excerpt | immutable; re-verified in the background |
| `link` / `unlink` | an edge add or remove: `{from, to, type}` | ≥ 1 ref | immutable |

Derived state, evaluated in this order (the first match wins):

| State | Condition | OKF mirror | Served |
|---|---|---|---|
| `candidate` | failed the gate at load (lint, missing evidence, an unapproved skill) | `draft` | no |
| `superseded` | not the head of its (subject, relation) order | `deprecated` | only for "as of T" queries |
| `stale` | a cited file path or record no longer exists | `deprecated` | no |
| `suspect` | some ref does not verify | `deprecated` | no, unless asked with `include: suspect` |
| `active` | every ref verifies (or unknown with a last-known pass) | `stable` | yes |

## 5. Storage layout

```
<repo>/memory/                      shared store, tracked in git
  semantic/ procedural/ external/ link/        files named sha256-<id>.md
  .gitattributes                    *.md merge=mem   (§10)
<app-data>/<project-id>/            person store; refuses to live inside a git work tree
  episodic/<subject>/  semantic/<subject>/  link/  working/<session>/
  tombstones.log                    HMAC-SHA256(install_key, id), one per line
  cache.sqlite                      layers 3–4 cache + write lock; deletable
```

- **Store rule, enforced in code:**
  - A record whose subject is a person (`user:*`), or that cites a person's episode, is refused
    by the shared store.
  - The person store checks before its first write that it is not inside a git work tree.
- **Install key:** created locally on first run; never leaves the machine.
- **Retention for episodes** is a setting. The default keeps everything. Deletion by retention
  goes through the forget path (§8.6), so it cascades and is reported.

## 6. Indexes

| Index | Shape | Built from | Used by |
|---|---|---|---|
| Records | `Map<id, Record>` | files | everything |
| Entities | `Map<entity, Set<id>>` (subject, paths, `[[wikilinks]]`, claim relation) | files | "everything about X", graph |
| Reverse evidence | `Map<ref, Set<id>>` (files, URLs, records) | `sources` | suspect walk, forget cascade |
| Supersession | `Map<(subject, relation), id[]>` in supersession order | claims | head lookup, history |
| Edges | `Map<id, Set<(to, type)>>` = links − unlinks | link records | graph, navigation |
| FTS5 | `records_fts(title, body, entities, paths)`, ranked by `bm25(records_fts, w1..w4)` | files | recall |
| File cache | `files(path, mtime, size, sha256)` + `anchors(id, ref, file_hash, hint)` | stat + hashing | incremental load, re-anchoring |

- FTS5: a lower `bm25()` is better, and extra arguments are column weights from the left
  (SQLite docs). The weights start at 1.0 and are tuned only in the evaluation (§14).
- Measured on one machine: `stat` of 100k files ≈ 0.4 s; 100k SQLite rows ≈ 64 ms; reading 100k
  small files ≈ 8–14 s. Hence the incremental load.

## 7. End-to-end data flow

```
          agent / chat bot
   remember   recall   forget   flush   link/unlink        your code / URLs
      │         ▲        │        │          │                    │ change
      ▼         │        ▼        ▼          ▼                    ▼
 ┌─────────┐ ┌──────┐ ┌───────┐ ┌──────┐ ┌─────────┐        ┌──────────┐
 │WRITE    │ │READ  │ │FORGET │ │FLUSH │ │WRITE    │        │VERIFY    │
 │GATE §8.1│ │§8.2  │ │§8.6   │ │§8.7  │ │GATE §8.5│        │§8.3      │
 └────┬────┘ └──▲───┘ └───┬───┘ └──┬───┘ └────┬────┘        └────┬─────┘
      │ lock    │         │ lock   │          │ lock             │
      ▼         │         ▼        ▼          ▼                  ▼
 ┌──────────────┴─────────────────────────────────────────────────────┐
 │ FILES (immutable records)  ──load/rebuild──►  INDEXES + DERIVE     │
 │ new file = rename (commit) │  delete = forget only │ state, heads, │
 │                            │                       │ edges, live   │
 └────────────────────────────────────────────────────┬───────────────┘
                                                      │ events
                                                      ▼
                                     memory.write · memory.state · memory.forget
                                     → Baton SSE bus (src/events.ts) → graph view
```

There are three kinds of movement:

- **Down (writes):** gate → lock → new file → index update → event.
- **Up (reads):** indexes → derived state filter → budget → caller.
- **Sideways (verify):** a change in the outside world → reverse index → re-derive state →
  event. No file is written.

## 8. Flows

### 8.1 Remember (write)

```
1  lint            envelope shape, required keys for the kind
2  evidence        each ref resolves now; compute file hash + excerpt hash from cited lines
3  secrets         regex redaction; refuse on a high-confidence key pattern
4  injection       instruction-like text → flagged (still stored only as quoted data)
5  store rule      person subject or person evidence → person store only
6  id              sha256(kind, subject, claim | normalised body)
── BEGIN IMMEDIATE (cross-process write lock) ──────────────────────────
7  tombstone       HMAC(id) present → refuse
8  duplicate       same id → union sources into the existing file; else FTS top-k +
                   token-set Jaccard → report near-duplicates (written anyway)
9  supersession    claim present and caller passed expectedHead ≠ current head
                   → return CONFLICT(current head), write nothing
10 write           temp file → fsync → rename          ← the commit point
11 index           records, entities, reverse evidence, supersession order, FTS, anchors
── COMMIT ─────────────────────────────────────────────────────────────
12 derive + emit   state of the new record (+ the old head becomes superseded) → events
```

A crash between steps 10 and 11 is harmless. The next load finds the new file through the file
cache and indexes it.

### 8.2 Recall (read)

```
1  FTS5 BM25 over the subject's records (+ the shared store for a repo subject)
     entity names match through the `entities` column → one ranked list, no merging
2  keep only derived state = active (or the states the caller asked for)
3  rank = BM25 order; recency is only a tie-breaker ("decay ranks, never deletes")
4  pack greedily into the token budget; skip a record that doesn't fit, continue
5  each item carries a label:  src/auth/middleware.ts ✓ verified 10:02 · episode 2026-10-19
6  nothing left → { abstain: true, reason }
```

"Everything about X" (an exact entity) skips search. It is one hash-map lookup, then steps 2–6.

**Session start / each turn / resume:**

```
session start → snapshot = short index (title · id · label) of top active records, frozen
                for the session so the prompt cache stays valid
each turn     → recall for this turn only, within budget
resume chat   → working view = the last session's episodes, newest first, packed to budget
                + snapshot
```

### 8.3 Verify: suspect walk (re-evaluate, propagate only real changes)

Triggers: file watcher, Baton's commit/checkout hook, background URL check, load, and
`verify` on demand.

```
dirty    = refs whose verification result may have changed (changed files, fetched URLs)
frontier = reverse[dirty]
seen     = {}
while frontier not empty:                       # breadth-first
    r = frontier.pop()
    if r in seen: continue
    seen.add(r)
    before = state(r)
    after  = derive(r)                          # §4.3 per ref, §4.4 order
    if after ≠ before:
        emit memory.state(r, before → after)
        frontier.extend(reverse[r])              # only a real change travels on
```

- A file edit outside every cited excerpt changes nothing, so nothing travels. That is the
  early cut-off.
- A record that comes back to `active` sends the change onward too, so its dependents are
  restored. v1 left them stuck.
- `seen` makes cycles safe. Each record is evaluated at most once per walk.
- **Recovery from `suspect`:** an agent re-confirms against the new code. It calls `remember`
  with the same text and a new excerpt. Same id → sources union → the new ref verifies →
  `active`.

### 8.4 Supersession (current value): derived, deterministic

For each (subject, relation), the records with that claim are sorted by:

```
valid-from ↑, then recorded-at ↑, then id ↑   (lexicographic)
```

The last record is the **head** (current value). Every other record is `superseded`, with
`valid-to` equal to the next record's `valid-from`. Nothing is written into old files.

- **Two agents at once on one machine:** the write lock and `expectedHead` in §8.1 step 9 return
  a CONFLICT, so the slower writer sees the newer value before overwriting it.
- **Two branches merged, or two machines:** both records exist. Everyone computes the same order,
  so everyone agrees on the head. No merge conflict is possible.
- Free-prose records without a claim never supersede automatically. The conflict key for prose
  stays deferred (§15).

### 8.5 Link / unlink: where your algorithm plugs in

```
link(from, to, type, evidence[])    → new link record   {op: add,    from, to, type}
unlink(from, to, type, evidence[])  → new link record   {op: remove, from, to, type}
edges = add records − remove records, among those whose derived state is active
```

- A link whose evidence dies goes suspect through §8.3, and its edge disappears from the graph
  automatically. That is "unlink on evidence" with no extra code.
- **`sources` pin a version:** if a cited record is superseded, the citing record goes suspect,
  because its basis changed.
- **Links follow the head:** a `related` or `depends_on` edge to a superseded record is shown
  pointing at that record's current head.
- **Your algorithm** (open question 4) decides *when* to write link and unlink records. The core
  only stores them, verifies them and derives edges.
- **Optional model-free helpers** from Hindsight's source:
  - entity resolution `0.5·name + 0.3·co-occurrence + 0.2·recency(7 d)`, merge at ≥ 0.6,
    trigram pre-filter;
  - temporal links between same-kind records within 24 h, weight `max(0.3, 1 − Δh/24)`, at most
    20 per record.

### 8.6 Forget (truthful delete)

Scopes: one record · one subject · one session · everything.

```
── BEGIN IMMEDIATE ───────────────────────────────────────
1 seed       records in scope (for a person: all their episodes + records about them)
2 cascade    walk reverse index from the seeds: EVERY record that cites a deleted
             record, directly or transitively → delete (no "drop the source and keep it")
3 skills     procedural records in the cascade are deleted too and listed in the report
4 delete     unlink files · delete FTS rows · drop from maps · VACUUM cache
5 tombstone  append HMAC(id) for every deleted id
── COMMIT ────────────────────────────────────────────────
6 snapshots  any session snapshot holding a deleted id → rebuilt
7 report     { deleted, skills_removed, unreachable }
```

- **Two people in one conversation:** each utterance is a record tagged with its speaker.
  Forgetting A deletes A's utterances and every record citing them, including a record that
  also cites B. B's own utterances and records citing only B survive.
- **Why delete rather than keep:** derived text can still contain A's data, so keeping it would
  make the report false.
- **`unreachable` is always listed:** git history of the shared store (person data is never
  there by §5), other machines, the agent's current context window, and any external copy.
- **Tombstones** stop a forgotten id coming back through a backup, a re-import or a pull.

### 8.7 Flush

```
flush(session) → delete working/<session>/ → rebuild that session's snapshot → event
```

Working memory only. Never touches episodes, facts or skills.

### 8.8 Load / rebuild

```
start → stat all record files → compare with cache.files
      → parse new/changed, drop removed → re-index those
      → verify refs whose file/URL hash changed since the cache (§8.3 walk)
      → derive supersession heads and edges for touched keys
cache missing/corrupt → full rebuild from files; identical result by construction
```

## 9. Concurrency

- **One write lock across processes:** SQLite `BEGIN IMMEDIATE` on `cache.sqlite`, WAL mode,
  with a busy timeout. Each agent's own MCP server process takes it for the write section only.
  Reads need no lock.
- **The file rename is the commit point.** The cache follows the files, never the reverse, so a
  lost or corrupt cache cannot lose data.
- Losing the cache also loses the lock table. That is harmless, because the next writer
  recreates it.
- **Baton integration:** when the Baton daemon is running it can be the single writer, and
  agents call it. The lock still guards direct CLI use.

## 10. Git and branches (shared store)

- **Content-addressed filenames:**
  - Two branches adding different facts create different files, so they never conflict.
  - Two branches adding the same fact create the same filename, and only `sources` can differ.
- **Merge driver** `merge=mem` in `.gitattributes`: it unions `sources` lists and fails loudly
  on anything else. (Anything else differing under the same id cannot happen with honest
  writers.)
- **Supersession across branches** needs no merge: §8.4's order is the same everywhere.
- **States are not committed.** They depend on the checked-out code and are derived per
  worktree.
- **The OKF mirror (`status`)** is updated by `mem lint --fix` in the pre-commit hook, only for
  memory files whose derived state changed, and staged into the same commit as the code change
  that caused it. A pull request therefore shows which facts the change made suspect, which no
  surveyed project shows. The hook can be turned off.
- **Facts arriving by `git pull`** are derived like any other. A fact that fails the gate at load
  is `candidate`, so a pulled fact cannot skip the checks.

## 11. Procedural memory and self-learning

- Skills stay `SKILL.md` folders. The envelope is extra frontmatter, so existing skill tools
  keep working.
- A learned skill is `candidate` until it cites an **approval ref**: a passing test run record,
  or an owner-approval episode. Approval is evidence, so a skill also stays immutable.
- **Distil insights and validation routines, not raw traces.** Raw traces cause negative
  transfer (§17).
- Forgetting a source episode deletes the skill (§8.6).
- Consolidation is deferred. When it comes: the user's own agent writes it, it cites the source
  ids, and code checks that every cited id is live.

## 12. Interfaces

Language is open (question 3). Signatures are shown TypeScript-style.

```ts
remember(r: Envelope, opts?: { expectedHead?: Id }): { id: Id; state: State; nearDup?: Id[] } | Conflict
recall(q: { text: string; subject: Subject; budgetTokens: number; include?: State[]; asOf?: Time }):
  { items: Recalled[]; abstain?: { reason: string } }
about(entity: Entity, subject: Subject): Recalled[]
verify(scope?: Ref[]): { changed: { id: Id; from: State; to: State }[] }
link(from: Id, to: Id, type: LinkType, evidence: Ref[]): Id
unlink(from: Id, to: Id, type: LinkType, evidence: Ref[]): Id
forget(scope: ForgetScope): ForgetReport
flush(session: SessionId): void
snapshot(subject: Subject, session: SessionId): Snapshot
resume(subject: Subject, budgetTokens: number): WorkingView
graph(filter?: GraphFilter): { nodes: GraphNode[]; links: GraphLink[] }
rebuild(): { files: number; changed: number }
on(event: "memory.write" | "memory.state" | "memory.forget", fn): Unsubscribe
```

The MCP tools map one-to-one onto these. The CLI is `mem <verb>`, plus `mem lint [--fix]` and
the git merge driver `mem merge-driver`.

## 13. Graph view — design system

Built in Baton's dashboard on the existing `GraphCanvas` (`force-graph`) and the tokens in
`web/src/styles/tokens.css`. There are no new colours, fonts or libraries. Live updates come
from `memory.*` events on the existing SSE bus.

**Nodes**

| Encodes | Rule | Token |
|---|---|---|
| kind | shape: semantic ●, episodic ■, procedural ◆, external ▲, working ○ (hidden by default); evidence nodes (file, URL, person) ▢ | — |
| `active` | filled | `--clean` |
| `suspect` | filled + ring | `--dirty` |
| `stale` | outline only | `--dirty-border` |
| `superseded` | faded | `--idle` |
| `candidate` | dashed outline | `--idle-border` |
| selected / hover | ring | `--accent`, `--ring` |
| size | live dependents (reverse index), clamped | — |

**Edges**

| Type | Style | Token |
|---|---|---|
| evidence (`sources`) | hairline | `--border-strong` |
| `depends_on`, `related` | solid | `--accent-border` |
| `supersedes` (derived) | dashed, arrow to the older record | `--idle` |
| `contradicts` (reserved) | solid | `--conflict` |

**Layout and interaction**

- **Left:** filters for kind, subject, state and "only suspect". `working` and `superseded`
  are hidden by default.
- **Centre:** the graph. Clicking a node highlights its one-hop neighbourhood (existing
  `highlightSet`, `web/src/lib/graphView.ts`).
- **Right sheet:** the rendered record. Evidence rows show `✓ excerpt found (line 52)`,
  `✗ changed` or `? unknown`. For a claim, the supersession timeline. Actions: Re-verify,
  Unlink, Forget (confirm, then show the report).
- **Style:** Geist (`--font-sans`), `--radius-md`/`--radius-lg`, hairline borders; dark and
  light from the existing token sets.
- **Demo mode:** a fixture graph with every kind and state, so the screen works on the Vite dev
  origin.
- **Accessibility:** state is shown by shape/outline as well as colour, and a keyboard list sits
  beside the canvas.

## 14. Testing and release gate

| Test | Pass condition |
|---|---|
| **Memory-off A/B** on the owner's real tasks + a held-out chat set | memory-on beats memory-off on task success, or no release |
| Supersession | the head is served for every planted update; the same head on two machines and after a branch merge |
| Excerpt anchor | an edit outside the excerpt → no state change; a moved excerpt → `active` with a new hint; an edited excerpt → `suspect` |
| Suspect walk | exactly the dependents change; a restore propagates; a cycle terminates |
| Concurrency | N processes writing the same (subject, relation) with `expectedHead` → exactly one wins, the rest get CONFLICT |
| Crash | kill between rename and commit → the next load indexes the file; nothing lost |
| Forget audit | after forget, the value is absent from files, cache, FTS, snapshots; never in `git log -p -S`; a fresh clone does not contain it |
| Tombstone | re-importing a forgotten file is refused |
| Poison set | planted instruction-like records are flagged and served only as quoted data |
| Rebuild | delete the cache → identical recall results |
| OKF round-trip | a file saved by an OKF tool keeps every `x-mem-*` key; otherwise the extension strategy has failed (overturn) |
| Merge driver | the same fact added on two branches merges with a sources union and no conflict |

Report baselines together with their failures. Do not headline LoCoMo: 6.4% of its answer key
is wrong (relayed).

## 15. Deferred and rejected

| Deferred item | Trigger that brings it in |
|---|---|
| Embeddings + RRF (k = 60) multi-arm recall | BM25-only fails the memory-off gate, or fusion beats weighted FTS5 on 200+ real records |
| Jev / Clef / local NLI judge plug-in | same trigger. Jev is hosted, so memory text would leave the machine → opt-in only |
| Symbol-level hashes (tree-sitter) | excerpt anchors still mark over a third of facts suspect per ordinary commit |
| Conflict key for prose facts | planted contradictions collide on agent-written keys in ≥ 8 of 10 pairs |
| LLM consolidation, integer-id swap, task routing | the owner requests consolidation |
| Per-observer views (Honcho-style) | a second agent writes about the same person |
| A2A Agent Card (signed, read-only) | a named consumer; selection stays a capability index + outcome ledger in Baton routing |
| Skill-vs-newer-fact contradiction check | seen in replay |
| Cross-machine person memory | the owner says yes → per-subject encryption with key destruction |

**Rejected for the core:** building on an existing system (the closest fit is tigerless
agent-memory, MIT, Python); model-written fact extraction; automatic consolidation after
writes; graph ranking; belief scoring; mutable records.

## 16. Open questions for the owner

1. Approve this v2 architecture, or change it?
2. Person memory: machine-local only (as written), or synced (adds encryption)?
3. Package name, language and licence. Baton is AGPL-3.0-or-later; a permissive licence helps
   adoption.
4. Your linking/unlinking algorithm. §8.5 is the slot.
5. Any memory type beyond the five?
6. Run council 5's read-only 90-day replay first? It would now measure the excerpt-anchor
   suspect rate, which decides whether symbol hashes are needed.

## 17. Web research

### Re-checked on the web on 2026-10-21

| Source | What it confirms |
|---|---|
| [OKF SPEC.md](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md) | v0.2; `type` is required; `status: draft \| stable \| deprecated`; `stale_after`; `generated {by, at}`; `verified`; `sources[].resource` with authority/recency signals; §4.1 keep unknown keys; §6.1 link kind lives in prose. **No hash, revision, relationships, supersedes or extension namespace** → our `x-mem-*` keys |
| [SQLite FTS5](https://www.sqlite.org/fts5.html) | `bm25()` lower = better; extra arguments are per-column weights; `ORDER BY rank` is the fast path |
| [arXiv 2606.26511](https://arxiv.org/abs/2606.26511) MemStrata | deterministic (s, r, o) supersession 0.95–1.00 vs RAG 0.20–0.47; "RAG serves superseded values 15–40% of the time". Single-author preprint |
| [arXiv 2609.23570](https://arxiv.org/abs/2609.23570) VibeMemBench | "eleven of twelve solver and system pairings fail to exceed the matched memory-off baseline"; verified experience +1.1 to +4.5 points |
| [arXiv 2407.12784](https://arxiv.org/abs/2407.12784) AgentPoison | > 80% attack success at < 0.1% poison rate |
| [arXiv 2602.17913](https://arxiv.org/abs/2602.17913) TierMem | summary-first with escalation to raw evidence: 0.851 vs 0.873, 54.1% fewer input tokens |
| [arXiv 2507.05257](https://arxiv.org/abs/2507.05257) MemoryAgentBench | abstract confirms selective forgetting as a core competency; the BM25 60.5 / MemGPT 34.3 / ≤ 7% multi-hop figures are from the paper body (relayed) |
| [Graphiti](https://github.com/getzep/graphiti) (Apache-2.0) | validity windows; "old facts are invalidated — not deleted"; full lineage to episodes |

**Correction:** "only external deletion is verifiable" was our inference from
[arXiv 2510.25117](https://arxiv.org/abs/2510.25117); its abstract does not say so. Nothing
here depends on it.

### Relayed from the 2026-10-21 and 2026-10-08 research (not re-fetched today)

- Hermes, Hindsight, Honcho source reviews.
- 29-system survey.
- Papers list, Jev/Clef, A2A, rea.
- Memorix's hash-bound code refs.
- Copilot Memory's citation check.
- The OKF `excerpt` proposal (an open, unmerged proposal that matches §4.3).
- Index timings.

All are in `docs/research/memory-types/` and the auto-memory notes. The session's
web-search quota was used up, so today's checks were direct page fetches.
