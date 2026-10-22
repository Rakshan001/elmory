# Council: which architecture holds five memory types for coding agents and chat/RAG bots

- **Date:** 2026-10-21
- **Status:** advisory — not acted on
- **Tier:** deep (requested by the owner: "run highest council")
- **Run:** 5 seats (5 subagent, 0 external, 0 inline) · review 4/4 · diversity ✓ (real spread A vs C)
- **Degraded:** no
- **Prior verdict:** councils 3, 4, 5 (`2026-10-08-standalone-open-memory-package-scope.md`, `2026-10-08-memory-package-components-and-feature-set.md`, `2026-10-21-existing-memory-systems-versus-own-package.md`) — all advisory, unapproved, and scoped to a coding-only first release. What changed: the owner now explicitly requires chat/RAG personalisation and a five-type taxonomy in the same system, which fires council 3's overturn condition ("a named chat/RAG consumer is ready to integrate"). Members were not told the prior recommendations.

## Question (as asked)

"see i want to build the new type of memory systems it will be used for the coding agents ... Now/context → working; What happened before → episodic; What is true → semantic; How to do it → procedural; Where to fetch it → external ... this memory systems can be used in the even rag system chatbot so it will create the personalizations and keep history ... multiple chat agents will get to know about that particular person details ... there will be flush memory options also ... this memory also leads to the halucinations right how we can tackles this ... /llm-council run highest council run 2 sandbox environment find all types of agents memroy availbe open source and what feature we can extract from it ... later u should run agian llm council highest and audit the ideas" (condensed; full message in the session record)

## Brief

DECISION: Which architecture should a new open-source memory system use to hold five memory types — working (now/context), episodic (what happened), semantic (what is true), procedural (how to do it: skills), external (where to fetch it) — for both coding agents and chat/RAG bots, and which features enter its first design?

OPTIONS (neutral order):
- A · One record model for all five types: every memory is a typed row/record (kind = working|episodic|semantic|procedural|external) sharing one id scheme, one provenance/evidence field, one supersession rule and one index; files on disk are the readable form, a rebuildable SQLite cache is the index.
- B · Five separate stores, each in its native shape (episodic = append-only event log; semantic = fact files with evidence; procedural = SKILL.md folders; working = per-session state file; external = a registry of sources), joined only by content-hash ids and a link table that the graph view reads.
- C · Layered: an immutable episodic log is the single source of truth; semantic, procedural and profile memories are derived records that must point back to episodic or code evidence ids; working memory is a budgeted view assembled per turn; external is a registry consulted on demand.
- D · Build on an existing system and add the missing types and code evidence on top — candidates: tigerless agent-memory (MIT, Python, Markdown truth + rebuildable FTS5, no LLM in core), Hindsight (MIT, Python, Postgres+pgvector), Honcho (AGPL-3.0, Python, peer model).

CONSTRAINTS:
- Must serve coding agents (Baton integration later) and chat/RAG bots (cross-conversation personalisation; several agents learn about the same person; resume a stopped chat).
- Must offer a user-triggered flush/forget, reduce memory-induced hallucination, save tokens, allow a graph view, and be "compatible with everything" (MCP-first; any agent).
- Owner wants hashes and OKF-style Markdown in the design and plans their own evidence-based linking/unlinking algorithm; the design must leave room for it.
- Baton's host conventions: daemon zero-dependency (raw node:http), strict TypeScript, git through src/util/exec.ts, SSE realtime; Baton is AGPL-3.0-or-later; a standalone package wants a permissive licence (owner decides).
- Agents never sign team events; memory "may reorganise, never originate"; no invented numbers.

STAKES: The record shape and storage layout become a public format; changing them after release forces migrations on every adopter. A wrong call either produces a coding-only store that cannot personalise chat, or a chat-style store that loses code evidence and serves stale facts to coding agents.

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

OUT OF SCOPE: Full A2A adoption (separate recommendation exists: stay MCP-first); Baton's team-sync signing; the licence choice itself (owner decides); model weight training (SEAL-style).

## Seats

Tier deep · 5 subagent members (5th seated because "compatible with everything / self-learning upside" is a tension no other seated lens covers) · 4 reviewers · 1 chairman = 10 agent calls.

| # | Lens | Tension | Seat type |
|---|---|---|---|
| 1 | First-principles | vs Maintainer: derive from the goal vs inherit Baton's shape | subagent |
| 2 | Maintainer | vs Expansionist: two-year format cost vs upside | subagent |
| 3 | User-advocate | vs Security: personalisation and recall vs exposure and poisoning | subagent |
| 4 | Security | vs User-advocate: every write path is an input channel | subagent |
| 5 | Expansionist | vs Maintainer: interoperability and self-learning upside | subagent |

## Answers

### Seat 1 — First-principles (subagent)

POSITION: C, built from two record kinds, Evidence and Claim, instead of five type silos. The episodic log stays append-only, but forget can hard-delete from it.

REASONING: The five types come from cognitive science. They are not storage boundaries. Storage only cares about lifecycle. Episodes, code hashes and external pointers are *observed* (Evidence). Semantic, procedural and profile items are *derived* and can be replaced by newer ones (Claims). Working memory is a per-turn *view*, so it is never stored as truth. The goals are never-originate, verifiable forget, no stale serving and a graph view. All four reduce to one invariant: a claim is served only if its chain back to evidence is still live. A and B leave that invariant optional. D brings in a foreign format.

First-design features:
1. Content-hash ids. Evidence covers episode, code anchor (path+hash) and external pointer (url+lastResolved).
2. A Claim has a kind tag, (subject, relation, object), validFrom/validTo, ≥1 evidence id, and a peer subject for chat personalisation.
3. Supersession on (s,r,o) with no LLM.
4. A pre-serve check drops a claim when its evidence was forgotten, its hash changed or its pointer is dead.
5. Forget cascades along evidence links to skills too.
6. Procedural claims store insights, not raw traces.
7. Markdown/OKF files are the truth. SQLite FTS5 is a rebuildable cache. The evidence-link table is where the owner's linking/unlinking algorithm plugs in.

CLAIMS:
Baton already stores code evidence as hashes — src/memory.ts:36 — "hash: string; // sha1 of content at save time ('' = file was absent)"
Baton derives keys rather than trusting stored ones — src/memory.ts:377 — "// COMPUTED, never read from the file. The fingerprint is not a label,"
Citation-based retraction exists to borrow — hindsight-api-slim/hindsight_api/engine/reflect/retractions.py:112 — "def partition_retracted(based_on: dict[str, Any] | None, live_ids: set[str]) -> RetractedGrounding:"
Deterministic supersession works — reports/papers.md:40 — "MemStrata applies deterministic (subject, relation, object) supersession in a bi-temporal ledger, no LLM call"
Raw traces hurt procedural memory — reports/papers.md:64 — "low-level traces often induce negative transfer"

WHAT WOULD CHANGE MY MIND: A measurement showing that requiring evidence ids drops a large share of useful chat claims, for example user-stated preferences with no episode retained.

### Seat 2 — Maintainer (subagent)

POSITION: Option A with a versioned envelope, plus C's derivation edges as a required field rather than a separate layer. No five formats, no fork.

REASONING: The format will outlive its author. B means five parsers and five migrations, plus a link table that becomes a sixth format and drifts from the other five. C calls the log "immutable" but must still honour user forget, so tombstone and rewrite rules leak into the source of truth, and every derived record depends on replay code that a future maintainer has to understand. D brings in a Python codebase and somebody else's format choices, while the host is strict TypeScript. Baton already writes A: one frontmatter envelope (type, supersedes, files@hash) on all 23 facts. Its two gaps are that nothing versions the envelope and nothing validates the evidence hashes. tigerless shows that one schema table can carry per-kind write rules, so episodic append-only fits inside A.

First-design features:
- `format: 1` in every envelope, with a migrate command and test fixtures for each version.
- A closed kind enum with a write mode per kind: episodic add-only; working scoped to the session and flushable.
- `derived_from: [ids]`, so a forget cascades to the skills distilled from it.
- Evidence written as path@hash, with an empty hash rejected at write time.
- Procedural records keep the SKILL.md body unchanged, with the envelope as frontmatter.
- Link and unlink stored as records of kind `link`, so the owner's algorithm writes the same format.
- The SQLite index is rebuildable and never shipped.

CLAIMS:
- The facts carry no version field. `grep -rln "schema" baton/memory/facts | wc -l` printed 0; the same command with "supersedes:" printed 23.
- tigerless-labs_agent-memory/packages/core/src/agent_memory/core/schema.py:125 — "FACTORY: tuple[MemorySchema, ...] = ("
- tigerless-labs_agent-memory/packages/core/src/agent_memory/core/schema.py:153 — "mode=MODE_ADD_ONLY,"
- baton/memory/facts/mem-a-hub-s-repo-list-is.md:12 — "  - src/kb/rescan.ts@" (evidence saved with an empty hash)

WHAT WOULD CHANGE MY MIND: a working prototype in which per-kind fields make one envelope mostly optional or nullable. In that case B's native shapes are honest and cheaper to keep up.

### Seat 3 — User-advocate (subagent)

POSITION: A, with one change: every kind shares one record envelope (hash id, provenance, supersession, tombstone), but each kind's readable file keeps its native form, so skills stay SKILL.md and episodes stay JSONL.

REASONING: Users trust a memory system mostly through "forget" and "why do you believe that?". C makes the episodic log immutable, which works against a forget that really erases. The research says only external-store deletion can be verified. D brings in silent failures. Honcho soft-deletes rows. Hermes's mirror store copies adds but never removals, so a "forgotten" fact stays in it. B gives users five different forget behaviours and no single answer to "what do you know about me?" One envelope gives one verb that works the same everywhere. Native file forms spare coding users a migration, because their SKILL.md folders keep working. Features the first design needs:
1. Two separate verbs: flush (working memory only) and forget (item, person or everything). Forget cascades through provenance to derived facts and skills, and returns a report of what it removed.
2. A tombstone that survives an index rebuild.
3. Every served memory carries its source id, so the user can open the file.
4. The serve path drops superseded and stale records.

CLAIMS:
- Honcho deletes softly: honcho/src/models.py:436 — "deleted_at: Mapped[datetime.datetime | None] = mapped_column("
- Hermes mirror copies only adds: plugins/memory/holographic/__init__.py:247 — "if action == \"add\" and self._store and content:"
- No system cascades forget: reports/oss-survey.md:162 — "4. **Forgetting does not provably cascade through every derivative.**"
- Flush is missing everywhere: reports/oss-survey.md:161 — "3. **Working memory is not a first-class, flushable object for both chat and coding.**"
- Tigerless marks the event kind add-only: core/schema.py:153 — "mode=MODE_ADD_ONLY,"

WHAT WOULD CHANGE MY MIND: A demonstration that C's log can hard-delete one person's episodes and rebuild every derived record, with no visible lag to the user.

### Seat 4 — Security (subagent)

POSITION: C, amended: the episodic log is append-only but physically deletable (not immutable), every derived record must cite live evidence ids, and the subject id is mandatory in every key. Treat this as a veto check on forget-cascade and scope, not a preference.

REASONING: The new trust boundary is "who may write text an agent later obeys". C is the only option where the schema enforces this. A fact or skill without live evidence is invalid, which makes "reorganise, never originate" real. It also turns forget into a graph walk: delete episode → retract derived facts, skills, FTS rows, vectors. B creates five forget paths, and Hermes already shows a mirror that gets adds but never removes. Honcho soft-deletes. Drop "immutable": an unerasable log makes forget unverifiable, and only verifiable store deletion counts.
First-design features: (1) subject scope inside ids and index keys, never an optional filter; (2) cascade forget with a change report, plus tombstones that survive rebuilds and are HMAC-keyed, because a bare hash of a short forgotten fact confirms guesses; (3) full SHA-256 ids; (4) content scan at write and at load, including agent-written skills; (5) human approval before anything becomes procedural; (6) served memory framed as data.

CLAIMS:
Mirror receives adds only — plugins/memory/holographic/__init__.py:247 — "if action == "add" and self._store and content:"
Agent-written skills unscanned by default — hermes_cli/config_defaults.py:2210 — ""guard_agent_created": False,"
Honcho deletion is a timestamp — src/models.py:436 — "deleted_at: Mapped[datetime.datetime | None] = mapped_column("
Baton ids are 48-bit — src/memory.ts:653 — "const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);"
Cascade precedent — retractions.py:112 — "def partition_retracted(based_on: dict[str, Any] | None, live_ids: set[str]) -> RetractedGrounding:"

WHAT WOULD CHANGE MY MIND: Option A with a NOT-NULL evidence field and a passing cascade-forget test suite across FTS, vectors and skills would meet the same veto with less machinery.

### Seat 5 — Expansionist (subagent)

POSITION: Hybrid "C inside A": use C's layering (an immutable episodic log as the root, where every semantic, procedural and profile record must carry `derived_from` ids pointing to episodes or code hashes), but write all of it in A's single record envelope, stored as OKF-frontmatter Markdown, with procedural records emitted as plain SKILL.md folders.

REASONING: The upside is in the lineage edges. If memory works, it learns: it turns episodes into facts, distils skills from task traces, and lets the owner's link/unlink algorithm rewrite edges. All three need one required, uniform derivation edge. That edge also delivers gaps nobody ships yet: a forget that cascades into distilled skills, and a check that flags a skill contradicting a newer fact. With one envelope there is one public format, so each adapter (LangGraph, Letta, Hermes, any MCP client) is written once, not five times as under B. SKILL.md output means learned procedures install into existing agents unchanged. D ties the format to Python/Postgres or AGPL and lacks code evidence.

First-design features: an envelope {hash id, kind, peer/subject scope, derived_from[], evidence, valid/superseded_by, stale_after}; the append-only episodic log; deterministic supersession; cascading forget with a diff report; a separate flush verb for working memory; a resolve-check on external pointers before serving them; per-peer scoping; an MCP server; OKF import/export.

CLAIMS:
Forget cascade into skills is unshipped — memtypes/reports/oss-survey.md:162 — "No system was seen that also retracts skills distilled from a forgotten episode and reports what changed"
Cross-type contradiction is unshipped — memtypes/reports/oss-survey.md:164 — "No system was seen checking a procedural skill against a newer semantic fact"
Derivation-based pruning already works in practice — hindsight/.../reflect/retractions.py:112 — "def partition_retracted(based_on: dict[str, Any] | None, live_ids: set[str]) -> RetractedGrounding:"
Another agent already treats skills as procedural memory — hermes-agent/tools/skill_manager_tool.py:10 — "Skills are the agent's procedural memory: they capture *how to do a specific"
There is a public Markdown provenance convention to align with — AgentMemoryRepo_agentmemoryrepo/SPEC.md:44 — "- Payments and website share a 2026-10-15 launch deadline [source: https://example.com/sessions/102; added: 2026-09-03]"

WHAT WOULD CHANGE MY MIND: Either of two findings. First, a prototype where requiring derived_from on chat-personalisation writes makes ingest measurably slower or lossier than A's optional provenance. Second, tigerless agent-memory already carrying a derivation-edge field in its schema and accepting a TypeScript port under MIT.

## Diversity check

POSITIONS: seat 1 C (Evidence/Claim split, log deletable) · seat 2 A (versioned envelope + required derivation edges) · seat 3 A (one envelope, native per-kind file forms) · seat 4 C amended (deletable log, mandatory subject id; veto check) · seat 5 "C inside A" hybrid. Real spread (A vs C), with clearly different reasons (lifecycle invariant · format maintenance · one forget verb · trust boundary · adapter reach). Proceed; no re-seat.

## Peer review

Mapping (written before dispatch): V = seat 3 User-advocate · W = seat 5 Expansionist · X = seat 1 First-principles · Y = seat 4 Security · Z = seat 2 Maintainer.
Citation slices (disjoint, each re-run whole): R1 — seat 1 memory.ts:36, memory.ts:377, papers.md:40, papers.md:64; seat 2 facts grep counts · R2 — tigerless schema.py:125, schema.py:153, mem-a-hub-s-repo-list-is.md:12, honcho models.py:436, holographic:247 · R3 — oss-survey.md:162 (seat 3 text), oss-survey.md:161, config_defaults.py:2210, memory.ts:653 · R4 — retractions.py:112, oss-survey.md:162 (seat 5 text), oss-survey.md:164, skill_manager_tool.py:10, SPEC.md:44.

### Review R1

CRITIQUE:
Response V: users judge memory by forget and explain · A's provenance is optional, so its cascade has nothing to walk
Response W: one required lineage edge gives cascade and skill-vs-fact checks · calls the log "immutable" and still promises cascading forget, and never resolves the two
Response X: Evidence/Claim lifecycle split, plus one served-only-if-chain-live invariant · (s,r,o) triples don't fit SKILL.md bodies; leans on a preprint that papers.md flags "Single-author"
Response Y: HMAC tombstones, subject in the key, scan at write and load · human approval before procedural blocks learned skills; heaviest machinery
Response Z: format versioning and a migrate command speak to the stated stakes; its Baton gaps are real · required derived_from leaves user-stated preferences with no episode unhandled

BIGGEST BLIND SPOT: W. An immutable root and a verifiable forget cannot both hold, and W never chooses one.

ALL MISSED: several agents writing about the same subject at once. Content-hash ids make two agents' identical facts collide, and no response defines a provenance-union merge rule. The facts also live untracked in git (0 of 23), so "files are truth" has no history.

RE-RUN CHECK:
- `grep -n "sha1 of content at save time" src/memory.ts` → `36:  hash: string; // sha1 of content at save time ('' = file was absent)` (match)
- `grep -n "COMPUTED, never read from the file" src/memory.ts` → `377:      // COMPUTED, never read from the file. The fingerprint is not a label,` (match)
- `grep -n "MemStrata applies deterministic" papers.md` → `40:| 3.3 | ... MemStrata applies deterministic (subject, relation, object) supersession in a bi-temporal ledger, no LLM call, ~2.1 s ... (Single-author preprint.) ...` (match)
- `grep -n "low-level traces often induce negative transfer" papers.md` → `64:| 4.4 | ... "high-level insights generalize well, whereas low-level traces often induce negative transfer" ...` (match)
- `grep -rln "schema" baton/memory/facts | wc -l` → `0`; with `"supersedes:"` → `23` (match). Extra check: `grep -n "src/kb/rescan.ts@"` on Z's fact file → `12:  - src/kb/rescan.ts@` (match)

FALSE OR UNSUPPORTED CLAIMS: none found. One caveat: X does not mention the single-author flag on its supersession citation.

FRAMING: Mild lean toward Markdown-based options and against D's Postgres candidates: "Owner wants hashes and OKF-style Markdown in the design".

FINAL RANKING:
1. Response X
2. Response Z
3. Response Y
4. Response W
5. Response V

### Review R2

CRITIQUE:
Response V: strongest: it keeps flush and forget as two verbs, backed by Honcho's soft delete and Hermes's add-only mirror · weakest: forget "cascades through provenance", but provenance stays optional under A, so the cascade is not guaranteed.
Response W: strongest: a required derived_from inside one envelope gives both the skill cascade and the skill-vs-fact contradiction check · weakest: it keeps the log "immutable" and also promises a cascading forget, and never reconciles the two.
Response X: strongest: splitting Evidence from Claim reduces every goal to one pre-serve check that the evidence chain is still live · weakest: (s,r,o) fits a SKILL.md body badly, and its own worry about preferences with no retained episode is left open.
Response Y: strongest: concrete security work: HMAC tombstones, subject id in every key, scanning skills at write and at load · weakest: human approval before anything becomes procedural works against the token-saving and automation goals.
Response Z: strongest: the format version plus a migrate command speaks directly to the public-format stakes · weakest: it misreads the empty hash as a defect.

BIGGEST BLIND SPOT: Response W. An immutable log cannot satisfy a verifiable forget, and W gives no erasure rule for it.

ALL MISSED: Several agents writing about one person at the same time. Files-as-truth needs merge and conflict rules for concurrent writes and supersessions.

RE-RUN CHECK:
1. `grep -nF "FACTORY: tuple[MemorySchema, ...] = (" .../tigerless-labs_agent-memory/packages/core/src/agent_memory/core/schema.py` → `125:FACTORY: tuple[MemorySchema, ...] = (` → match
2. `grep -n "mode=MODE_ADD_ONLY," .../schema.py` → `153:        mode=MODE_ADD_ONLY,` → match (context: inside the MemorySchema("event", ...) entry, so V's "event kind add-only" holds)
3. `grep -n "  - src/kb/rescan.ts@" ~/Desktop/Developer/playground/baton/baton/memory/facts/mem-a-hub-s-repo-list-is.md` → `12:  - src/kb/rescan.ts@` → match (od -c confirms the line ends at "@")
4. `grep -nF "deleted_at: Mapped[datetime.datetime | None] = mapped_column(" .../sandbox-a/honcho/src/models.py` → `436:    deleted_at: Mapped[datetime.datetime | None] = mapped_column(` → match
5. `grep -nF 'if action == "add" and self._store and content:' ".../hermes-agent/plugins/memory/holographic/__init__.py"` → `247:        if action == "add" and self._store and content:` → match (the function on_memory_write has no other branch, so replace/remove are dropped)
Extra check: Z's counts reproduce. "schema" gives 0 files, "supersedes:" gives 23, and the folder holds 23 files.

FALSE OR UNSUPPORTED CLAIMS: All quoted text matches. One problem is interpretation. Z says the line was "evidence saved with an empty hash" and proposes "empty hash rejected at write time". But src/memory.ts:36 says `hash: string; // sha1 of content at save time ('' = file was absent)`, and `ls src/kb/rescan.ts` prints "No such file or directory". So the empty hash is the designed marker for an absent file, not a validation gap. Rejecting it would break that meaning.

FRAMING: Leans toward C and toward requiring evidence: "memory 'may reorganise, never originate'" and "Owner wants hashes and OKF-style Markdown" penalise D (Postgres, AGPL).

FINAL RANKING:
1. Response X
2. Response Y
3. Response Z
4. Response V
5. Response W

### Review R3

CRITIQUE:
Response V: puts forget/flush trust first, with Honcho and Hermes evidence · provenance stays optional under A, so its promised cascade can't be enforced.
Response W: one required derived_from edge serves cascade, the contradiction check and owner linking · keeps the "immutable" log yet promises a forget that cascades.
Response X: one invariant (serve only claims with live evidence) replaces five type silos · admits user-stated preferences may have no evidence, but proposes no fix.
Response Y: schema-enforced never-originate; HMAC tombstones; subject in every key · its scan requirement ignores Hermes's own reason the scan is off (terminal() bypasses it).
Response Z: grounded in Baton's real files (no version field, empty hash); format versioning · "required" derived_from is just a field, with no serve-time check that it is live.

BIGGEST BLIND SPOT: Response W. It keeps C's immutable episodic root but never says how a forgotten episode is physically erased. Without that, a verifiable forget is impossible (arXiv:2510.25117).

ALL MISSED: No one gates release on beating memory-off, even though VibeMemBench shows 11/12 pairings fail to.

RE-RUN CHECK:
- V oss-survey.md:162 — `grep -nF "4. **Forgetting does not provably cascade through every derivative.**" .../memtypes/reports/oss-survey.md` → `162:4. **Forgetting does not provably cascade through every derivative.** Hindsight prunes mental models and Cognee drops graph and vector entries. No system was seen that also retracts skills distilled from a forgotten episode and reports what changed (MIRIX tracks the lineage but no retract path was seen), or that tombstones embeddings and FTS rows and proves the result.` — match
- V oss-survey.md:161 — `grep -nF "3. **Working memory is not a first-class, flushable object for both chat and coding.**" .../oss-survey.md` → `161:3. **Working memory is not a first-class, flushable object for both chat and coding.** Letta `system/` and MemOS `WorkingMemory` exist, but both are model-managed. Neither has an explicit "flush now/context" verb separate from long-term forget.` — match
- Y config_defaults.py:2210 — `grep -nF '"guard_agent_created": False,' ".../hermes-agent/hermes_cli/config_defaults.py"` → `2210:        "guard_agent_created": False,` — match
- Y src/memory.ts:653 — `grep -nF "const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);" src/memory.ts` → `653:const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);` — match

FALSE OR UNSUPPORTED CLAIMS: none found. V's "Flush is missing everywhere" overstates line 161, which says Letta and MemOS have working memory but no explicit flush verb.

FRAMING: Mostly neutral. The survey-gap line "forget does not cascade to skills distilled from a forgotten episode" favours derivation designs (C).

FINAL RANKING:
1. Response Y
2. Response X
3. Response Z
4. Response W
5. Response V

### Review R4

CRITIQUE:
Response V: puts forget/flush first and gives a report of what was removed · provenance is never made mandatory, so "cascades through provenance" is not enforced.
Response W: one envelope that emits SKILL.md and OKF, so adapters are written once · keeps the log "immutable" yet promises a cascading forget, and never reconciles the two.
Response X: Evidence/Claim reduces four goals to one serve-time invariant · drops profile claims that have no evidence; the answer admits this but sizes nothing.
Response Y: HMAC-keyed tombstones, subject inside keys, write/load scanning · heaviest machinery; the human gate on procedural could stall chat bots.
Response Z: the only answer to version the public format (`format: 1` + migrate) · `derived_from` is required, but it says nothing on what happens when a cited record is forgotten.

BIGGEST BLIND SPOT: W. Its root is an immutable episodic log, so "forget that cascades into distilled skills" cannot erase the source episode itself.

ALL MISSED: concurrent writers. Several agents or worktrees supersede the same (subject, relation) at once on Markdown truth files. No answer gives a merge or conflict rule for content-hash ids under git.

RE-RUN CHECK:
- `grep -nF 'def partition_retracted(based_on: dict[str, Any] | None, live_ids: set[str]) -> RetractedGrounding:' .../hindsight_api/engine/reflect/retractions.py` → `112:def partition_retracted(based_on: dict[str, Any] | None, live_ids: set[str]) -> RetractedGrounding:` · match (X, Y, W)
- `grep -nF 'No system was seen that also retracts skills distilled from a forgotten episode and reports what changed' .../reports/oss-survey.md` → `162:4. **Forgetting does not provably cascade through every derivative.** Hindsight prunes mental models and Cognee drops graph and vector entries. No system was seen that also retracts skills distilled from a forgotten episode and reports what changed (MIRIX tracks the lineage but no retract path was seen), or that tombstones embeddings and FTS rows and proves the result.` · match
- `grep -nF 'No system was seen checking a procedural skill against a newer semantic fact' .../reports/oss-survey.md` → `164:6. **No cross-type contradiction check.** No system was seen checking a procedural skill against a newer semantic fact (for example, a skill says "run X" but a fact now says X is deprecated).` · match
- `grep -nF "Skills are the agent's procedural memory: they capture *how to do a specific" ".../hermes-agent/tools/skill_manager_tool.py"` → `10:Skills are the agent's procedural memory: they capture *how to do a specific` · match
- `grep -nF -- '- Payments and website share a 2026-10-15 launch deadline [source: https://example.com/sessions/102; added: 2026-09-03]' .../AgentMemoryRepo_agentmemoryrepo/SPEC.md` → `44:- Payments and website share a 2026-10-15 launch deadline [source: https://example.com/sessions/102; added: 2026-09-03]` · match

FALSE OR UNSUPPORTED CLAIMS: none of the citations were wrong. One claim is unsupported: W says derivation-based pruning "already works in practice", but its evidence is only a function signature at retractions.py:112. I traced no caller or test.

FRAMING: leans toward C. Two phrases tilt it: "memory 'may reorganise, never originate'", and the gap list "forget does not cascade to skills distilled from a forgotten episode". Both favour required derivation edges.

FINAL RANKING:
1. Response Y
2. Response X
3. Response Z
4. Response W
5. Response V

## Claim checks

Checked by the orchestrator with `grep -n "<quoted text>" <file>` (one literal term each) on 2026-10-21; Re-run = the reviewer whose disjoint slice held the row.

| Seat | Claim | Citation | Checked with | Line as found | Re-run | Result |
|---|---|---|---|---|---|---|
| 1 | hash field records save-time sha1 | src/memory.ts:36 | `grep -n "sha1 of content at save time" src/memory.ts` | `36:  hash: string; // sha1 of content at save time ('' = file was absent)` | R1 match | kept |
| 1 | keys computed, not read | src/memory.ts:377 | `grep -n "COMPUTED, never read from the file" src/memory.ts` | `377:      // COMPUTED, never read from the file. The fingerprint is not a label,` | R1 match | kept |
| 1 | deterministic supersession | reports/papers.md:40 | `grep -n "MemStrata applies deterministic" papers.md` | `40:| 3.3 | ... MemStrata applies deterministic (subject, relation, object) supersession ... (Single-author preprint.) ...` | R1 match | kept (single-author preprint, R1 caveat) |
| 1 | raw traces negative transfer | reports/papers.md:64 | `grep -n "low-level traces often induce negative transfer" papers.md` | `64:| 4.4 | ... low-level traces often induce negative transfer ...` | R1 match | kept |
| 2 | no version field in facts | count | `grep -rln "schema" baton/memory/facts \| wc -l` ; same with `supersedes:` | `0` ; `23` | R1 match, R2 match | kept |
| 2 | one schema table, per-kind rules | tigerless schema.py:125 | `grep -n "FACTORY: tuple" schema.py` | `125:FACTORY: tuple[MemorySchema, ...] = (` | R2 match | kept |
| 2, 3 | event kind add-only | tigerless schema.py:153 | `grep -n "mode=MODE_ADD_ONLY" schema.py` | `153:        mode=MODE_ADD_ONLY,` | R2 match | kept |
| 2 | evidence saved with empty hash (= defect) | baton/memory/facts/mem-a-hub-s-repo-list-is.md:12 | `grep -n "src/kb/rescan.ts@" <file>` | `12:  - src/kb/rescan.ts@` | R2 match on text; interpretation MISMATCH | **struck — re-run disagrees**: '' is the designed absent-file marker (memory.ts:36), and `ls src/kb/rescan.ts` → "No such file or directory" |
| 3, 4 | Honcho soft delete | honcho src/models.py:436 | `grep -n "deleted_at: Mapped" models.py` | `436:    deleted_at: Mapped[datetime.datetime \| None] = mapped_column(` | R2 match | kept |
| 3, 4 | Hermes mirror adds only | holographic/__init__.py:247 | `grep -n "if action == \"add\" and self._store" __init__.py` | `247:        if action == "add" and self._store and content:` | R2 match | kept |
| 3 | no provable forget cascade | reports/oss-survey.md:162 | `grep -n "Forgetting does not provably cascade" oss-survey.md` | `162:4. **Forgetting does not provably cascade through every derivative.** ...` | R3 match | kept |
| 3 | no flushable working memory | reports/oss-survey.md:161 | `grep -n "Working memory is not a first-class" oss-survey.md` | `161:3. **Working memory is not a first-class, flushable object for both chat and coding.** ...` | R3 match | kept (R3: "missing everywhere" overstates; Letta/MemOS have model-managed WM, no flush verb) |
| 4 | agent-written skills unscanned | hermes config_defaults.py:2210 | `grep -n "guard_agent_created" config_defaults.py` | `2210:        "guard_agent_created": False,` | R3 match | kept |
| 4 | 48-bit ids | src/memory.ts:653 | `grep -n "createHash('sha1')" src/memory.ts` | `653:const sha1 = ... .slice(0, 12);` | R3 match | kept |
| 1, 4, 5 | derived pruning precedent | hindsight retractions.py:112 | `grep -n "def partition_retracted" retractions.py` | `112:def partition_retracted(based_on: dict[str, Any] \| None, live_ids: set[str]) -> RetractedGrounding:` | R4 match | kept (R4: signature only; "works in practice" unsupported — no caller traced) |
| 5 | skills cascade unshipped | reports/oss-survey.md:162 | `grep -n "also retracts skills distilled" oss-survey.md` | `162:... No system was seen that also retracts skills distilled from a forgotten episode and reports what changed ...` | R4 match | kept |
| 5 | no cross-type contradiction check | reports/oss-survey.md:164 | `grep -n "checking a procedural skill against" oss-survey.md` | `164:6. **No cross-type contradiction check.** ...` | R4 match | kept |
| 5 | skills = procedural (Hermes) | skill_manager_tool.py:10 | `grep -n "Skills are the agent's procedural memory" skill_manager_tool.py` | `10:Skills are the agent's procedural memory: they capture *how to do a specific` | R4 match | kept |
| 5 | Markdown provenance convention | AgentMemoryRepo SPEC.md:44 | `grep -n "Payments and website share" SPEC.md` | `44:- Payments and website share a 2026-10-15 launch deadline [source: https://example.com/sessions/102; added: 2026-09-03]` | R4 match | kept |

## Tally

Rankings: R1 X Z Y W V · R2 X Y Z V W · R3 Y X Z W V · R4 Y X Z W V.
AVERAGE RANK (lower is better): X 1.5 (seat 1 First-principles) · Y 1.75 (seat 4 Security) · Z 2.75 (seat 2 Maintainer) · W 4.25 (seat 5 Expansionist) · V 4.75 (seat 3 User-advocate). 4 of 4 parsed.
Framing: 3 of 4 reviewers flagged a lean (toward C / required evidence: "may reorganise, never originate"; survey-gap line on skill cascade; toward Markdown: "Owner wants hashes and OKF-style Markdown") → confidence capped at medium.

## Verdict (chairman, fresh subagent)

### Framing
Leans toward C and Markdown; 3 of 4 reviewers flagged it. Leaning words: "memory 'may reorganise, never originate'", "Owner wants hashes and OKF-style Markdown in the design", and "forget does not cascade to skills distilled from a forgotten episode". These are owner constraints, but they tilt against B and D.

### Positions
First-principles: "C, built from two record kinds, Evidence and Claim, instead of five type silos. The episodic log stays append-only, but forget can hard-delete from it."
Maintainer: "Option A with a versioned envelope, plus C's derivation edges as a required field rather than a separate layer. No five formats, no fork."
User-advocate: "A, with one change: every kind shares one record envelope (hash id, provenance, supersession, tombstone), but each kind's readable file keeps its native form, so skills stay SKILL.md and episodes stay JSONL."
Security: "C, amended: the episodic log is append-only but physically deletable (not immutable), every derived record must cite live evidence ids, and the subject id is mandatory in every key. Treat this as a veto check on forget-cascade and scope, not a preference."
Expansionist: "Hybrid "C inside A": use C's layering (an immutable episodic log as the root, where every semantic, procedural and profile record must carry `derived_from` ids pointing to episodes or code hashes), but write all of it in A's single record envelope, stored as OKF-frontmatter Markdown, with procedural records emitted as plain SKILL.md folders."

### Where the members agree
0 of 5 seats chose B or D. 4 of 5 (all but User-advocate) require evidence or derivation links. 3 of 5 name one shared envelope. All want Markdown truth, a rebuildable SQLite index, and forget that reaches skills.

### Where they clash
Is the episodic log immutable? Expansionist says yes; First-principles and Security say hard-deletable. All four reviewers called this Expansionist's blind spot: an unerasable log cannot give verifiable forget.

### Blind spots
- Concurrent writers (3 of 4 reviewers): identical facts from two agents collide on content-hash ids; no merge rule.
- 0 of 23 Baton facts are git-tracked, so "files are truth" has no history.
- No memory-off baseline gate (VibeMemBench, agent-read).
- Maintainer's "reject empty hash" is struck: '' marks an absent file.

### Recommendation
A's single versioned envelope (`format: 1`) with C's invariant required: every semantic, procedural and profile record cites at least one evidence id (episode, path@hash, url) and is served only while that chain is live. Episodes are append-only but physically deletable. Forget walks links through files, FTS, vectors and skills with a report; HMAC-keyed tombstones survive rebuilds; flush is separate. Subject id in every key; full SHA-256 ids; on collision, union provenance. Skills stay SKILL.md. A stated preference cites its utterance as evidence. Links are records too, ready for the owner's algorithm.

Confidence: medium — seats converge and citations hold, but the brief leans this way and nothing is prototyped.

### What would overturn it
- On replayed chat logs, over 20% (proposed threshold) of keep-worthy claims cannot cite a retained episode → make profile evidence optional.
- Any kind leaving over half its envelope fields null in a prototype → B.
- A cascade-forget test that cannot remove one person from files, FTS, vectors and skills → rethink lineage.
- tigerless adds a derivation-edge field and accepts an MIT TypeScript port → D.

### First step
Write the envelope as a scratchpad JSON Schema; convert copies of three Baton facts (one absent-file hash) plus one hand-written preference citing its utterance. Count null fields per kind; discard the copies.

## Memory

Baton fact: mem-council-decision-five-type-memory-system (advisory).
