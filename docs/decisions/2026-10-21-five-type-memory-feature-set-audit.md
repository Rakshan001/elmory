# Council: audit the five-type memory design — which features enter release 1

- **Date:** 2026-10-21
- **Status:** advisory — not acted on
- **Tier:** deep (owner: "later u should run agian llm council highest and audit the ideas")
- **Run:** 5 seats (5 subagent, 0 external, 0 inline) · review 4/4 · diversity ✓ (real spread D vs C)
- **Degraded:** no
- **Prior verdict:** `2026-10-21-five-type-memory-system-architecture.md` (same day, advisory) — this run audits its output; that proposal is listed under the brief as the artifact, not as grounding. Members and reviewers are all fresh agents with lenses not used in that run.

## Question (as asked)

"later u should run agian llm council highest and audit the ideas and takes the features"

## Brief

DECISION: Audit the proposed design for a new memory system (coding agents + chat/RAG bots, five types: working, episodic, semantic, procedural, external) — for its first release, which features are IN, which are DEFERRED (with a named trigger), which are CUT, and is any required feature missing?

THE PROPOSAL UNDER AUDIT (an earlier council's advisory output plus research findings — a proposal, not evidence):
Architecture: one versioned record envelope for all kinds; every semantic, procedural and profile record cites ≥1 live evidence id and is served only while that evidence chain is live.
F1 `format: 1` version key in every envelope + migrate command
F2 required evidence id (episode id, path@hash, url) on semantic/procedural/profile records; pre-serve check drops a record whose evidence is forgotten, hash-changed or dead
F3 episodic log append-only but physically deletable
F4 forget cascades along evidence/derivation links through files, FTS rows, vectors and distilled skills, returning a report of what was removed
F5 HMAC-keyed tombstones that survive an index rebuild
F6 flush verb for working memory, separate from long-term forget
F7 subject (person/peer) id inside every id and index key; optional per-observer view (one agent's view of a person built only from sessions it saw)
F8 full SHA-256 content ids; on collision of identical facts from two agents, union their provenance
F9 skills stored as SKILL.md with the envelope as frontmatter; procedural writes store insights/validation routines, not raw traces; approval or verification before a skill becomes active
F10 link/unlink stored as records of kind `link` (slot for the owner's own linking algorithm)
F11 deterministic (subject, relation, object) supersession with valid_from/valid_to, no LLM
F12 Markdown/OKF-frontmatter files as truth; SQLite FTS5 + in-memory entity hash map as a rebuildable cache
F13 BM25 by default; optional embeddings fused by reciprocal rank fusion; results packed to a token budget
F14 frozen per-session memory snapshot in the system prompt + per-turn recall appended to the user message (prompt-cache safe)
F15 content scan at write and at load; served memory framed as untrusted data, never "authoritative"
F16 pre-serve check that an external pointer (url/path) still resolves
F17 check of a skill against a newer semantic fact that contradicts it
F18 abstention as a first-class recall outcome, decided in code
F19 typed-judgement plug-in interface (Jev hosted / Clef open-weights / small local NLI), null by default
F20 sleep-time consolidation: an LLM picks only from a menu the code drafted, capped per kind, one commit/report per run
F21 swap ids for small integers before an LLM sees memories
F22 per-session tag task vs conversation (task → procedural distillation, conversation → episodic/semantic)
F23 graph view derived from link records
F24 MCP server as the integration surface; optional signed read-only A2A Agent Card
F25 release gate: beat a memory-off baseline; evaluate on LongMemEval + MemoryAgentBench + a coding replay
F26 evidence confidence label (observed / derived / inferred) + an open-questions register
F27 decay is a ranking signal only, never silent deletion

OPTIONS (neutral order):
- A · Release 1 carries all 27 features.
- B · Release 1 carries only features that need no model in the read or write path; F13-embeddings, F19, F20 deferred.
- C · Release 1 is a smaller core the seat names by feature id, everything else deferred or cut with reasons.
- D · The proposal has a structural flaw that must be fixed before any feature list (seat names it and the fix).

CONSTRAINTS:
- Owner requires: coding agents and chat/RAG personalisation; cross-conversation resume; several agents learning about one person; user flush; less memory-induced hallucination; token saving; graph view; "compatible with everything"; self-learning; later Baton integration.
- Owner wants hashes and OKF-style Markdown, and plans their own linking/unlinking algorithm.
- Baton host conventions: zero-dependency daemon (raw node:http), strict TypeScript, SSE, git via src/util/exec.ts; Baton is AGPL-3.0-or-later; the package licence is the owner's call.
- Memory "may reorganise, never originate"; no invented numbers.

STAKES: Every feature in release 1 becomes part of a public format and API that adopters depend on; over-scoping delays the release and adds untested surface, under-scoping ships a store that misleads agents or cannot forget a person.

GROUNDING (every line below was printed by a tool today, or is marked):
Baton today
- src/memory.ts:377 — "// COMPUTED, never read from the file. The fingerprint is not a label,"
- src/memory.ts:447 — "const main = await mainRepoRoot(root);"
- src/memory.ts:653 — "const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);"
- src/memory-rank.ts:9 — " * real BM25 via an FTS5 table built IN MEMORY per query (node:sqlite, zero"
- package.json:39 — "\"license\": \"AGPL-3.0-or-later\","
- baton/memory/facts: 23 files on disk, 0 tracked in git (ls | wc -l; git ls-files | wc -l)
Hermes agent (source, commit 1d94f832e6)
- tools/skill_manager_tool.py:10 — "Skills are the agent's procedural memory: they capture *how to do a specific"
- tools/memory_tool.py:11 — "Both are injected into the system prompt as a frozen snapshot at session start."
- agent/memory_manager.py:396 — "\"NOT new user input. Treat as authoritative reference data — \""
- plugins/memory/holographic/__init__.py:247 — "if action == \"add\" and self._store and content:" (mirror copies adds only; replace/remove never reach it)
- hermes_state_search.py:1415 — "def search_messages(" (report: no user_id parameter → shared transcripts in multi-user gateways) [signature only; callers not traced]
Hindsight (MIT, a7ab53c) / Honcho (AGPL-3.0, 607438d)
- hindsight .../engine/search/fusion.py:29 — "def reciprocal_rank_fusion(result_lists: list[list[RetrievalResult]], k: int = 60) -> list[MergedCandidate]:"
- hindsight .../engine/search/decision_reranker.py:58 — "0.59 against 0.79 on a 20-question answer-quality set."
- honcho docs/v3/documentation/core-concepts/representation.mdx:33 — "**Peers observing others** (`observe_others`): ... Alice's representation of Bob will be completely different from Charlie's representation of Bob if they've observed different interactions."
- honcho src/models.py:436 — "deleted_at: Mapped[datetime.datetime | None] = mapped_column("
Research (papers.md; read from arXiv abstracts today by a research agent, not re-opened by the chair)
- Deterministic (subject, relation, object) supersession in a bi-temporal ledger with no LLM call: 0.95–1.00 vs plain RAG 0.20–0.47 on serving the current value (arXiv:2606.26511) [agent-read]
- MemoryAgentBench: multi-hop conflict resolution ≤7% for every system tested; BM25 60.5% vs MemGPT 34.3%, HippoRAG-v2 65.1% (arXiv:2507.05257) [agent-read]
- Memory poisoning: AgentPoison >80% attack success at <0.1% poisoned records (arXiv:2407.12784) [agent-read]
- TierMem: summaries save 54% tokens but raw-only is more accurate, 0.873 vs 0.851 (arXiv:2602.17913) [agent-read]
- Coding: VibeMemBench, 11 of 12 solver × memory-system pairings fail to beat memory-off (arXiv:2609.23570) [agent-read]
- Procedural: raw traces cause negative transfer for coding agents; high-level insights/validation routines transfer (+3.7%) (arXiv:2604.14004) [agent-read]
- Weight-level unlearning unreliable; only external-store deletion is verifiable (arXiv:2510.25117) [agent-read]
Jev / verifiers (jev.md)
- Jev = TypeSafe typed-judgement API (Choice/Score/Noul); hosted only; Cloudflare "Clef" open-weights models (Apache-2.0) claim Jev-API compatibility; small local NLI (nli-deberta-v3-xsmall, 70.8M, Apache-2.0) maps to supports/contradicts/neutral [agent-read]
rea (morluto/rea, MIT, 25bea07)
- src/domain/evidence.ts:280 — "const computeEvidenceId = (evidence: EvidenceWithoutId): string =>" (SHA-256 over canonical JSON; evidence has confidence observed/derived/inferred, coverage complete/partial/unknown, open-questions register)
OSS survey (29 systems, 13 cloned; clones under the session scratchpad, not in this repo)
- tigerless agent-memory @327bc51 CLAUDE.md:26 — "1. **Markdown files are the single source of truth; every index is a rebuildable cache.**"
- tigerless .../core/schema.py:153 — "mode=MODE_ADD_ONLY," (event kind is append-only; kinds: event / profile, preference, entity, fact, decision / procedure, experience / reference)
- tigerless .../core/manage.py:36 — "PROPOSAL_SUPERSEDE = \"supersede\"" (sleep-time pass picks only from a menu the code drafted; one git commit per run)
- MIRIX @8cb06a6 mirix/constants.py:327 — "SESSION_TAG_TASK = \"task\"" (task sessions → procedural; conversation sessions → episodic/semantic)
- Graphiti @8e320f8 graphiti_core/utils/maintenance/edge_operations.py:715 — "def _apply_temporal_invalidation(" (contradiction expires the old edge, bi-temporal)
- mem0 @2c81af3 mem0/configs/prompts.py:472 — "... Your sole operation is ADD: ..." ; mem0/memory/main.py:935 — "# Map UUIDs to integers (anti-hallucination)"
- Hindsight @a7ab53c .../engine/reflect/retractions.py:112 — "def partition_retracted(based_on: dict[str, Any] | None, live_ids: set[str]) -> RetractedGrounding:" (derived items pruned when cited facts vanish)
- Cognee @37f788b cognee/api/v1/forget/forget.py:48 — "await cognee.forget(dataset=\"scientists\", memory_only=True)"
- Basic Memory @976a10c src/basic_memory/temporal.py:1108 — "moment is not: `@effective 2026-06-10` means the decision took effect that day and"
- Agent Memory Repo spec (Cognition, MIT) SPEC.md:44 — "- Payments and website share a 2026-10-15 launch deadline [source: https://example.com/sessions/102; added: 2026-09-03]"
- Survey's reported gaps none of the 13 cloned systems cover [agent-read]: no pre-serve check that an external pointer still resolves; no flushable working memory separate from long-term forget; forget does not cascade to skills distilled from a forgotten episode; no skill-vs-newer-fact contradiction check; no system uses OKF as live storage; no coding-agent memory benchmark.
- hermes tools/memory_tool.py:178 — "memory_char_limit: int = 2200," (Hermes caps built-in memory by characters)
- hindsight .../engine/cross_encoder.py:1190 — "class TypeSafeCrossEncoder(CrossEncoderModel):" (Jev used as an optional reranker)
- Earlier council's reviewers (3 of 4) raised: concurrent writers superseding the same (subject, relation) on Markdown files have no merge rule; 0 of 23 Baton facts are git-tracked; no memory-off baseline gate. [from transcript .baton/council/2026-10-21-five-type-memory-system-architecture.md]
- Earlier council's struck claim: an empty hash in a Baton fact (`path@`) is the designed absent-file marker — src/memory.ts:36 — "hash: string; // sha1 of content at save time ('' = file was absent)"

OUT OF SCOPE: Re-choosing between "five separate stores" and "build on an existing system" unless option D's structural flaw demands it; the licence choice; full A2A adoption; weight training.

## Seats

Tier deep · 5 subagent members (5th seated: token-saving and latency claims need a Performance lens no other seat covers) · 4 reviewers · 1 chairman = 10 agent calls.

| # | Lens | Tension | Seat type |
|---|---|---|---|
| 1 | Contrarian | vs Expansionist-leaning proposal: hunts the most likely failure | subagent |
| 2 | Executor | vs First-principles: concrete first weeks, what blocks them | subagent |
| 3 | Performance | vs Maintainer: tokens, latency, index cost at scale | subagent |
| 4 | Outsider | vs insider jargon: would an adopter understand and trust it | subagent |
| 5 | Reversibility | vs bold scope: cost of backing out each public-format feature | subagent |

## Answers

### Seat 1 — Contrarian (subagent)

POSITION: D. Files-as-truth (F12), placed in Baton's git-tracked memory folder, makes forget (F3/F4/F5) a report that claims removal while the data survives. Fix where person records are stored before freezing any feature list.

REASONING: Baton writes facts to a git-tracked folder by default, and its own comments admit that pushing a leak means rotating a key, because deleting the file no longer helps. Put profile or episodic records there and F4 deletes the working copy, then returns "removed". Git history, every clone and the remote still hold the record, and the next `git pull` brings the file back. F5 tombstones also need an HMAC key shared by every clone, and the proposal never says where that key lives. Baton's archive keeps removed facts on purpose, so forget has a fourth copy to miss. How we would notice: run forget on a subject, then `git log -p -S<value>` and grep a fresh clone. Today both would still find it.
Fix: send records by kind. Person-scoped kinds (episodic, profile, per-observer) stay out of git, encrypted with a per-subject key, and forget destroys the key. Shared kinds (code semantic/procedural) may be tracked. F4's report must list the places it cannot reach.
Second risk: F2 checks a hash of the whole file, so any edit to an anchored file withdraws every coding record tied to it.
IN: F1 F2 F3 F4 F5 F6 F7(subject id) F8 F9 F10(kind reserved) F11 F12 F13(BM25) F14 F15 F18 F24(MCP) F25 F26 F27 · DEFER: F7-observer (2nd agent writes same subject), F13-emb/F19 (BM25 fails F25), F20/F21/F22 (F25 passes deterministically), F16 (async, never on the read path), F17 (F11 covers skills), F23 (owner's link algorithm lands) · CUT: F24-A2A card (out of scope) · MISSING: storage routed by kind with key-destroying forget (crypto-shredding); anchors that hash part of a file, not all of it.

CLAIMS:
- src/memory.ts:471 — "* - `tracked` → `baton/memory/facts`, in git. The default, and the point of the"
- src/memory.ts:483 — "* leak discovered after a push is a key rotation, not a file deletion. The"
- src/memory.ts:381 — "// `baton/memory/facts/` is tracked, so a file arriving by `git pull`"
- src/memory.ts:510 — "* Superseded/removed facts move HERE instead of being destroyed, so a fact's"
- src/memory.ts:970 — "staleReason = now === '' ? `${a.path} no longer exists` : `${a.path} changed since this was saved`;"

WHAT WOULD CHANGE MY MIND: The owner confirms person-scoped records never enter git, enforced by code and not by convention. Or a test shows forget leaves zero hits in history and in a fresh clone.

### Seat 2 — Executor (subagent)

POSITION: C, a model-free core ported out of Baton's existing memory code, plus one missing feature that must be fixed before the format freezes: a concurrent-writer rule.

REASONING: A solo owner should not start from zero. Baton already re-hashes path anchors before serving, has a migrate verb, and runs BM25 over a per-query in-memory FTS index. That index means forget has no persistent FTS rows to purge in v1. Week 1: day 1–2, envelope plus F1/F8 content ids (this also ends the reusable-slug ids that cause Baton's documented race); day 3, port the freshness check as F2; day 4, F4 forget and F6 flush, with a test proving nothing is left on disk; day 5, the MCP server and a memory-off replay. Two things block it. First, Baton's remove *archives*, so forget-a-person needs a new delete path, not a reuse of the old one. Second, there is no coding replay corpus: the survey found no coding-memory benchmark, and 0 of 23 facts are git-tracked. Every field adopters will parse belongs in v1, so the cheap slots (F10, F26 label, F7 subject) ship now and their behaviour can wait.
IN: F1, F2 (path/episode; url check deferred), F3, F4, F6, F7 (subject key only), F8, F9 (approval-gated), F10, F11, F12, F13 (BM25), F15, F18, F24 (MCP), F25 (coding replay plus LongMemEval), F26 (label only), F27 · DEFER: F5 (first sync/import path that can re-deliver deleted content), F7 per-observer view (second agent writing about the same subject in real use), F13 embeddings (F25 shows BM25 losing on recall), F14 (first chat-bot adapter), F16-url (first external-kind adopter), F17/F19 (a skill served against a newer contradicting fact in replay), F20/F21/F22 (store nears its cap, or consolidation is requested), F23 (Baton dashboard integration), MemoryAgentBench (after v1) · CUT: F24 A2A card (no requirement; a signed surface nobody consumes) · MISSING: compare-and-swap on (subject, relation) for concurrent supersession across processes.

CLAIMS:
Baton already withholds anchor-changed facts — src/memory.ts:970 — "staleReason = now === '' ? `${a.path} no longer exists` : `${a.path} changed since this was saved`;"
Baton's remove archives rather than deletes — src/memory.ts:1194 — "return archiveFact(mainRoot, id, 'remove', reason);"
Slug ids already produced a cross-process race — src/memory.ts:1227 — " * is no cross-process interlock between them. The first applies it; an agent"
FTS is per-query and in memory, so there is no persistent index to purge — src/memory-rank.ts:9 — " * real BM25 via an FTS5 table built IN MEMORY per query (node:sqlite, zero"
Per-query FTS stays fast enough at v1 store sizes [unverified]

WHAT WOULD CHANGE MY MIND: Two things. First, a memory-off replay on day 5 showing that BM25-only memory does no better than no memory; then F19/embeddings move IN. Second, an owner requirement that forgotten data be recoverable, which would reverse the delete-path work.

### Seat 3 — Performance (subagent)

POSITION: C: a model-free core where every per-turn check is O(top-k) against a precomputed liveness flag, and nothing makes a network call or a model call while a turn is being answered.

REASONING: The hot path is per-turn recall: rank, then the F2/F16 liveness checks, then token packing. Baton rebuilds FTS5 for every query. That works under its 500-fact cap, but a store holding many people in chat/RAG will go past that cap. I measured today (Node v26.3.0, synthetic 40-word docs, file reads not counted): in-memory build took 1.5 ms at 500 docs, 8.3 ms at 5k and 110 ms at 50k. A query took 0.05, 0.42 and 4.1 ms. So F12 needs a persistent, incrementally updated index; rebuilding it is a recovery path, not something every turn does. F2 as written walks "the evidence chain" at serve time, and that walk grows with derivation depth. Liveness should instead be materialised when something is written (forget, hash change, sweep), so serving only reads a flag on over-fetched top-k. F16's URL check is network I/O, so it belongs in a background sweep. A judge call costs about 524 ms (Jev), which rules F19 out of the read path. F21 and F14 save tokens on every turn.
IN: F1 F2 F3 F4 F5 F6 F7(subject id) F8 F9 F10 F11 F12 F13(BM25) F14 F15 F16(async sweep) F18 F21 F22 F23(offline) F24(MCP) F25 F26(label) F27
DEFER: F13-embeddings (F25 shows a BM25 recall gap) · F19, F17-uncited (first contradiction a deterministic key misses) · F20 (store exceeds budget or duplicate rate climbs) · F7 per-observer (two observers diverge in eval) · F24 A2A (an adopter asks) · F26 register (label proves insufficient)
CUT: none
MISSING: a reverse evidence index (evidence → dependents) so F2/F4 never scan the corpus, plus p95 recall latency and tokens-per-turn at 10k/100k records as part of the F25 gate.

CLAIMS:
Baton today builds FTS5 per query — src/memory-rank.ts:10 — " * dependencies): at the 500-fact cap that build costs ~1ms and, unlike a"
The anchor-hash check is already cached by mtime, so stat-only when files are unchanged — src/memory.ts:655 — "/** Content hash of an anchored file, cached by mtime (re-hash only on change). */"
A judge call is far too slow for a turn — reports/jev.md:200 — "- **Latency.** Hindsight measured 27 to 63 ms per query. Cloudflare measured Jev at about 524 ms median."
Integer ids are an established pattern — mem0/memory/main.py:935 — "# Map UUIDs to integers (anti-hallucination)"
My FTS5 timings (1.5/8.3/110 ms) come from a synthetic inline run, not a file [unverified]

WHAT WOULD CHANGE MY MIND: real-corpus p95 recall staying under ~20 ms at 50k records with the per-query rebuild (that would remove the need for a persistent index), or F25 showing BM25 trailing embeddings by enough to require F13-embeddings in release 1.

### Seat 4 — Outsider (subagent)

POSITION: C. Ship only a core a newcomer can sum up in one sentence ("Markdown memory that cites its evidence, stops serving what lost it, and forgets completely"), and defer every feature whose reason is not visible on the page.

REASONING: Read cold, the 27 features look like the survey's gap list, not a product. Each IN feature below answers a question an adopter would ask anyway: will it lie (F2, F11, F15, F16, F18), can I delete a person (F3, F4, F6), will it fit my stack (F12, F13, F24-MCP), and does it help at all (F25)? Some features need insider history before anyone can see why they exist: HMAC tombstones, when deleting the truth file already forgets; a confidence label that repeats the evidence type; an empty "slot" for an algorithm nobody has written yet. Shipping them freezes them into the public format before anyone can say what they are for. A judge interface that defaults to null, and the checks that depend on it (F17), would ship as no-ops that look like guarantees.

IN: F1, F2, F3, F4, F6, F7 (subject id only), F8, F9, F10 (plain manual link/unlink), F11, F12, F13 (BM25 + token budget), F14, F15, F16, F18, F21, F22, F23, F24 (MCP), F25, F27 · DEFER: F5 (first sync or re-import path that can bring forgotten content back) · F7 observer view (an adopter runs two agents on one person) · F13 embeddings (BM25 misses an F25 gate) · F19 (a feature needs a verdict code cannot give) · F17, F20 (F19 ships) · F24 A2A card (an adopter asks) · F26 register (owner's linking algorithm lands) · CUT: F26 label (repeats F2's evidence type, and two fields can disagree) · MISSING: a merge rule for two agents superseding the same (subject, relation) in Markdown at the same time.

CLAIMS:
- Adopters will copy Hermes unless the docs explain why F15 does the opposite — agent/memory_manager.py:396 — "NOT new user input. Treat as authoritative reference data — "
- The simplest competing format is one Markdown line with its source inline — AgentMemoryRepo SPEC.md:44 — "- Payments and website share a 2026-10-15 launch deadline [source: https://example.com/sessions/102; added: 2026-09-03]"
- F12 already has precedent — tigerless CLAUDE.md:26 — "1. **Markdown files are the single source of truth; every index is a rebuildable cache.**"
- F21 is established practice — mem0/memory/main.py:935 — "# Map UUIDs to integers (anti-hallucination)"

WHAT WOULD CHANGE MY MIND: a release-1 path (host re-feeds transcripts, a git pull from a peer) that brings back a forgotten record, which moves F5 IN; or an F25 run where BM25-only loses to memory-off, which moves embeddings IN.

### Seat 5 — Reversibility (subagent)

POSITION: C — a small core with few public formats, plus every field that cannot be backfilled later.

REASONING: Read-path checks (F2 gate, F16, F18, F27, BM25, F14) are code: a patch removes them, adopters' files untouched. Kinds, id scheme, tombstone key and relation vocabulary live in adopters' files forever. So ship the checks, few kinds, and unrebuildable provenance; Baton paid for adding authors late. Forget (F3–F6) is IN despite its format cost: failing to forget a person is the one irreversible harm. F1 plus a "preserve unknown kinds/fields" rule keeps every DEFER cheap.

IN: F1–F6, F7 (subject id only), F8, F9, F11, F12, F13 (BM25 + budget), F14, F15, F16, F18, F23 (from evidence/supersession edges), F24 (MCP), F25, F26 (label only), F27 · DEFER: per-observer view (second agent writes about one subject); F10 (owner's linking algorithm specified); embeddings (BM25 loses on F25 eval); F17, F19 (eval shows contradictions triples miss); F20–F22 (recall measurably degrades with store size); A2A card (named consumer); open-questions register (adopter asks) · CUT: none; deferring is cheaper · MISSING: observer id + recorded_at in every envelope; forward-compat rule; merge rule for concurrent F11 supersession.

CLAIMS:
Late attribution left old facts unattributable: src/memory.ts:47 — "pre-author facts read as `unknown` rather than being migrated. */"
Baton facts have no version key: `grep -c "version" src/memory.ts` → 0 (control `grep -c "fingerprint"` → 15)
Baton ids are truncated: src/memory.ts:653 — "createHash('sha1').update(data).digest('hex').slice(0, 12);" (truncated)
Per-observer views need observer data at write time: honcho representation.mdx:33 — "based solely on what Bob said in sessions Alice participated in." (truncated)
Evidence gating is read-path code: hindsight retractions.py:112 — "def partition_retracted(based_on: dict[str, Any] | None, live_ids: set[str]) -> RetractedGrounding:"

WHAT WOULD CHANGE MY MIND: an owner linking spec fitting F10 now (F10 IN), or the F25 coding replay showing BM25 failing (embeddings release-blocking).

Note: answers run 300–470 words by `wc -w`, mostly long citation paths; not trimmed.

## Diversity check

POSITIONS: seats 2, 3, 4, 5 → C (a smaller core, each with different IN/DEFER lists and reasons: Baton port + concurrency rule · materialised liveness + persistent index · one-sentence adopter story · unbackfillable fields first); seat 1 → D (structural flaw: forget cannot erase git-tracked files). Real spread (D vs C) with distinct reasons. Proceed; no re-seat.

## Peer review

Mapping (written before dispatch): V = seat 2 Executor · W = seat 4 Outsider · X = seat 5 Reversibility · Y = seat 1 Contrarian · Z = seat 3 Performance.
Citation slices (disjoint, each re-run whole): R1 — Y memory.ts:471, :483, :381, :510, :970 · R2 — V memory.ts:1194, :1227, memory-rank.ts:9; Z memory-rank.ts:10, memory.ts:655 · R3 — Z jev.md:200, mem0 main.py:935; W memory_manager.py:396, SPEC.md:44, tigerless CLAUDE.md:26 · R4 — X memory.ts:47, version/fingerprint counts, memory.ts:653, representation.mdx:33, retractions.py:112.

### Review R1

CRITIQUE:
Response V: plans to port existing code and catches that remove archives, so forget needs a new delete path · the day-by-day schedule is invented, and it defers F5 even though git pull can re-deliver deleted files today.
Response W: the "null judge ships no-ops that look like guarantees" point · cites nothing from Baton, and keeps F14/F21/F22/F23 IN, which fails its own "reason visible on the page" test.
Response X: draws the line between read-path code and file format, and names unbackfillable fields (observer id, recorded_at, forward-compat) · calls forget "the one irreversible harm" but never checks where the files live.
Response Y: a git-tracked default turns F4's report into a false claim, and it gives a runnable falsifier · 0 of 23 facts are tracked, the package is standalone, and placement could be a rule inside C. Crypto-shredding brings key management it leaves unspecified.
Response Z: measured scaling, a reverse evidence index, and liveness materialised at write · the timings are unverified, and it ignores forget-in-git.

BIGGEST BLIND SPOT: Response X keeps F3–F5 IN to prevent irreversible harm. Truth files in the default tracked area survive in history and clones (memory.ts:471, :381).

ALL MISSED: an episode involving two subjects. Forgetting Alice either deletes Bob's derived records or leaves Alice's data cited inside them, and no cascade rule is given.

RE-RUN CHECK:
- `grep -nF '* - \`tracked\` → \`baton/memory/facts\`, in git. The default, and the point of the' src/memory.ts` → `471: * - \`tracked\` → \`baton/memory/facts\`, in git. The default, and the point of the` — match
- `grep -nF '* leak discovered after a push is a key rotation, not a file deletion. The' src/memory.ts` → `483: * leak discovered after a push is a key rotation, not a file deletion. The` — match
- `grep -nF '// \`baton/memory/facts/\` is tracked, so a file arriving by \`git pull\`' src/memory.ts` → `381:      // \`baton/memory/facts/\` is tracked, so a file arriving by \`git pull\`` — match
- `grep -nF "* Superseded/removed facts move HERE instead of being destroyed, so a fact's" src/memory.ts` → `510: * Superseded/removed facts move HERE instead of being destroyed, so a fact's` — match (lines 513–514 add that the archive is gitignored, local only)
- `grep -nF 'staleReason = now === '' ? \`${a.path} no longer exists\` : \`${a.path} changed since this was saved\`;' src/memory.ts` → `970:        staleReason = now === '' ? \`${a.path} no longer exists\` : \`${a.path} changed since this was saved\`;` — match

FALSE OR UNSUPPORTED CLAIMS: none found in my slice. Z's case for a persistent index rests on its [unverified] synthetic timings. V's [unverified] claim that the rebuild is fast enough is load-bearing for skipping FTS purge.

FRAMING: neutral.

FINAL RANKING:
1. Response Y
2. Response X
3. Response V
4. Response Z
5. Response W

### Review R2

CRITIQUE:
Response V: strongest: grounded port plan; spots that remove archives, so a real delete path is needed · weakest: its "nothing left on disk" forget test ignores git history.
Response W: strongest: cuts the F26 label as a duplicate field that can disagree · weakest: no repo evidence; F21–F23 are IN despite its own "visible reason" test.
Response X: strongest: splits read-path code (patchable) from format fields (permanent) · weakest: keeps F5 IN without saying where the HMAC key lives.
Response Y: strongest: a git-tracked truth store makes F4's "removed" report false, and it gives a check (`git log -S`, fresh clone) · weakest: storage routing is a fix you can list as a feature, so D overstates it.
Response Z: strongest: async F16, a reverse evidence index, latency in the gate · weakest: an unverified synthetic benchmark drives the persistent-index demand.

BIGGEST BLIND SPOT: V. It ports Baton's store, which is git-tracked by default, and declares forget complete.

ALL MISSED: a frozen F14 snapshot keeps serving forgotten or flushed records until the session ends. Nobody gave F4/F6 a rule that invalidates the snapshot.

RE-RUN CHECK:
- V `grep -nF "return archiveFact(mainRoot, id, 'remove', reason);" src/memory.ts` → `1194:  return archiveFact(mainRoot, id, 'remove', reason);` match
- V `grep -nF " * is no cross-process interlock between them. The first applies it; an agent" src/memory.ts` → `1227: * is no cross-process interlock between them. The first applies it; an agent` match
- V `grep -nF " * real BM25 via an FTS5 table built IN MEMORY per query (node:sqlite, zero" src/memory-rank.ts` → `9: * real BM25 via an FTS5 table built IN MEMORY per query (node:sqlite, zero` match
- Z `grep -nF " * dependencies): at the 500-fact cap that build costs ~1ms and, unlike a" src/memory-rank.ts` → `10: * dependencies): at the 500-fact cap that build costs ~1ms and, unlike a` match
- Z `grep -nF "/** Content hash of an anchored file, cached by mtime (re-hash only on change). */" src/memory.ts` → `655:/** Content hash of an anchored file, cached by mtime (re-hash only on change). */` match

FALSE OR UNSUPPORTED CLAIMS: I found no false citations. V: line 1227 describes a hazard that the code now guards against, not an incident that was observed. V's [unverified] "fast enough at v1 sizes" is supported only up to FACT_CAP 500 (src/memory.ts:125). Z's [unverified] timings carry its argument.

FRAMING: neutral

FINAL RANKING:
1. Response Y
2. Response X
3. Response V
4. Response Z
5. Response W

### Review R3

CRITIQUE:
Response V: grounded in Baton's real archive-not-delete and slug race · its "nothing left on disk" test ignores git copies; the week plan is invented timing.
Response W: clean adopter test; cuts F26 label for a stated reason · fails its own test (F21/F22/F23 IN unexplained); puts F16's network check on the read path.
Response X: best principle (read-path code is patchable, file fields are permanent); adds observer id, recorded_at, forward-compat · F5 IN without saying where the HMAC key lives.
Response Y: only seat to check where person data physically lives; gives a falsifiable git-log test · crypto-shredding adds key management, a large v1 surface.
Response Z: reverse evidence index and write-time liveness are real fixes · timings unverified; quotes 524 ms but drops the 27–63 ms on the same line.

BIGGEST BLIND SPOT: Response V — ships F4 with "a test proving nothing is left on disk" while facts sit in a git-tracked folder, so history and clones keep the record.

ALL MISSED: F14's frozen per-session snapshot keeps a forgotten or flushed record in the system prompt until the session ends; F4/F6 need a snapshot-invalidation rule.

RE-RUN CHECK:
1. Z jev.md:200 — `grep -nF -- "- **Latency.** Hindsight measured 27 to 63 ms per query. Cloudflare measured Jev at about 524 ms median." .../reports/jev.md` → `200:- **Latency.** Hindsight measured 27 to 63 ms per query. Cloudflare measured Jev at about 524 ms median.` — match
2. Z+W mem0 main.py:935 — `grep -nF -- "# Map UUIDs to integers (anti-hallucination)" .../mem0/memory/main.py` → `935:        # Map UUIDs to integers (anti-hallucination)` and `2618:        # Map UUIDs to integers (anti-hallucination)` — match
3. W hermes memory_manager.py:396 — `grep -nF -- "NOT new user input. Treat as authoritative reference data — " ".../hermes-agent/agent/memory_manager.py"` → `396:        "NOT new user input. Treat as authoritative reference data — "` — match
4. W SPEC.md:44 — `grep -nF -- "- Payments and website share a 2026-10-15 launch deadline [source: https://example.com/sessions/102; added: 2026-09-03]" .../SPEC.md` → `44:- Payments and website share a 2026-10-15 launch deadline [source: https://example.com/sessions/102; added: 2026-09-03]` — match
5. W tigerless CLAUDE.md:26 — `grep -nF -- "1. **Markdown files are the single source of truth; every index is a rebuildable cache.**" .../CLAUDE.md` → `26:1. **Markdown files are the single source of truth; every index is a rebuildable cache.**` — match

FALSE OR UNSUPPORTED CLAIMS: no citation mismatches. Z: its FTS5 timings are [unverified], and its persistent-index argument depends on them. Z's 524 ms leaves out the same line's "27 to 63 ms" figure, which weakens "rules F19 out". V: "Per-query FTS stays fast enough" is [unverified].

FRAMING: mostly neutral. "Survey's reported gaps none of the 13 cloned systems cover" lends weight to the gap features (F6, F16, F17).

FINAL RANKING:
1. Response Y
2. Response X
3. Response V
4. Response Z
5. Response W

### Review R4

CRITIQUE:
Response V: it starts from code that already exists and spots that `remove` archives, so forget needs a new delete path · it ports Baton's store without asking where that store lives (a git-tracked folder by default), and its day-by-day schedule is untested.
Response W: it points out that a null judge plus F17 would ship no-ops that look like guarantees · it puts F14/F21/F22/F23 IN without reasons, and it defers F5 until a re-delivery path appears, when `git pull` is already one.
Response X: it separates checks that are code and can be patched later from formats that adopters' files keep forever, and adds a forward-compat rule · F5 is IN with no word on where the HMAC key lives, and git history is not mentioned.
Response Y: it is the only answer showing that forget "removes" a record which git history, clones and the archive still hold; every cited line checks out · crypto-shredding adds key management it never costs out, and partial-file anchors make anchoring more fragile.
Response Z: it moves liveness to write time, adds a reverse evidence index and runs the F16 URL check as an async sweep · its latency numbers are unverified, and it ignores whether forget can actually reach the data.

BIGGEST BLIND SPOT: Response V. Porting Baton's memory code carries over its tracked-by-default storage, so the F4 delete test it plans for day 4 would pass on disk while the record survives in git.

ALL MISSED: F14's frozen per-session snapshot keeps serving a forgotten or flushed record for the rest of that session. Forget (F4/F6) needs a rule for invalidating that snapshot.

RE-RUN CHECK:
- X memory.ts:47 — `grep -n "pre-author facts read as" src/memory.ts` → `47:   *  pre-author facts read as \`unknown\` rather than being migrated. */` — match
- X count — `grep -c "version" src/memory.ts` → `0`; `grep -c "fingerprint" src/memory.ts` → `15` — match (the case-insensitive count is also 0)
- X memory.ts:653 — `grep -n "digest('hex').slice(0, 12)" src/memory.ts` → `653:const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);` — match
- X representation.mdx:33 — `grep -n "based solely on what Bob said" .../representation.mdx` → `33:**Peers observing others** (\`observe_others\`): ... Alice will form a representation of Bob based solely on what Bob said in sessions Alice participated in. ...` — match
- X retractions.py:112 — `grep -n "def partition_retracted" .../retractions.py` → `112:def partition_retracted(based_on: dict[str, Any] | None, live_ids: set[str]) -> RetractedGrounding:` — match

FALSE OR UNSUPPORTED CLAIMS: No citation was wrong. Z's FTS5 timings are marked [unverified], and its case for a persistent index rests on them.

FRAMING: neutral

FINAL RANKING:
1. Response Y
2. Response X
3. Response Z
4. Response V
5. Response W

## Claim checks

Orchestrator ran `grep -n "<quoted text>" <file>` per citation on 2026-10-21; Re-run = reviewer owning the slice.

| Seat | Citation | Checked with | Line as found | Re-run | Result |
|---|---|---|---|---|---|
| 1 | src/memory.ts:471 | `grep -n "The default, and the point of the" src/memory.ts` | `471: * - \`tracked\` → \`baton/memory/facts\`, in git. The default, and the point of the` | R1 match | kept |
| 1 | src/memory.ts:483 | `grep -n "leak discovered after a push is a key rotation" src/memory.ts` | `483: * leak discovered after a push is a key rotation, not a file deletion. The` | R1 match | kept |
| 1 | src/memory.ts:381 | `grep -n "is tracked, so a file arriving by" src/memory.ts` | `381:      // \`baton/memory/facts/\` is tracked, so a file arriving by \`git pull\`` | R1 match | kept |
| 1 | src/memory.ts:510 | `grep -n "Superseded/removed facts move HERE" src/memory.ts` | `510: * Superseded/removed facts move HERE instead of being destroyed, so a fact's` | R1 match (archive is gitignored, local only: lines 513–514 per R1) | kept |
| 1, 2 | src/memory.ts:970 | `grep -n "changed since this was saved" src/memory.ts` | `970:        staleReason = now === '' ? ... changed since this was saved\`;` | R1 match | kept |
| 2 | src/memory.ts:1194 | `grep -n "return archiveFact(mainRoot, id, 'remove', reason);" src/memory.ts` | `1194:  return archiveFact(mainRoot, id, 'remove', reason);` | R2 match | kept |
| 2 | src/memory.ts:1227 | `grep -n "is no cross-process interlock between them" src/memory.ts` | `1227: * is no cross-process interlock between them. The first applies it; an agent` | R2 match | kept (R2: describes a guarded hazard, not an observed incident) |
| 2 | src/memory-rank.ts:9 | (grounding) `grep -n "node:sqlite" src/memory-rank.ts` | `9: * real BM25 via an FTS5 table built IN MEMORY per query (node:sqlite, zero` | R2 match | kept |
| 2 | per-query FTS fast enough at v1 sizes | — | — | — | [unverified] (R2: supported only to FACT_CAP 500) |
| 3 | src/memory-rank.ts:10 | `grep -n "at the 500-fact cap that build costs" src/memory-rank.ts` | `10: * dependencies): at the 500-fact cap that build costs ~1ms and, unlike a` | R2 match | kept |
| 3 | src/memory.ts:655 | `grep -n "cached by mtime (re-hash only on change)" src/memory.ts` | `655:/** Content hash of an anchored file, cached by mtime (re-hash only on change). */` | R2 match | kept |
| 3 | reports/jev.md:200 | `grep -n "Cloudflare measured Jev at about 524 ms median" jev.md` | `200:- **Latency.** Hindsight measured 27 to 63 ms per query. Cloudflare measured Jev at about 524 ms median.` | R3 match | kept (R3: omits the same line's 27–63 ms Hindsight figure) |
| 3 | FTS5 timings 1.5/8.3/110 ms | — | — | — | [unverified] (synthetic inline run, self-marked) |
| 3, 4 | mem0 main.py:935 | `grep -n "Map UUIDs to integers" main.py` | `935:        # Map UUIDs to integers (anti-hallucination)` | R3 match | kept |
| 4 | hermes agent/memory_manager.py:396 | `grep -n "Treat as authoritative reference data" memory_manager.py` | `396:        "NOT new user input. Treat as authoritative reference data — "` | R3 match | kept |
| 4 | AgentMemoryRepo SPEC.md:44 | `grep -n "Payments and website share" SPEC.md` | `44:- Payments and website share a 2026-10-15 launch deadline [source: ...; added: 2026-09-03]` | R3 match | kept |
| 4 | tigerless CLAUDE.md:26 | `grep -n "every index is a rebuildable cache" CLAUDE.md` | `26:1. **Markdown files are the single source of truth; every index is a rebuildable cache.**` | R3 match | kept |
| 5 | src/memory.ts:47 | `grep -n "pre-author facts read as" src/memory.ts` | `47:   *  pre-author facts read as \`unknown\` rather than being migrated. */` | R4 match | kept |
| 5 | version count | `grep -c "version" src/memory.ts` ; `grep -c "fingerprint" src/memory.ts` | `0` ; `15` | R4 match | kept |
| 5 | src/memory.ts:653 | `grep -n "createHash('sha1')" src/memory.ts` | `653:const sha1 = ... .slice(0, 12);` | R4 match | kept |
| 5 | honcho representation.mdx:33 | `grep -n "based solely on what Bob said" representation.mdx` | `33:**Peers observing others** (\`observe_others\`): When enabled at the session le…` (truncated) | R4 match | kept |
| 5 | hindsight retractions.py:112 | `grep -n "def partition_retracted" retractions.py` | `112:def partition_retracted(...) -> RetractedGrounding:` | R4 match | kept |

Extra check by orchestrator: `git check-ignore -v baton/memory/facts/x.md` → (no output: not ignored); `git ls-files baton/memory` → (no output: 0 tracked in this checkout). So the folder is untracked here but not ignored — a `git add .` would commit it.

## Tally

Rankings: R1 Y X V Z W · R2 Y X V Z W · R3 Y X V Z W · R4 Y X Z V W.
AVERAGE RANK: Y 1.0 (seat 1 Contrarian) · X 2.0 (seat 5 Reversibility) · V 3.25 (seat 2 Executor) · Z 3.75 (seat 3 Performance) · W 5.0 (seat 4 Outsider). 4 of 4 parsed.
Framing: R1, R2, R4 neutral; R3 "mostly neutral" quoting "Survey's reported gaps none of the 13 cloned systems cover" as lending weight to F6/F16/F17 → confidence capped at medium.
All-missed raised by 3 of 4 reviewers: F14's frozen per-session snapshot keeps serving a forgotten/flushed record until the session ends — F4/F6 need snapshot invalidation. R1 adds: an episode with two subjects — forgetting Alice must not delete Bob's records nor leave Alice's data cited inside them.

## Verdict (chairman, fresh subagent)

### Framing
This is a feature audit of a 27-item proposal that will become a public format. R1, R2 and R4 found the brief neutral. R3 said the survey-gaps line lends weight to F6, F16 and F17, so confidence is capped at medium. The Performance seat's FTS5 timings and the Executor's "fast enough" claim are both [unverified], and neither decides anything below.

### Positions
Contrarian: "D. Files-as-truth (F12), placed in Baton's git-tracked memory folder, makes forget (F3/F4/F5) a report that claims removal while the data survives. Fix where person records are stored before freezing any feature list."
Executor: "C, a model-free core ported out of Baton's existing memory code, plus one missing feature that must be fixed before the format freezes: a concurrent-writer rule."
Performance: "C: a model-free core where every per-turn check is O(top-k) against a precomputed liveness flag, and nothing makes a network call or a model call while a turn is being answered."
Outsider: "C. Ship only a core a newcomer can sum up in one sentence ("Markdown memory that cites its evidence, stops serving what lost it, and forgets completely"), and defer every feature whose reason is not visible on the page."
Reversibility: "C — a small core with few public formats, plus every field that cannot be backfilled later."

### Where the members agree
4 of 5 seats choose C; the D seat's IN list is close to theirs. No seat ships F13-embeddings, F19, F20 or F17. All five ship F7 as a subject id only and gate on F25. 3 of 5 name a missing supersession merge rule.

### Where they clash
- **Placement.** The Contrarian is right on substance: git is Baton's default write area (src/memory.ts:471), so a "removed" report would be false. The reviewers are right on form: Baton already has a gitignored area (:473–474), so this is a rule inside C, not a D.
- **F5.** `git pull` already brings deleted records back (:381) — its deferral trigger has fired.

### Blind spots
F14's snapshot keeps serving forgotten records for the rest of the session (3 of 4 reviewers). An episode with two subjects has no cascade rule (R1). F5's HMAC key has no home.

### Recommendation
C, plus the Contrarian's placement rule.
Confidence: medium — R3 noted a brief lean; no coding replay corpus exists.

IN: F1, F2, F3, F4, F5, F6, F7 (subject), F8, F9 (gated), F10 (manual), F11, F12, F13 (BM25), F14, F15, F16 (async), F18, F23, F24 (MCP), F25, F26 (label), F27
DEFER: F7-observer (second agent, same subject) · F13-embeddings, F19 (BM25 loses in F25) · F17 (skill contradicted in replay) · F20–F22 (consolidation requested) · F24-A2A (named consumer) · F26 register (adopter asks)
CUT: none
ADD: person kinds stored only in gitignored storage, enforced in code · a true delete path, since remove archives today (:1194) · compare-and-swap on (subject, relation) · snapshot invalidation · a two-subject cascade rule · observer id and recorded_at · preserve unknown fields · a reverse evidence index

### What would overturn it
- BM25-only memory fails to beat memory-off in F25: embeddings and F19 move IN.
- After a forget, `git log -p -S<value>` or a grep of a fresh clone finds the value: the release is blocked.
- Person records must sync across machines: crypto-shredding moves IN.

### First step
Draft the envelope field list and placement rule in a scratch file.

Orchestrator check of the chairman's new citation: `sed -n '470,476p' src/memory.ts` → line 474 " * - `local` → `.baton/memory/facts`, gitignored. Where memory has always lived," — matches ":473–474" (the text is on 474).

## Memory

Baton fact: mem-council-decision-five-type-memory-feature (advisory).
