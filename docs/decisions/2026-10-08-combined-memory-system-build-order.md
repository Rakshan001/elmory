# Council: build Baton's memory as one combined system, or staged — and from which parts

- **Date:** 2026-10-08
- **Status:** advisory — not acted on
- **Tier:** deep
- **Run:** 5 seats (5 subagent) · review 4/4 · diversity ✓ (one position, different reasons)
- **Degraded:** brief leaned toward B (all four reviewers and the chairman); published results relayed through a summarising fetch tool; stale measurement not re-run by a second agent
- **Prior verdict:** `mem-council-decision-memory-graph-okf-hindsight` (2026-10-08, advisory, not approved) — re-run at the owner's request. Changed since: four research passes (token saving, Mem0 + Graphiti source, academic survey, coding-agent memory tools), source reads of Memanto and Honcho, and a read-only measurement of how many facts read stale on other branches. Members were not told the prior recommendation.

## Question (as asked)

"rerun the council with new evidence https://github.com/moorcheh-ai/memanto https://github.com/plastic-labs/honcho … according to that my plan hashing and using OKF is bad see dont come to conclusion run the llm council in higher options … my plan is like we create the okf memory using hindsight logic we use and copilot and like we create the hashmap table for easy search the points and evidence and stale fact duplicate fact and all so agents never hallucinate … we take all other project each points and build our own system that is okay for me … sometimes logical way possible even though you say not possible"

## Brief

DECISION: Should Baton's next project-memory version be built as one combined system assembled from the ideas of other memory projects, and if so which parts, in what form, and in what order?

OPTIONS (neutral order; a seat may name a hybrid):
- A · Deterministic combined system, one version: every part below that needs no model, built and released together as a new memory version with a new committed fact format — OKF-style fact files (frontmatter `type`/`title`/`description`/`tags`/`timestamp`, generated `index.md` and `log.md`, links between facts); an entity → facts hash-map index (entities = file paths, code symbols, tags) with each fact carrying evidence pointers (`sources`); validity fields (`valid_at` / `invalid_at` / `superseded_by`); symbol-level hashes with `current / suspect / stale`; re-validation of suspect facts by the reading agent; a plain-code duplicate ladder (exact → MinHash); multi-arm recall (keyword / entity / time) with rank fusion and a token-budget trim; a graph view of memory in the app.
- B · Staged, format last: build in this order, each step shipped and measured before the next — (1) freshness that survives sharing (symbol-level hashes, `suspect` state, re-validate instead of withhold); (2) share / keep-local / commit controls in the dashboard; (3) admission check at save, failure-lesson capture, cap on what loads at session start; (4) serve the facts anchored to the file being edited; (5) entity hash map and graph view computed in memory from existing fields; (6) only then any new committed format (OKF fields, stored links, validity fields).
- C · Full combined system as the owner describes it: everything in A, plus Hindsight-style retain/recall — write-time extraction of entities, typed links and consolidated observations, a reflect step, typed memory networks — with every model call delegated to the user's own agent (Baton itself calls no model), each model-written item required to cite existing facts as premises and rejected otherwise; goal stated by the owner: "agents never hallucinate", weak models produce better output, tokens are saved.
- D · Smallest change: dashboard share / keep-local / commit controls, an in-memory entity → facts map over existing anchors, a token-budget trim and a graph view; no change to the fact format, freshness rule or write path.

CONSTRAINTS:
- `grep -n -F "Daemon stays zero-dependency" CLAUDE.md` → `18:- **Daemon stays zero-dependency**: \`src/server.ts\` is raw \`node:http\`. No express/fastify.`
- Owner's product rules: Baton makes no model calls itself ("does not buy tokens, it delegates"); no invented numbers shown to users; must work offline; demo mode must keep working; no Python runtime is shipped.
- `grep -n -F "REORGANISE" src/memory/delegate.ts` → `13: * **The model may REORGANISE, never ORIGINATE.**` (the existing delegated pass validates that every content word of a produced fact comes from a source fact).
- Memory is shared by committing Markdown to git; teammates receive it by pulling. One developer builds Baton.
- The owner has said borrowing ideas from several projects and building Baton's own system is acceptable, and asked that an option not be dismissed only because prior systems did not do it.

STAKES: Memory is read at the start of agent sessions, so its size and precision are paid on every session by every teammate. A wrong or stale fact sends a weak model in the wrong direction with nothing to contradict it. A committed format is hard to reverse once teammates have saved facts in it. Building little leaves the product without a memory feature that distinguishes it; building much with one developer delays everything else.

GROUNDING — Baton today (commands run in the main checkout, 2026-10-08):
- `grep -n -F "FACT_CAP = " src/memory.ts` → `125:export const FACT_CAP = 500;`
- `grep -n -F "export const MEMORY_TYPES" src/memory.ts` → `32:export const MEMORY_TYPES: MemoryType[] = ['decision', 'gotcha', 'convention', 'reference', 'preference'];`
- `grep -n -F "export type Freshness" src/memory.ts` → `71:export type Freshness = 'fresh' | 'aging' | 'stale';`
- `grep -n -F "f.freshness !== 'stale'" src/memory.ts` → `1148:  const usable = all.filter((f) => f.freshness !== 'stale');` · `1332:    if (f.freshness !== 'stale') continue;` · `1493:    if (f.freshness !== 'stale') continue;` (stale facts are withheld from recall; recall returns them separately under `staleGrounding` with a "re-check and re-save" tip).
- `grep -n -F "async function fileHash" src/memory.ts` → `657:async function fileHash(mainRoot: string, relPath: string): Promise<string> {` · `grep -n -F "sha1(" src/memory.ts` → `663:    const hash = sha1(await readFile(abs));` · `761:    id = \`${id}-${sha1(fact).slice(0, 4)}\`;` · `grep -n -F "changed since this was saved" src/memory.ts` → `970:        staleReason = now === '' ? \`${a.path} no longer exists\` : \`${a.path} changed since this was saved\`;` — freshness = whole-file hash of the anchored file in the reader's main checkout.
- Measured read-only on 2026-10-08 (script compared each fact's `path@hash` anchors with `git show <ref>:<path>`): 21 facts, 14 carry hashed anchors. Would read stale — working tree of `codex/desktop-subscription-launcher`: 1 · `main`: 5 · `bugfix/team-admit-stuck`: 12 · `fix/settings-desktop-panel`: 12.
- `grep -n -F "BM25 (FTS5)" src/memory.ts` → `1170:    // BM25 (FTS5) with synonym/identifier expansion; scoreMemory is its fallback.` · `grep -n -F "RELATED_CAP = " src/memory.ts` → `1075:const RELATED_CAP = 3;` (facts sharing anchor files with the hits are added, cap 3).
- `grep -n -F "links" src/memory.ts` → no matches (same tool and file: `grep -c -F "related"` → 10). `grep -rl -F "embedding" src` → `src/skills/catalog.ts`, `src/skills/bundled/prompt-master/SKILL.md` only.
- Fact file shape (first file in `baton/memory/facts/`): frontmatter `id`, `type`, `agent`, `author`, `task`, `created`, `commit`, `files: [path@12-hex-hash]`, `supersedes`, `fingerprint`; body 1–3 sentences. No format-version field.
- `ls baton/memory/facts | wc -l` → 18 · `ls .baton/memory/facts | wc -l` → 3 · `git ls-files baton/memory | wc -l` → 0: 21 facts after about a month, none committed.
- `grep -n -F "local_only" src/mcp.ts` → `768:        local_only: z.boolean().optional()...` (+ 771, 774) · `grep -n -F "localOnly" src/server.ts` → no matches · `grep -n -F "local" web/src/features/Memory.tsx` → no matches: only agents can choose share / keep-local; the dashboard cannot.
- `grep -n -F "export function consolidateFacts" src/memory/consolidate.ts` → `190:...` · `grep -n -F "Supersede, never delete, never rewrite" src/memory/consolidate.ts` → `13: *   2. **Supersede, never delete, never rewrite.** The only write this pass can` · `grep -n -F "Contradiction is a signal for a person" src/memory/consolidate.ts` → `17: *   3. **Contradiction is a signal for a person.** Two facts that disagree are`: a zero-model duplicate/contradiction pass already exists (fingerprint + word-set similarity).
- `grep -n -F "ORIENT_MAX_CHARS = " src/kb/orient.ts` → `25:export const ORIENT_MAX_CHARS = 3200;` · a code graph with symbols exists (`src/kb/neighbours.ts`, `graphify-out/graph.json`).

GROUNDING — other projects' source, cloned and read on 2026-10-08 (clones under `<scratchpad>/{mem0,graphiti,memanto,honcho}`; you may open them; findings below were reported by research agents and are `[relayed]` unless you open the line yourself):
- Mem0 (`b7ad69a`): live write path only adds; the update/delete step is unused; no contradiction handling; hands the model integer aliases for existing memory ids so it cannot invent ids; vector-first retrieval.
- Graphiti (`86f1c94`): about 3+E+N model calls per episode; duplicate ladder in plain code (exact → entropy gate → MinHash/LSH Jaccard ≥ 0.9); the model only points at which existing edge is contradicted, by index, and plain code applies `valid_at`/`invalid_at`/`expired_at`; needs a graph database; expired edges are not filtered by default.
- Memanto (`61a4715`): a Python wrapper; every store and search goes to a Moorcheh service (cloud or Docker with an embedding model), whose engine is not in the repo. Plain write stores verbatim, no model call. Supersede/validation fields were deleted (`REMOVED_TRUST_FIELDS = {"superseded_by", "supersedes", "validated_at", ...}`). Staleness = age-based retention sweeps in plain code. 13 memory types. Its own in-repo benchmark `temporal-memory-showdown/results/latest.md` reports a 100% stale leak rate for Memanto. Claims 89.8% LongMemEval / 87.1% LoCoMo, self-reported, conversational.
- Honcho (`ad3839d`, AGPL-3.0): Postgres + pgvector + LLM + embedding model required. All stored conclusions are model-written (levels explicit / deductive / inductive / contradiction). Plain-code rule `_filter_ungrounded_source_ids` in `src/utils/agent_tools.py` strips cited source ids that do not exist and rejects a derived conclusion with no real source; `DocumentSource` rows record "derived_id was concluded from source_id"; `times_derived` counter; duplicates by exact normalised match plus cosine ≤ 0.05; staleness and contradiction decided by a model in a background "dreamer"; context assembly uses a fixed-ratio token budget. Benchmarks conversational, self-run.
- None of the four ties a memory to the state of source code (no file hashes, commits or symbols).

GROUNDING — published results (web research 2026-10-08 through a summarising fetch tool; every line `[relayed]`, numbers approximate):
- Hindsight (arXiv 2512.12818): 83.6% on a conversational benchmark with a 20B open model vs 39.0% for the same model given the full context and 60.2% for full-context GPT-4o (self-reported). Needs Postgres + vector extension, embedding model, reranker. Release 0.5.0 replaced graph walks with one-hop link expansion as "empirically more accurate in our benchmarks". No invalidation of facts that become false.
- OKF v0.1: Markdown + YAML frontmatter (`type` required), `index.md`, `log.md`, links as the graph; no embeddings; no staleness mechanism.
- GitHub Copilot Memory: facts carry code citations re-checked against the current branch when used; 28-day expiry reset on successful validation; vendor A/B 90% vs 83% pull-request merge rate.
- Memorix: symbol-level hashes with `current / suspect / stale`.
- CodeRAG-Bench: gold context gives GPT-4o "a 27.4% gain on SWE-Bench"; "retrievers often struggle to fetch useful contexts". SWE-ContextBench: oracle summary 34.34 vs baseline 26.26; self-retrieved summary 22.22.
- VibeMemBench (coding agents; Mem0, SimpleMem, MemoryOS, A-MEM): 11 of 12 solver/system pairings fail to beat memory-off; 69.3% of failures are form degradation of the memory, 1.3% ranking misses.
- Admission control (arXiv 2505.16067): strict quality gate on what is stored, +15 to +25 points. SWE-Exp: one retrieved experience 42.0 vs four 39.0. ReasoningBank: failure lessons add about 3 points. ACE: itemised delta edits beat full rewrites ("context collapse").
- MemoryAgentBench accurate retrieval: BM25 60.5 vs Mem0 32.6, Zep 37.5, Cognee 28.3.
- Model strength: gains from memory shrink with stronger models; mid-tier models gain most; models ≤ 7B were net-negative with added context (arXiv 2603.11513).
- Project-overview files: LLM-generated AGENTS.md −0.5% to −2% success, +20% cost (arXiv 2602.11988); a smaller study found −28.64% runtime, −16.58% output tokens (arXiv 2601.20404).
- Aider repo map: graph-ranked (personalised PageRank), trimmed by binary search to a 1,024-token budget.
- No paper found measures code-triggered invalidation, or a git-shared store of a few hundred short facts.

OUT OF SCOPE: running Hindsight, Cognee, Mem0, Graphiti, Memanto or Honcho as an engine beside Baton (each needs a model, a database or a Python runtime the constraints exclude); embeddings or vector search inside Baton; Team Sync transport; licence enforcement; showing a modelled "tokens saved" number.

Clarifying question asked: none. Assumptions: "hashmap" = an inverted index from entity to facts; "Hindsight logic" = its retain / recall / reflect design, not its code or infrastructure; "Copilot" = re-validating a fact against current code when it is used.

## Seats

| # | Lens | Seat type | Model / provider | Tension with |
|---|---|---|---|---|
| 1 | Expansionist | subagent | host | Contrarian, Maintainer — what a combined system unlocks vs its failure modes and upkeep |
| 2 | Contrarian | subagent | host | Expansionist — argues against the option the owner leans toward (C) |
| 3 | Maintainer | subagent | host | Expansionist, Executor — a committed format and code owned for two years |
| 4 | Executor | subagent | host | First-principles — what one developer can ship, in what order |
| 5 | First-principles | subagent | host | Executor — is "never hallucinate" served by structure, by freshness, or by capture |

Fifth seat justified: no other lens covers delivery by a single developer.

## Answers

### Seat 1 — Expansionist
POSITION: B, with one change — pull a minimal additive format step (a format-version field plus optional symbol anchors and `sources`) forward into step 1, before step 2's commit controls freeze today's shape.

REASONING: The unclaimed territory is code-anchored freshness: none of the four projects ties memory to source state, and no paper measures it. Step 1 makes Baton the only system able to publish that measurement. But the format window is open now, not later: zero facts are committed, and step 2 exists to get them committed. A version field plus optional symbol anchors costs little and keeps A's index and C's premise-cited reflect reachable; C's door is already half-built in the delegated pass. A and C bet everything before evidence exists.

CLAIMS:
- Freshness hashes whole files, so symbol hashes need a new anchor shape. src/memory.ts:657 — "async function fileHash(mainRoot: string, relPath: string): Promise<string> {"
- No format version exists: `grep -n -F "version" src/memory.ts` → no matches (same tool and file: `grep -c -F "created"` → 12).
- Nothing is committed yet: `git ls-files baton/memory | wc -l` → 0.
- C's grounding rule already exists. src/memory/delegate.ts:13 — " * **The model may REORGANISE, never ORIGINATE.**"
- Honcho's premise check is plain code, portable later. honcho/src/utils/agent_tools.py:749 — "async def _filter_ungrounded_source_ids("

WHAT WOULD CHANGE MY MIND: Teammates already holding committed facts elsewhere (window closed → pure B); or step 1's measurement showing symbol hashes do not cut the 12-of-14 cross-branch stale count (then D).


### Seat 2 — Contrarian
POSITION: Choose B, stopping before step 6 until shared facts exist; reject C.

REASONING: C's gate proves provenance, not truth. Likeliest failure: a model-written observation cites two real facts, passes, then outlives them. Staleness is computed from a fact's own file anchors; a produced fact carries `cites`, not anchors, so when code changes the premises are withheld while the derived item is still served to a weak model. Second: today's validator requires every content word to come from cited facts. Hindsight-style entities, typed links and inductive observations are origination; C either rejects nearly all of them (dead feature) or loosens the gate (inventions in a committed store). The base is already unsound: 12 of 14 anchored facts read stale on a sibling branch. We would not notice: nothing counts served-while-premise-stale.

CLAIMS:
- Staleness derives only from own anchors — src/memory.ts:967 — "    for (const a of f.anchors.files) {"
- ProducedFact declares citations, no anchors (inheritance at write [unverified]) — src/memory/delegate.ts:84 — "  cites: string[];"
- Gate forbids new words — src/memory/delegate.ts:25 — " * Every CONTENT WORD of a produced fact must appear in a fact that produced"
- It knowingly blocks paraphrase — src/memory/delegate.ts:31 — " * rejects legitimate paraphrases, and that is the accepted trade: the model"
- Honcho's gate checks only that ids exist — honcho/src/utils/agent_tools.py:756 — "    """Drop cited source_ids that resolve to no existing document."

WHAT WOULD CHANGE MY MIND: A test showing a derived item turns stale when any premise's anchor changes, plus a measured acceptance rate above half for observations under the unloosened validator on 100+ committed facts.


### Seat 3 — Maintainer
POSITION: Choose B, amended so step 6 opens by adding a format-version field alone, with C's retain/reflect layer left unscheduled.

REASONING: One developer owns this for years, and the monthly bill is set by committed surface, not code. Runtime features (suspect state, entity map, budget trim, graph view) can be deleted in an afternoon; a frontmatter field teammates have pulled cannot. The parser has no version marker and silently coerces what it does not recognise, so A's or C's format would be misread without error on an older build. A lands eight mechanisms at once in a 1,655-line module, so no regression is attributable. C's output depends on whichever model the user runs, which the maintainer cannot reproduce. D keeps the freshness rule that misfires across branches.

CLAIMS:
- Unknown types degrade silently: src/memory.ts:369 — "type: MEMORY_TYPES.includes(data.type as MemoryType) ? (data.type as MemoryType) : 'reference',"
- No format version: `grep -c -F "version" src/memory.ts` → 0 (same tool and file: `grep -c -F "supersedes"` → 6).
- Stale facts are dropped, not re-validated: src/memory.ts:1148 — "const usable = all.filter((f) => f.freshness !== 'stale');"
- Core is one large file: `wc -l src/memory.ts` → 1655.
- Invariant new writes must keep: src/memory/consolidate.ts:13 — " *   2. **Supersede, never delete, never rewrite.** The only write this pass can"

WHAT WOULD CHANGE MY MIND: A second maintainer joining, or a measurement on teammates' facts showing steps 1–5 cannot work without stored links or validity fields — then A's format moves forward.


### Seat 4 — Executor
POSITION: B, staged with format last, with step 2 (dashboard share/keep-local/commit) pulled into the same first week as step 1.

REASONING: One developer, 21 facts, none in git. A and C open with a committed-format migration for a store nobody shares yet, the one irreversible job. B's week one is unblocked: Mon–Wed, replace the whole-file hash with a symbol-span hash from the existing code graph, add `suspect`, serve suspect facts with a re-check instruction instead of withholding; Thu–Fri, expose the stored `localOnly` flag through `src/server.ts` and Memory.tsx. The measurement exists: re-run the branch comparison (12 of 14 hashed facts stale on two branches). Blocker: symbol resolution when the graph is stale or a symbol was renamed; fall back to the file hash. D skips freshness, the measured defect.

CLAIMS:
- Freshness hashes whole files. src/memory.ts:657 — "async function fileHash(mainRoot: string, relPath: string): Promise<string> {"
- Stale facts are dropped from recall. src/memory.ts:1148 — "const usable = all.filter((f) => f.freshness !== 'stale');"
- Keep-local already exists in the store. src/memory.ts:735 — "const area: MemoryArea = input.localOnly ? 'local' : 'tracked';"
- The daemon does not expose it: `grep -n -F "localOnly" src/server.ts` → no output (control `grep -c -F "memory" src/server.ts` → 47).
- Symbol data exists. src/kb/neighbours.ts:30 — "/** `out`: this symbol points at it. `in`: it points at this symbol. */"

WHAT WOULD CHANGE MY MIND: Symbol-level hashing leaving the cross-branch stale count near 12 of 14 (favouring A), or teammates already holding committed facts.


### Seat 5 — First-principles
POSITION: B, cut to its first two steps as the entire next version, with steps 3–6 each gated on a measurement taken from real shared use.

REASONING: The goal is not "a memory system". It is: a fact an agent reads is true for the code on that agent's branch, and teammates actually receive it. Neither holds today. Nothing is committed, so sharing has never run once. Truth is judged by whole-file hash, so any edit to an anchored file withholds the fact: 12 of 14 hashed facts vanish on sibling branches. With 21 facts, an entity index, rank fusion, MinHash and a graph view tune retrieval over a corpus one screen long; A, C and D polish recall while every teammate's store is empty. C's "never hallucinate" is unreachable by construction: citing premises proves derivation, not that the premises still match code. Only freshness does that. A freezes a format before anyone has pulled a single fact.

CLAIMS:
- Freshness is a whole-file content hash. src/memory.ts:663 — "const hash = sha1(await readFile(abs));"
- A changed anchor file alone marks the fact stale. src/memory.ts:970 — "staleReason = now === '' ? `${a.path} no longer exists` : `${a.path} changed since this was saved`;"
- Stale facts are dropped from recall. src/memory.ts:1148 — "const usable = all.filter((f) => f.freshness !== 'stale');"
- Share/keep-local exists only on the agent tool. src/mcp.ts:768 — "local_only: z.boolean().optional().describe('Keep out of git: private to this machine. Not for secrets — those are refused'),"
- 21 facts, none committed; 12 of 14 stale on two branches. [unverified]

WHAT WOULD CHANGE MY MIND: A team with several hundred committed facts where symbol-level freshness already holds and measured recall misses relevant fresh facts; then the index and format work (A) becomes the binding constraint.


## Diversity check

One position (B) from all five seats, for different reasons: the format window before first commit (1), derived items outliving stale premises (2), committed surface as the long-run cost (3), an unblocked first week (4), and the goal being true-on-this-branch facts that teammates receive (5). Live sub-clash: when a format-version field lands — step 1 (seat 1), step 6 (seat 3), not at all yet (seat 5). No seat chose A, C or D. Re-seated: none — the reasons and most claims differ; no seat was told to disagree.

## Peer review

**Anonymization mapping** (shuffled): V = seat 3 · W = seat 5 · X = seat 1 · Y = seat 4 · Z = seat 2
Reviewers: fresh subagents R1..R4
**Citation slices** (disjoint, five each, re-run whole): R1 = claims 1–5 · R2 = 6–10 · R3 = 11–15 · R4 = 16–20 (numbering as in the claim table)

### Reviewer R1
CRITIQUE:
Response V: strongest — committed surface, not code, is the irreversible cost; the parser has no version marker (`grep -c -F "version" src/memory.ts` → 0, re-run) · weakest — puts the version field at step 6, after step 2 has already got facts committed.
Response W: strongest — sharing has never run and whole-file hashing withholds facts, all four citations exact · weakest — its central numbers are self-marked [unverified]; gates for steps 3–6 are unspecified.
Response X: strongest — the format window is open only while zero facts are committed · weakest — "optional symbol anchors and `sources`" is more than minimal; it commits a shape before step 1 measures it.
Response Y: strongest — concrete week plan with a re-runnable measurement and a fallback · weakest — ignores format versioning entirely.
Response Z: strongest — derived facts carry `cites`, not anchors, so they outlive stale premises · weakest — only argues against C; little on ordering B.

BIGGEST BLIND SPOT: Response Y — commits today's unversioned format in week one, the hazard V and X identify.

ALL MISSED: Freshness is hashed in the reader's main checkout, not the agent's worktree; symbol hashes do not fix that mismatch.

RE-RUN CHECK: citations 1–5 each re-run with `grep -n -F "<quoted text>" <file>` → 663, 970, 1148 (src/memory.ts), 768 (src/mcp.ts), 657 (src/memory.ts) — all match. Also re-run outside the slice and matching: memory.ts:735, memory.ts:967, delegate.ts:84, `wc -l src/memory.ts` → 1655.

FALSE OR UNSUPPORTED CLAIMS: none found in my slice (5 of 5 match). W's "21 facts, none committed; 12 of 14 stale" is [unverified] by W, though it restates the brief's grounding. Z's anchor-inheritance claim is [unverified] and its argument depends on it; `grep -n -F "anchors" src/memory/delegate.ts` returned nothing, which is consistent but not proof.

FRAMING: Leans to B. "each step shipped and measured before the next"; "A committed format is hard to reverse"; "one developer"; C is tagged with the unreachable "agents never hallucinate".

FINAL RANKING:
1. Response X
2. Response Z
3. Response W
4. Response V
5. Response Y

### Reviewer R2
CRITIQUE:
Response V: strongest — silent type coercion (memory.ts:369, confirmed) makes an unversioned format change unsafe · weakest — puts the version field at step 6, after step 2 has facts committed.
Response W: strongest — sharing has never run, so retrieval tuning is premature · weakest — key numbers left [unverified]; no format safeguard before the first commit.
Response X: strongest — the format window closes at step 2; version field first · weakest — bundles symbol anchors and `sources` into the format before step 1 proves them.
Response Y: strongest — concrete, measurable week · weakest — assumes the code graph yields symbol spans.
Response Z: strongest — derived facts outlive stale premises; the validator blocks origination · weakest — mostly argues against C; thin on B's order.

BIGGEST BLIND SPOT: Response Y — the graph exposes `source_location` only (`grep -c -F "end_line" src/kb/neighbours.ts` → 0), so symbol-span hashing may need a parser, not three days.

ALL MISSED: The 12-of-14 stale count may be real divergence; nobody proposes checking how many of those facts are actually still true before building symbol hashes.

RE-RUN CHECK: 6. `grep -c -F "version" src/memory.ts` → `0` (controls `created` → 12, `supersedes` → 6) — match. 7. `git ls-files baton/memory | wc -l` → `0` — match. 8. delegate.ts → `13: * **The model may REORGANISE, never ORIGINATE.**` — match. 9. honcho agent_tools.py → `749:async def _filter_ungrounded_source_ids(` — match. 10. memory.ts → `735:  const area: MemoryArea = input.localOnly ? 'local' : 'tracked';` — match.

FALSE OR UNSUPPORTED CLAIMS: none found in my slice. W's "12 of 14" is [unverified] by W, though it matches the brief. Y's symbol-span assumption is unsupported.

FRAMING: Leans to B: "each step shipped and measured before the next"; "A committed format is hard to reverse".

FINAL RANKING:
1. Response X
2. Response Z
3. Response V
4. Response Y
5. Response W

### Reviewer R3
CRITIQUE:
Response V: strongest — silent type coercion (memory.ts:369) makes any unversioned format change unsafe on older builds · weakest — "version first" sits at step 6, after commit controls have already frozen today's shape.
Response W: strongest — sharing has never run once, so recall tuning polishes an empty store · weakest — its key numbers are self-marked [unverified], and it gives no gate measurements.
Response X: strongest — the format window is open now (0 committed) and step 2 closes it · weakest — bundling symbol anchors and `sources` into step 1 commits a shape before any measurement.
Response Y: strongest — concrete week plan with a re-runnable measurement and a fallback · weakest — neighbours.ts:30 shows graph edges, not symbol spans that could be hashed.
Response Z: strongest — a derived fact can outlive its premises · weakest — it argues against a write path that does not exist.

BIGGEST BLIND SPOT: Response Y — `fileHash(mainRoot, …)` hashes the main checkout, so symbol hashes alone will not fix per-worktree or per-branch truth.

ALL MISSED: serving `suspect` facts to weak models with a "re-check" instruction is itself unmeasured, and the brief says models ≤7B were net-negative with added context.

RE-RUN CHECK: 11. `grep -n -F "localOnly" src/server.ts` → no output; `grep -c -F "memory" src/server.ts` → `47` — match. 12. neighbours.ts → `30:  /** \`out\`: this symbol points at it. \`in\`: it points at this symbol. */` — match. 13. memory.ts → `967:    for (const a of f.anchors.files) {` — match. 14. delegate.ts → `84:  cites: string[];` — match. 15. delegate.ts → `25: * Every CONTENT WORD of a produced fact must appear in a fact that produced` — match.
Citation 14, surrounding code: `ProducedFact` (delegate.ts:79–95) has only `id`, `fact`, `cites`, `origin`, `generator`, `author`. It carries no file anchors of its own, and `grep -n -i -F "anchor" src/memory/delegate.ts` returns nothing. Nothing inherits them either, because no code writes a produced fact: src/server.ts:3172–3173 says "`runDelegatePass` takes an injected launcher and nothing in Baton supplies one; nothing applies a `ProposeOp` either." Whether anchors are inherited is therefore undecided, not absent by design.

FALSE OR UNSUPPORTED CLAIMS: No mismatches in my slice. Response Z, [unverified] dependency: "the derived item is still served" describes a future implementation choice, not current behaviour; the no-anchors half is confirmed, the served-while-stale half is unsupported today. Response Y, citation 12: the text matches, but the line documents edge direction; it does not show that symbol spans or hashes exist.

FRAMING: Leans to B and against C. "each step shipped and measured before the next"; "A committed format is hard to reverse"; "building much with one developer delays everything else"; C's goal in scare quotes ("agents never hallucinate"); D is labelled "Smallest change".

FINAL RANKING:
1. Response X
2. Response V
3. Response Y
4. Response W
5. Response Z

### Reviewer R4
CRITIQUE:
Response V: strongest — silent type coercion plus no version marker makes any new format misread without error (both verified) · weakest — "deleted in an afternoon" and "unattributable regressions" are asserted, not evidenced.
Response W: strongest — sharing has never run, so recall tuning polishes an empty store · weakest — its central figures are tagged [unverified] though the brief supplies them; drops the session-load cap without argument.
Response X: strongest — the format window closes when step 2 commits facts · weakest — freezes symbol-anchor/`sources` shape before step 1 has measured anything.
Response Y: strongest — concrete, re-runnable measurement and a named blocker · weakest — day-level schedule unsupported; neighbours.ts:30 shows edges, not hashable symbol spans.
Response Z: strongest — derived facts carry `cites`, not anchors, so they can outlive withheld premises · weakest — that rests on write-path inheritance it admits is unverified.

BIGGEST BLIND SPOT: Response Y — assumes every reader has a current code graph on their branch; without it the file-hash fallback reproduces the 12-of-14 result.

ALL MISSED: Re-validation is done by the reading agent. A weak model can rubber-stamp a suspect fact and refresh its hash, laundering staleness; nobody audits re-validations.

RE-RUN CHECK: 16. delegate.ts → `31: * rejects legitimate paraphrases, and that is the accepted trade: the model` — match. 17. honcho agent_tools.py → `756:    """Drop cited source_ids that resolve to no existing document.` — match. 18. memory.ts → `369:      type: MEMORY_TYPES.includes(data.type as MemoryType) ? (data.type as MemoryType) : 'reference',` — match. 19. `wc -l src/memory.ts` → `    1655 src/memory.ts` — match. 20. consolidate.ts → `13: *   2. **Supersede, never delete, never rewrite.** The only write this pass can` — match.

FALSE OR UNSUPPORTED CLAIMS: No wrong citation found in my slice. Z item 17 is accurate but partial: the docstring at 756–768 also says an observation left with too few real sources is rejected. Z's "[unverified] inheritance at write" stays unverified and its main argument depends on it. W's 21 facts / 12 of 14 comes from the brief; not re-measured. Y's week-one schedule is unsupported.

FRAMING: Leans mildly both ways. Toward B: "each step shipped and measured before the next". Against D: "Building little leaves the product without a memory feature that distinguishes it". Shielding C: "asked that an option not be dismissed only because prior systems did not do it". Against A/C: "A committed format is hard to reverse".

FINAL RANKING:
1. Response Z
2. Response X
3. Response W
4. Response V
5. Response Y

Tally note: none (4 rankings parsed)

## Claim checks

All checks run by the orchestrator in one batch per file with `grep -n -F "<quoted text>" <file>` (or the exact command shown); Re-run cells are the reviewers' own runs.

| # | Seat | Claim | Citation | Checked with | Line as found | Result | Re-run |
|---|---|---|---|---|---|---|---|
| 1 | 5 | whole-file content hash | src/memory.ts:663 | `grep -n -F "const hash = sha1(await readFile(abs));" src/memory.ts` | "663:    const hash = sha1(await readFile(abs));" | kept | R1: 663 · match |
| 2 | 5 | changed anchor file marks stale | src/memory.ts:970 | `grep -n -F "changed since this was saved" src/memory.ts` | "970:        staleReason = now === '' ? \`${a.path} no longer exists\` : \`${a.path} changed since this was saved\`;" | kept | R1: 970 · match |
| 3 | 5, 3, 4 | stale facts dropped from recall | src/memory.ts:1148 | `grep -n -F "const usable = all.filter((f) => f.freshness !== 'stale');" src/memory.ts` | "1148:  const usable = all.filter((f) => f.freshness !== 'stale');" | kept | R1: 1148 · match |
| 4 | 5 | share/keep-local only on agent tool | src/mcp.ts:768 | `grep -n -F "local_only: z.boolean().optional()" src/mcp.ts` | "768:        local_only: z.boolean().optional().describe('Keep out of git: private to this machine. Not for secrets — those are refused')," | kept | R1: 768 · match |
| 5 | 1, 4 | freshness hashes whole files | src/memory.ts:657 | `grep -n -F "async function fileHash(mainRoot: string, relPath: string): Promise<string> {" src/memory.ts` | "657:async function fileHash(mainRoot: string, relPath: string): Promise<string> {" | kept | R1: 657 · match |
| 6 | 1, 3 | no format version | `grep -c -F "version" src/memory.ts` → 0 | same; controls `created`, `supersedes` | "0" · "12" · "6" | kept | R2: 0 / 12 / 6 · match |
| 7 | 1 | nothing committed | `git ls-files baton/memory \| wc -l` → 0 | same | "0" | kept | R2: 0 · match |
| 8 | 1 | grounding rule exists | src/memory/delegate.ts:13 | `grep -n -F "REORGANISE, never ORIGINATE" src/memory/delegate.ts` | "13: * **The model may REORGANISE, never ORIGINATE.**" | kept | R2: 13 · match |
| 9 | 1 | Honcho premise check is plain code | honcho/src/utils/agent_tools.py:749 | `grep -n -F "async def _filter_ungrounded_source_ids(" …/agent_tools.py` | "749:async def _filter_ungrounded_source_ids(" | kept | R2: 749 · match |
| 10 | 4 | keep-local exists in the store | src/memory.ts:735 | `grep -n -F "const area: MemoryArea = input.localOnly ? 'local' : 'tracked';" src/memory.ts` | "735:  const area: MemoryArea = input.localOnly ? 'local' : 'tracked';" | kept | R2: 735 · match |
| 11 | 4 | daemon does not expose it | `grep -n -F "localOnly" src/server.ts` → none | same; control `grep -c -F "memory" src/server.ts` | no output · "47" | kept | R3: none / 47 · match |
| 12 | 4 | "Symbol data exists" | src/kb/neighbours.ts:30 | `grep -n -F "this symbol points at it" src/kb/neighbours.ts` | "30:  /** \`out\`: this symbol points at it. \`in\`: it points at this symbol. */" | kept as a quote; the inference to hashable symbol spans is struck — see settled fact below | R3: 30 · match (edges, not spans) |
| 13 | 2 | staleness from own anchors only | src/memory.ts:967 | `grep -n -F "for (const a of f.anchors.files) {" src/memory.ts` | "967:    for (const a of f.anchors.files) {" | kept | R3: 967 · match |
| 14 | 2 | ProducedFact has citations, no anchors | src/memory/delegate.ts:84 | `grep -n -F "cites: string[];" src/memory/delegate.ts` | "84:  cites: string[];" | kept; "still served while premises stale" is [unverified] — no code writes a produced fact today | R3: 84 · match |
| 15 | 2 | gate forbids new words | src/memory/delegate.ts:25 | `grep -n -F "Every CONTENT WORD of a produced fact must appear in a fact that produced" src/memory/delegate.ts` | "25: * Every CONTENT WORD of a produced fact must appear in a fact that produced" | kept | R3: 25 · match |
| 16 | 2 | it knowingly blocks paraphrase | src/memory/delegate.ts:31 | `grep -n -F "rejects legitimate paraphrases, and that is the accepted trade: the model" src/memory/delegate.ts` | "31: * rejects legitimate paraphrases, and that is the accepted trade: the model" | kept | R4: 31 · match |
| 17 | 2 | Honcho gate checks only that ids exist | honcho/src/utils/agent_tools.py:756 | `grep -n -F "Drop cited source_ids that resolve to no existing document." …/agent_tools.py` | "756:    \"\"\"Drop cited source_ids that resolve to no existing document." | kept (partial: it also rejects items left with too few sources) | R4: 756 · match |
| 18 | 3 | unknown types degrade silently | src/memory.ts:369 | `grep -n -F "type: MEMORY_TYPES.includes(data.type as MemoryType)" src/memory.ts` | "369:      type: MEMORY_TYPES.includes(data.type as MemoryType) ? (data.type as MemoryType) : 'reference'," | kept | R4: 369 · match |
| 19 | 3 | core is one large file | `wc -l src/memory.ts` → 1655 | same | "    1655 src/memory.ts" | kept | R4: 1655 · match |
| 20 | 3 | supersede-only invariant | src/memory/consolidate.ts:13 | `grep -n -F "Supersede, never delete, never rewrite" src/memory/consolidate.ts` | "13: *   2. **Supersede, never delete, never rewrite.** The only write this pass can" | kept | R4: 13 · match |
| 21 | 5 | 21 facts, none committed; 12 of 14 stale | [unverified] by the seat | brief grounding (orchestrator's read-only script) | see Brief | kept as brief grounding, not re-measured by a second agent | — |

**Facts settled by the orchestrator after review** (raised by R2, R3):
- `grep -c -F "end_line" src/kb/neighbours.ts` → `0` · `grep -n -F "source_location" src/kb/neighbours.ts` → `55:  source_file?: unknown; source_location?: unknown;` · `136:      sourceLocation: strOrNull(n.source_location),` · a sample node in `graphify-out/graph.json` carries `"source_location":"L1"`: the code graph records a symbol's start line only, no end line, so a symbol-span hash needs a span source the graph does not hold today.
- `grep -n -F "takes an injected launcher" src/server.ts` → `3172:  // described as if it did. \`runDelegatePass\` takes an injected launcher and`: the delegated pass has no launcher wired, so no model-written fact is produced or stored today.
- Freshness is hashed in the main checkout (`fileHash(mainRoot, …)`), not the agent's worktree (brief grounding).

## Tally

| Response | Seat | Ranks received | Average |
|---|---|---|---|
| X | 1 Expansionist | 1, 1, 1, 2 | 1.25 |
| Z | 2 Contrarian | 2, 2, 5, 1 | 2.50 |
| V | 3 Maintainer | 4, 3, 2, 4 | 3.25 |
| W | 5 First-principles | 3, 5, 4, 3 | 3.75 |
| Y | 4 Executor | 5, 4, 3, 5 | 4.25 |

Excluded rankings: none · Re-requested: none

## Verdict

Council · deep · 5 seats (5 subagent) · review 4/4 · diversity: one position, different reasons · degraded: brief leaned (4/4 reviewers + chairman)

### Framing
Leans to B and against C: "each step shipped and measured before the next"; "A committed format is hard to reverse"; "building much with one developer delays everything else"; C carries the goal "agents never hallucinate". One counter-lean shields C: "asked that an option not be dismissed only because prior systems did not do it".

### Positions
Expansionist: "B, with one change — pull a minimal additive format step (a format-version field plus optional symbol anchors and `sources`) forward into step 1, before step 2's commit controls freeze today's shape."
Contrarian: "Choose B, stopping before step 6 until shared facts exist; reject C."
Maintainer: "Choose B, amended so step 6 opens by adding a format-version field alone, with C's retain/reflect layer left unscheduled."
Executor: "B, staged with format last, with step 2 (dashboard share/keep-local/commit) pulled into the same first week as step 1."
First-principles: "B, cut to its first two steps as the entire next version, with steps 3–6 each gated on a measurement taken from real shared use."

### Where the members agree
5 of 5 seats choose B; none backs A, C or D as written. Verified: freshness is a whole-file hash (memory.ts:657, 663), stale facts are withheld (1148), nothing is committed, and no format version exists.

### Where they clash
- **Version field timing:** Expansionist wants it in step 1 with symbol anchors and `sources`; Maintainer at step 6. Expansionist ranked first (1.25) on verified claims, but all four reviewers faulted the bundle as shape before measurement.
- **Scope:** First-principles stops after step 2; Contrarian before step 6.

### Blind spots
- The code graph stores a symbol's start line only, so Executor's symbol-hash plan is struck.
- Freshness hashes the main checkout, not the agent's worktree.
- Nobody checked whether the 12 stale-reading facts are actually wrong.
- A weak reader can rubber-stamp a suspect fact; nothing audits re-validations.

### Recommendation
B, with a format-version field alone added before step 2 commits anything.
- **Copilot-style re-validation and stale-fact handling:** step 1 (`suspect`, re-check instead of withhold).
- **Duplicate handling:** step 3 admission check on top of the existing consolidate pass; MinHash deferred at 21 facts.
- **Entity hash map and graph view:** step 5, in memory, with existing file anchors as evidence; stored `sources` deferred to step 6.
- **OKF format:** step 6. Deferred because the parser silently coerces unknown types (memory.ts:369) and no fact is shared yet.
- **Hindsight retain/reflect:** unscheduled, not dropped, on code evidence rather than precedent. The validator rejects any new content word (delegate.ts:25), no launcher is wired (server.ts:3172), and produced facts carry no anchors.
- **Hindsight recall:** budget trim and anchored serving land in steps 3–4; multi-arm fusion deferred.

Confidence: medium — unanimous and code-verified, but the brief leans to B, external evidence is relayed, and 12-of-14 was not re-run.

### What would overturn it
- At least 8 of the 12 stale-reading facts are genuinely wrong on that branch: keep the file hash and skip symbol work.
- Teammates already hold committed facts: the version field becomes a migration.
- A test shows a derived item turns stale when a premise anchor changes, plus over 50% acceptance under the unloosened validator on 100+ committed facts: schedule C's reflect.
- Several hundred committed facts with measured recall misses: bring A's index and format forward.

### First step
Read-only: re-run the anchor comparison against `bugfix/team-admit-stuck` and hand-label each of the 12 stale-reading facts true or false for that branch.

## Degradation notes

- A reviewer's and the chairman's FRAMING check quoted a lean in the brief (toward B, against C) — confidence capped at medium.
- Published-results grounding was read through a summarising fetch tool; relayed, not opened. Treat those numbers as approximate.
- The 12-of-14 stale measurement was made by the orchestrator's script only; no second agent re-ran it.
- No seat argued for C; the option was judged without an advocate. No re-seat was made because the seats' reasons differed.

## Memory

save_memory: mem-council-decision-combined-memory-system-build (advisory). The earlier advisory fact mem-council-decision-memory-graph-okf-hindsight was left in place (`supersedes` null — different slug); remove it once the owner decides.
