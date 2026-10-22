# Council: form, format and first-release scope of a standalone open-source memory package

- **Date:** 2026-10-08
- **Status:** advisory — not acted on
- **Tier:** deep
- **Run:** 5 seats (5 subagent) · review 4/4 · diversity ✓
- **Degraded:** brief leaned toward B/C (all four reviewers and the chairman); external evidence relayed
- **Prior verdict:** mem-council-decision-combined-memory-system-build (advisory, 2026-10-08) — premises changed: the system is now to be a standalone package for coding and chat/RAG; OKF v0.2 spec, Kage and okf-agent-memory were cloned and read; new web research on search structures, non-generative models, formats and benchmarks. Re-run requested by the owner.

## Question (as asked)

"my planning is i release new memory system which i create as package and use in this baton … this memory system is for the coding and normal chat also … stored in the OKF right find the better alternative for this … 10 session works as 10 session memory and wired together … based on evidence we can break the chain … it will become knowledge graph … use hashmap or hashtable find the best matching dsa algorithm … research about that new [non-LLM] concept … use council to come to conclusion"

## Brief

DECISION: What should the open-source memory system be — its form, file format, first-release scope and relation to existing projects — given that the owner wants a memory package usable by coding agents and by chat/RAG bots, which Baton then consumes?

OPTIONS (neutral order; a seat may name a hybrid):
- A · New standalone package, Baton's own fact format: extract Baton's memory code into a package, keep its frontmatter (`id`, `type`, `files: [path@hash]`, `supersedes`, …) plus a format-version field; coding and chat evidence types in the first release.
- B · New standalone package on OKF v0.2 with namespaced extension keys: OKF `sources` / `generated` / `verified` / `status` / `stale_after` as the base; extensions for content-hash evidence, fact-to-fact evidence and a `suspect` state that propagates to dependent facts; coding and chat/RAG evidence (source file + hash, source message id, source document + hash) in the first release; reverse-dependency index + keyword index; graph viewer; optional non-generative classifier plug-ins (NLI for contradiction/support, cross-encoder for relevance).
- C · Same package and format as B, but the first release covers coding agents only (what Baton's memory already does, extracted and re-based on the format); chat/RAG evidence types, classifier plug-ins and the viewer follow as later releases.
- D · Do not start a new package: contribute to or build on an existing project (okf-agent-memory, MIT, Go; or Kage, GPL-3.0, TypeScript), adding the missing parts there, and have Baton consume that.
- E · No package now: improve memory inside Baton behind clean module boundaries (freshness, sharing controls, admission check, anchored serving, entity index, graph view), and extract a package later.

CONSTRAINTS:
- `grep -n -F "Daemon stays zero-dependency" CLAUDE.md` → `18:- **Daemon stays zero-dependency**: \`src/server.ts\` is raw \`node:http\`. No express/fastify.`
- Owner's product rules for Baton: Baton makes no model call itself; must work offline; no Python runtime shipped; no invented numbers shown to users.
- The owner has stated the intent to release a standalone package and use it in Baton, to serve both coding and chat/RAG, to visualise memory as a knowledge graph, and that linking/unlinking of memories be driven by evidence. Options D and E are included for the council to judge that intent.
- One developer builds Baton and would build and maintain the package.
- The owner asked that an option not be dismissed only because prior systems did not do it, and that arguments rest on logic and on sources opened now.

STAKES: A published file format and package API become a contract other people's stores depend on; changing them later breaks users. A package separate from Baton doubles release, documentation and support work for one developer. Building inside Baton only leaves no reusable artefact. Building what already exists spends months for no distinction; joining an existing project gives up control of format and roadmap.

GROUNDING — Baton today (main checkout, 2026-10-08):
- `grep -n -F "SPDX-License-Identifier" src/memory.ts` → `2:// SPDX-License-Identifier: AGPL-3.0-or-later` · `grep -n -F '"license"' package.json` → `39:  "license": "AGPL-3.0-or-later",`
- `grep -n "^import" src/memory.ts` → 12 imports, including `19:import { assessAnchor, claimedFiles } from './memory-repair.js';` · `25:import { git, gitTry } from './util/exec.js';` · `26:import { readAuthor, resolveAuthor, UNKNOWN_AUTHOR } from './identity.js';` · `28:import { rankFacts } from './memory-rank.js';` · `29:import { classifyDurability } from './memory-durability.js';` (memory code imports Baton-specific modules). `wc -c src/memory.ts src/memory/*.ts` → `132543 total`.
- `grep -n -F "node:sqlite" src/cli.ts` → `7: * Baton requires Node >= 24 (node:sqlite + FTS5). Someone who runs` (keyword search uses the Node built-in SQLite FTS5).
- `grep -n -F "FACT_CAP = " src/memory.ts` → `125:export const FACT_CAP = 500;` · `grep -n -F "async function fileHash" src/memory.ts` → `657:async function fileHash(mainRoot: string, relPath: string): Promise<string> {` (freshness = whole-file sha1 of the anchored file; stale facts withheld from recall).
- Store size: 21 facts after about a month, none committed to git; no teammate holds any. No chat/RAG consumer of Baton memory exists today.
- `grep -n -F "REORGANISE" src/memory/delegate.ts` → `13: * **The model may REORGANISE, never ORIGINATE.**`

GROUNDING — existing projects, cloned and read 2026-10-08 (clones at `<scratchpad>/{knowledge-catalog,Kage,okf-agent-memory}`; `<scratchpad>` = <scratchpad>; you may open them):
- OKF spec (`knowledge-catalog` @ 1d36d9d, `okf/SPEC.md`, 1006 lines, Apache-2.0): `grep -n -F "### 5.1 Provenance" okf/SPEC.md` → `287:### 5.1 Provenance: \`sources\`` · `grep -n -F "### 5.2 Trust" …` → `366:### 5.2 Trust: \`generated\` and \`verified\`` · `grep -n -F "### 5.5 Lifecycle" …` → `424:### 5.5 Lifecycle: \`stale_after\`` · `grep -n -F "stale_after: 2026" …` → `427:stale_after: 2026-09-23T00:00:00Z   # content is stale on/after this instant` … (5 hits, first shown; all are timestamps — staleness is a clock instant) · `grep -n -F "out of scope for v0.2" …` → `348:\`derived_from\`, or data lineage) is out of scope for v0.2.` · `grep -n -F "SHOULD preserve unknown keys" …` → `206:SHOULD preserve unknown keys when round-tripping and MUST NOT reject` · `grep -c -F "content_hash" …` → 0 and `grep -c -F "sha256" …` → 0 (same file: `grep -c -F "stale_after"` → 12).
- Kage (@ e7cc087, last commit 2026-08-21, TypeScript): `grep -n -F '"license"' mcp/package.json` → `38:  "license": "GPL-3.0-only",` · `grep -n -F "is withheld" README.md` → `167:  Memory that no longer matches the code is withheld, so the agent never acts on a stale claim.` and `258:  changed is withheld), vs 100% for capture-everything stores.` · `grep -n -F "dependency-free" README.md` → `256:  dependency-free: BM25 + sparse lexical scoring, no embeddings, no network.` · a `mcp/viewer` directory exists · `grep -rl -F "message_id" mcp` → no matches (same scope: `grep -rl -F "createHash" mcp` → 8 files). Its repo root holds `PIVOT.md`: `grep -n -F "Status: PROPOSAL" PIVOT.md` → `3:> Status: PROPOSAL for founder decision. Names ("Probe") are placeholders pending trademark/npm/domain check.` · `grep -n -F "Memory becomes" PIVOT.md` → `11:The headline noun moves from *memory* to *blast radius / verified impact*. Memory becomes an invisible internal evidence cache, never spoken to the user.` 39 GitHub stars [relayed].
- okf-agent-memory (@ 533b634, last commit 2026-10-04, Go, `LICENSE` line 1 `MIT License`): `grep -n -F "Built on Google OKF v0.2" README.md` → `83:* **Built on Google OKF v0.2**: Uses the open standard format for agent knowledge with full support for provenance (\`sources\`), trust tiers (\`generated\` vs. \`verified\`), and lifecycle metadata (\`status\`, \`stale_after\`).` · `grep -rn -F "CodeRefs" pkg` (non-test) → `pkg/okf/types.go:34:	CodeRefs    []string             \`json:"code_refs,omitempty"\`   // Referenced source paths or globs` (paths or globs, no hash) · `grep -rn -F "sha256.Sum" pkg` (non-test) → 5 hits, all in `pkg/registry` and `pkg/vault`, none in `pkg/okf`. 756 GitHub stars [relayed].

GROUNDING — web research 2026-10-08 (research agents opened the pages; every line `[relayed]`, numbers read once):
- Other formats checked: basic-memory (Markdown graph, AGPL-3.0, needs SQLite index + embeddings, 4.1k stars, no evidence/staleness fields), MCP memory server (JSONL, none), Letta MemFS (Markdown + git, none), AGENTS.md / llms.txt / Cline memory bank (no schema), PROV-O (W3C vocabulary: `wasDerivedFrom`, `wasInvalidatedBy`). OKF v0.2 was the only one found with spec-level provenance and staleness fields.
- Not found in any project: evidence types beyond code with `suspect` propagating through dependent facts; content-hash invalidation as a format extension; one store for both coding and chat/RAG; the evidence-checking variant under a permissive licence.
- Chat-memory benchmarks: LoCoMo full-context baseline ~73% vs Mem0 ~68% (source is a competitor's blog); Letta files + grep 74.0% vs Mem0 68.5%; an audit found 6.4% of LoCoMo's answer key wrong and its judge accepting 62.81% of intentionally wrong answers; ConvoMem: full context 70–82% vs Mem0 30–45% under 150 conversations, retrieval needed beyond ~300; LongMemEval-V2: file-based agentic method 72.5%, RAG 48.5%; STALE benchmark (implicit-conflict detection): best model 55.2%.
- Lexical vs vector on LongMemEval-S R@5: BM25-only 86.2%, hybrid 95.2% (self-reported by a project).
- Data structures: reverse dependency index (evidence → facts) + content hash per source + breadth-first marking matches JTMS-style truth maintenance; Salsa-style early cutoff stops propagation when a re-checked fact is unchanged; ATMS is exponential. A V8 Map of ~1M entries is ~29 MB; no published Node measurement of loading 10k–1M small files. SimHash precision/recall "near 0.75"; MinHash unstable on very short texts.
- Non-generative models: no text JEPA, HRM, TRM or energy-based model is downloadable for text tasks. Available offline in Node via ONNX/transformers.js: NLI cross-encoder `nli-deberta-v3-xsmall` (70.8M params; SNLI 91.64%), MS MARCO MiniLM cross-encoder (22.7M), MiniLM embeddings; accuracy figures are benchmark numbers, none measured on short memory facts.
- Coding-memory benchmark (VibeMemBench): 11 of 12 solver/system pairings fail to beat memory-off; 69.3% of failures are form degradation of the memory.

OUT OF SCOPE: running another memory engine as a service beside Baton; requiring an LLM, embedding model or database server in the package core; Team Sync transport; licence enforcement of Baton itself; the choice of package name.

Clarifying question asked: "What should the open-source thing be?" → owner: a new memory system released as a package and used in Baton, for coding and normal chat/RAG, with OKF-style files, evidence-based linking and unlinking, a hash-map search structure and a knowledge-graph view.

## Seats

| # | Lens | Seat type | Model / provider | Tension with |
|---|---|---|---|---|
| 1 | Expansionist | subagent | host | Contrarian, Maintainer (upside of a broad first release vs its cost) |
| 2 | Contrarian | subagent | host | Expansionist (argues against the owner's favoured new package) |
| 3 | Maintainer | subagent | host | Executor (two-year upkeep of a second project vs shipping) |
| 4 | Executor | subagent | host | Maintainer (what one developer can ship first) |
| 5 | Ecosystem | subagent | host | Expansionist (adopt a standard / join a project vs own format and roadmap) — seated as 5th because build-versus-join is covered by no other lens |

## Answers

### Seat 1 — Expansionist

POSITION: Hybrid "B-format, C-plus scope": publish B's OKF-extension format with the full evidence union (file+hash, document+hash, message id, fact) specified in v1, ship resolvers for file+hash and document+hash only, and leave classifiers and viewer as later plug-ins.

REASONING: The durable asset is the format, not the code. The upside case is that "evidence-hash invalidation with suspect propagation" becomes the extension other OKF stores adopt; that only happens if the evidence field is generic from day one. Coding-only v1 (pure C) risks baking `path@hash` into the contract, making chat/RAG a breaking change later. Document+hash reuses Baton's existing whole-file hash almost unchanged, so RAG support costs little and proves the union is real. OKF's unknown-key rule means these files stay readable by the 756-star Go implementation, which has paths but no hashes: free distribution into an existing audience. Kage, the nearest evidence-checking peer, is proposing to stop calling itself memory, and is GPL. E leaves no artefact; D surrenders the one thing worth owning; A forfeits the OKF audience.

CLAIMS:
- OKF permits and protects extension keys. <scratchpad>/knowledge-catalog/okf/SPEC.md:206 — "SHOULD preserve unknown keys when round-tripping and MUST NOT reject"
- OKF leaves lineage unowned. same file:348 — "`derived_from`, or data lineage) is out of scope for v0.2."
- okf-agent-memory anchors without hashes. <scratchpad>/okf-agent-memory/pkg/okf/types.go:34 — "CodeRefs    []string             `json:"code_refs,omitempty"`   // Referenced source paths or globs"
- Kage is vacating the noun. <scratchpad>/Kage/PIVOT.md:11 — "The headline noun moves from *memory* to *blast radius / verified impact*. Memory becomes an invisible internal evidence cache, never spoken to the user."
- Baton's hash is file-generic. ~/Desktop/Developer/playground/baton/src/memory.ts:657 — "async function fileHash(mainRoot: string, relPath: string): Promise<string> {"

WHAT WOULD CHANGE MY MIND: okf-agent-memory maintainers agreeing to accept hash evidence and suspect propagation upstream (then D); or a prototype showing message-id evidence cannot share one schema shape with file+hash (then pure C).


### Seat 2 — Contrarian

POSITION: Option E — build the evidence model inside Baton behind a clean module boundary, writing OKF-shaped files privately, and publish no package or format until a second consumer exists.

REASONING: The favoured path (B, or C as its cautious form) fails in one specific way: the distinguishing data lives in extension keys that OKF only asks other tools to keep. Content hashes and `suspect` are the whole product; a conformant OKF tool may drop them on round-trip, leaving a fact with base-spec `verified` and a future `stale_after` — it reads as fresh while its evidence is gone. That is silent, and it is the exact failure Baton's withholding exists to prevent. Second, the base moves: v0.2 already broke v0.1 fields, so a published contract inherits someone else's breaking changes. Third, the contract would be frozen on 21 facts and zero chat consumers; chat evidence types would be designed against no user. We would notice late: by a teammate's store recalling a stale fact, not by a test.

CLAIMS:
- Extension preservation is advisory, not mandatory. <scratchpad>/knowledge-catalog/okf/SPEC.md:206 — "SHOULD preserve unknown keys when round-tripping and MUST NOT reject"
- OKF has already shipped breaking changes. same file:798 — "v0.2 supersedes OKF v0.1 and is a minor version bump under §12, except for"
- Memory code is coupled to Baton's git layer. ~/Desktop/Developer/playground/baton/src/memory.ts:25 — "import { git, gitTry } from './util/exec.js';"
- And to Baton identity. ~/Desktop/Developer/playground/baton/src/memory.ts:26 — "import { readAuthor, resolveAuthor, UNKNOWN_AUTHOR } from './identity.js';"
- okf-agent-memory actually drops unknown keys on rewrite. [unverified]

WHAT WOULD CHANGE MY MIND: A round-trip test showing okf-agent-memory preserves namespaced extension keys byte-for-byte, plus one real external chat/RAG consumer committed to the format — then C.


### Seat 3 — Maintainer

POSITION: C — the OKF-based package, but the first release covers only the coding evidence Baton already exercises.

REASONING: One developer should publish only fields a real consumer exercises daily. Baton exercises file-plus-hash evidence; nothing exercises message or document evidence, so B freezes untested keys into a contract. OKF's unknown-key rule lets chat keys arrive later without breaking stores. A makes the maintainer sole owner of a whole spec; C owns only extension keys. D means maintaining Go, or GPL code whose owners are leaving memory. E postpones untangling memory from Baton's identity and git modules, which only gets costlier.

CLAIMS:
- Memory is coupled to Baton's identity module — ~/Desktop/Developer/playground/baton/src/memory.ts:26 — "import { readAuthor, resolveAuthor, UNKNOWN_AUTHOR } from './identity.js';"
- OKF tolerates later extension keys — <scratchpad>/knowledge-catalog/okf/SPEC.md:206 — "SHOULD preserve unknown keys when round-tripping and MUST NOT reject"
- Kage is leaving memory as a product — <scratchpad>/Kage/PIVOT.md:11 — "The headline noun moves from *memory* to *blast radius / verified impact*. Memory becomes an invisible internal evidence cache, never spoken to the user."
- okf-agent-memory's code evidence has no hash — <scratchpad>/okf-agent-memory/pkg/okf/types.go:34 — "CodeRefs    []string             `json:"code_refs,omitempty"`   // Referenced source paths or globs"

WHAT WOULD CHANGE MY MIND: A named chat/RAG consumer committed to the first release would move me to B. Evidence that OKF v0.3 will break v0.2 frontmatter would move me to A. An extraction spike showing the identity and git seams cannot be cut in two weeks would move me to E.


### Seat 4 — Executor

POSITION: C — a new package on OKF v0.2 with namespaced extensions, first release coding-only, with evidence typed generically so chat/RAG becomes a later additive release.

REASONING: One developer has one shippable week-one task: cut memory out of Baton by replacing the git and identity imports with injected interfaces, re-basing frontmatter on OKF keys, and migrating 21 facts. B needs the same work, then adds NLI plug-ins, a viewer and chat evidence with no consumer to test against, freezing their API blind. D fails on execution: the live candidate is Go, so Baton ships a foreign binary or reimplements it; the TypeScript one is pivoting away from memory. E leaves the couplings in place, deferring the same cut. The week-one blocker is the seam, not the format: OKF tolerates unknown keys, so extensions need nobody's permission.

CLAIMS:
- Memory depends on Baton's git wrapper — ~/Desktop/Developer/playground/baton/src/memory.ts:25 — "import { git, gitTry } from './util/exec.js';"
- OKF permits extension keys — <scratchpad>/knowledge-catalog/okf/SPEC.md:206 — "SHOULD preserve unknown keys when round-tripping and MUST NOT reject"
- okf-agent-memory anchors code without hashes — <scratchpad>/okf-agent-memory/pkg/okf/types.go:34 — "CodeRefs    []string             `json:"code_refs,omitempty"`   // Referenced source paths or globs"
- Kage is leaving memory — <scratchpad>/Kage/PIVOT.md:11 — "Memory becomes an invisible internal evidence cache, never spoken to the user."

WHAT WOULD CHANGE MY MIND: A real chat/RAG consumer ready to integrate now (flips to B); or a spike showing the git/identity seam cannot be cut in about a week without rewriting recall (flips to E).


### Seat 5 — Ecosystem

POSITION: C — a new permissively-licensed package on OKF v0.2 with namespaced extension keys, first release coding-only.

REASONING: A solo-maintained format survives only if other tools can read its files without its author. OKF is the one spec with provenance and staleness fields, and a 756-star MIT implementation already parses it, so B/C files stay legible to tools we never write; A's frontmatter has one reader forever. OKF permits extra keys, so content-hash evidence is an extension. D fails on the neighbours: Kage is GPL and pivoting away from memory; okf-agent-memory is Go, which Baton's Node daemon cannot import. C over B because a published key is a contract: with 21 facts and no chat consumer, chat/RAG keys would be frozen untested.

CLAIMS:
- OKF sanctions extensions. <scratchpad>/knowledge-catalog/okf/SPEC.md:206 — "SHOULD preserve unknown keys when round-tripping and MUST NOT reject"
- OKF leaves fact lineage open. <scratchpad>/knowledge-catalog/okf/SPEC.md:348 — "`derived_from`, or data lineage) is out of scope for v0.2."
- The spec defines no namespacing convention: `grep -n -F "namespace" okf/SPEC.md` → no output (same file yields line 206 above).
- Kage is leaving memory. <scratchpad>/Kage/PIVOT.md:11 — "Memory becomes an invisible internal evidence cache, never spoken to the user."
- Inheriting Baton's licence would deter adopters. ~/Desktop/Developer/playground/baton/package.json:39 — "\"license\": \"AGPL-3.0-or-later\","

WHAT WOULD CHANGE MY MIND: A committed chat/RAG consumer ready to test the evidence keys before release (then B); or OKF v0.3 adding incompatible hash/lineage fields, or the spec repo going dormant (then A plus an OKF exporter).


## Diversity check

Three positions: C (seats 3, 4, 5), a B-format/C-plus hybrid with all evidence types specified in v1 (seat 1), E (seat 2). Real spread · re-seated: none

## Peer review

**Anonymization mapping** (shuffled): A = seat 4 · B = seat 2 · C = seat 5 · D = seat 1 · E = seat 3
Reviewers: fresh subagents R1..R4
**Citation slices** (disjoint, by unique citation; each re-run whole): R1 = SPEC.md:206, SPEC.md:348, SPEC.md:798 · R2 = types.go:34, PIVOT.md:11 (both quoted variants) · R3 = memory.ts:657, memory.ts:25, memory.ts:26 · R4 = `grep -n -F "namespace" okf/SPEC.md` absence, package.json:39

### Reviewer R1

CRITIQUE:
Response A: names the real first task (cutting git/identity seams) · treats SHOULD-preserve as settling format risk.
Response B: only one to read "SHOULD" as advisory and trace a silent stale-reads-fresh failure · its Go-drops-keys premise is unverified and the code leans against it.
Response C: checked that the spec has no namespacing convention; raises licence · "756-star tool reads our files" ignores that it cannot honour hash staleness.
Response D: generic evidence union avoids baking `path@hash` into the contract · freezes message-id shape with no consumer.
Response E: publish only exercised fields · adds nothing beyond A and C.

BIGGEST BLIND SPOT: Response D — "free distribution" to base-OKF readers who will show hash-stale facts as fresh.

ALL MISSED: mirror hash-staleness down into base `status`/`stale_after` on write, so extension-unaware consumers still see it; this answers B's objection.

RE-RUN CHECK:
1. `grep -n -F "SHOULD preserve unknown keys when round-tripping and MUST NOT reject" SPEC.md` → `206:SHOULD preserve unknown keys when round-tripping and MUST NOT reject` — match (text and line).
2. ``grep -n -F '`derived_from`, or data lineage) is out of scope for v0.2.' SPEC.md`` → ``348:`derived_from`, or data lineage) is out of scope for v0.2.`` — match (text and line).
3. `grep -n -F "v0.2 supersedes OKF v0.1 and is a minor version bump under §12, except for" SPEC.md` → `798:v0.2 supersedes OKF v0.1 and is a minor version bump under §12, except for` — match (text and line). Reading is fair: lines 799-800 continue "two deliberate breaking changes called out below because they rename or retire v0.1 fields", and §13.1 is headed "Breaking changes" (`timestamp`, `# Citations`). Qualifier B omits: line 800-801 "A v0.1 bundle is consumable by a v0.2 consumer under the fallbacks noted here".
Extra, outside slice: `grep -n -F "namespace" SPEC.md` → no output, exit 1 (Response C's claim holds).

FALSE OR UNSUPPORTED CLAIMS: no slice citation wrong. Response D glosses line 206 as "protects" — it is SHOULD, as B says. Response B's [unverified] "okf-agent-memory drops unknown keys" is load-bearing and doubtful: `pkg/okf/types.go:38` reads ``Extra       map[string]any       `json:"extra,omitempty"` // Preserved unknown fields``; write path unchecked.

FRAMING: mild lean to B/C — "Options D and E are included for the council to judge that intent"; clarifying answer restates B.

FINAL RANKING:
1. Response B
2. Response C
3. Response A
4. Response D
5. Response E

Tally note: none

### Reviewer R2

CRITIQUE:
Response A: names the real blocker (git/identity seam) with falsifiable flip conditions · "about a week" for 132 KB is unevidenced; overstates Kage.
Response B: only one to name a silent failure (extension keys dropped, fact still reads fresh) · leans on an [unverified] claim the code contradicts.
Response C: licence point (AGPL deters adopters) and no-namespacing grep · "756-star implementation parses it" is not tested interop.
Response D: generic evidence union avoids a later breaking change; words Kage accurately · freezes a message-id shape with no consumer.
Response E: "publish only exercised fields" · adds nothing beyond A; overstates Kage.

BIGGEST BLIND SPOT: Response B — never opened okf-agent-memory, whose `Extra` field preserves unknown keys, largely meeting its own flip condition.

ALL MISSED: Nobody ran a Baton-shaped file through okf-agent-memory's validator, or considered reusing its existing `code_refs` key; interop is asserted, not tested. Baton's hash is sha1 truncated to 12 hex — weak to freeze into a public format.

RE-RUN CHECK:
1. `grep -n -F 'CodeRefs    []string             `json:"code_refs,omitempty"`   // Referenced source paths or globs' okf-agent-memory/pkg/okf/types.go` → `34:	CodeRefs    []string             `json:"code_refs,omitempty"`   // Referenced source paths or globs` — match (text and line). Supporting check: `grep -rn -i -F "hash" pkg/okf | wc -l` → `0`; `grep -rn -F "sha256" pkg` (non-test) → hits only in pkg/registry, pkg/sync, pkg/vault. validator.go:334 only warns when a non-glob path does not exist. "Anchors code without hashes" is supported.
2. `grep -n -F 'The headline noun moves from *memory* to *blast radius / verified impact*. Memory becomes an invisible internal evidence cache, never spoken to the user.' Kage/PIVOT.md` → `11:The headline noun moves from *memory* to *blast radius / verified impact*. Memory becomes an invisible internal evidence cache, never spoken to the user.` — match (text and line).
3. `grep -n -F 'Memory becomes an invisible internal evidence cache, never spoken to the user.' Kage/PIVOT.md` → `11:The headline noun moves from *memory* to *blast radius / verified impact*. Memory becomes an invisible internal evidence cache, never spoken to the user.` — match (line 11; quote is the second sentence of that line).

FALSE OR UNSUPPORTED CLAIMS:
- A, C, E: "Kage is leaving / pivoting away from memory" — quote matches, inference does not. PIVOT.md:3 reads "> Status: PROPOSAL for founder decision. Names ("Probe") are placeholders…"; line 1 dates it 2026-06-27; README at the same commit (2026-08-21) still says "Kage is an orchestrator for coding agents, built on a memory layer" and never mentions Probe or a pivot. Unadopted proposal. D's "is proposing" is fair.
- B: "okf-agent-memory actually drops unknown keys on rewrite [unverified]" — contradicted on its face: types.go:38 `Extra       map[string]any       `json:"extra,omitempty"` // Preserved unknown fields`; parser.go:598–604 writes them back. Byte-for-byte fidelity unchecked.

FRAMING: Leans to B/C: "Options D and E are included for the council to judge that intent"; "Building what already exists spends months for no distinction"; B's description is several times longer than any other.

FINAL RANKING:
1. Response D
2. Response A
3. Response C
4. Response B
5. Response E

Tally note: none

### Reviewer R3

CRITIQUE:
Response A: falsifiable seam-first plan · "week one" bundles seam, OKF re-base and migration; only the seam looks that small.
Response B: SHOULD-not-MUST means extensions can vanish silently · rests on an [unverified] drop claim.
Response C: licence and legibility argument · "756-star reader" ignores that reader skipping hashes.
Response D: generic evidence union avoids a later break · "almost unchanged" overstated.
Response E: publish only exercised fields · two-week seam asserted, not examined.

BIGGEST BLIND SPOT: Response D. `fileHash` hashes any bytes, but only at `join(mainRoot, relPath)` under a git root, and repair needs `git show <commit>:<path>` (memory.ts:1351) for the before-text. Documents outside git get hashing, not repair.

ALL MISSED: Freshness is git-shaped beyond imports: anchorless facts age by `git rev-list --count` (memory.ts:990) and the hash is sha1 cut to 12 hex (memory.ts:653). Publishing freezes both.

RE-RUN CHECK:
1. `grep -n -F "async function fileHash(mainRoot: string, relPath: string): Promise<string> {" src/memory.ts` → `657:async function fileHash(mainRoot: string, relPath: string): Promise<string> {` — match
2. `grep -n -F "import { git, gitTry } from './util/exec.js';" src/memory.ts` → `25:import { git, gitTry } from './util/exec.js';` — match
3. `grep -n -F "import { readAuthor, resolveAuthor, UNKNOWN_AUTHOR } from './identity.js';" src/memory.ts` → `26:import { readAuthor, resolveAuthor, UNKNOWN_AUTHOR } from './identity.js';` — match

FALSE OR UNSUPPORTED CLAIMS: No citation wrong. D's inference from 657 is half-fair (private, four callers: 717, 968, 1294, 1383). B's okf-agent-memory drop claim [unverified]. A/E's estimate: about seven git calls and three identity uses, so one to two weeks is plausible for the seam alone (my reading, not a spike).

FRAMING: Leans to B/C: "Options D and E are included for the council to judge that intent"; "leaves no reusable artefact".

FINAL RANKING:
1. Response A
2. Response B
3. Response E
4. Response C
5. Response D

Tally note: none

### Reviewer R4

CRITIQUE:
Response A: names the real first task (cut git/identity seam, migrate 21 facts) · "about a week" is asserted, not evidenced.
Response B: correctly reads line 206 as advisory SHOULD · its supporting claim about okf-agent-memory is contradicted by the code.
Response C: honest that the spec defines no namespacing convention (confirmed) · "legible to tools" overstates; other tools keep the keys but cannot act on them.
Response D: generic evidence union avoids a later breaking change · specifies message-id evidence with no consumer, the exact risk it criticises.
Response E: publish only exercised fields · adds little beyond A.

BIGGEST BLIND SPOT: Response B — treats preservation as the risk, but never opened the one implementation it names; the parser keeps unknown keys.

ALL MISSED: okf-agent-memory re-serialises on save: extension keys are kept but re-ordered and JSON-quoted, and `generated` is overwritten with the saving actor and time (mutate.go:423-426). Any design hashing frontmatter, or trusting `generated` as origin, breaks when a second tool touches the file.

RE-RUN CHECK:
- `grep -n -F "namespace" okf/SPEC.md` → no output (exit 1). Match (absence confirmed).
- Positive control `grep -n -F "stale_after" okf/SPEC.md` → 12 hits: 424, 427, 431, 579, 626, 695, 718, 821, 903, 939, 969, 989. Tool works on this file.
- `grep -n -i -F "namespac" okf/SPEC.md` → no output (exit 1).
- `grep -n -F "x-" okf/SPEC.md` → no output (exit 1).
- Extension-key naming: the spec's only rule is lines 205-207: "**Extensions:** Producers MAY include any additional keys. Consumers / SHOULD preserve unknown keys when round-tripping and MUST NOT reject / documents with unrecognized fields." plus line 760 "- Unknown additional frontmatter keys." (in a MUST NOT reject list). No prefix, namespace or naming convention for extension keys is stated.
- `grep -n -F '"license": "AGPL-3.0-or-later",' ~/Desktop/Developer/playground/baton/package.json` → `39:  "license": "AGPL-3.0-or-later",`. Match (text and line).
- Response B [unverified] "okf-agent-memory drops unknown keys on rewrite": NOT supported for rewrites of an existing concept.
  - parser.go:317-318 `default:` / `c.setExtra(k, b.inline, b.lines)`; parser.go:325-326 comment "setExtra stores an unknown frontmatter field. Scalars and lists become typed values; any other / block structure is kept as verbatim lines so it survives a round trip unchanged."
  - parser.go:595-597 "Preserve extra unknown fields in canonical key order. String values are / always JSON-quoted (valid YAML) so their scalar type and content survive a / round trip"; 598-626 emits every `c.Extra` key, sorted.
  - types.go:38 `Extra       map[string]any       \`json:"extra,omitempty"\` // Preserved unknown fields`.
  - mutate.go:442 `raw := SerializeConcept(c)` inside `SaveConcept` (402); `RelateConcepts` (470) loads via `LoadBundle` and saves the parsed concept (524), so Extra is carried. MCP update copies the loaded concept (mcp.go:678 `updated := *c`, saved at 737); CLI update mutates the loaded concept (internal/cli/mutate.go:240-262).
  - Preserved, but not byte-for-byte: keys are sorted and values JSON-encoded.
  - Create paths build a fresh `Concept` with no Extra (mcp.go:628-637, internal/cli/mutate.go:147-156); a single `grep -n -i -F "already exists"` over mutate.go, mcp.go and internal/cli/mutate.go returned nothing, so whether create can overwrite an existing file and thereby drop keys is unchecked.

FALSE OR UNSUPPORTED CLAIMS:
- B: "okf-agent-memory actually drops unknown keys on rewrite" — contradicted; parser.go:318 prints `c.setExtra(k, b.inline, b.lines)` and 595 "Preserve extra unknown fields in canonical key order." B's argument leans on it. B's own overturn test ("byte-for-byte") would still fail, since output is re-ordered and re-quoted.
- C: both slice citations hold.
- Not in my slice, unchecked: SPEC.md:798 was seen incidentally and reads as B quotes it.

FRAMING: Leans to B/C. "Options D and E are included for the council to judge that intent"; "Building what already exists spends months for no distinction"; option B's description is several times longer than any other.

FINAL RANKING:
1. Response A
2. Response C
3. Response E
4. Response D
5. Response B

Tally note: none

## Claim checks

One batch per file, run by the orchestrator after the answers arrived; Re-run cells are the reviewers' own outputs. `<scratchpad>` is the path given in the brief.

| Seat | Claim | Citation | Checked with | Line as found | Result | Re-run |
|---|---|---|---|---|---|---|
| 1, 2, 3, 4, 5 | OKF permits extension keys ("protects" in seat 1; "advisory, not mandatory" in seat 2) | <scratchpad>/knowledge-catalog/okf/SPEC.md:206 | `grep -n -F "SHOULD preserve unknown keys when round-tripping and MUST NOT reject" knowledge-catalog/okf/SPEC.md` | "206:SHOULD preserve unknown keys when round-tripping and MUST NOT reject" | kept — the line is SHOULD for preservation, MUST NOT for rejection; seat 1's "protects" overstates it | R1: "206:SHOULD preserve unknown keys when round-tripping and MUST NOT reject" · match |
| 1, 5 | OKF leaves lineage out of scope | SPEC.md:348 | `grep -n -F "or data lineage) is out of scope for v0.2." knowledge-catalog/okf/SPEC.md` | "348:`derived_from`, or data lineage) is out of scope for v0.2." | kept | R1: "348:`derived_from`, or data lineage) is out of scope for v0.2." · match |
| 2 | OKF has already shipped breaking changes | SPEC.md:798 | `grep -n -F "v0.2 supersedes OKF v0.1 and is a minor version bump" knowledge-catalog/okf/SPEC.md` | "798:v0.2 supersedes OKF v0.1 and is a minor version bump under §12, except for" | kept — R1 read on: two deliberate breaking changes, and a v0.1 bundle stays consumable by a v0.2 consumer under stated fallbacks | R1: "798:v0.2 supersedes OKF v0.1 and is a minor version bump under §12, except for" · match |
| 5 | The spec defines no namespacing convention | `grep -n -F "namespace" okf/SPEC.md` → no output | `grep -n -F "namespace" knowledge-catalog/okf/SPEC.md` (same file: `grep -c -F stale_after` → 12) | no output | kept | R4: no output (exit 1); control `stale_after` → 12 hits; `namespac` (-i) and `x-` also no output · match |
| 1, 3, 4 | okf-agent-memory anchors code without hashes | <scratchpad>/okf-agent-memory/pkg/okf/types.go:34 | `grep -n -F "Referenced source paths or globs" okf-agent-memory/pkg/okf/types.go` | "34:	CodeRefs    []string             `json:"code_refs,omitempty"`   // Referenced source paths or globs" | kept | R2: "34:	CodeRefs    []string             `json:"code_refs,omitempty"`   // Referenced source paths or globs" · match; `grep -rn -i -F "hash" pkg/okf` → 0 |
| 1 | Kage "is proposing to stop calling itself memory" | <scratchpad>/Kage/PIVOT.md:11 | `grep -n -F "Memory becomes an invisible internal evidence cache, never spoken to the user." Kage/PIVOT.md` | "11:The headline noun moves from *memory* to *blast radius / verified impact*. Memory becomes an invisible internal evidence cache, never spoken to the user." | kept | R2: same line 11 · match |
| 3, 4, 5 | Kage "is leaving memory" | Kage/PIVOT.md:11 | same command | same line 11 | quote kept; inference struck — PIVOT.md:3 marks it a proposal and the README at the same commit still describes a memory layer (R2) | R2: line 11 · match; inference not supported |
| 1 | Baton's hash is file-generic | src/memory.ts:657 | `grep -n -F "async function fileHash(mainRoot: string, relPath: string): Promise<string> {" src/memory.ts` | "657:async function fileHash(mainRoot: string, relPath: string): Promise<string> {" | kept — R3: half-fair; it hashes any bytes under a git root, but repair uses `git show`, so documents outside git get hashing, not repair | R3: "657:async function fileHash(mainRoot: string, relPath: string): Promise<string> {" · match |
| 2, 4 | Memory depends on Baton's git wrapper | src/memory.ts:25 | `grep -n -F "import { git, gitTry } from './util/exec.js';" src/memory.ts` | "25:import { git, gitTry } from './util/exec.js';" | kept | R3: "25:import { git, gitTry } from './util/exec.js';" · match |
| 2, 3 | Memory depends on Baton's identity module | src/memory.ts:26 | `grep -n -F "import { readAuthor, resolveAuthor, UNKNOWN_AUTHOR } from './identity.js';" src/memory.ts` | "26:import { readAuthor, resolveAuthor, UNKNOWN_AUTHOR } from './identity.js';" | kept | R3: "26:import { readAuthor, resolveAuthor, UNKNOWN_AUTHOR } from './identity.js';" · match |
| 5 | Baton's licence is AGPL | package.json:39 | `grep -n -F '"license": "AGPL-3.0-or-later",' package.json` | "39:  "license": "AGPL-3.0-or-later"," | kept | R4: "39:  "license": "AGPL-3.0-or-later"," · match |
| 2 | okf-agent-memory drops unknown keys on rewrite | no file opened ([unverified] by the seat) | — | — | struck — contradicted by R2 and R4: types.go:38 "Preserved unknown fields", parser.go:595 "Preserve extra unknown fields in canonical key order"; keys are kept but re-ordered and re-quoted, and `generated` is overwritten on save | R4: parser.go:317-318, 595-626, mutate.go:423-426, 442 · contradicts |

## Tally

| Response | Seat | Ranks received (R1, R2, R3, R4) | Average |
|---|---|---|---|
| A | 4 — Executor | 3, 2, 1, 1 | 1.75 |
| C | 5 — Ecosystem | 2, 3, 4, 2 | 2.75 |
| B | 2 — Contrarian | 1, 4, 2, 5 | 3.00 |
| D | 1 — Expansionist | 4, 1, 5, 4 | 3.50 |
| E | 3 — Maintainer | 5, 5, 3, 3 | 4.00 |

Excluded rankings: none · Re-requested: none

## Verdict

deep · 5 seats (5 subagent) · review 4/4 · diversity ✓ · degraded: brief leaned

### Framing
The brief leans toward B/C: "Options D and E are included for the council to judge that intent"; "Building what already exists spends months for no distinction"; "leaves no reusable artefact". B's description is also several times longer than any other.

### Positions
Expansionist: "POSITION: Hybrid "B-format, C-plus scope": publish B's OKF-extension format with the full evidence union (file+hash, document+hash, message id, fact) specified in v1, ship resolvers for file+hash and document+hash only, and leave classifiers and viewer as later plug-ins."
Contrarian: "POSITION: Option E — build the evidence model inside Baton behind a clean module boundary, writing OKF-shaped files privately, and publish no package or format until a second consumer exists."
Maintainer: "POSITION: C — the OKF-based package, but the first release covers only the coding evidence Baton already exercises."
Executor: "POSITION: C — a new package on OKF v0.2 with namespaced extensions, first release coding-only, with evidence typed generically so chat/RAG becomes a later additive release."
Ecosystem: "POSITION: C — a new permissively-licensed package on OKF v0.2 with namespaced extension keys, first release coding-only."

### Where the members agree
3 of 5 seats choose C. A fourth wants the same format with wider scope. All 5 want OKF-shaped files, and none puts classifiers or the viewer in the first release. The first job is cutting memory loose from Baton's git and identity code (verified).

### Where they clash
- **Publish now or wait.** Contrarian says wait: other tools are only asked ("SHOULD"), not required, to keep extension keys. That reading is verified, but its claim that okf-agent-memory drops those keys was struck: the tool keeps them. The argument loses weight; "21 facts, no chat consumer" stands.
- **Chat/RAG in v1.** Expansionist would specify it now to avoid a later break. Three seats refuse to freeze untested keys; with no consumer, theirs is the stronger case.
- **Kage.** Three seats said it "is leaving memory". Struck: it is an unadopted proposal. Rejecting D still holds: Kage is GPL, okf-agent-memory is Go.
- **Effort.** Executor ranked first, but its "about a week" is unevidenced.

### Blind spots
- Tools that ignore the extensions will show a hash-stale fact as fresh. Fix: also write staleness into OKF's base `status`.
- okf-agent-memory overwrites `generated` on save, so never hash frontmatter or treat `generated` as origin.
- Baton's hash is sha1 cut to 12 characters, and anchorless facts age by git commit count. Publishing freezes both.

### Recommendation
C, with two conditions: release as 0.x with the format labelled experimental, and give evidence a generic "kind + reference + hash" shape with only file evidence defined.
Confidence: medium — code facts are verified, but effort and interop are untested and the brief leans this way.

### What would overturn it
- The git/identity seam cannot be cut in two weeks without rewriting recall: choose E.
- Extension keys are lost after an okf-agent-memory save: choose E.
- A named chat/RAG consumer is ready to integrate now: choose B.
- okf-agent-memory maintainers accept hash evidence upstream: choose D.

### First step
In the scratchpad, hand-write one of the 21 facts as an OKF v0.2 file with extension keys, run it through okf-agent-memory's validator and one save, and diff the result.

## Degradation notes

- A reviewer's and the chairman's FRAMING check quoted a lean: "Options D and E are included for the council to judge that intent"; "Building what already exists spends months for no distinction"; "leaves no reusable artefact"; option B's description is several times longer than the others. Confidence capped at medium.
- Web-research lines in the brief are relayed by research agents, not opened by the council.

## Memory

save_memory: mem-council-decision-standalone-open-memory-package (advisory)
