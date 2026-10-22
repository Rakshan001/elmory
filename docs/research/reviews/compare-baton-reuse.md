# Five-type memory spec vs Baton today — reuse map

Spec: `docs/superpowers/specs/2026-10-21-five-type-memory-system-design.md` (v2, 604 lines).
Baton read: `src/memory.ts` (1655), `src/memory-rank.ts`, `src/memory-repair.ts`,
`src/memory-durability.ts`, `src/memory/consolidate.ts`, `src/memory/delegate.ts`, `src/mcp.ts`,
`src/events.ts`, `src/server.ts`, `src/util/lock.ts`, `src/history.ts`, `src/skills/*`,
`src/hooks-git.ts`, `web/src/components/GraphCanvas.tsx`, `web/src/features/KnowledgeGraph.tsx`,
`web/src/features/Memory.tsx`, `web/src/styles/tokens.css`.
All line numbers below came from `grep -n` or `Read` in this session (2026-10-21). Read-only; nothing in the repo was changed.

Effort scale (one developer): S = under 1 day · M = 1–3 days · L = 1–2 weeks.

## 1. Mapping table

| # | Spec component (§) | Verdict | What Baton has (file:line) | Gap / how it differs | Effort |
|---|---|---|---|---|---|
| 1 | Record format + ids (§4.1, §4.2) | **MODIFY** | One `.md` per fact, gray-matter frontmatter `id,type,agent,author,task,created,commit,files,supersedes,fingerprint,local_only` (`src/memory.ts:297-317`). Id = slug of the first 6 words `mem-…` (`memory.ts:157-170`), with a sha1 suffix only on a live collision (`memory.ts:759-762`). Filename = id, guarded by `SAFE_FACT_ID` (`memory.ts:353`). Fingerprint is derived, not read from the file (`memory.ts:377-391`), which already matches spec principle 3 | Needs OKF envelope (`type: memory/<kind>`, `sources[]`, `x-mem-*` keys), and a content-addressed `sha256(kind, subject, claim\|body)` id. A `sha256-<64hex>` name (71 chars) fits `SAFE_FACT_ID`. **Unknown keys are dropped:** `parseFactFile` builds a fresh object (`memory.ts:355-397`) and `renderFactFile` writes back only known keys, so any OKF-tool round-trip loses `x-mem-*`. That fails the spec's OKF round-trip test | M |
| 2 | Evidence anchors: excerpt hash + hint, record refs, URL refs (§4.3) | **MODIFY** | Whole-file `sha1(...).slice(0,12)` (`memory.ts:653`) plus a mtime cache (`memory.ts:656-673`). Commit anchor at save (`memory.ts:743-746`). Anchors auto-derived from the fact's text (`memory.ts:1288-1299`). The re-check is a heuristic: diff the before/after lines for identifier terms, or use an explicit `path:42` (`memory-repair.ts:118-158`, `assessAnchor` at `:133`). `before` comes from `git show <commit>:<path>` (`memory.ts:1351`) | No excerpt hash, line count or hint, and no sliding-window re-search. No `mem:` record refs and no URL refs (with "unknown" when offline). Excerpt anchors would replace the term heuristic in `assessAnchor` and drop the `git show` dependency | M |
| 3 | Derived state: candidate/superseded/stale/suspect/active, per worktree (§4.4, §3) | **MODIFY** | Derived on every read: `Freshness = fresh\|aging\|stale` (`memory.ts:71`), computed in `listMemories` (`memory.ts:954-1009`). Unanchored facts age out after 50 commits (`memory.ts:946`, `:1002-1004`) | There are 3 states, not 5, and no `candidate`/`superseded`/`suspect` split. **Hashes are taken against the MAIN checkout** (`resolveRoot`→`mainRepoRoot` `memory.ts:429-450`, `fileHash` joins `mainRoot` `:657-658`). That is not per worktree, so a fact cannot be `suspect` on one branch and `active` on another. **Records are mutated:** `repairMemories` and `pruneUnclaimedAnchors` rewrite fact files (`memory.ts:1398`, `:1464`). The spec keeps re-anchoring in the cache only | M |
| 4 | Suspect walk + reverse evidence index (§8.3, §6) | **NEW** | Nothing comparable. The nearest thing is `relatedByAnchors`, a per-query count of shared anchor paths (`memory.ts:1078-1089`) | Need a persistent `Map<ref, Set<id>>`, a BFS re-derive with early cut-off and `seen`, and propagation of restores. It only becomes meaningful once record→record refs (#2) exist | M |
| 5 | Supersession, derived and deterministic (§8.4) | **MODIFY** | On save, a matching fingerprint plus Jaccard ≥ 0.5 auto-supersedes (`memory.ts:751-758`, `:192`), and the old file is **moved** to the archive (`memory.ts:783-785`). `supersedeMemory` has a createdAt ordering guard (`memory.ts:1241-1258`). Background consolidation emits supersede ops and reports contradictions (`src/memory/consolidate.ts:30-46`, run from `src/daemons.ts:32`, `:342+`). The comment at `memory.ts:1225-1227` documents the race this causes ("no cross-process interlock") | The spec has no fingerprint guess and no file moves: an explicit `(subject, relation)` claim and a sort by `valid-from, recorded-at, id`, with `expectedHead`→CONFLICT. Baton's heuristic dedup can stay as the near-dup hint (#17). Content-addressed ids (#1) remove the slug-reuse race | M |
| 6 | Link / unlink records, edges = links − unlinks (§8.5) | **NEW** | None for memory. `src/skills/graph.ts` has `requires` / `works-with` between skills only (different domain) | New record kind, edge derivation, follow-the-head. The linking algorithm is still an open owner question (§16 Q4) | M |
| 7 | Forget (cascade, truthful report) + HMAC tombstones (§8.6) | **NEW** (conflicts with convention) | Removal is **archive-not-delete** by design: `archiveFact` "Replaces every hard-delete in the module" (`memory.ts:574-637`, archive dir `:509-518`), plus an append-only `journal.jsonl` (`memory.ts:520-537`). gc/retention/bulk all route there (`memory.ts:1485-1535`). `src/purge.ts:30-33,140` can wipe the whole memory category. HMAC is used only in team code (`src/team/pairing.ts:327`, `src/team/service-lock.ts:70`) | Needs a cascade over the reverse index (#4), real unlinks including archive copies and journal lines, tombstones, a snapshot rebuild and a report with `unreachable`. Tracked facts are already in git history, so the report must say so | M (3 d) |
| 8 | SQLite FTS5 cache, 4 weighted columns + file/anchor tables (§6, §8.8) | **MODIFY** | BM25 via an **in-memory** FTS5 table rebuilt per query, one `body` column, `porter unicode61`, synonym and identifier expansion (`memory-rank.ts:99-125`, schema `:107`). The no-persist choice is deliberate (`memory-rank.ts:9-11`). A persistent SQLite + FTS5 precedent exists in the same codebase (`src/history.ts:79-101`, `:259`; `src/reports.ts:32-49`) | Need a persisted `cache.sqlite` with `records_fts(title, body, entities, paths)` and `bm25(...)` weights, plus `files` and `anchors` tables. Incremental load works the same way the in-process mtime caches already do (`memory.ts:887-930`, `:656-673`). Keep the synonym expansion | M |
| 9 | Entity map `entity → ids` (§6, §8.2 "about X") | **NEW** | Only path-based proxies: `relatedByAnchors` (`memory.ts:1078`) and `deriveProject` (`memory.ts:90-101`) | Build from subject, paths, `[[wikilinks]]` and claim relation. Cheap once #8 exists | S |
| 10 | Cross-process write lock: `BEGIN IMMEDIATE`, rename = commit, startup reconcile (§9) | **MODIFY** | Atomic tmp+rename with per-write unique temp names (`memory.ts:319-333`). An in-process per-key mutex only (`src/util/lock.ts:20-31`, which says "In-process only"). WAL + busy_timeout already set on Baton's other DBs (`history.ts:92-101`). No `BEGIN IMMEDIATE` anywhere in `src/` | Wrap the write section of save, forget and link in `BEGIN IMMEDIATE` on the memory cache DB. Add a reconcile-on-load step | M |
| 11 | Git merge driver `merge=mem` + pre-commit `mem lint --fix` (§10) | **NEW** | Hook installer infrastructure exists and never overwrites foreign hooks (`src/hooks-git.ts:18`, `:35`, `:167-168`, `:222`, `:342`). There is no `.gitattributes` in the repo and no merge driver | Needs a driver binary/subcommand, `.gitattributes`, `git config merge.mem.driver` (a repo-config write, so it needs explicit opt-in), and a pre-commit status-mirror lint | M |
| 12 | Recall pack, token budget, abstain, frozen session snapshot, resume (§8.2) | **MODIFY** | Progressive disclosure: top 3 full bodies, then preview rows (`memory.ts:1596-1616`). Count limit 10, max 50 (`memory.ts:1149`). Stale facts are withheld and returned as re-grounding pointers (`memory.ts:1035-1073`). Brief section (`memory.ts:1630-1655`). Char-budgeted orient/brief (`src/kb/orient.ts:69`, `:137`; `src/handoff/brief.ts:62`, `:441`; `src/kb/contextpack.ts:325`). `save_progress` ledger (`src/handoff/progress-ledger.ts:218`) | The budget is counts and chars, not greedy token packing. There is no `{abstain, reason}`, no snapshot frozen per session, no `resume` from episodes, and no `asOf` queries | M |
| 13 | SSE events `memory.write / memory.state / memory.forget` (§7) | **MODIFY** | One payload-less `{ type: 'memory.updated' }` (`src/events.ts:56`), emitted at `server.ts:3095,3106,3114,3124,3132,3161,3266,3308,3581`. A debounced fs.watch on both areas (`server.ts:3589-3607`). The client subscribes in `web/src/hooks/useEvents.ts:39` | Add three typed events with payloads to the union. MCP processes write directly, so state events must come from the daemon's watcher or verify walk, not from the writer | S |
| 14 | Graph view: kind shapes, state encoding, edge styles, filters, side sheet, demo fixture (§13) | **MODIFY** (canvas) + **NEW** (screen) | `force-graph` wrapper with circle-only nodes coloured by community (`GraphCanvas.tsx:44`, painter `:85-125`), uniform `--border-subtle` links (`:64`, `:77`). Used by `KnowledgeGraph.tsx:19`, `:377`. `highlightSet` (`web/src/lib/graphView.ts:150`). Tokens present: `--clean :139`, `--dirty :144`, `--dirty-border :146`, `--conflict :149`, `--idle :160`, `--idle-border :162`, `--accent-border :135`, `--border-strong :121` (tokens.css). The memory screen is a list, polled every 30 s (`web/src/features/Memory.tsx:43`). Demo fixture is list-only (`web/src/lib/demoMemory.ts`) | GraphCanvas needs a pluggable node painter (shapes, ring, dashed or outline) and per-link style/dash. Needs a new memory-graph screen (filters, side sheet, supersession timeline, keyboard list) and a `/api/memory/graph` endpoint. **`--ring` (`tokens.css:170`) is a box-shadow value, not a colour**, so it cannot stroke on canvas; use `--focus-ring`/`--accent` instead | L |
| 15 | Procedural memory: learned skill is `candidate` until an approval ref (§11) | **MODIFY** | SKILL.md folders, catalog (`src/skills/catalog.ts:74`, `:113`). **Quarantine release bound to a content hash, fail-closed** (`src/skills/quarantine.ts:18-20`, `isReleased :100`, `releaseSkill :123`). Injection-style scan (`src/skills/scan.ts:173`). `suggest_skills` MCP (`mcp.ts:844`) | Baton skills are imported or bundled, not learned from episodes. Map "release record" to an approval-ref record and add the `x-mem-*` frontmatter. Forget-cascade deletion of skills depends on #7 | M |
| 16 | MCP / CLI interface (§12) | **MODIFY** | MCP `save_memory` (`mcp.ts:759-796`), `recall_memory` with topic / ids / limit (`mcp.ts:799-841`). CLI `baton memory list/add/migrate/rm/repair/consolidate/gc/log` (`src/main.ts:340-392`). HTTP `/api/memory*` (`server.ts:3083-3266`). Tool help (`src/mcp-help.ts:29`, `:39`) | Add `verify, link, unlink, forget, flush, snapshot, resume, graph, rebuild, about`, plus `expectedHead`/CONFLICT on save. All writes over HTTP stay behind the central Origin/CSRF gate (per project memory) | M |
| 17 | Write gate: secrets, near-duplicates, lint (§8.1 steps 1, 3, 8) | **EXISTS** | Secret refusal patterns + runtime secrets (`memory.ts:202-263`). Durability gate (`memory-durability.ts:202`, extra to the spec, keep it). Length limits (`memory.ts:707-708`). Near-dup hints by Jaccard (`memory.ts:183-196`, `:787-796`). Path sanitising (`memory.ts:275-285`) | Reuse as is. The spec says "redact"; Baton refuses, which is stricter | S |
| 18 | Injection flag + "memory is untrusted, never authoritative" (§2 p6, §8.1 step 4) | **NEW** | Quoting helpers exist (`src/handoff/untrusted.ts:21-23`, `:102`, `:141`, `:161`) and are used by delegate (`src/memory/delegate.ts:56`), but **not on recall**. Tool help tells agents "hits are safe to trust" (`src/mcp-help.ts:40`). The brief header reads "evidence-checked" (`memory.ts:1654`) | Flag instruction-like text at write and fence or quote it on serve. Reword the help text | S |
| 19 | Store rule: person store outside any git work tree, install key (§5) | **NEW** (conflicts) | Two areas: `baton/memory/facts` **tracked by default** and `.baton/memory/facts` gitignored (`memory.ts:487-507`, default tracked `:733-735`). `.baton/` is gitignored (`.gitignore:36`) but still **inside** the work tree. A `preference` type exists (`memory.ts:31`) and is written to the tracked area by default | Needs an app-data store with a "not inside a git work tree" check, `user:*` subject refusal on the shared store, and an install key | M |
| 20 | Kinds: episodic, working, external (§4.4) | **NEW** | Types are all semantic flavours: `decision\|gotcha\|convention\|reference\|preference` (`memory.ts:31-32`). The nearest relatives are commit history FTS (`history.ts:259`, MCP `search_history` `mcp.ts:711`) and the `save_progress` ledger (`mcp.ts:634`) | Episodic records (per-utterance, speaker-tagged), working memory with flush, and external URL records with background re-verify | M (3 d) |
| 21 | Incremental load / rebuild (§8.8) | **EXISTS** (in-process) | mtime-keyed fact and hash caches (`memory.ts:886-930`, `:656-673`) | Move into the persisted file table with #8. The "delete cache → identical result" property already holds, because files are the truth | S |
| 22 | Memory-off A/B release gate + test matrix (§14) | **NEW** | 25+ memory unit tests exist (`test/memory-*.test.ts`), but no task-success A/B harness | Spec principle 9 says no release without it | M (3 d) |
| 23 | Migration of existing facts to the new envelope | **NEW** | Precedent: `migrateMemory` (`memory.ts:833-884`), re-scanning with a dry run | Map type→kind, `files@hash`→`sources[]`, slug→content id. Re-anchoring old facts needs an excerpt, so most old facts start whole-file-only | S–M (1 d) |

**Counts (23 rows):** EXISTS 2 · MODIFY 11 · NEW 10.
For the 16 components the brief named (rows 1–16): EXISTS 0 · MODIFY 11 · NEW 5.

## 2. Conflicts with Baton conventions or current behaviour

1. **SQLite is not a new dependency.** `node:sqlite` is built in. It already backs persistent `history.db` with WAL, busy_timeout and FTS5 (`src/history.ts:85-101`, `:259`; `src/reports.ts:38-49`), and in-memory FTS5 recall (`memory-rank.ts:19-35`). `engines.node >=24` (`package.json:49`). The preflight enforces Node 24 because of FTS5 (`src/util/node-preflight.ts:15-16`, `:24`). Local Node is v26.3.0, and an FTS5 smoke test passed. `package.json:57-63` deps: MCP SDK, commander, execa, gray-matter, zod. **No conflict** with the zero-dependency daemon. Unverified: whether Electron 44's embedded Node has FTS5; the desktop app runs the daemon.
2. **Branch model vs "memory lives only in the main checkout".** Baton deliberately resolves every read and write to the main repo root, never the worktree (`memory.ts:13-16`, `:419-450`). The spec assumes records travel per branch (merge driver, "facts arriving by git pull", per-worktree derived state). Today a fact saved from a worktree lands in the main checkout's working tree, on whatever branch that checkout has. So:
   - (a) per-worktree state needs verification against the worktree root, while records still come from the main root;
   - (b) the merge driver matters far less in Baton than in the standalone package.
   Project memory warns that a "git-boundary fix would BREAK the hub", so don't move the store per-worktree.
3. **Archive-not-delete vs truthful forget.** Removal moves the file to `.baton/memory/archive` and journals the id (`memory.ts:509-518`, `:574-637`). The spec's forget must also purge archive copies and journal lines. It must also report git history as `unreachable`, because the default area is **tracked** (`memory.ts:733-735`).
4. **Git-tracked default area vs "person data never enters git".** `preference` facts (`memory.ts:31`) go to tracked `baton/memory/facts` unless `local_only`. The gitignored area is still inside the work tree, which the spec's person store forbids.
5. **Mutable records.** Repair and anchor-prune rewrite tracked fact files (`memory.ts:1398`, `:1464`). Supersede and remove move them (`memory.ts:783-785`, `:626`). The code itself admits the result is unrequested `git status` churn (`memory.ts:385-390`). The spec makes every record immutable, which removes this churn.
6. **Trust labelling.** `recall_memory` help says "hits are safe to trust" (`src/mcp-help.ts:40`), against spec principle 6.
7. **Scale caps.** `FACT_CAP = 500` (`memory.ts:125`) and a per-query in-memory FTS rebuild are sized for 500 facts. Episodic records would blow past this immediately.
8. **Git config writes.** The merge driver needs `git config merge.mem.driver`. Baton's hook installer only writes hook files (`src/hooks-git.ts`). This needs an explicit opt-in, and any git call must go through `src/util/exec.ts` (memory.ts already does at `:25`).
9. **Demo mode.** A memory-graph screen needs a new fixture. `web/src/lib/demoMemory.ts` is list-shaped and must stay for the current Memory screen.
10. **Licence.** The spec targets a standalone package (§16 Q3 permissive?). Every reused Baton file is AGPL-3.0-or-later (headers, `package.json` license). Code lifted out of Baton keeps AGPL unless the owner relicenses it.

## 3. Effort

| Rows | Days |
|---|---|
| 1 Record/ids | 2 |
| 2 Excerpt anchors | 2 |
| 3 Derived state | 2.5 |
| 4 Suspect walk | 2 |
| 5 Supersession | 2 |
| 6 Links | 2 |
| 7 Forget+tombstones | 3 |
| 8 FTS cache | 2 |
| 9 Entity map | 0.5 |
| 10 Write lock | 1.5 |
| 11 Merge driver + lint | 2.5 |
| 12 Recall/budget/snapshot | 2 |
| 13 SSE | 0.5 |
| 14 Graph view | 7 |
| 15 Procedural gate | 2 |
| 16 MCP/CLI | 2 |
| 17 Write gate | 0.5 |
| 18 Injection/trust | 0.5 |
| 19 Person store | 2.5 |
| 20 Episodic/working/external | 3 |
| 21 Incremental load | 0.5 |
| 22 A/B gate | 3 |
| 23 Migration | 1 |
| **Total** | **~46 dev-days ≈ 9 weeks** (realistic range 7–12 with the §14 test matrix) |

Rough share already built: about **30% by effort**. Rows 2, 3, 5, 8, 10, 12, 16 and 17 sit on real, tested Baton code. Only 2 of 23 rows can be reused as they are.

## 4. Smallest high-value subset (do inside Baton first)

The goal: a coding-agent memory that is trustworthy, doesn't churn git, and beats memory-off. Leave out person, chat, links, graph and the merge driver.

1. **Immutable content-addressed records + OKF envelope + migration** (rows 1, 23). This ends the slug-reuse race and the git churn. 3 d
2. **Excerpt anchors, re-anchored in the cache only, verified against the caller's worktree** (rows 2, 3). This cuts false-stale and makes state per branch. 4.5 d
3. **Explicit-claim supersession with `expectedHead` under a `BEGIN IMMEDIATE` lock** in a persisted `.baton/memory/cache.sqlite` with weighted FTS5 (rows 5, 8, 10). This reuses the history.db patterns. 5.5 d
4. **Untrusted labelling on recall + fix the "safe to trust" wording** (row 18). 0.5 d
5. **Typed `memory.state` events** (row 13), so the existing Memory screen shows suspects live. 0.5 d
6. **Memory-off A/B harness** (row 22). The spec makes it a release gate. 3 d

**Subset ≈ 17 dev-days (~3.5 weeks).** It delivers spec principles 1–7 and 9 for the coding-agent consumer.

Deferred: forget/tombstones and the person store, which only matter once person or chat data exists. Also links, suspect walk and the entity map, which need record→record refs first. Then the graph screen, the merge driver and the procedural gate.
