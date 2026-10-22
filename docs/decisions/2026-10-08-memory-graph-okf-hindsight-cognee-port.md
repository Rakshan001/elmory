# Council: what Baton's next memory version should be built from

- **Date:** 2026-10-08
- **Status:** advisory — not acted on
- **Tier:** deep
- **Run:** 5 seats (5 subagent) · review 4/4 · diversity ✓
- **Degraded:** brief leaned toward the smaller options (all four reviewers); external research was read through a summarising fetch tool; its quotes are relayed, not opened by the orchestrator
- **Prior verdict:** none on this question. Related: `mem-council-decision-code-lookup-index-versus` (2026-10-06, advisory) recommends a name map inside the existing code-graph index for code lookup — a different store, not reopened here.

## Question (as asked)

"i was planning google OKF is best for retrieving context … we create the hashmap so it easily find the related docs … i am planning to use hindsight … take the concept … all these .md will display like graph and we use hashmap so agents easily find its related file so memories goes on improving helps on token saving … use dsa concept like dijkstra … we invent new memory type like hindsight … if we use OKF and hindsight logics so even very bad llm also result in better output … dont come to conclusion directly … think outside the box" — later adding https://github.com/topoteretes/cognee.

## Brief

DECISION: Which design should Baton's next project-memory version be built on, given that the memory must be shareable with teammates' agents and useful to cheap models?

OPTIONS (neutral order):
- A · Sharing only: keep the fact store and recall as they are; add dashboard controls to share / keep-local / commit facts, and nothing else.
- B · OKF layer: A, plus a generated `index.md` and `log.md` per topic, OKF frontmatter fields (`type`, `title`, `description`, `tags`, `timestamp`), and Markdown links between facts. Recall code unchanged; agents read the index first.
- C · Deterministic memory graph: B, plus an entity → facts hash map (entities = file paths, code-graph symbols, tags), typed facts, one-hop expansion from the first hits, rank fusion across keyword / entity / time, a token-budget trim, a per-fact usage weight, and a graph view of memory in the app. No model anywhere in Baton.
- D · Model-written memory graph: C, plus Hindsight/Cognee-style write-time extraction (entities, causal links, consolidated "observations", session distillation, a reflect step), with every model call delegated to the user's own agent on its cheapest tier; optionally a local embedding arm.
- E · Embed an existing engine: run Hindsight or Cognee itself beside Baton and route memory through it.

CONSTRAINTS:
- `grep -n "Daemon stays zero-dependency" CLAUDE.md` → `18:- **Daemon stays zero-dependency**: \`src/server.ts\` is raw \`node:http\`. No express/fastify.`
- Runtime dependencies in `package.json` are `@modelcontextprotocol/sdk`, `commander`, `execa`, `gray-matter`, `zod`; no Python runtime is shipped.
- Product rules recorded by the owner: Baton makes no model calls itself ("does not buy tokens, it delegates"); memory tooling "may reorganise, never originate"; no invented numbers shown to users; must work offline; demo mode must keep working.
- Memory is shared by committing Markdown to git; teammates receive it by pulling.

STAKES: Memory is read at the start of agent sessions, so its size and precision are paid for on every session by every teammate. A design that needs a model, a database or a download excludes offline and low-budget users; one that returns the wrong or stale fact sends a weak model in the wrong direction with nothing to contradict it. A store format change is hard to reverse once teammates have committed facts in it.

GROUNDING — Baton today (commands run in the main checkout):
- `grep -n "FACT_CAP" src/memory.ts` → `125:export const FACT_CAP = 500;`
- `grep -n "function recall" src/memory.ts` → `1140:export async function recallMemories(` · `1604:export function recallRows(facts: MemoryStatus[], fullCount = RECALL_FULL_BODIES): RecallRow[] {`
- `grep -n "BM25" src/memory.ts` → includes `1170:    // BM25 (FTS5) with synonym/identifier expansion; scoreMemory is its fallback.`
- `grep -n "RELATED_CAP" src/memory.ts` → `1075:const RELATED_CAP = 3;` · `1078:export function relatedByAnchors(picked: MemoryStatus[], candidates: MemoryStatus[], cap = RELATED_CAP): MemoryStatus[] {` (facts sharing anchor files with the hits)
- `grep -n "links" src/memory.ts` → no matches (same tool and file find `related`, 10 hits): facts carry no links to other facts.
- `grep -rln "embedding" src` → `src/skills/catalog.ts`, `src/skills/bundled/prompt-master/SKILL.md` only: no embedding code in memory or kb.
- `grep -n "Freshness" src/memory.ts` → `71:export type Freshness = 'fresh' | 'aging' | 'stale';`; stale facts are withheld from recall (`const usable = all.filter((f) => f.freshness !== 'stale');` in `recallMemories`).
- Fact file shape (first file under `baton/memory/facts/`): frontmatter `id`, `type`, `agent`, `author`, `task`, `created`, `commit`, `files: [path@hash]`, `supersedes`, `fingerprint`; body is 1–3 sentences.
- `ls baton/memory/facts | wc -l` → 17 · `ls .baton/memory/facts | wc -l` → 3 · `git ls-files baton/memory | wc -l` → 0: 20 facts after about a month of use, none committed.
- `grep -n "local" web/src/features/Memory.tsx` → no matches; `grep -n "localOnly" src/server.ts` → no matches: the dashboard and HTTP API have no share / keep-local control. `local_only` exists on the agent-facing `save_memory` tool.
- `grep -n "ORIENT_MAX_CHARS" src/kb/orient.ts` → `25:export const ORIENT_MAX_CHARS = 3200;` (the project brief every session can load).
- `ls src/memory/` → `consolidate.ts`, `delegate.ts`: zero-model duplicate consolidation and delegation to the user's agent already exist.
- A code knowledge graph of the repo exists (`src/kb/neighbours.ts`, `graphify-out/graph.json`, 11 MB).

GROUNDING — external (two web research passes on 2026-10-08, read through a summarising fetch tool; every line is `[relayed]`, not opened by the orchestrator):
- OKF (Google Cloud Open Knowledge Format v0.1): a directory of Markdown files with YAML frontmatter (`type` required), reserved `index.md` and `log.md`, Markdown links as the graph; no embeddings, no staleness mechanism.
- Hindsight (arXiv 2512.12818, MIT): four memory networks; write = one LLM extraction call plus a background consolidation pass; recall = semantic + BM25 + graph + temporal arms, reciprocal rank fusion (k=60), cross-encoder rerank, token-budget trim, no LLM at query time. Needs Postgres with a vector extension, an embedding model and a reranker. Release 0.5.0 removed its spreading-activation graph walks in favour of one-hop link expansion, described as "empirically more accurate in our benchmarks". Repo search for `dijkstra`, `shortest_path`, `pagerank` → no hits. No invalidation of facts that become false; "forgetting mechanisms" are future work. Benchmarks are conversational (LongMemEval, LoCoMo), self-reported: 83.6% with a 20B open model vs 39.0% for the same model with full context and 60.2% for full-context GPT-4o; 89.0% and 91.4% with larger models.
- Cognee (Apache-2.0, Python): `cognify` = "2 LLM calls per chunk"; default stores SQLite + LanceDB + a Kuzu-compatible graph DB. Its code-graph pipeline is documented as deterministic ("No LLM Providers or embedding configuration is required"), with query operations such as `impact_analysis`, `find_path`, `delta`. `feedback_weight` on nodes/edges used in retrieval shifts later ranking. Benchmarks self-run on 12–24 questions per dataset.
- Letta: a plain filesystem agent scored 74.0% on LoCoMo (gpt-4o-mini) vs 68.5% reported for Mem0's graph variant (vendor-run).
- LoCoMo audit (Penfield Labs): 6.4% of the answer key wrong; the judge accepted 62.81% of intentionally wrong answers.
- HippoRAG 2 paper: "all previous structure-augmented methods underperform against the strongest embedding-based RAG methods"; BM25 59.0 / 28.8 F1 on NQ / MuSiQue vs HippoRAG 2 63.3 / 48.6 (the latter needs an LLM at indexing plus embeddings).
- VibeMemBench (arXiv 2609.23570, coding agents, 111 tasks from 90 SWE-bench repos; Mem0, SimpleMem, MemoryOS, A-MEM): "eleven of twelve solver and system pairings fail to exceed the matched memory-off baseline"; injecting verified history directly gained 1.1–4.5 points on four of five solvers; the weakest solver was not the biggest gainer.
- CodeRAG-Bench: gold context gives GPT-4o "a 27.4% gain on SWE-Bench"; "retrievers often struggle to fetch useful contexts"; generators "can be easily distracted by additional contexts".
- Karpathy LLM-wiki note: "at small scale the index file is enough" (~hundreds of pages).
- No benchmark found measures any of these systems on codebase knowledge at a few hundred to a few thousand short facts.

OUT OF SCOPE: the Team Sync transport; licence enforcement; the code-lookup route decided on 2026-10-06; whether to show "tokens saved" as a modelled number (ruled out 2026-09-24).

Clarifying question asked: none. Assumption stated: "hashmap" means an in-memory inverted index from entity to facts; "Dijkstra" means any graph-traversal retrieval.

## Seats

| # | Lens | Seat type | Model / provider | Tension with |
|---|---|---|---|---|
| 1 | Expansionist | subagent | host | Contrarian, Maintainer — upside of a new memory type vs its failure modes and upkeep |
| 2 | Contrarian | subagent | host | Expansionist — argues against the option the owner leans toward |
| 3 | First-principles | subagent | host | Maintainer — is "retrieval structure" even the bottleneck, or is it capture |
| 4 | Maintainer | subagent | host | Expansionist — store format and code owned for two years |
| 5 | User-advocate | subagent | host | Maintainer — what a low-budget "vibe coder" on a weak model actually gains or loses |

## Answers

### Seat 1 — Expansionist
POSITION: Build C (deterministic memory graph), shipped in the order A → B → C, with the OKF frontmatter and typed links designed so D's extraction can later be added through the existing delegate path without a format change.

REASONING: The upside nobody else owns is the join between two assets Baton already has: content-hashed file anchors on every fact and a code graph of the repo. Today they are unconnected. An entity → facts index keyed on paths and graph symbols turns memory into "what do we know about what this file touches" — impact-aware recall that Hindsight and Cognee cannot offer without an LLM, and that stays offline and zero-model. That is the differentiated product, and it compounds with stale-withholding. A and B alone leave that door shut; E forfeits it and breaks the dependency and offline rules. D is the bigger prize but its write-time extraction originates content, which the current validator forbids by construction; C leaves D open as a pure addition, because links and types are already in the committed Markdown. At 20 facts, format is the irreversible choice, so settle it now while it is cheap. One-hop expansion is the relayed Hindsight 0.5.0 finding, which I rely on unopened.

CLAIMS:
- Facts already carry commit and file anchors, the natural entity keys: src/memory.ts:51 — "  anchors: { commit: string | null; files: FileAnchor[] };"
- A code-graph query exists to join against: src/kb/neighbours.ts:213 — "export async function queryNeighbours("
- Memory does not use it today: `grep -n "neighbours" src/memory.ts` → no matches (same tool and file: `grep -c "anchors"` → 54).
- Current fact-to-fact expansion is capped at three: src/memory.ts:1075 — "const RELATED_CAP = 3;"
- D's extraction conflicts with the enforced rule: src/memory/delegate.ts:13 — " * **The model may REORGANISE, never ORIGINATE.**"

WHAT WOULD CHANGE MY MIND: A replay of real sessions on this repo's facts showing entity/one-hop expansion adds no correct fact beyond BM25 plus `relatedByAnchors`, or adds distractors that hurt a cheap model — then stop at B. Evidence that the fact store will stay under roughly 100 facts per project would do the same. Conversely, a validator design that makes extracted links mechanically checkable would move me to D.

### Seat 2 — Contrarian
POSITION: Choose A now, plus only B's generated `index.md` as a rebuildable, uncommitted derivative — no new frontmatter, no stored links, no model-written graph (reject D).

REASONING: D's concrete failure mode: model-written causal links and consolidated "observations" are claims about relationships between facts, not about files. Baton's freshness is computed per fact from its file anchors, so an edge or observation has nothing to re-hash. When one endpoint goes stale, the observation synthesised from it stays served, and one-hop expansion re-admits withheld content by another route. That defeats stale-withholding, the one property the external systems lack (Hindsight has no invalidation — relayed). It also collides with the owner's own rule: an observation that passes all-content-words containment is a concatenation, not an insight; one that is useful fails the validator. How we would notice: we mostly would not — a weak model follows a wrong fact silently.

C fails differently: at 20 facts with none committed, rank fusion and usage weights are untestable, and usage weight committed to git is a merge-conflict generator. The real bottleneck is that sharing has no control at all (relayed: VibeMemBench shows memory systems rarely beat memory-off).

CLAIMS:
- Freshness is derived only from a fact's own stale reason and commit distance — src/memory.ts:1005 — "const freshness: Freshness = staleReason ? 'stale' : commitsBehind && commitsBehind > 0 ? 'aging' : 'fresh';"
- Anchorless content is already a known blind spot — src/memory.ts:997 — "// A fact with no file anchors has nothing to re-hash — the stale check"
- Recall withholds stale facts — src/memory.ts:1148 — "const usable = all.filter((f) => f.freshness !== 'stale');"
- The origination ban is mechanical — src/memory/delegate.ts:13 — " * **The model may REORGANISE, never ORIGINATE.**"
- Containment is total, so paraphrased observations are rejected — src/memory/delegate.ts:25 — " * Every CONTENT WORD of a produced fact must appear in a fact that produced"
- Usage weights in git would cause merge conflicts; observations/edges would have no anchors — design inference about a proposal [unverified]

WHAT WOULD CHANGE MY MIND: A committed store of 200+ facts across two or more teammates, plus a replayed set of real recall queries where current BM25 + anchor-related recall misses the needed fact in the top 3 on more than roughly a fifth of queries, and entity expansion recovers it without serving any fact whose source is stale. For D specifically: a design where every edge and observation inherits staleness from all of its source facts, with a test proving it.

### Seat 3 — First-principles
POSITION: Choose A (sharing only), with B/C gated on an observed recall miss from real committed facts rather than built ahead of one.

REASONING: The underlying goal is "a teammate's cheap agent receives a correct fact at session start". That chain has three links: facts exist, facts travel, facts get retrieved. Options B–E all strengthen the third link, but the second is the broken one: nothing is committed and no human-facing control exists to commit anything. Retrieval design cannot be the binding constraint for a corpus of 17 facts that already has BM25, anchor-based related expansion and stale-withholding, under a store capped at 500. External evidence ([relayed], not opened by me) points the same way: an index suffices at hundreds of pages, most coding-memory systems fail to beat memory-off, and extra context distracts generators. C's entity map and fusion are optimising a ranking problem nobody has measured; B's frontmatter is a format commitment made before any teammate has used the format, which is the hard-to-reverse move the stakes warn against. A is the only option that produces the evidence needed to judge the others.

CLAIMS:
- Store is capped small — src/memory.ts:125 — "export const FACT_CAP = 500;"
- Stale facts are already withheld from recall — src/memory.ts:1148 — "const usable = all.filter((f) => f.freshness !== 'stale');"
- Keyword ranking already exists — src/memory.ts:1170 — "// BM25 (FTS5) with synonym/identifier expansion; scoreMemory is its fallback."
- One-hop-style expansion already exists — src/memory.ts:1075 — "const RELATED_CAP = 3;"
- Dashboard has no share control: `grep -n "localOnly" web/src/features/Memory.tsx` → no matches (same tool and file find "freshness", 3+ hits); `git ls-files baton/memory | wc -l` → 0.

WHAT WOULD CHANGE MY MIND: A logged set of real recall queries, against 100+ committed facts, where the right fact existed and current recall missed it or ranked it below the trim; or teammates committing facts and reporting session-start cost as the complaint.

### Seat 4 — Maintainer
POSITION: Hybrid "A + derived-C": ship A's share controls, and take from C only what can be rebuilt in memory from today's fact files (entity→facts map, one-hop expansion, budget trim); reject B's on-disk additions, D and E.

REASONING: The only irreversible thing here is what teammates commit. Nothing is committed yet (grounding: 0 tracked facts), so the format is cheapest to keep stable now. B adds generated `index.md`/`log.md` and new frontmatter to tracked files: generated files in git mean a merge conflict per concurrent save, forever, owned by whoever inherits this. OKF's `type` also collides with Baton's existing closed `type` enum, and there is no version field to migrate on. C's retrieval is a generalisation of code already present, and as a derived index it is deletable without touching anyone's repo. Per-fact usage weight must stay local or it churns tracked files. D adds prompt-maintenance on top of a 1655-line memory.ts; E breaks the dependency rule. At 20 facts, graph machinery beyond one hop is unowned weight.

CLAIMS:
- One-hop entity expansion already exists for file anchors — src/memory.ts:1078 — "export function relatedByAnchors(picked: MemoryStatus[], candidates: MemoryStatus[], cap = RELATED_CAP): MemoryStatus[] {"
- `type` is a closed enum; unknown values silently coerce — src/memory.ts:369 — "type: MEMORY_TYPES.includes(data.type as MemoryType) ? (data.type as MemoryType) : 'reference',"
- Rewriting tracked frontmatter is already a known cost — src/memory.ts:387 — "// rewrites the frontmatter with the computed value — in TRACKED files, so"
- No format version: `grep -c "schema" src/memory.ts` → 0; `grep -c "version" src/memory.ts` → 0; control `grep -c "usable" src/memory.ts` → 8.
- Generated index files would conflict on concurrent saves [unverified]

WHAT WOULD CHANGE MY MIND: A measured recall miss on real Baton facts that an agent-read `index.md` fixes and a derived index cannot; or a teammate tool that consumes OKF directly.

### Seat 5 — User-advocate
POSITION: Build B (sharing controls plus a generated OKF index), with exactly one piece of C pulled forward — the token-budget trim — and defer the graph, usage weights, graph view, D and E.

REASONING: The teammate's agent currently receives nothing: 20 facts after a month, none committed. Their loss is not weak ranking, it is an empty store, and only the share / keep-local / commit control fixes that. The vibe coder cannot audit recall, so every extra ranking arm is one more way a confident wrong fact reaches a weak model unchallenged; relayed research (VibeMemBench, CodeRAG-Bench, not opened by me) says added memory rarely beats memory-off and that extra context distracts. At tens of facts a readable `index.md` is something both a human and a cheap model can check by eye; a graph view is not. B is also nearly free to migrate: facts already carry `type`, so OKF fields are additive and reversible. D spends the low-budget user's tokens on every write; E breaks offline.

CLAIMS:
- Sharing is agent-only today: src/mcp.ts:768 — "local_only: z.boolean().optional().describe('Keep out of git: private to this machine. Not for secrets — those are refused'),"
- The dashboard has no such control: `grep -n "localOnly" web/src/features/Memory.tsx` → no output; same tool and file find `freshness`, 8 hits.
- One-hop expansion already exists: src/memory.ts:1075 — "const RELATED_CAP = 3;"
- Stale facts are already withheld: src/memory.ts:1148 — "const usable = all.filter((f) => f.freshness !== 'stale');"
- Facts already have OKF's required field: baton/memory/facts/mem-a-hub-s-repo-list-is.md — "type: gotcha"

WHAT WOULD CHANGE MY MIND: A replay on Baton's own committed facts (a few hundred or more) showing entity/rank-fusion recall returns the right fact where current BM25 plus anchors misses it, at equal or lower token cost — then C.

## Diversity check

Real spread: A (First-principles) · A + uncommitted generated index (Contrarian) · A + derived in-memory parts of C (Maintainer) · B + token trim (User-advocate) · C staged A → B → C (Expansionist). Re-seated: none.

## Peer review

**Anonymization mapping** (shuffled; letters P–T so they cannot be confused with options A–E): P = seat 4 · Q = seat 1 · R = seat 5 · S = seat 2 · T = seat 3
Reviewers: fresh subagents R1..R4
**Citation slices** (18 distinct citations after merging duplicates; disjoint): R1 = 1–5 · R2 = 6–10 · R3 = 11–14 · R4 = 15–18

### Reviewer R1
CRITIQUE:
Response P: strongest — separates derived (deletable) index from committed format, the one irreversible thing · weakest — its merge-conflict argument against B is self-marked [unverified].
Response Q: strongest — the only concrete upside: joining file anchors to the code graph, with a verified "not joined today" · weakest — "links and types are already in the committed Markdown" contradicts the brief (0 committed, no links).
Response R: strongest — empty store, not ranking, is the teammate's loss · weakest — calls OKF frontmatter "reversible" against the brief's stakes; cites a cap constant as proof expansion exists.
Response S: strongest — edges/observations have no anchors to re-hash, so D defeats stale-withholding · weakest — mostly argues against D, thin on choosing between A/B/C.
Response T: strongest — exists/travels/retrieved chain; A produces the evidence · weakest — gives no trigger for when facts will actually get committed.

BIGGEST BLIND SPOT: Response Q — the join loads an 11 MB graph through a worker (`queryNeighbours` is async, returns `not-built` when absent); session-start cost and no-graph fallback are unaddressed.

ALL MISSED: Whether committed facts' `files: [path@hash]` anchors stay valid on a teammate's checkout/branch; if they stale on pull, sharing delivers withheld facts.

RE-RUN CHECK:
1. `grep -F -n "  anchors: { commit: string | null; files: FileAnchor[] };" src/memory.ts` → `51:  anchors: { commit: string | null; files: FileAnchor[] };` — match
2. `grep -F -n "export async function queryNeighbours(" src/kb/neighbours.ts` → `213:export async function queryNeighbours(` — match
3. `grep -n "neighbours" src/memory.ts` → no output (exit 1); control `grep -c "anchors" src/memory.ts` → `54` — match
4. `grep -F -n "const RELATED_CAP = 3;" src/memory.ts` → `1075:const RELATED_CAP = 3;` — match (Q, R, T)
5. `grep -F -n " * **The model may REORGANISE, never ORIGINATE.**" src/memory/delegate.ts` → `13: * **The model may REORGANISE, never ORIGINATE.**` — match (Q, S)

FALSE OR UNSUPPORTED CLAIMS: No citation in my slice is wrong. Unsupported: Q's "already in the committed Markdown" (brief: `git ls-files baton/memory | wc -l` → 0; `links` → no matches). R and T label line 1075 "one-hop expansion already exists"; that line is only the cap — the function is at 1078, called at 1175. P's and S's merge-conflict claims are [unverified] and both arguments lean on them. Citations outside my slice: unchecked.

FRAMING: Leans against D/E and towards A–C: "A design that needs a model, a database or a download excludes offline and low-budget users"; "No model anywhere in Baton" echoes the owner's rule as a virtue of C.

FINAL RANKING:
1. Response S
2. Response P
3. Response T
4. Response Q
5. Response R

### Reviewer R2
CRITIQUE:
Response P: strongest — separates irreversible committed format from a deletable derived index · weakest — its central merge-conflict claim is [unverified].
Response Q: strongest — names a concrete join (file anchors x code graph) · weakest — "settle format now" at 20 facts, with no measured recall miss.
Response R: strongest — empty store, not ranking, is the teammate's loss · weakest — calls new frontmatter "reversible" against the brief's stakes.
Response S: strongest — derived edges/observations have no anchors, so expansion can re-admit withheld content · weakest — line 997 cited as an open blind spot; the code already closes it.
Response T: strongest — three-link chain; A generates the evidence · weakest — FACT_CAP 500 shows a cap, not that retrieval is adequate.

BIGGEST BLIND SPOT: Response Q — never addresses staleness propagation through its links/one-hop expansion.

ALL MISSED: Committing facts makes `files: [path@hash]` anchors meet teammates' divergent branches; nobody asks whether shared facts read stale on a different checkout.

RE-RUN CHECK (all `grep -F -n "<quoted text>" <file>`, repo root):
6. src/memory.ts → `1005:    const freshness: Freshness = staleReason ? 'stale' : commitsBehind && commitsBehind > 0 ? 'aging' : 'fresh';` — match
7. src/memory.ts → `997:    // A fact with no file anchors has nothing to re-hash — the stale check` — match
8. src/memory.ts → `1148:  const usable = all.filter((f) => f.freshness !== 'stale');` — match
9. src/memory/delegate.ts → `25: * Every CONTENT WORD of a produced fact must appear in a fact that produced` — match
10. src/memory.ts → `125:export const FACT_CAP = 500;` — match

FALSE OR UNSUPPORTED CLAIMS: No number/text mismatch in my slice. Two interpretive overreaches by S:
- Citation 7: the quote is accurate but the comment continues (998-1001) "above is blind to it, so without this it would be served as fresh / forever... Age it out on commit / distance instead", and line 1002 marks anchorless facts stale past `UNANCHORED_STALE_BEHIND`. So it is a handled case, not an open blind spot; an anchorless observation would age out by commit distance (though not by source-fact staleness — S's core point survives, weakened).
- Citation 9: inference mostly follows. Lines 30-32: "It / rejects legitimate paraphrases, and that is the accepted trade: the model / must reuse the source's words rather than reword them." A new-vocabulary insight does fail. "Concatenation" is overstated — selection/reordering/merging in source words passes — and the validator governs the existing consolidation pass; applying it to D's hypothetical observations is S's extension.
- Argument-bearing [unverified]: P's and S's merge-conflict claims.

FRAMING: Leans toward A/B and against D/E: "20 facts after about a month of use, none committed"; "A design that needs a model, a database or a download excludes offline and low-budget users".

FINAL RANKING:
1. Response S
2. Response T
3. Response P
4. Response R
5. Response Q

### Reviewer R3
CRITIQUE:
Response P: strongest: keeps C's index derived and deletable, so nothing irreversible is committed · weakest: the central merge-conflict claim is [unverified], and the `type` "collision" is overstated.
Response Q: strongest: names the one differentiated asset, joining fact anchors to the code graph · weakest: settles the format "now" at 20 facts with no recall miss measured.
Response R: strongest: empty store, not ranking, is the teammate's loss · weakest: calls OKF frontmatter "additive and reversible" against the brief's stakes, with no evidence.
Response S: strongest: model-written edges have no anchors to re-hash, so they bypass stale-withholding · weakest: this mostly argues against D, and C's rejection is thinner.
Response T: strongest: the exists/travels/retrieved chain, with A producing the evidence to judge the rest · weakest: assumes a dashboard control is what makes facts travel.

BIGGEST BLIND SPOT: Response Q — never weighs the relayed evidence that added context distracts weak models; entity expansion widens recall with no precision guard.

ALL MISSED: Why zero facts are committed. The session's git status shows `baton/memory/` untracked, and the owner commits only on explicit approval, so a share button may not change the count. No response checked this.

RE-RUN CHECK (all run from the repo root):
11. `grep -F -n "// BM25 (FTS5) with synonym/identifier expansion; scoreMemory is its fallback." src/memory.ts` → `1170:    // BM25 (FTS5) with synonym/identifier expansion; scoreMemory is its fallback.` — match.
12. `grep -n "localOnly" web/src/features/Memory.tsx` → no output (exit 1) — match. Control `grep -c "freshness" web/src/features/Memory.tsx` → `8` — match for Response R ("8 hits"); consistent with Response T ("3+ hits"), though imprecise.
13. `grep -F -n "export function relatedByAnchors(picked: MemoryStatus[], candidates: MemoryStatus[], cap = RELATED_CAP): MemoryStatus[] {" src/memory.ts` → `1078:export function relatedByAnchors(picked: MemoryStatus[], candidates: MemoryStatus[], cap = RELATED_CAP): MemoryStatus[] {` — match.
14. `grep -F -n "type: MEMORY_TYPES.includes(data.type as MemoryType) ? (data.type as MemoryType) : 'reference'," src/memory.ts` → `369:      type: MEMORY_TYPES.includes(data.type as MemoryType) ? (data.type as MemoryType) : 'reference',` — match.
    Definition: `grep -n "MEMORY_TYPES" src/memory.ts` → `32:export const MEMORY_TYPES: MemoryType[] = ['decision', 'gotcha', 'convention', 'reference', 'preference'];`, plus line 369 above and `731:  const type: MemoryType = MEMORY_TYPES.includes(input.type as MemoryType) ? (input.type as MemoryType) : 'reference';`.
    Does P's inference follow? Only partly. "Closed enum; unknown values silently coerce" is confirmed, on both read (369) and save (731). A collision follows only for `type` values outside those five, such as foreign OKF files or new OKF types. The brief says only that OKF's `type` is required, not what values it takes, so Baton's own facts already satisfy it and no collision is shown for them.

FALSE OR UNSUPPORTED CLAIMS:
- No citation in my slice is wrong; all four match by line number and text.
- Response P: "OKF's `type` also collides with Baton's existing closed `type` enum" is an overreach beyond line 369, as above.
- Response P: "Generated index files would conflict on concurrent saves" is [unverified] and its case against B depends on it.
- Response S: "usage weight committed to git is a merge-conflict generator" is [unverified].
- Response R: "OKF fields are additive and reversible" is asserted with no citation.

FRAMING: Leans toward A and against D/E. "A design that needs a model, a database or a download excludes offline and low-budget users"; "20 facts after about a month of use, none committed"; "the dashboard and HTTP API have no share / keep-local control".

FINAL RANKING:
1. Response S
2. Response T
3. Response P
4. Response Q
5. Response R

### Reviewer R4
CRITIQUE:
Response P: strongest — keeps C's retrieval as a derived, deletable index so nothing irreversible is committed · weakest — the generated-index merge-conflict claim is [unverified] and "no version field" rests on two word counts.
Response Q: strongest — names the unused join between fact anchors and the code graph · weakest — commits to format now on 20 uncommitted facts; one-hop benefit relies on an unopened relayed finding.
Response R: strongest — an empty shared store, not ranking, is the teammate's loss · weakest — "additive and reversible" ignores the closed `type` enum coercing unknown values to 'reference' (src/memory.ts:369, confirmed).
Response S: strongest — edges/observations have no anchors to re-hash, so D defeats stale-withholding; all five citations confirmed · weakest — an uncommitted index.md never reaches teammates.
Response T: strongest — facts exist / travel / get retrieved; the travel link is broken · weakest — defers session-start size entirely; no budget trim.

BIGGEST BLIND SPOT: Response Q — expansion through the code graph can re-admit stale or distracting facts to a weak model; it proposes no staleness inheritance for links.

ALL MISSED: A pulled fact's `path@hash` anchors are re-checked against the teammate's checkout; on a diverged branch, correct shared facts may read stale and be withheld. Nobody tested whether sharing survives stale-withholding.

RE-RUN CHECK:
15. `grep -F -n "// rewrites the frontmatter with the computed value — in TRACKED files, so" src/memory.ts` → `387:      // rewrites the frontmatter with the computed value — in TRACKED files, so` — match. Context (lines 377-390): the comment explains that `fingerprint` is computed from the body rather than read from frontmatter, so a repair/prune pass rewrites a divergent stored fingerprint in tracked files, "a silent migration, and it is the accepted cost". It supports "rewriting tracked frontmatter is already a known cost", but only for a one-line fingerprint repair, not for generated index files.
16. `grep -c "schema" src/memory.ts` → `0`; `grep -c "version" src/memory.ts` → `0`; `grep -c "usable" src/memory.ts` → `8` — match (all three).
17. `grep -F -n "local_only: z.boolean().optional().describe('Keep out of git: private to this machine. Not for secrets — those are refused')," src/mcp.ts` → `768:        local_only: z.boolean().optional().describe('Keep out of git: private to this machine. Not for secrets — those are refused'),` — match.
18. `grep -F -n "type: gotcha" baton/memory/facts/mem-a-hub-s-repo-list-is.md` → `3:type: gotcha` — match.

FALSE OR UNSUPPORTED CLAIMS: No wrong citation found in my slice. Outside the slice I also confirmed src/memory.ts:369, 997, 1005, 1148, src/memory/delegate.ts:13 and 25, src/kb/neighbours.ts:213, and the 1655-line count. Unchecked: Q's src/memory.ts:51 and the `neighbours`/`anchors` counts; T's and R's Memory.tsx `localOnly` grep (the control count of 8 `freshness` lines matches R). Arguments depending on unverified claims:
- P: "generated index files would conflict on concurrent saves" [unverified] carries its rejection of B.
- S: "usage weights in git would cause merge conflicts; observations/edges would have no anchors" [unverified] design inference carries its rejection of C and D.
- R: "OKF fields are additive and reversible" is inference; citation 18 shows only that a `type` field exists, not that OKF's type vocabulary fits Baton's closed enum.
- Q, R, S, T all lean on relayed external research none of them opened (each says so).

FRAMING: Leans toward the smaller options (A/B). Words that lean: "20 facts after about a month of use, none committed"; "A store format change is hard to reverse once teammates have committed facts in it"; "A design that needs a model, a database or a download excludes offline and low-budget users".

FINAL RANKING:
1. Response S
2. Response P
3. Response T
4. Response R
5. Response Q

## Claim checks

All 18 distinct citations were run by the orchestrator in one batch per file with `grep -F -n "<quoted text>" <file>` from the repo root, and re-run by a reviewer who did not write the row. Every line number returned by the tool equals the cited number.

| # | Seat(s) | Citation | Checked with (grep -F -n, text → file) | Line as found | Result | Re-run |
|---|---|---|---|---|---|---|
| 1 | 1 | src/memory.ts:51 | `anchors: { commit: string | null; files: FileAnchor[] };` → src/memory.ts | "51:  anchors: { commit: string | null; files: FileAnchor[] };" | kept | R1: same line · match |
| 2 | 1 | src/kb/neighbours.ts:213 | `export async function queryNeighbours(` → src/kb/neighbours.ts | "213:export async function queryNeighbours(" | kept | R1: same line · match |
| 3 | 1 | `neighbours` absent from src/memory.ts | `neighbours` → src/memory.ts; control `grep -c "anchors"` | no output (exit 1); control 54 | kept | R1: no output; 54 · match |
| 4 | 1, 3, 5 | src/memory.ts:1075 | `const RELATED_CAP = 3;` → src/memory.ts | "1075:const RELATED_CAP = 3;" | kept — but it is the cap, not the expansion (function at 1078) | R1: same line · match |
| 5 | 1, 2 | src/memory/delegate.ts:13 | `The model may REORGANISE, never ORIGINATE.` → src/memory/delegate.ts | "13: * **The model may REORGANISE, never ORIGINATE.**" | kept | R1: same line · match |
| 6 | 2 | src/memory.ts:1005 | `const freshness: Freshness = staleReason` → src/memory.ts | "1005:    const freshness: Freshness = staleReason ? 'stale' : commitsBehind && commitsBehind > 0 ? 'aging' : 'fresh';" | kept | R2: same line · match |
| 7 | 2 | src/memory.ts:997 | `A fact with no file anchors has nothing to re-hash` → src/memory.ts | "997:    // A fact with no file anchors has nothing to re-hash — the stale check" | kept — text matches; the seat's reading "known blind spot" is overstated: lines 998–1004 age anchorless facts out by commit distance | R2: same line · match; reading weakened |
| 8 | 2, 3, 5 | src/memory.ts:1148 | `const usable = all.filter((f) => f.freshness !== 'stale');` → src/memory.ts | "1148:  const usable = all.filter((f) => f.freshness !== 'stale');" | kept | R2: same line · match |
| 9 | 2 | src/memory/delegate.ts:25 | `Every CONTENT WORD of a produced fact must appear in a fact that produced` → src/memory/delegate.ts | "25: * Every CONTENT WORD of a produced fact must appear in a fact that produced" | kept — "concatenation" overstated; the validator covers the existing consolidation pass, extending it to option D is the seat's inference | R2: same line · match |
| 10 | 3 | src/memory.ts:125 | `export const FACT_CAP = 500;` → src/memory.ts | "125:export const FACT_CAP = 500;" | kept | R2: same line · match |
| 11 | 3 | src/memory.ts:1170 | `BM25 (FTS5) with synonym/identifier expansion` → src/memory.ts | "1170:    // BM25 (FTS5) with synonym/identifier expansion; scoreMemory is its fallback." | kept | R3: same line · match |
| 12 | 3, 5 | `localOnly` absent from web/src/features/Memory.tsx | `localOnly` → web/src/features/Memory.tsx; control `grep -c freshness` | no output (exit 1); control 8 | kept | R3: no output; 8 · match |
| 13 | 4 | src/memory.ts:1078 | `export function relatedByAnchors(` → src/memory.ts | "1078:export function relatedByAnchors(picked: MemoryStatus[], candidates: MemoryStatus[], cap = RELATED_CAP): MemoryStatus[] {" | kept | R3: same line · match |
| 14 | 4 | src/memory.ts:369 | `type: MEMORY_TYPES.includes(data.type as MemoryType)` → src/memory.ts | "369:      type: MEMORY_TYPES.includes(data.type as MemoryType) ? (data.type as MemoryType) : 'reference'," | kept — closed enum confirmed (`32:export const MEMORY_TYPES: MemoryType[] = ['decision', 'gotcha', 'convention', 'reference', 'preference'];`); "collides with OKF" holds only for type values outside those five | R3: same line · match; inference partly follows |
| 15 | 4 | src/memory.ts:387 | `rewrites the frontmatter with the computed value` → src/memory.ts | "387:      // rewrites the frontmatter with the computed value — in TRACKED files, so" | kept — about a one-line fingerprint repair, not generated index files | R4: same line · match |
| 16 | 4 | no `schema` / `version` in src/memory.ts | `grep -c schema`, `grep -c version`, control `grep -c usable` | 0 · 0 · 8 | kept | R4: 0 · 0 · 8 · match |
| 17 | 5 | src/mcp.ts:768 | `local_only: z.boolean().optional().describe('Keep out of git` → src/mcp.ts | "768:        local_only: z.boolean().optional().describe('Keep out of git: private to this machine. Not for secrets — those are refused')," | kept | R4: same line · match |
| 18 | 5 | baton/memory/facts/mem-a-hub-s-repo-list-is.md | `type: gotcha` → that file | "3:type: gotcha" | kept | R4: same line · match |

[unverified], never decisive: seat 4 "generated index files would conflict on concurrent saves"; seat 2 "usage weights in git would cause merge conflicts; observations/edges would have no anchors"; seat 5 "OKF fields are additive and reversible"; seat 1 "links and types are already in the committed Markdown" — **struck**: contradicted by grounding (0 tracked facts, no `links` in src/memory.ts).

**Fact settled after review (raised as ALL MISSED by R1, R2, R4):** freshness is decided by hashing the anchored file on disk in the current checkout — `grep -n "function fileHash" src/memory.ts` → `657:async function fileHash(mainRoot: string, relPath: string): Promise<string> {`, whose body is `const hash = sha1(await readFile(abs));`, compared in the status loop with `if (now !== a.hash) {` → `staleReason = ... changed since this was saved`. A fact pulled into a checkout where an anchored file differs (another branch, or a later commit) therefore reads stale and is withheld by line 1148.

## Tally

| Response | Seat | Ranks received (R1, R2, R3, R4) | Average |
|---|---|---|---|
| S | 2 Contrarian | 1, 1, 1, 1 | 1.00 |
| P | 4 Maintainer | 2, 3, 3, 2 | 2.50 |
| T | 3 First-principles | 3, 2, 2, 3 | 2.50 |
| Q | 1 Expansionist | 4, 5, 4, 5 | 4.50 |
| R | 5 User-advocate | 5, 4, 5, 4 | 4.50 |

Excluded rankings: none · Re-requested: none

## Verdict

Council · deep · 5 seats (5 subagent) · review 4/4 · diversity ✓ · degraded: brief leaned; external research relayed

### Framing
The brief leans toward the smaller options and against D/E (all four reviewers found this). Leaning words: "A design that needs a model, a database or a download excludes offline and low-budget users"; "20 facts after about a month of use, none committed"; "A store format change is hard to reverse once teammates have committed facts in it".

### Positions
Expansionist: "Build C (deterministic memory graph), shipped in the order A → B → C, with the OKF frontmatter and typed links designed so D's extraction can later be added through the existing delegate path without a format change."
Contrarian: "Choose A now, plus only B's generated `index.md` as a rebuildable, uncommitted derivative — no new frontmatter, no stored links, no model-written graph (reject D)."
First-principles: "Choose A (sharing only), with B/C gated on an observed recall miss from real committed facts rather than built ahead of one."
Maintainer: "Hybrid "A + derived-C": ship A's share controls, and take from C only what can be rebuilt in memory from today's fact files (entity→facts map, one-hop expansion, budget trim); reject B's on-disk additions, D and E."
User-advocate: "Build B (sharing controls plus a generated OKF index), with exactly one piece of C pulled forward — the token-budget trim — and defer the graph, usage weights, graph view, D and E."

### Where the members agree
- 5 of 5 seats ship A's sharing controls first.
- 0 of 5 build D or E now: three reject or defer D by name, Expansionist stages it for later, and First-principles stops at A.
- This agreement is genuine and rests on verified lines (no dashboard share control, 0 committed facts, the "REORGANISE, never ORIGINATE" rule).

### Where they clash
- **Committed format now:** Expansionist and User-advocate want OKF frontmatter now; Contrarian, Maintainer and First-principles want no on-disk change.
- **Retrieval before a measured miss:** Maintainer and Expansionist build it now; First-principles and Contrarian gate it.
- **Weight of the arguments:**
  - Contrarian ranked first, but its case against C rests on an [unverified] merge-conflict claim and its line-997 reading was weakened.
  - Maintainer's case against B is also [unverified], but its derived-only route does not depend on that claim.
  - Expansionist's "format is already there" sentence was struck.
  - User-advocate's "additive and reversible" is unverified.

### Blind spots
- Freshness hashes the anchored file in the reader's checkout, so pulled facts on a diverged branch read stale and are withheld. Sharing may deliver nothing.
- Nobody checked why zero facts are committed; a button may not change that.
- The code-graph join loads an 11 MB graph, with no fallback discussed.
- No seat proposed staleness inheritance for links.

### Recommendation
Choose Maintainer's hybrid, A plus derived-only C, which is a minority position.
- **Build now:** share / keep-local / commit controls; an in-memory entity→facts map over existing anchors; a token-budget trim; and the memory graph view, drawn from that derived map. Nothing new is committed.
- **Stage behind a measurement:** OKF frontmatter, committed `index.md`/`log.md`, stored links, rank fusion, usage weights, and the code-graph join.
- **Stage D behind a design test:** Hindsight/Cognee-style extraction only once edges provably inherit staleness from their source facts.
- **Drop:** E, the embedding arm, and any "weak models do better / saves tokens" claim until it is measured. No benchmark supports it at this scale.

Confidence: medium — the A-first and no-D/E agreement rests on verified code, but the retrieval value is unmeasured and the external research is relayed, not opened.

### What would overturn it
- **To full C:** on 100+ committed facts from 2+ teammates, current recall misses the needed fact in the top 3 on more than 20% of replayed queries, and entity expansion recovers it without serving any stale-sourced fact.
- **Back to A only:** the same replay shows expansion adds no correct fact.
- **To B:** a teammate tool consumes OKF directly.
- **To D:** a passing test proves staleness inheritance for edges and observations.

### First step
In a throwaway worktree on a different branch, load the 17 existing facts and count how many read `stale`.

## Degradation notes

- All four reviewers and the chairman quoted a lean in the brief toward the smaller options — confidence capped at medium.
- External research (OKF, Hindsight, Cognee, benchmarks) was read through a summarising fetch tool and is relayed, not opened by any seat — treat those lines as a hypothesis.
- Key claims [unverified]: the merge-conflict arguments against B and against committed usage weights.

## Memory

save_memory: mem-council-decision-memory-graph-okf-hindsight (advisory)
