# Council: which components and features the open memory package's design should contain

- **Date:** 2026-10-08
- **Status:** advisory — not acted on
- **Tier:** standard
- **Run:** 4 seats (4 subagent) · review 3/3 · diversity ✓ (spread inside one neighbourhood; no seat argued E)
- **Degraded:** brief leaned mildly toward B (all three reviewers and the chairman); web research lines are relayed; the chairman re-ran no checks of its own
- **Prior verdict:** mem-council-decision-standalone-open-memory-package (advisory, same day) settled scope, not components; mem-council-decision-combined-memory-system-build (advisory) covered build order inside Baton. Changed since: Hindsight source read (v0.10.2), Jev identified, Memorix found with hash-bound code evidence, 23-project survey, index and format research. Members were not told either recommendation.

## Question (as asked)

"so is there any better version that hashmap or that okf and can we use the hindsight logic use council ofr this aswell bcz we needed the reference right like where it lags we search all the memeory opensouve realted librarty we add all their feature in the bettter version all those have the missing feature right we tackle here with new memeroy system so our baton get better veriosn of memeory so this will works as centrlaized knowledge base and knowelege about the productadn codebase right … give me the report is what finalise u given plans find other better options exists we can add so it will become better veriosn of this right"

## Brief

DECISION: Which components and features should the design of the owner's open-source agent-memory package contain — the planned baseline as it stands, the baseline plus additions taken from other projects, a build on an existing project, or the union of what other memory libraries offer?

OPTIONS (neutral order; a seat may name a hybrid, and should say which listed additions it would take or drop):
- A · Baseline only. Markdown fact files on OKF v0.2 with extension keys; file evidence with a content hash; `suspect` marking through a reverse dependency index (evidence → facts, breadth-first, stop when a re-checked fact is unchanged); an in-memory entity → facts hash map; SQLite FTS5 BM25 keyword search; exact-hash then MinHash duplicate check. Nothing else in the first design.
- B · Baseline plus model-free additions that add no runtime dependency: SQLite as a rebuildable cache of the files (path, mtime, size, hash); FTS5 column weights; `sha256:<hex>` hashes and an `x-<pkg>-*` key prefix; link shape following open OKF proposals; a `candidate` state and a frontmatter lint as admission gate; a conflict key (hash of subject, predicate, scope); recorded time separate from valid time; multi-arm recall (keyword, entity one-hop, time) fused by reciprocal rank with a token-budget trim; regex secret redaction; usage signals in a per-machine sidecar; archive instead of delete.
- C · B plus parts that add a dependency or a model: symbol-level hashes through a parser (tree-sitter WASM); optional plug-ins for a local cross-encoder reranker, a local NLI contradiction classifier and a hosted typed-decision reranker (Jev); consolidation written by the user's own agent with source fact ids pinned and checked by code.
- D · Build on Memorix (TypeScript, Apache-2.0) rather than a new core: it already stores file and symbol hashes per memory and marks references stale; add Markdown-in-git files, OKF fields and the owner's other requirements there, as a contribution or a fork, and have Baton consume it.
- E · Union: C plus the features other libraries have — embedding/hybrid retrieval, model-written extraction of facts, entities and links, automatic consolidation after writes, a temporal knowledge graph, graph ranking (personalised PageRank), belief/confidence updating.

CONSTRAINTS:
- `grep -n -F "Daemon stays zero-dependency" CLAUDE.md` → `18:- **Daemon stays zero-dependency**: \`src/server.ts\` is raw \`node:http\`. No express/fastify.`
- `grep -n -F "REORGANISE" src/memory/delegate.ts` → `13: * **The model may REORGANISE, never ORIGINATE.**`
- Owner's product rules for Baton: Baton makes no model call itself; must work offline; no Python runtime shipped; no invented numbers shown to users.
- The owner asked for: a package that serves Baton as its central knowledge base for product and codebase; the strengths of other memory libraries added and their gaps covered; and that an option not be dismissed only because prior systems did not do it.
- One developer builds Baton and the package.

STAKES: Every feature in a published package is documented, tested and supported by one developer, and a published file format is a contract. A feature that degrades memory is paid for in every agent session that reads it. Omitting a feature that works leaves the package behind projects that have it. Building on another project ties format and roadmap to its maintainers.

GROUNDING — Baton today (main checkout, commands run 2026-10-08):
- `grep -n -F "FACT_CAP = " src/memory.ts` → `125:export const FACT_CAP = 500;` · `grep -n -F "async function fileHash" src/memory.ts` → `657:async function fileHash(mainRoot: string, relPath: string): Promise<string> {` (whole-file hash) · `grep -n -F "export type Freshness" src/memory.ts` → `71:export type Freshness = 'fresh' | 'aging' | 'stale';`
- `grep -n -F "BM25 (FTS5)" src/memory.ts` → `1170:    // BM25 (FTS5) with synonym/identifier expansion; scoreMemory is its fallback.` · `grep -n -F "RELATED_CAP = " src/memory.ts` → `1075:const RELATED_CAP = 3;` · `grep -n -F "export function rankFacts" src/memory-rank.ts` → `99:export function rankFacts<T extends MemoryFact>(facts: T[], topic: string): T[] {`
- `grep -n -F "Supersede, never delete, never rewrite" src/memory/consolidate.ts` → `13: *   2. **Supersede, never delete, never rewrite.** The only write this pass can` · `grep -n -F "Contradiction is a signal for a person" src/memory/consolidate.ts` → `17: *   3. **Contradiction is a signal for a person.** Two facts that disagree are`
- `grep -c -F "links" src/memory.ts` → 0 (same file: `grep -c -F "related"` → 10) · `grep -rl -F "embedding" src` → `src/skills/catalog.ts`, `src/skills/bundled/prompt-master/SKILL.md` only.
- Store: `ls baton/memory/facts | wc -l` → 20 · `ls .baton/memory/facts | wc -l` → 3 · `git ls-files baton/memory | wc -l` → 0. No chat/RAG consumer exists.

GROUNDING — source read 2026-10-08 (`<S>` = <scratchpad>; you may open these clones):
- OKF (`<S>/knowledge-catalog/okf/SPEC.md`): `grep -n -F "SHOULD preserve unknown keys"` → `206:SHOULD preserve unknown keys when round-tripping and MUST NOT reject` · `grep -n -F "out of scope for v0.2"` → `348:\`derived_from\`, or data lineage) is out of scope for v0.2.` · `grep -c -F "content_hash"` → 0 (same file `grep -c -F "stale_after"` → 12).
- Memorix (`<S>/survey/memorix` @ 82ff315, last commit 2026-10-02, `LICENSE` Apache 2.0; 836 stars [relayed]): `grep -n -F "observation_code_refs" src/store/sqlite-db.ts` → `295:CREATE TABLE IF NOT EXISTS observation_code_refs (` … (4 hits, first shown); that table's columns include `capturedFileHash TEXT`, `capturedSymbolHash TEXT`, `status TEXT NOT NULL` (lines 301–303 of the same block) · `grep -n -F "status = 'stale'" src/codegraph/store.ts` → `408:      SET status = 'stale', updatedAt = ?` … (4 hits, first shown) · `grep -n -F "candidate" src/memory/admission.ts` → `17:  return observation.admissionState !== 'ephemeral' && observation.admissionState !== 'candidate';` · `21:  return observation.admissionState === 'candidate';` · `39: * Code Memory link backs a non-ephemeral candidate. This deliberately does` · `grep -n -F "createHash" src/knowledge/claims.ts` → `1:import …` · `49:  return createHash('sha256').update(parts.join(String.fromCharCode(31))).digest('hex');` · `341:  return createHash('sha256').update(JSON.stringify([` · runtime data directory: `src/memory/owner.ts:20:  // The normal runtime data directory is ~/.memorix/data, so keep identity` · `wc -l src/server.ts` → 5857 · `package.json` dependencies include `@orama/orama`, `ink`, `react`, `unpdf`; optional `@lancedb/lancedb`, `better-sqlite3` · `grep -c -F "okf" README.md` → 0.
- Hindsight (`<S>/hindsight` @ 31fc17c, MIT; paths under `hindsight-api-slim/hindsight_api/`): `grep -n -F "k: int = 60" engine/search/fusion.py` → `29:def reciprocal_rank_fusion(result_lists: list[list[RetrievalResult]], k: int = 60) -> list[MergedCandidate]:` · `grep -n -F "retain_extract_facts" engine/retain/fact_extraction.py` → `2128:                scope="retain_extract_facts",` (fact extraction is a model call) · `grep -n -F "class RRFPassthroughCrossEncoder" engine/cross_encoder.py` → `1276:class RRFPassthroughCrossEncoder(CrossEncoderModel):` · `grep -n -F "ms-marco-MiniLM-L-6-v2" config.py` → `1286:DEFAULT_RERANKER_LOCAL_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"` · `grep -n -F "def invalidate" engine/memories/pg/writes.py` → `418:async def invalidate_memory(*, conn, fq_table, bank_id: str, unit_id: str, reason: str | None) -> bool:` (manual; no automatic trigger found [relayed]) · consolidation pins source ids: `engine/consolidation/consolidator.py:1171:    \`\`fact_ids\`\` pins \`\`source_fact_ids\`\` to the batch's fact ids (\`\`enum\`\`, plus` · entity resolution is plain code: `engine/memories/pg/entity_resolver.py:1345:            threshold = 0.6`. Reported by the reading agent [relayed]: the graph and temporal recall arms are seeded or gated by embeddings; the paper has no per-component ablation.
- Jev (same clone, `hindsight-docs/blog/2026-09-24-adding-jev-reranker-what-we-learned.md`): `grep -n -F "produces no text at all"` → `14:Hindsight 0.10.1 adds [Jev](https://typesafe.ai) as a reranker provider. Jev is an unusual model: it produces no text at all. …` · `grep -n -F "hosted third-party API"` → `29:- **It is a hosted third-party API**, which disqualifies it for some deployments no matter how good the numbers are.` and line 89 · `grep -n -F "Jev, ranking only (the default)"` → `114:| **Jev, ranking only (the default)** | **0.950** | **0.966** | **0.957** | **0.027** |` against local MiniLM recall@1 0.800 at 30 candidates (vendor-adjacent, LoCoMo).
- Other clones under `<S>/survey/` (letta-code, byterover-cli, claude-mem, beads, serena) and earlier ones under `<S>/` (Kage, okf-agent-memory, mem0, graphiti, memanto, honcho).

GROUNDING — web research 2026-10-08 (research agents opened the pages; every line `[relayed]`, numbers read once):
- Formats: no candidate found with more than OKF v0.2 as a base. OKF is still v0.2 with no hash field and no namespacing rule; open, unmerged proposals exist for `revision: "sha256:<hex>"`, `x-…` namespacing, typed `relationships`, `supersedes`/`contradicts`. in-toto, W3C VC and an IETF individual draft (AIMEM) define digest field shapes. GitHub Copilot Memory (hosted, closed): facts carry code citations checked against the current branch; unused facts expire after 28 days. Whether third-party OKF tools keep unknown keys on round-trip: untested.
- Index: Zoekt, Tantivy and Lucene use posting lists/FSTs built for corpora far larger than 1M short facts. Measured locally by a research agent (Node 26, one machine): reading 100k small files ≈ 8–14 s, `stat` of 100k ≈ 0.4 s, 100k rows from node:sqlite ≈ 64 ms. FTS5 supports per-column BM25 weights; Sourcegraph reports ~20% gain from field boosts (own metrics). No published winner for near-duplicate detection on 1–3 sentence texts. Graph ranking evidence (HippoRAG 2, SYNAPSE) comes from systems that need model extraction and embeddings.
- Retrieval benchmarks: MemoryAgentBench overall BM25 41.5 vs best embedding RAG 38.0 vs HippoRAG-v2 41.6; LoCoMo: fusion beats BM25 by 11.2 points Hit@1; MERIT: structured fact stores 0.70–1.00 retrieval accuracy, embedding retrieval 0.30–0.95 with seed gaps up to 0.45, hybrid below the fact store alone, agents acted on a correctly retrieved fact 55% of the time; D²ACCI: BM25/RRF fusion gave no significant gain.
- Memory quality: VibeMemBench (coding, executable tests): Mem0, SimpleMem, MemoryOS, A-MEM failed to beat memory-off in 11 of 12 pairings; hand-verified experience gave +1.1 to +4.5 points. arXiv 2605.12978: memories continuously rewritten by a model degrade and can fall below no-memory; episodic-only stayed competitive. arXiv 2607.21962: a budgeted curated map led at three weeks (96%) and fell to 72% at nine weeks through eviction; a provenance-typed graph rose to 90%. arXiv 2606.22030: Bayesian belief updating adds little over last-write-wins on LoCoMo. LoCoMo audit: 6.4% of the answer key wrong.
- Survey of 23 projects/products: none stores hash-checked evidence as Markdown in the project's git repository; none ties evidence to documents by line range plus hash; none uses one evidence model for coding and chat; Memorix and Copilot Memory are the two found that invalidate memory from code state. Mechanical features seen in code: pre-commit frontmatter lint and a worktree per memory writer (Letta Code), per-machine sidecar for ranking signals and an out-of-domain score floor (ByteRover; repository archived 2026-06, Elastic licence), agent-supplied compaction summary (Beads), reference integrity with rename propagation (Serena), render-and-shrink context budget and IDF-cosine duplicate check (claude-mem), regex secret redaction (Memorix), bitemporal fields and a contradictions table (LongMemory, schema only). Memorix exposes 48 MCP tools.

OUT OF SCOPE: whether to release a standalone package at all and whether the first release covers chat/RAG; the package name; Team Sync transport; licence enforcement of Baton; running another memory engine as a service beside Baton.

Clarifying question asked: none. Assumptions: "hashmap" = entity → facts map plus the reverse dependency index; "Hindsight logic" = its retain / recall / reflect design, not its infrastructure; "JEV" = Jev by TypeSafe.

## Seats

| Seat | Lens | Type |
|---|---|---|
| 1 | Maintainer | subagent |
| 2 | Expansionist | subagent |
| 3 | Contrarian | subagent |
| 4 | First-principles | subagent |

Tensions: Maintainer vs Expansionist (monthly upkeep of each feature vs what a fuller package unlocks) · Contrarian vs Expansionist (the owner leans toward adding every library's features; Contrarian hunts the failure in that) · First-principles vs Maintainer (is a new core the thing the goal requires, given Memorix).

## Answers

### Seat 1 — Maintainer

POSITION: B, minus valid-time and the usage sidecar until something reads them, plus from C only agent-written consolidation with code-checked source ids; reject D and E.

REASONING: One maintainer's monthly bill comes from dependencies that upgrade, behaviour that is not deterministic, and format keys that cannot be withdrawn. B's additions are plain code with deterministic tests, and its format items (`sha256:` prefix, `x-<pkg>-*` keys, `candidate`, archive) are cheapest before first publication; afterwards each is a migration. SQLite as a rebuildable cache keeps the files the only contract, so the index can be rewritten freely. Valid time and usage signals are published surface with no reader at 20 facts. C's parser and model plug-ins each add a version matrix and unreproducible bug reports. D trades my code for someone else's storage model and UI stack carried on a fork. E imports model-written memory, which the brief's evidence shows degrading.

CLAIMS:
- Memorix stores outside the repo, so D rewrites its storage layer: <scratchpad>/survey/memorix/src/memory/owner.ts:20 — "  // The normal runtime data directory is ~/.memorix/data, so keep identity"
- D inherits a UI runtime dependency: <scratchpad>/survey/memorix/package.json:151 — "    "react": "19.2.7","
- Unknown keys are only SHOULD-preserved, so namespace before publishing: <scratchpad>/knowledge-catalog/okf/SPEC.md:206 — "SHOULD preserve unknown keys when round-tripping and MUST NOT reject"
- Agent-written consolidation fits an existing rule: ~/Desktop/Developer/playground/baton/src/memory/delegate.ts:13 — " * **The model may REORGANISE, never ORIGINATE.**"
- Baton carries no parser today: `grep -c -F "tree-sitter" ~/Desktop/Developer/playground/baton/package.json` → 0; control `grep -c -F "typescript"` same file → 1.

WHAT WOULD CHANGE MY MIND: A measurement on Baton's own store showing whole-file hashes mark most facts `suspect` on unrelated edits would justify the parser. A second maintainer, or Memorix accepting Markdown-in-git upstream, would reopen D.

### Seat 2 — Expansionist

POSITION: B, plus two things from C — agent-written consolidation with pinned source ids, and format/API seams (a sub-file evidence locator, a rerank hook defaulting to passthrough) — with tree-sitter, NLI, Jev and all of D/E left out of the core.

REASONING: The upside nobody else holds is hash-checked evidence as Markdown in git; the survey found no project doing it. If that works, the package becomes the reference OKF extension for evidence, and the published format is the asset. So spend on what is irreversible: `sha256:` shape, `x-` prefix, conflict key, bitemporal fields, and an evidence record that can carry a line-range or symbol locator later without a format break. Runtime features are reversible; a contract is not. Seams cost one interface each and keep rerankers, symbol hashes and chat evidence open as later plug-ins, not rewrites. Consolidation by the user's agent is nearly free here because Baton already enforces it. D surrenders the format to another roadmap; E imports model-written memory, which the cited studies show degrading below memory-off.

CLAIMS:
- Baton already ships the reorganise-only consolidation rule. src/memory/delegate.ts:13 — " * **The model may REORGANISE, never ORIGINATE.**"
- Baton evidence is whole-file today, so a locator field is new format surface. src/memory.ts:657 — "async function fileHash(mainRoot: string, relPath: string): Promise<string> {"
- OKF tolerates extension keys. <S>/knowledge-catalog/okf/SPEC.md:206 — "SHOULD preserve unknown keys when round-tripping and MUST NOT reject"
- A passthrough reranker default has precedent. <S>/hindsight/hindsight-api-slim/hindsight_api/engine/cross_encoder.py:1276 — "class RRFPassthroughCrossEncoder(CrossEncoderModel):"
- Symbol-level hashing is proven feasible elsewhere. <S>/survey/memorix/src/store/sqlite-db.ts:302 — "  capturedSymbolHash TEXT,"

WHAT WOULD CHANGE MY MIND: A round-trip test showing common OKF tools strip unknown keys (then the extension strategy fails and D or a private format wins); or a measurement on Baton's own store that whole-file hashing marks most facts suspect per commit, which would promote symbol hashes from seam to core.

### Seat 3 — Contrarian

POSITION: A plus only B's format-and-safety items (`sha256:<hex>`, `x-<pkg>-*` prefix, SQLite as rebuildable cache, archive-not-delete, secret redaction, frontmatter lint); drop B's conflict key, bitemporal fields, multi-arm RRF, usage sidecar and `candidate` state from the first design.

REASONING: B looks free because it adds no dependency; its cost is contract surface. Most likely failure: the conflict key silently never fires. Facts are free prose with a hand-written slug; hashing subject/predicate/scope needs fields nobody has, so the writing agent must invent them, and two agents phrasing "auth gate" versus "owner check" hash differently. No error; the feature just detects nothing. We would notice only by planting contradicting pairs and counting hits; with 20 facts no ranking change is measurable either. RRF's evidence is contested (D²ACCI no gain; MERIT hybrid below the fact store alone).

CLAIMS:
- Facts are one prose string. ~/Desktop/Developer/playground/baton/src/memory.ts:42 — "  fact: string;"
- `grep -n -F "predicate" src/memory.ts` → no matches; `grep -n -F "subject" src/memory.ts` → no matches (control, same tool and file: `grep -c -F "related"` → 10).
- Existing dedupe key: a free-text slug. ~/Desktop/Developer/playground/baton/baton/memory/facts/mem-a-hub-s-repo-list-is.md:14 — "fingerprint: hub-repo-list-owner-only-control"
- Model origination is already forbidden. ~/Desktop/Developer/playground/baton/src/memory/delegate.ts:13 — " * **The model may REORGANISE, never ORIGINATE.**"

WHAT WOULD CHANGE MY MIND: A planted-contradiction test on Baton's own store where agent-written conflict keys collide in at least 8 of 10 pairs, or a recall test on 200+ real facts where fusion beats FTS5 alone.

### Seat 4 — First-principles

POSITION: Hybrid "B-contract": A plus B's format and integrity items (rebuildable SQLite cache, `sha256:<hex>`, `x-<pkg>-*` prefix, OKF-proposal link shape, `candidate` + lint gate, conflict key, recorded/valid time, redaction, archive), dropping multi-arm fusion and the usage sidecar; nothing from C, D or E.

REASONING: The goal is a knowledge base agents can trust, not one that retrieves cleverly. At a 500-fact cap with 20 facts stored, recall is not the binding constraint; wrong or stale facts are. So the options mostly argue about the wrong axis. What cannot be changed later is the file format, so every B item that fixes on-disk shape or admission belongs in the first design, while ranking arms are replaceable internals that can wait for a measured miss. Today's hash is a truncated SHA-1, which must not become a published contract. D fails the goal directly: Memorix keeps state in a home directory, whereas the differentiator is evidence living in the project's repository. E's model-written extraction breaks Baton's own rule. One gap sits outside all options: the fact store is untracked in git, so "Markdown in git" is not yet true.

CLAIMS:
- Store is capped small. src/memory.ts:125 — "export const FACT_CAP = 500;"
- Current hash is truncated SHA-1. src/memory.ts:653 — "const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);"
- Model origination is barred. src/memory/delegate.ts:13 — " * **The model may REORGANISE, never ORIGINATE.**"
- Extension keys are permitted by OKF. <scratchpad>/knowledge-catalog/okf/SPEC.md:206 — "SHOULD preserve unknown keys when round-tripping and MUST NOT reject"
- Memorix data lives outside the repo. <scratchpad>/survey/memorix/src/memory/owner.ts:20 — "  // The normal runtime data directory is ~/.memorix/data, so keep identity"

WHAT WOULD CHANGE MY MIND: A measured recall miss on Baton's own store (a needed fact present but not returned by weighted BM25) would restore fusion; whole-file hashing marking over roughly a third of facts suspect per ordinary commit would justify C's symbol hashes; FACT_CAP rising past tens of thousands would reopen retrieval design.

## Diversity check

Real spread inside one neighbourhood: no seat chose C, D or E whole; the four differ on which additions enter the first design — agent-written consolidation (seats 1, 2 yes; 3, 4 no), conflict key and `candidate` state (seat 3 drops both; seat 4 keeps both), multi-arm fusion (seats 3, 4 drop; 1, 2 keep), valid time (seats 1, 3 drop). No re-seat. No seat argued for the union (E), the option the owner's request leans toward.

## Review

Mapping (written before dispatch): A = seat 3 · B = seat 1 · C = seat 4 · D = seat 2.

Citation slices (disjoint, each re-run whole): R1 — src/memory.ts:42, `predicate` absence, `subject` absence, facts file fingerprint line 14, src/memory.ts:653 · R2 — memorix owner.ts:20, memorix package.json:151, tree-sitter count in Baton package.json, memorix sqlite-db.ts:302, hindsight cross_encoder.py:1276 · R3 — OKF SPEC.md:206, src/memory/delegate.ts:13, src/memory.ts:657, src/memory.ts:125.

### Reviewer 1

CRITIQUE:
Response A: strongest — verified that no subject/predicate fields exist, so a conflict key has nothing to hash and would fail silently · weakest — defers `candidate` state, a format item that is cheapest before publication; calls the fingerprint "hand-written", which is wrong.
Response B: strongest — cost model (dependencies, non-determinism, unwithdrawable keys) applied consistently; drops fields with no reader · weakest — keeps conflict key and multi-arm fusion without evidence either works on prose facts.
Response C: strongest — separates irreversible format from replaceable ranking; spots truncated SHA-1 and the untracked store · weakest — keeps conflict key and valid time without saying where subject/predicate come from.
Response D: strongest — evidence record shaped to accept a locator later without a format break · weakest — "seams cost one interface each" is asserted; speculative published surface for one developer.

BIGGEST BLIND SPOT: Response D — treats the conflict key as settled format while facts are a single prose string; the key's inputs do not exist.

ALL MISSED: Migration of the existing store. Anchors are `path@<12-hex sha1>` (one has an empty hash), there is no format-version key, and the loader recomputes `fingerprint` and rewrites frontmatter in place, so a published format needs a versioning and rewrite policy.

RE-RUN CHECK:
1. `grep -n -F "  fact: string;" src/memory.ts` → `42:  fact: string;` and `680:  fact: string;` — match (line 42 and text correct; a second occurrence exists at 680).
2. `grep -n -F "predicate" src/memory.ts` → no output, exit 1 — match.
3. `grep -n -F "subject" src/memory.ts` → no output, exit 1; control `grep -c -F "related" src/memory.ts` → `10` — match.
4. `grep -n -F "fingerprint: hub-repo-list-owner-only-control" baton/memory/facts/mem-a-hub-s-repo-list-is.md` → `14:fingerprint: hub-repo-list-owner-only-control` — match.
5. `grep -n -F "const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);" src/memory.ts` → `653:const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);` — match.

FALSE OR UNSUPPORTED CLAIMS:
- Response A: citation 4's text and line match, but its gloss ("hand-written slug", "free-text slug") is false. `src/memory.ts:131-132` prints `/** Near-duplicate detection: slug of the first significant words. */` / `export function fingerprintOf(fact: string): string {`, and line 377 prints `// COMPUTED, never read from the file. The fingerprint is not a label,`. The key is derived from the first six words of the body. A's wider point (the key depends on phrasing) survives.
- Response C: "the fact store is untracked in git" holds in this checkout (`git ls-files baton/memory | wc -l` → 0), though the comment at `src/memory.ts:381` says `baton/memory/facts/` is tracked.
- Response B: `package.json:151` react line confirmed (also at 163).
- Unchecked: all other citations.

FRAMING: Leans mildly to B — "model-free additions that add no runtime dependency" presents B's items as costless, and "Nothing else in the first design" makes A sound austere.

FINAL RANKING:
1. Response C
2. Response A
3. Response B
4. Response D

### Reviewer 2

CRITIQUE:
Response A: strongest — conflict key needs subject/predicate fields the store lacks (both greps return 0), so it fails silently · weakest — calls the fingerprint "hand-written"; code computes it; drops `candidate` without argument.
Response B: strongest — format items are cheapest before first publication, SQLite cache keeps files the only contract · weakest — "D rewrites its storage layer" overreaches its evidence.
Response C: strongest — trust, not recall, binds at 20 facts; truncated SHA-1 must not be published · weakest — keeps conflict key and valid time with no reader or test.
Response D: strongest — reserve a sub-file evidence locator now to avoid a later format break · weakest — "seams cost one interface each" is asserted, not shown.

BIGGEST BLIND SPOT: Response D — its conflict key assumes structured subject/predicate that free-prose facts do not have.

ALL MISSED: No format-version key or migration path for existing facts (sha1-12 to `sha256:`); Baton already silently rewrites tracked frontmatter on repair.

RE-RUN CHECK:
1. `grep -n -F "  // The normal runtime data directory is ~/.memorix/data, so keep identity" <S>/survey/memorix/src/memory/owner.ts` → `20:  // The normal runtime data directory is ~/.memorix/data, so keep identity` — match.
2. `grep -n -F '    "react": "19.2.7",' <S>/survey/memorix/package.json` → `151:    "react": "19.2.7",` and `163:    "react": "19.2.7",` — match at 151 (inside `"dependencies"`, opened line 137; 163 is under `"optionalDependencies"`, opened line 157).
3. `grep -c -F "tree-sitter" ~/Desktop/Developer/playground/baton/package.json` → `0`; control `grep -c -F "typescript"` same file → `1` — match.
4. `grep -n -F "  capturedSymbolHash TEXT," <S>/survey/memorix/src/store/sqlite-db.ts` → `302:  capturedSymbolHash TEXT,` — match.
5. `grep -n -F "class RRFPassthroughCrossEncoder(CrossEncoderModel):" <S>/hindsight/hindsight-api-slim/hindsight_api/engine/cross_encoder.py` → `1276:class RRFPassthroughCrossEncoder(CrossEncoderModel):` — match.

FALSE OR UNSUPPORTED CLAIMS:
- A, "hand-written slug": citation text matches (line 14), but `src/memory.ts:377` says "      // COMPUTED, never read from the file. The fingerprint is not a label," — inference false.
- B and C, Memorix "stores outside the repo": line 20 matches, but line 21 reads "  // beside it. Custom data directories and isolated tests own their identity" — default only, directory is configurable.
- Other citations in my slice: none found wrong.

FRAMING: Leans to B and against D: "model-free additions that add no runtime dependency"; "ties format and roadmap to its maintainers".

FINAL RANKING:
1. Response C
2. Response D
3. Response B
4. Response A

### Reviewer 3

CRITIQUE:
Response A: strongest — conflict key has no subject/predicate fields to hash, so it fails silently · weakest — drops `candidate` and time fields although format is cheapest to fix before publication.
Response B: strongest — files stay the only contract, cache rewritable · weakest — keeps conflict key without saying where its inputs come from.
Response C: strongest — trust, not recall, binds at 20 facts; found truncated SHA-1 and untracked store · weakest — same unexamined conflict key.
Response D: strongest — evidence locator reserved now avoids a format break · weakest — rerank hook is speculative surface with no consumer.

BIGGEST BLIND SPOT: Response D — its whole strategy rests on third-party OKF tools preserving unknown keys, which the brief marks untested; it names this only as a mind-changer.

ALL MISSED: src/memory.ts:377–391 already refuses to read a grouping key from frontmatter (a pulled file could dictate its group). A stored conflict key or `candidate` state has the same exposure; none says derived versus stored.

RE-RUN CHECK:
1. `grep -n -F "SHOULD preserve unknown keys when round-tripping and MUST NOT reject" <S>/knowledge-catalog/okf/SPEC.md` → `206:SHOULD preserve unknown keys when round-tripping and MUST NOT reject` — match
2. `grep -n -F " * **The model may REORGANISE, never ORIGINATE.**" ~/Desktop/Developer/playground/baton/src/memory/delegate.ts` → `13: * **The model may REORGANISE, never ORIGINATE.**` — match
3. `grep -n -F "async function fileHash(mainRoot: string, relPath: string): Promise<string> {" ~/Desktop/Developer/playground/baton/src/memory.ts` → `657:async function fileHash(mainRoot: string, relPath: string): Promise<string> {` — match
4. `grep -n -F "export const FACT_CAP = 500;" ~/Desktop/Developer/playground/baton/src/memory.ts` → `125:export const FACT_CAP = 500;` — match

FALSE OR UNSUPPORTED CLAIMS:
- A: "hand-written slug" / "free-text slug" — quoted line matches (`14:fingerprint: hub-repo-list-owner-only-control`), but the loader says `377:      // COMPUTED, never read from the file.` and `391:      fingerprint: fingerprintOf(body),`. The stored value is ignored; characterisation wrong, conclusion survives.
- D: relies on [relayed] "survey found no project doing it".
- Other citations spot-checked (A :42, B package.json:151, C :653, D :302, :1276, owner.ts:20) match.

FRAMING: Mild lean to B: "model-free additions that add no runtime dependency"; against A: "Omitting a feature that works leaves the package behind".

FINAL RANKING:
1. Response C
2. Response B
3. Response A
4. Response D

## Claim checks

| Seat | Claim | Checked with | Line as found | Re-run | Result |
|---|---|---|---|---|---|
| 3 | facts are one prose string (src/memory.ts:42) | `grep -n -F '  fact: string;' src/memory.ts` | `42:  fact: string;` · `680:  fact: string;` | R1: same two lines — match | kept |
| 3 | no `predicate` in src/memory.ts | `grep -n -F 'predicate' src/memory.ts` | no output; control `grep -c -F related` → 10 | R1: no output — match | kept |
| 3 | no `subject` in src/memory.ts | `grep -n -F 'subject' src/memory.ts` | no output; same control → 10 | R1: no output, control 10 — match | kept |
| 3 | dedupe key is a "free-text / hand-written slug" (facts file :14) | `grep -n -F 'fingerprint: hub-repo-list-owner-only-control' baton/memory/facts/mem-a-hub-s-repo-list-is.md` | `14:fingerprint: hub-repo-list-owner-only-control` | R1: line matches; R1, R2, R3 each cite `src/memory.ts:377` "COMPUTED, never read from the file" (`grep -n -F "COMPUTED, never read from the file" src/memory.ts` → `377:      // COMPUTED, never read from the file. The fingerprint is not a label,`) | struck — characterisation false, line itself correct |
| 4 | hash is truncated SHA-1 (src/memory.ts:653) | `grep -n -F 'const sha1 = ' src/memory.ts` | `653:const sha1 = (data: string \| Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);` | R1: same — match | kept |
| 4 | FACT_CAP 500 (src/memory.ts:125) | `grep -n -F 'FACT_CAP = ' src/memory.ts` | `125:export const FACT_CAP = 500;` | R3: same — match | kept |
| 2 | whole-file hash (src/memory.ts:657) | `grep -n -F 'async function fileHash' src/memory.ts` | `657:async function fileHash(mainRoot: string, relPath: string): Promise<string> {` | R3: same — match | kept |
| 1, 2, 3, 4 | reorganise-only rule (delegate.ts:13) | `grep -n -F 'REORGANISE' src/memory/delegate.ts` | `13: * **The model may REORGANISE, never ORIGINATE.**` | R3: same — match | kept |
| 1, 2, 4 | OKF unknown keys SHOULD be preserved (SPEC.md:206) | `grep -n -F 'SHOULD preserve unknown keys' <S>/knowledge-catalog/okf/SPEC.md` | `206:SHOULD preserve unknown keys when round-tripping and MUST NOT reject` | R3: same — match | kept |
| 1 | no parser in Baton | `grep -c -F tree-sitter package.json` · `grep -c -F typescript package.json` | 0 · 1 | R2: 0 · 1 — match | kept |
| 1, 4 | Memorix data lives outside the repo (owner.ts:20) | `grep -n -F 'The normal runtime data directory' <S>/survey/memorix/src/memory/owner.ts` | `20:  // The normal runtime data directory is ~/.memorix/data, so keep identity` | R2: same — match; R2 adds line 21 (`grep -n -F "Custom data directories"` → `21:  // beside it. Custom data directories and isolated tests own their identity`) | kept, qualified — a default, the directory is configurable; "D rewrites its storage layer" (seat 1) is not shown |
| 1 | Memorix depends on react (package.json:151) | `grep -n -F '"react"' <S>/survey/memorix/package.json` | `151:    "react": "19.2.7",` · `163:    "react": "19.2.7",` | R2: same two lines — match | kept |
| 2 | Memorix stores a symbol hash (sqlite-db.ts:302) | `grep -n -F 'capturedSymbolHash TEXT' <S>/survey/memorix/src/store/sqlite-db.ts` | `302:  capturedSymbolHash TEXT,` | R2: same — match | kept |
| 2 | passthrough reranker exists (cross_encoder.py:1276) | `grep -n -F 'class RRFPassthroughCrossEncoder' <S>/hindsight/hindsight-api-slim/hindsight_api/engine/cross_encoder.py` | `1276:class RRFPassthroughCrossEncoder(CrossEncoderModel):` | R2: same — match | kept |
| 4 | fact store untracked in git | `git ls-files baton/memory \| wc -l` | 0 | R1: 0; notes the comment at src/memory.ts:381 calls the directory tracked | kept — true in this checkout |

## Tally

C 1.00 · B 2.67 · A 3.00 · D 3.33 (3 of 3 rankings parsed; C = seat 4 First-principles, B = seat 1 Maintainer, A = seat 3 Contrarian, D = seat 2 Expansionist)

## Verdict

### Framing
Mild lean to B and against A and D: "model-free additions that add no runtime dependency"; "Nothing else in the first design"; "Omitting a feature that works leaves the package behind"; "ties format and roadmap to its maintainers". No seat argued E, the option the owner's request leans toward.

### Positions
Maintainer: "B, minus valid-time and the usage sidecar until something reads them, plus from C only agent-written consolidation with code-checked source ids; reject D and E."
Expansionist: "B, plus two things from C — agent-written consolidation with pinned source ids, and format/API seams (a sub-file evidence locator, a rerank hook defaulting to passthrough) — with tree-sitter, NLI, Jev and all of D/E left out of the core."
Contrarian: "A plus only B's format-and-safety items (`sha256:<hex>`, `x-<pkg>-*` prefix, SQLite as rebuildable cache, archive-not-delete, secret redaction, frontmatter lint); drop B's conflict key, bitemporal fields, multi-arm RRF, usage sidecar and `candidate` state from the first design."
First-principles: "Hybrid "B-contract": A plus B's format and integrity items (rebuildable SQLite cache, `sha256:<hex>`, `x-<pkg>-*` prefix, OKF-proposal link shape, `candidate` + lint gate, conflict key, recorded/valid time, redaction, archive), dropping multi-arm fusion and the usage sidecar; nothing from C, D or E."

### Where the members agree
4 of 4 take the baseline plus `sha256:<hex>`, the `x-<pkg>-*` prefix, the rebuildable SQLite cache, archive, redaction and the lint. 4 of 4 reject D, E, tree-sitter, NLI and Jev in the core. 3 of 4 drop the usage sidecar.

### Where they clash
- Conflict key: three keep it, the Contrarian drops it. The Contrarian is right: facts are one prose string and no subject or predicate field exists (verified), so the key has no inputs. The minority wins.
- Fusion: 2 keep, 2 drop.
- Valid time: 2 keep, 2 drop.
- `candidate`: only the Contrarian drops it, without argument.

### Blind spots
- No format-version key and no migration path from today's `path@<12-hex sha1>` anchors; the loader already rewrites frontmatter.
- Nobody said which keys are stored and which derived; Baton already refuses to trust a grouping key read from a file.
- The store is untracked in git in this checkout.
- Whether OKF tools keep unknown keys is untested.

### Recommendation
Build the First-principles "B-contract" without the conflict key.
- **Enter:** the baseline; `sha256:<hex>`; `x-<pkg>-*` prefix; a format-version key; rebuildable SQLite cache; FTS5 column weights; OKF-proposal link shape; `candidate` plus lint; recorded time; redaction; archive; an evidence record that can later carry a line-range or symbol locator; agent-written consolidation with code-checked source ids (Baton already enforces the rule).
- **Deferred:** conflict key, valid time, multi-arm fusion with budget trim, usage sidecar, rerank hook, symbol hashes.
- **Rejected:** D; E's model-written extraction, automatic consolidation, embeddings, graph ranking and belief updating; NLI and Jev.

Confidence: medium — the brief leans to B, the research is relayed, and no seat argued E.

### What would overturn it
- Agent-written conflict keys collide in at least 8 of 10 planted contradicting pairs: the conflict key enters.
- Fusion beats weighted FTS5 on 200+ real facts, or a stored fact is not returned: fusion enters.
- Whole-file hashing marks over a third of facts `suspect` per ordinary commit: symbol hashes enter.
- OKF tools strip unknown keys on round-trip: the extension strategy fails.

### First step
In the scratchpad, rewrite one existing fact file by hand into the proposed frontmatter (version key, `sha256:`, `x-` keys, evidence record) and check that Baton's loader and any OKF tooling in the clone keep every key.

## Memory

Saved as an advisory decision fact (id in the chat verdict block); the 8-of-10 conflict-key overturn condition was left out of the fact for length and is recorded in the verdict above.
