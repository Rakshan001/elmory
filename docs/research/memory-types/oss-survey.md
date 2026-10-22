# Open-source agent memory systems: survey (2026-10-21)

Scope: memory systems for coding agents and chat/RAG bots, mapped onto the owner's five types:
**W** = working (now/context), **E** = episodic (what happened), **S** = semantic (what is true),
**P** = procedural (how to / skills), **X** = external (where to fetch it).

Evidence levels used below:
- **SRC**: shallow clone opened; the mechanism was checked with `grep -n` (section 2 lists commit, file and line).
- **README**: only the repo README (via `gh api repos/<r>/readme`) or the official page was opened.
- **[unverified]**: neither source was opened for that claim.

Stars and last-commit values came from `gh api repos/<r>` and `gh api repos/<r>/commits?per_page=1` on 2026-10-21.
Clones are in `scratchpad/memtypes/sandbox-b/`. No cloned code was run, installed or built.

---

## 0. Changes since mid-2026

- **Letta moved.** `letta-ai/letta` (25.2k★) is now only a README that points to `letta-ai/letta-code` (TypeScript, 3.7k★). The old Python V1 server sits on an `archive` branch. Memory is now a **git-backed Markdown "memory filesystem" (memfs)**. A `system/` folder holds the files pinned into context, which is the old core memory. A `/dream` reflection run replaces sleep-time agents.
- **mem0 OSS dropped its graph store and LLM UPDATE/DELETE.** At commit `2c81af3` the extractor prompt says "Your sole operation is ADD". `mem0/memory/main.py` has no `graph_store`. It uses an entity store that boosts memories whose linked entities match the query. Graph memory now appears only on the docs path `platform/features/graph-memory` (the hosted platform).
- **Zep CE is gone.** The `getzep/zep` README says the repo holds "integrations, and tools" for Zep Cloud and sends readers to Graphiti for the open-source engine.
- **OpenMemory was renamed.** `CaviraOSS/OpenMemory` now redirects to `CaviraOSS/LongMemory`. `mem0ai/openmemory` (98★) is a different project: a tool that moves sessions between coding harnesses.
- **Cognition published the Agent Memory Repo spec** (`AgentMemoryRepo/agentmemoryrepo`, MIT, created 2026-10-04, 819★). It defines a git repo of Markdown with a short `MEMORY.md` index, one-line entries carrying `[source: …; added: …]`, `[[wikilinks]]`, and a periodic "Dreaming" consolidation job.
- **New large 2026 entrants:** vectorize-io/**Hindsight** (52.1k★), volcengine/**OpenViking** (40.5k★), TencentCloud/**TencentDB-Agent-Memory** (29.7k★), tigerless-labs/**agent-memory** (4.2k★, Markdown truth, no LLM in the core), vshulcz/**deja-vu** (1.3k★, built from transcripts, no model), eugeniughelbur/**obsidian-second-brain** (4.8k★).
- **claude-mem is now the most-starred system here** (102k★).
- **OKF is real.** "Open Knowledge Format" v0.2 is published at `GoogleCloudPlatform/knowledge-catalog/okf/SPEC.md` (last change `62432a09`, 2026-08-21). It defines a directory of Markdown plus YAML frontmatter with `type` (required), `sources`, `generated`/`verified` trust tiers, `status` (draft/stable/deprecated) and `stale_after`. **Basic Memory ships an OKF exporter** in `src/basic_memory/okf/`.

---

## 1. Master table

Type key: W/E/S/P/X as defined above. The system's own names are in parentheses.

| System | Licence | Lang | Types modelled (own names) | Storage | Who writes | Forget/flush API | Anti-hallucination / provenance | Graph view | Stars · last commit |
|---|---|---|---|---|---|---|---|---|---|
| **MIRIX** (SRC) | Apache-2.0 | Py | W (core), E (episodic), S (semantic), P (procedural + `skill_experience`), X (resource), plus a 6th type, knowledge_vault (credentials and contacts, with a `sensitivity` field) | SQL tables (Postgres with tsvector, or SQLite with in-memory BM25) + embeddings | LLM: a meta-agent routes content to 6 memory-manager agents; `auto_dream` consolidates | per-table soft delete (`is_deleted`) [API surface unverified] | Experiences are tagged `worth_learning`/`worth_avoiding`, with status pending→consumed→superseded and `influenced_skill_ids` lineage. Sessions are tagged task vs conversation | dashboard exists; graph view [unverified] | 3.5k · 8cb06a62 (2026-08-20 on default branch) |
| **Letta / letta-code** (SRC) | Apache-2.0 | TS | W (`system/` pinned files), S/E (detached memfs files), P (skills), E (conversation history) | git repo of Markdown with frontmatter (`description`, `read_only`, `limit`) | LLM (agent edits files; `/dream` reflection runs) | git (delete, revert); `read_only` files are protected by a git hook | **Frontmatter validated in a git pre-commit hook**; `read_only` cannot be set or changed by the agent; signed git commits (`memory-git-signing.ts`) | none seen; files only | 3.7k (old repo 25.2k) · c25f091d (2026-10-20) |
| **mem0** (SRC) | Apache-2.0 | Py/TS | S (facts), P (`_create_procedural_memory`), E partly (episodes via `run_id`) | vector store (many backends), SQLite `history` table, entity store | LLM, ADD-only single call (V3) | `delete`, `delete_all(user/agent/run)`, `reset`, `expiration_date` | **UUIDs mapped to small integers before the LLM sees them** ("anti-hallucination"); per-memory `history()` audit | OSS: none (graph is a platform feature) | 67.6k · 2c81af3b (2026-10-20) |
| **Graphiti** (Zep's OSS engine) (SRC) | Apache-2.0 | Py | E (EpisodicNode, "saga"), S (EntityEdge facts), communities | graph DB: Neo4j, FalkorDB, Kuzu, Neptune | LLM extraction plus deterministic temporal resolution | `remove_episode(uuid)` | **Bitemporal edges**: `valid_at`/`invalid_at` (world time) plus `created_at`/`expired_at` (system time). Contradictions expire old edges instead of deleting them. Each edge's `episodes` list gives provenance | via the graph DB's own browser [unverified] | 32.1k · 8e320f88 (2026-10-21) |
| **Zep** | Apache-2.0 (repo) | Py | n/a: the repo holds Cloud integrations and LoCoMo/LongMemEval benchmarks (README) | Zep Cloud (closed) | – | – | – | – | 5.0k · a3a9194d (2026-10-20) |
| **Cognee** (SRC) | Apache-2.0 | Py | S (graph), E (sessions), "memify" enrichment pipelines | graph (Kuzu by default) + vector + relational | LLM ("cognify") | **`cognee.forget(...)`**: per data item, per dataset, everything, or `memory_only=True` (drops graph and vector, keeps raw files) | ontology support [unverified detail] | **`visualize_graph()`** renders HTML | 32.6k · 37f788bd (2026-10-16) |
| **LangMem** (SRC) | MIT | Py | S, E, P (P is done by **prompt optimisation**: `create_prompt_optimizer`, gradient and metaprompt variants) | LangGraph `BaseStore` | LLM, in the hot path or in the background (`ReflectionExecutor`) | `enable_deletes` flag (default False) | – | none (`graph_rag.py` is entirely commented out) | 1.7k · 48e3c11f (2026-10-02) |
| **MemOS** (SRC) | Apache-2.0 | Py + TS | W (`WorkingMemory`), S (`LongTermMemory`, `UserMemory`), P (`SkillMemory`, `ToolSchemaMemory`, `ToolTrajectoryMemory`), X (`OuterMemory`, `RawFileMemory`), preferences, plus KV-cache "activation memory" | tree/graph text memory (Neo4j or similar [unverified]) + vector; MemCube container | LLM, with a scheduler | status: activated/resolving/archived/deleted | `update_type` conflict/duplicate/…; `sources` list; `visibility` private/public/session | [unverified] | 12.0k · a7367d07 (2026-09-22) |
| **MemoryOS** (BAI-LAB) (README) | Apache-2.0 | Py | W (short-term), E (mid-term pages), S (long-term persona: user profile and knowledge) | files/JSON or ChromaDB | LLM | [unverified] | – | – | 1.6k · 587ed775 (2026-07-07) |
| **A-MEM** (README) | MIT | Py | S/E as Zettelkasten notes; links and "memory evolution" | ChromaDB | LLM writes note attributes and links, and rewrites neighbouring notes | `update`, delete [unverified] | – | links only | 1.2k · ceffb860 (2025-12-12) (paper repo WujiangXu/A-mem: 0c8039f2, 2026-03-05) |
| **Memobase** (README) | Apache-2.0 | Py | S (structured user **profile** of topic/sub_topic/content), E (user **event** timeline) | Postgres + Redis | LLM, batched in buffer zones (not in the hot path) | `delete_user`, blob delete, flush | profile schema is configurable | playground visualises the profile | 2.9k · 358c16bb (2026-01-11) |
| **Supermemory** (README) | MIT | TS | S (facts), user profile (stable facts + recent activity), RAG over documents | hosted; self-host docs exist [unverified detail] | LLM | "automatic forgetting", "forgets expired information" | handles "temporal changes, contradictions" | console | 31.3k · f81fad00 (2026-10-18) |
| **LongMemory** (ex-OpenMemory) (README) | Apache-2.0 | TS (+ Py client) | S/E (nodes, worlds, entities), P (Skills), X (LLM-Wiki, CodeGraph), Chat Memory | SQLite "Hydrograph" | mixed: deterministic decay and lifecycle; LLM is optional ("at most one model call" for grounded answers) | `maintenance decay`; lifecycle states | **Immutable content, hashes and provenance.** Recall modes: `strict` (temporal, contradiction and grounding gates), `historical`, `associative`, `world_grounded` | Next.js dashboard; graph [unverified] | 4.5k · 8badf44d (2026-10-18) |
| **memU** (README) | Apache-2.0 (LICENSE.txt) | Py | S/E as "LLM wiki", P (auto-extracted **skill Markdown**) | Markdown + embeddings | the **host agent** distils; `MemoryService` "makes no LLM or chat calls" | uninstall keeps the store; erase only on explicit request | – | – | 14.6k · 42ef9fa3 (2026-10-16) |
| **Memori** (README) | Apache-2.0 (LICENSE) | Py | S/E from "what agents do": tool calls, decisions | SQL [unverified] | LLM ("Advanced Augmentation") | [unverified] | – | – | 17.2k · 574b1ea3 (2026-09-18) |
| **Second-Me** (README) | Apache-2.0 | Py | personal identity model (Hierarchical Memory Modeling + fine-tuning) | local model weights + GraphRAG data | training | – | – | – | 15.7k · d0e40251 (**2025-09-19, stale**) |
| **Basic Memory** (SRC) | **AGPL-3.0** | Py | S (notes with `[category]` observations and typed relations), E (via `@occurred` dates) | **Markdown files are the truth**; SQLite FTS5 or Postgres index | human or LLM via MCP tools (`write_note`, `edit_note`, `delete_note`); parsing is deterministic | `delete_note`, `move_note` | **Authored valid time in Markdown**: `[decision] @effective[2026-06-10,2026-07-27) …`; accepted-change journal; **OKF export plus conformance checks** | Obsidian graph via wikilinks; README "A real knowledge graph" | 4.3k · 976a10c8 (2026-10-20) |
| **Khoj** (README) | AGPL-3.0 | Py | X (your documents: PDF, Markdown, org, Notion), custom agents | Postgres/pgvector [unverified] | RAG | – | – | – | 37.8k · ae229ca8 (2026-08-02) |
| **txtai** (README) | Apache-2.0 | Py | X/S: "embeddings database" combining sparse and dense vector indexes, a graph network and a relational DB | SQLite + ANN index + graph | deterministic indexing; LLM optional | index delete [unverified] | – | graph analysis API | 13.0k · 0ea7cb0d (2026-10-20) |
| **Graphlit** (README) | MIT (MCP server only) | TS | X (ingests Slack, Drive, GitHub…), "Memory (Short-Term)" | hosted Graphlit platform (closed) | platform | Delete Content/Feed/Collection/Conversation tools | – | platform | 0.4k · 1b94b887 (2026-01-12) |
| **Agent Memory Repo** (Cognition spec) (SRC) | MIT | spec + skill | any; `MEMORY.md` is the always-loaded W/S index | **git repo of Markdown**, plus SQL and scripts | agent writes live; a "Dreaming" agent consolidates | "Update or remove entries when the information changes"; Dreaming removes outdated entries | **`[source: <session URL>; added: YYYY-MM-DD]`** on every entry | `[[path]]` wikilinks | 819 · 8798cb26 (2026-10-06) |
| **Memorix** (SRC) | Apache-2.0 | TS | E/S/P (`LONG_TERM_MEMORY_KINDS = episodic, semantic, procedural`); observation types gotcha, decision, what-changed…; mini-skills | local store + Orama index (+ vectors) | agent/hook capture; LLM optional | lifecycle active→resolved→archived; retention decay with immunity rules | **Evidence rows** (`kind` git/code/test/session…, `relation` supports/verifies/derives/user-confirmed, `capturedHash`); states candidate→qualified→approved→archived/superseded; `commitHash`, `relatedCommits` | dashboard (graph code in `app.js`) | 853 · f9dc4b29 (2026-10-20) |
| **claude-mem** (SRC) | Apache-2.0 | TS | E (observations, `session_summaries` with request/investigated/learned/completed), S partly | SQLite (+ Postgres server mode with tsvector) + Chroma | LLM compresses tool observations captured by hooks | [unverified API]; `<private>` tags exclude content at capture | `observation_sources` table (Postgres schema); 3-layer progressive disclosure: search → `timeline` → `get_observations` | web viewer UI (README) | **102.0k** · bbb33790 (2026-10-20) |
| **Hindsight** (SRC) | MIT | Py | S (`world` facts), E (`experience`), derived `observation`s, **mental models**, **directives** (rules), knowledge-base pages | Postgres (pg extensions) | LLM: retain, recall, reflect | delete mental model; clear; invalidation | **Retraction tracking**: a mental model whose cited facts are deleted or invalidated is pruned and re-"unsaid" (`reflect/retractions.py`); 4-way recall fused by RRF; causal links | control-plane `graph-data.ts` | **52.1k** · a7ab53c8 (2026-10-20) |
| **OpenViking** (README) | AGPL-3.0 | Py | X (`viking://resources`), S/E (memories), P (`skills/`): "one filesystem for knowledge, memory, and skills" | virtual filesystem + vector index | LLM; sessions are committed to Markdown | [unverified] | **L0 abstract / L1 overview / L2 full** layering; directory-scoped search | Studio filesystem UI | 40.5k · 82882c26 (2026-10-21) |
| **TencentDB Agent Memory** (README) | MIT | TS | S/E (Chat Memory: L0 conversation → L1 atom → L2 scenario → L3 persona), P (versioned Skills with trigger boundaries and validation rules), X (Wiki, CodeGraph) | memory-core + hub services | LLM | human-controlled team panel; review before sharing | skills are private until reviewed | Wiki link graph + CodeGraph | 29.7k · 6a4bb55e (2026-10-21) |
| **tigerless agent-memory** (SRC) | MIT | Py | E (`event`, add-only), S (`profile`, `preference`, `entity`, `fact`, `decision`), P (`procedure`, `experience`), X (`reference`), W (deterministic `MEMORY.md` injection) | **Markdown truth + rebuildable SQLite FTS5 index** (+ optional vectors fused by RRF) | **no LLM in the core**; the host CLI or a user endpoint distils; Manage runs at sleep time | value-based forgetting; Manage marks files invalid and never removes them; physical delete is human-only | each sleep produces a git commit and a report; per-kind caps; decision ledger | none (links without a graph DB) | 4.2k · 327bc511 (2026-10-16) |
| **deja-vu** (README) | MIT | Go | E (every session transcript from 42 harnesses), `deja wip` (W) | local index; embeddings optional | **no model** (derived from transcripts) | `deja forget` (survives rebuilds), `deja delete`, exclude file | **"Says when the ground moved"**: reports when files a hit touched have changed since; `deja blame <path>:line` | stats card | 1.3k · 9f1e7c4e (2026-10-20) |
| **obsidian-second-brain** (README) | MIT | Py | S/E as an Obsidian vault; "Crew" shared logbook | Markdown vault | LLM, plus 4 scheduled agents (nightly consolidation…) | – | lessons "become rules only when you keep them" | Obsidian graph | 4.8k · 70054f75 (2026-10-20) |

---

## 2. Source-confirmed mechanisms (shallow clones in `sandbox-b/`)

Each line was printed by `grep -n -F "<literal>" <file>`.

| System @ commit | File:line | What it confirms |
|---|---|---|
| MIRIX @ `8cb06a62bbb7c478beb33dd4f2815696a72df482` | `mirix/constants.py:327` `SESSION_TAG_TASK = "task"` | Per-session routing. A "task" session goes to procedural/skill distillation; a "conversation" session goes to episodic/semantic extraction. This is the coding-vs-chat split in one switch. |
| | `mirix/orm/skill_experience.py:67` `'worth_learning' or 'worth_avoiding'` | Lesson store with status pending→consumed→superseded and `influenced_skill_ids` lineage. |
| | `mirix/orm/knowledge_vault.py:72` `sensitivity: Mapped[str]` | A separate vault for sensitive data, with a sensitivity level. |
| | `mirix/services/episodic_memory_manager.py:8` `from rank_bm25 import BM25Okapi` | Lexical search without embeddings is supported. |
| Graphiti @ `8e320f880e7d169a907dbf2a7ac4188586c03b55` | `graphiti_core/edges.py:281` `invalid_at: datetime \| None` | World-time validity on every fact edge. `episodes` on line 267 gives provenance. |
| | `graphiti_core/utils/maintenance/edge_operations.py:715` `def _apply_temporal_invalidation(` | Contradictions expire edges (`expired_at = now`, `invalid_at = new.valid_at`) and never delete them. |
| | `graphiti_core/graphiti.py:2174` `async def remove_episode` | Forget by source episode. |
| mem0 @ `2c81af3bbe27d9bccb09c772d583df9e9be72ee5` | `mem0/memory/main.py:935` `# Map UUIDs to integers (anti-hallucination)` | The LLM sees ids "0..n", so it cannot invent a UUID. Cheap and worth copying. |
| | `mem0/configs/prompts.py:472` `Your sole operation is ADD` | V3 extraction is additive only. The LLM no longer issues UPDATE/DELETE. |
| | `mem0/memory/main.py:1960` `def history(self, memory_id)` | Per-memory change audit, stored in SQLite. |
| Basic Memory @ `976a10c8977345e1f84b9d1a1557a0e2d0bad540` | `src/basic_memory/okf/__init__.py:1` `Open Knowledge Format` | OKF export and conformance checks. |
| | `src/basic_memory/markdown/temporal_qualifier.py:6` `@effective[2026-06-10,2026-07-27)` | Valid-time ranges written in plain Markdown bullets. |
| | `src/basic_memory/repository/sqlite_search_repository.py:61` `FTS5 virtual tables` | Cheap lexical index over Markdown. |
| letta-code @ `c25f091d0fce1f032e5cdf67ce131d5b474e6576` | `src/memory-frontmatter.ts:94` `'read_only' is a protected field and cannot be set by the agent` | A git hook enforces human-only fields. |
| | `src/agent/memory-filesystem.ts:344` `Always show system/ directory` | `system/` is the pinned working/core set; other files are fetched on demand. |
| | `src/agent/reflection-runs.ts:8` `DreamCommandScope` | `/dream` reflection (consolidation) runs. |
| Memorix @ `f9dc4b29f01916a86e8bb87f63776bb413be1976` | `src/memory/long-term-types.ts:57` `capturedHash?: string;` | Evidence rows are hash-bound to code, git, test or session sources. |
| | `src/memory/long-term-types.ts:13` `'candidate',` | Promotion lifecycle candidate→qualified→approved→archived/superseded. |
| | `src/memory/retention.ts:10` `accessBoost × connectionBoost` | Decay formula `importance × e^(-age/retention) × access × connection`, with immunity rules. |
| tigerless agent-memory @ `327bc51106e854aab63a7a769842a4872f6adb01` | `CLAUDE.md:26` `every index is a rebuildable cache` | Files are the truth; `rm -rf .index && mem rebuild` loses nothing. |
| | `packages/core/src/agent_memory/core/schema.py:153` `mode=MODE_ADD_ONLY` | `event` (episodic) is append-only. Other kinds upsert by identity fields, so the identity fields determine the file path. |
| | `packages/core/src/agent_memory/core/manage.py:36` `PROPOSAL_SUPERSEDE = "supersede"` | Sleep-time Manage: the reasoner picks only from a menu the core drafted, with caps per kind and a git commit per sleep. |
| | `packages/core/src/agent_memory/core/database.py:46` `USING fts5(` | Separate active and history FTS surfaces. |
| Agent Memory Repo @ `8798cb26c817d451a5ed6cba0ad8d9eca8d5ec3e` | `SPEC.md:49` `` `source`: a link to the agent session `` | Per-entry provenance convention. |
| Hindsight @ `a7ab53c84a847664d3377dfb7987d3e6bbaf4b17` | `hindsight-api-slim/hindsight_api/mcp_tools.py:147` `Literal["world", "experience", "observation"]` | Fact/experience split (semantic vs episodic). |
| | `hindsight-api-slim/hindsight_api/engine/search/fusion.py:33` `RRF formula` | Multi-retriever fusion (semantic, BM25, graph, temporal). |
| | `hindsight-api-slim/hindsight_api/engine/reflect/retractions.py:112` `def partition_retracted` | Derived documents are pruned when the facts they cite disappear. |
| LangMem @ `48e3c11f5bb527282c7d5339c6a87a0b35abccfc` | `src/langmem/prompts/optimization.py:27` `def create_prompt_optimizer(` | Procedural memory is implemented as system-prompt rewriting. |
| | `src/langmem/knowledge/extraction.py:226` `enable_deletes: bool = False` | LLM deletes are off by default. |
| Cognee @ `37f788bd287750e10d7610173e5332b3843f6ebd` | `cognee/api/v1/forget/forget.py:48` `memory_only=True` | One forget verb with scopes. |
| | `cognee/api/v1/visualize/visualize.py:193` `async def visualize_graph(` | Built-in graph view. |
| claude-mem @ `bbb337902271db56849b7645fee0f3b77b9aabf6` | `src/services/sqlite/SessionStore.ts:1258` `CREATE TABLE IF NOT EXISTS session_summaries` | Episodic session summaries with fields request/investigated/learned/completed. |
| | `README.md:224` `<private>` | Exclusion of private content at capture time. |
| MemOS @ `a7367d07e55db61099f7b4e2c1108bc5831a24f3` | `src/memos/memories/textual/item.py:184` `"ToolTrajectoryMemory",` | The richest memory_type enum among the clones: Working, LongTerm, User, Outer, ToolSchema, ToolTrajectory, RawFile, Skill, Preference. |
| | `…/item.py:72` `update_type: Literal["conflict", "duplicate", …]` | Each update is labelled with its reason. |

---

## 3. Features worth extracting

Costs: LLM = needs model calls; Emb = embeddings; DB = needs a server DB; Free = deterministic, files or SQLite only.

| # | Feature | Where | Cost | Serves |
|---|---|---|---|---|
| 1 | Markdown files as truth with a rebuildable index (FTS5 or hash map) | tigerless, Basic Memory, Letta memfs, AMR spec, OpenViking | Free | all five |
| 2 | Short always-loaded `MEMORY.md` index plus links to everything else | AMR spec, tigerless (deterministic injection), Letta `system/` | Free | W |
| 3 | Typed memory schemas whose identity fields give the file path, so upserts are deterministic. Example: `event` keyed by date+subject, add-only | tigerless `schema.py` | Free (an LLM fills fields) | E/S/P/X |
| 4 | Per-entry provenance `[source: session-url; added: date]` | AMR spec; OKF `sources` | Free | anti-hallucination |
| 5 | Trust tiers from `generated`/`verified` (unverified, machine-confirmed, human-reviewed), plus `status` and `stale_after` | OKF v0.2 (Basic Memory exports it) | Free | S, anti-hallucination |
| 6 | Bitemporal facts (valid time + system time); expire on contradiction, never delete | Graphiti; Basic Memory `@effective[a,b)` in Markdown | Graphiti needs LLM + graph DB; Basic Memory form is Free | S/E |
| 7 | Hash-bound code evidence (`capturedHash`, commitHash) plus "ground moved" warnings | Memorix; deja-vu | Free | S/P for coding |
| 8 | Promotion lifecycle candidate→approved; human-only protected fields | Memorix; Letta `read_only` hook; Tencent skill review | Free | S/P |
| 9 | Retraction propagation: derived summaries or models lose claims whose sources were deleted | Hindsight `retractions.py`; MIRIX `influenced_skill_ids` lineage | Free bookkeeping; LLM for the rewrite | S/P, forget |
| 10 | One `forget` verb with scopes (item / dataset / everything / memory-only), forgetting that survives rebuilds, and a human-only hard delete | Cognee; deja-vu; tigerless | Free | flush/forget |
| 11 | ID aliasing: show the LLM small ints instead of UUIDs | mem0 | Free | anti-hallucination |
| 12 | Additive-only LLM writes; LLM deletes off by default | mem0 V3; LangMem | LLM | S |
| 13 | Sleep-time consolidation ("dreaming"), with a menu-constrained reasoner, per-kind caps and one git commit per run | tigerless Manage, AMR Dreaming, Letta `/dream`, MIRIX auto_dream | LLM (batch, off the hot path) | S/P |
| 14 | Value-based decay with immunity rules (pinned, critical, accessed ≥3 times) | Memorix `retention.ts`; LongMemory deterministic decay | Free | forget |
| 15 | Progressive disclosure: L0 one-line abstract → L1 overview → L2 full file | OpenViking, tigerless, claude-mem 3-layer | Free (an LLM writes the abstracts) | W budget |
| 16 | Lexical-first hybrid search fused by RRF; vectors optional | Hindsight, tigerless, MIRIX BM25 | Free; Emb optional | retrieval |
| 17 | Task vs conversation session tag that routes extraction (skills vs facts) | MIRIX | Free | P vs E/S |
| 18 | Lessons tagged worth_learning/worth_avoiding, distilled into skills every N sessions | MIRIX; memU (host agent writes skill Markdown); Tencent (versioned skills with trigger boundaries) | LLM | P |
| 19 | Strict vs historical vs associative recall modes (strict gates on temporal validity, contradiction and grounding) | LongMemory | Free gating | anti-hallucination |
| 20 | Sensitive-data vault and `<private>` capture exclusion | MIRIX knowledge_vault; claude-mem; deja-vu strips keys | Free | safety |
| 21 | Separate user-profile object (topic/sub_topic) plus an event timeline | Memobase, Supermemory, Tencent L3 persona | LLM | S/E for chat |
| 22 | Signed, git-hooked memory commits | Letta `memory-git-signing.ts` | Free | audit |
| 23 | Graph view from wikilinks (Obsidian) or a generated HTML graph | Basic Memory, obsidian-second-brain, Cognee `visualize_graph` | Free | graph view |

---

## 4. Gaps no system covers

Each gap is limited to the systems checked here.

1. **No single system combines all of: file truth, bitemporal validity, hash-bound code evidence and the five types.** The parts exist separately:
   - tigerless: the five-type schema on files
   - Basic Memory: valid time in Markdown
   - Memorix: code hashes
   - Graphiti: system time plus expiry

   None has all four.
2. **External memory is never treated as a checked pointer.** Systems store the fetched content:
   - MIRIX resource memory
   - MemOS OuterMemory
   - tigerless `reference`

   OKF has `resource` and `stale_after`. No system was seen re-checking that a "where to fetch it" pointer still resolves, or comparing its hash, before serving it.
3. **Working memory is not a first-class, flushable object for both chat and coding.** Letta `system/` and MemOS `WorkingMemory` exist, but both are model-managed. Neither has an explicit "flush now/context" verb separate from long-term forget.
4. **Forgetting does not provably cascade through every derivative.** Hindsight prunes mental models and Cognee drops graph and vector entries. No system was seen that also retracts skills distilled from a forgotten episode and reports what changed (MIRIX tracks the lineage but no retract path was seen), or that tombstones embeddings and FTS rows and proves the result.
5. **No OKF-native writer.** Basic Memory only exports OKF. No system was seen that writes OKF frontmatter (`type`, `sources`, `generated`, `verified`, `stale_after`) as its live memory format.
6. **No cross-type contradiction check.** No system was seen checking a procedural skill against a newer semantic fact (for example, a skill says "run X" but a fact now says X is deprecated).
7. **Answer-time grounding is rare and optional.** Only LongMemory `strict` mode and Hindsight retractions gate recall on provenance. Most systems return top-k snippets without asking "is this still sourced?".
8. **No shared benchmark covers coding agents.** LoCoMo and LongMemEval measure chat. deja-vu reports LongMemEval-S. Nothing comparable measures stale-code-memory harm.

---

## 5. Chat personalisation vs coding agents

- **Chat / RAG personalisation:**
  - Memobase: profile + events, cheap and batched
  - Supermemory: profiles, automatic forgetting
  - mem0: additive facts, many backends
  - Zep Cloud / Graphiti: temporal facts about people
  - MemoryOS: short/mid/long persona
  - LangMem: LangGraph apps
  - Second-Me: personal model, stale since 2025-09
  - Khoj, txtai, Graphlit: document or external RAG more than memory
- **Coding agents:**
  - claude-mem: hooks + SQLite, biggest user base
  - Memorix: code evidence hashes, lifecycle
  - deja-vu: zero-model transcript index, "ground moved" warnings, blame
  - letta-code memfs: git Markdown
  - Agent Memory Repo spec
  - memU: skills from history
  - OpenViking: viking:// FS, plugins for Claude Code, Codex, Cursor
  - TencentDB Agent Memory: team skills, CodeGraph
- **Both:**
  - MIRIX: explicit task/conversation routing
  - tigerless agent-memory: profile/preference for chat, decision/procedure/fact for projects
  - Hindsight
  - Cognee
  - Basic Memory
  - LongMemory: Chat Memory + CodeGraph + Skills
  - MemOS

## 6. Closest starting points for the owner's design

- **tigerless agent-memory** is the closest match. It has a Markdown truth layer, FTS5, no LLM in the core, typed kinds that map almost 1:1 onto E/S/P/X, an add-only episodic kind, and reversible sleep-time Manage.
- **On top of it, add:**
  - the OKF frontmatter trust and lifecycle fields
  - Basic Memory's `@effective` valid-time syntax
  - Memorix's `capturedHash` evidence and promotion states
  - mem0's ID aliasing
  - Hindsight-style retraction propagation
  - MIRIX's task/conversation routing
  - Cognee's scoped `forget`
