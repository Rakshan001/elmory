# Hindsight vs Honcho — source study for a five-type memory system

Date: 2026-10-21. Everything here comes from source and docs opened in this session. Anything I did not open is marked [unverified].

| Repo | Clone path (sandbox-a) | Commit | Commit date | Licence |
|---|---|---|---|---|
| vectorize-io/hindsight | `.../memtypes/sandbox-a/hindsight` | `a7ab53c` | 2026-10-20 | MIT (`LICENSE:1`) |
| plastic-labs/honcho | `.../memtypes/sandbox-a/honcho` | `607438d` | 2026-10-20 | AGPL-3.0 (`LICENSE:1`) |

The scratchpad copy of Hindsight had no `.git`, so I cloned it again with `--depth 1`. I did not run, install or build anything.

Citation format: `file:line` is the line printed by `grep -n -F "<one literal>" <file>`. For Hindsight, `H/` means `hindsight-api-slim/hindsight_api/` and `HD/` means `hindsight-docs/docs/developer/`. For Honcho, `src/` and `docs/v3/documentation/` (shortened to `D/`) are relative to the repo root.

---

## 1. Memory types and how they map to the five target types

### Hindsight

The types it models (overview at `HD/index.mdx:65-69`):

| Hindsight construct | What it is | Where it lives | Maps to |
|---|---|---|---|
| **world** fact | An objective claim about other people or things. LLM-extracted with fields such as `what`/`when`/`who`/`why` (`H/engine/retain/fact_extraction.py:277`). | `memory_units.fact_type` (`H/models.py:170`) | **semantic** |
| **experience** fact | Something the bank's own agent did ("I recommended Python"). Decided by who is speaking, not by grammar (`HD/retain.md`, "Two Types of Facts"). `fact_type: Literal["world","experience"]` (`fact_extraction.py:179`). | `memory_units` | **episodic** (the agent's own history) |
| **observation** | A consolidated belief, deduplicated, with `source_memory_ids`, `proof_count` and history. | `memory_units` with `fact_type='observation'`. Columns added in migration `p1k2l3m4n5o6...py:106` (source_memory_ids). | **semantic** (consolidated, evolving) |
| **mental model** | A standing answer to a question you define, rewritten in the background, with freshness and history (`HD/mental-models.mdx:22,44`). | Own `mental_models` table (read at `H/engine/memory_engine.py:4805`). The migration history churned: it was dropped, then recreated (`h3c4d5e6f7g8_mental_models_v4.py`). | **semantic/procedural** (curated playbooks) |
| **knowledge page** | A wiki tree the bank writes itself, built from observations, never citing other pages. Can be mounted as files with `hindsight fs mount` (`HD/index.mdx:113`). | Pages backed by mental models (delete route "pages' mental models are removed too") | **semantic/procedural** docs; file-mount gives an **external**-style access path |
| **directives** | Hard rules ("Never recommend specific stocks"), with tags and priority. | `directives` table (`p1k2l3m4n5o6...py:73`) | **procedural** (rules, not how-tos) |
| **disposition / mission** | Skepticism, literalism and empathy on a 1–5 scale (`H/models.py:338`). Shapes `reflect` only. | `banks` | persona config, not memory |
| **documents / chunks / attachments** | The raw source text, with chunks returned via `include_chunks`. Attachments have fetch URLs. | `documents` (`H/models.py:104`) | **episodic raw** + **external** pointers (document_id, attachment URL) |
| **reflect** | An agentic loop that answers by searching mental models, then observations, then raw facts (`HD/reflect.mdx`). | runtime only | a reasoning layer, not a store |

**Missing types.** Hindsight has no **working memory** object. There is no session state or summary; the caller owns the conversation, and Hindsight only receives `retain` batches. The Claude Code plugin retains every 10 turns (`hindsight-integrations/claude-code/settings.json:30`). It has no **procedural** store of executable steps or skills; directives and mental models are the closest. **External** exists only as `document_id`/`chunk_id`/attachment URLs on retrieved facts. I found no registry of "where to fetch X" for sources that live outside Hindsight.

Two caveats on the schema. First, the ORM `models.py` lags the migrations: its CHECK still lists only the three fact types (`models.py:170`), while migration `p1k2l3m4n5o6...py:127` adds `'opinion'` and `'mental_model'`. Second, `opinion` appears only in legacy constraints, and the current docs do not describe it.

### Honcho

| Honcho construct | What it is | Maps to |
|---|---|---|
| **Workspace** | Tenant/namespace; auth is issued at this level (`D/core-concepts/architecture.mdx`) | isolation boundary |
| **Peer** | Any user or agent; holds the cross-session representation | identity key for personalisation |
| **Session** | A conversation thread with many peers; also the unit of visibility | container for **working** + **episodic** |
| **Message** | Raw turns stored verbatim, with GIN full-text index (`src/models.py:280`) and per-message embeddings (`message_embeddings`) | **episodic** (raw) |
| **Session summaries** | Short summary every 20 messages, long every 60 (`src/config.py:1223,1224`). Recursive and exhaustive: prior summary plus new messages (`D/features/advanced/summarizer.mdx:19`). | **working** (compressed context) / **episodic** |
| **Conclusions** (`documents` rows) | `level ∈ explicit, deductive, inductive, contradiction` (`src/utils/types.py:294`). Stored in a **collection keyed by (observer, observed)** (`src/models.py:360,388`). | **semantic** about a person |
| **Peer card** | Up to 40 prefixed entries: `IDENTITY:`, `ATTRIBUTE:`, `RELATIONSHIP:`, `INSTRUCTION:` (`src/utils/agent_tools.py:419`) | cached core **semantic** profile. `INSTRUCTION:` entries are a thin **procedural** slice (standing rules the user stated). |
| **Representation** | The set of conclusions plus card plus summaries for one (observer, observed) pair. This is the theory-of-mind object (`D/core-concepts/representation.mdx`). | personalised **semantic** model |
| **Deriver** | Background worker. The current prompt extracts **explicit atomic facts** only (`src/deriver/prompts.py:67`). | ingestion |
| **Dreamer ("dreaming")** | Periodic specialists: Deduction, Induction, CardRefresh (`src/dreamer/specialists.py:829,976,1109`). Uses surprisal sampling (`src/dreamer/surprisal.py:4`). Marked "experimental" (`D/features/advanced/dreaming.mdx:8`). | consolidation, contradiction handling |
| **Dialectic** (`peer.chat`) | An agent loop answering questions about a peer, with reasoning levels minimal…max (`src/config.py:1027`) | retrieval/reasoning API |
| **Scopes** | Named sets of sessions; a "projection" of one representation (`D/features/advanced/scopes.mdx:19`) | visibility, not a type |

Doc/code drift: `D/core-concepts/reasoning.mdx:58` says the deriver extracts "explicit and deductive" conclusions. The current deriver prompt (`src/deriver/prompts.py:67`) asks only for explicit facts. Deductive conclusions come from the dreamer's DeductionSpecialist.

**Missing types.** Honcho has no **procedural** store beyond peer-card `INSTRUCTION:` entries, and no **external**/pointer type. Messages and file uploads are ingested as content, and evidence returns message ids for later fetch (`D/features/advanced/evidence.mdx`). **Working** memory is well served by `session.context()`: summary plus recent messages within a token budget.

---

## 2. Data model, ingestion, retrieval

### Hindsight

**Storage.** Everything is in Postgres. Oracle is an alternative (`HD/storage.md`), and embedded `pg0` is used for local dev.
- `memory_units` holds text, a pgvector `embedding` (`H/models.py:136`) with an HNSW cosine index (`:194`), the temporal fields `occurred_start/end` and `mentioned_at`, `fact_type`, JSONB metadata, tags, `proof_count`, `source_memory_ids` and history.
- `entities` with `unit_entities`, plus `entity_cooccurrences` (`:260`), which is a materialised co-occurrence cache.
- `memory_links` is a typed graph: `temporal`, `semantic`, `entity`, `causes`, `caused_by`, `enables`, `prevents`, with weight in [0,1] (`H/models.py:313`).
- `documents` (`:104`), `directives` and `mental_models`.

**Ingestion (`retain`).**
- *Model-written:* fact extraction (`concise`, `verbose`, `verbatim`, `custom`). Each fact gets what/when/who/why, a fact_type, entities and causal relations (`fact_extraction.py:277,179`). Consolidation into observations is also model-written (`H/engine/consolidation/prompts.py`), as are mental-model refreshes, knowledge pages and reflect.
- *Plain code:* chunking, embeddings, entity resolution (fuzzy name match plus co-occurrence, per `HD/retain.md`), temporal, semantic and causal link creation (`H/engine/retain/link_creation.py`), dedup thresholds, and memory-defense regex redaction.
- *No-LLM mode:* `chunks` mode stores chunks with "no LLM call" (`HD/retain.md:300`). `HINDSIGHT_API_LLM_PROVIDER=none` turns Hindsight into a chunk store with semantic search; reflect and consolidation are disabled (`H/engine/providers/none_llm.py:30`).
- Consolidation runs in the background after retain and is fully asynchronous.

**Recall algorithm** (`HD/retrieval.md`; code verified):
1. Four arms run in parallel:
   - semantic: pgvector, `LIMIT recall_budget`
   - keyword: BM25 with 5 backends
   - graph: entity/link spreading activation
   - temporal: a parsed time window, relevance-first, spread across time buckets
2. **RRF** with k=60 (`H/engine/search/fusion.py:29`; `HD/retrieval.md:233`).
3. Pre-filter to the top 300, then a **cross-encoder rerank**. The default local model is `cross-encoder/ms-marco-MiniLM-L-6-v2` (`H/config.py:1383`).
4. Multiplicative boosts: `combined = CE × recency × temporal × proof_count` (`H/engine/search/reranking.py:200`). Recency gives ±10% with linear decay over 365 days. Proof count gives ±5%, log-scaled.
5. **Token-budget packing** rather than top-k. The default is `max_tokens` 4096 (`HD/retrieval.md:137`). Only memory text counts toward the budget. An oversized item is skipped and packing continues, and the top item is always returned (`HD/retrieval.md:348`).
6. `budget` low/mid/high sets candidate depth: 100/300/1000, or an adaptive ratio of max_tokens.

**Reflect.** An agent loop of up to 10 iterations (`H/engine/reflect/agent.py:161`). Its tools are `search_mental_models`, `search_observations`, `recall`, `expand` and `done`. It must gather evidence before answering.

### Honcho

**Storage.** Postgres plus pgvector by default. The vector store is pluggable: pgvector, turbopuffer, lancedb, qdrant or chromadb (`src/config.py:1518`).
- `messages`: verbatim, with `seq_in_session`, token_count, a GIN tsvector index (`src/models.py:280`) and a trigram index.
- `message_embeddings`: HNSW.
- `collections`: unique on (observer, observed, workspace) (`src/models.py:388`).
- `documents` (conclusions):
  - `level` and `times_derived`, a reinforcement count (`:422`)
  - an `embedding` with an HNSW index (`:534`)
  - `session_name`, which is null for cross-session derived conclusions
  - `deleted_at` (`:436`)
- `document_sources`: a reasoning-tree edge from derived_id to source_id (`:568`). It is deliberately not a foreign key, because "the dreamer can emit IDs that never resolve" (`:576`).
- `queue`: task types webhook, summary, representation, dream, deletion, reconciler, scope_backfill and scope_removal (`src/utils/types.py:283`).

There are no entity tables and no temporal or causal link graph. The only graph is the derived→source premise tree.

**Ingestion.**
- *Plain code:* message write plus enqueue, synchronously. A batching gate fires at ≥512 tokens per work unit (`src/config.py:970`), or by age after 1800 s.
- *Model-written:* the deriver extracts explicit facts and is told never to attribute to the target what another peer said (`src/deriver/prompts.py:78`). The summarizer writes summaries. The dreamer's deduction specialist does knowledge updates, implications and contradictions. Its induction specialist writes patterns with confidence high, medium or low (`src/utils/agent_tools.py:158`). CardRefresh writes the peer card.
- *Plain-code dedup:* exact match plus semantic cosine distance ≤ 0.05 (`src/crud/document.py:334`). A duplicate bumps `times_derived` rather than inserting a new row. `DEDUPLICATE` defaults to True (`src/config.py:950`).
- *Dream scheduling (plain code):* ≥50 new conclusions (`src/config.py:1411`), an 8 h cooldown (`:1413`) and a 60 min idle timer (`:1412`). New messages cancel a pending dream.

**Retrieval.**
- *Working representation* (`src/crud/representation.py`) is a blend under a `max_observations` cap. The default is 100 (`src/config.py:961`):
  - a semantic top-k for the query (default ⅓ of the cap)
  - "most derived", meaning highest `times_derived` (`:525`)
  - the most recent conclusions, which fill the remainder (`:411`)
  - There is no rank fusion and no reranker; it is a slot-allocation blend.
- *`session.context(tokens, summary, peer_target, search_query, search_top_k, max_conclusions)`:* up to 40% of the budget goes to the best summary that fits (`src/routers/sessions.py:238`). The rest goes to recent messages, net of the representation and peer card.
- *Dialectic `peer.chat`:* prefetches 25 relevant conclusions (10 at the minimal level) (`src/dialectic/core.py:326`). It then runs a tool loop (`search_memory`, `search_messages`, `grep_messages`, temporal search, `get_reasoning_chain`, ...) with 1–10 iterations by level (`src/config.py:1101`). The default model is `gpt-5.4-mini` (`src/config.py:944`).

---

## 3. Personalisation across conversations

### Hindsight
- The unit is the **bank** (`bank_id`). A new chat on the same bank gets everything earlier chats retained. The Claude Code plugin injects recall on every `UserPromptSubmit` (`hindsight-integrations/claude-code/hooks/hooks.json:14`) and retains on `Stop`.
- **Per-user isolation:**
  - A bank per user/agent, or tags within a bank: "Tags enable visibility scoping—useful when one memory bank serves multiple users" (`HD/retain.md:169`).
  - Observations are consolidated per tag scope, and `consolidation_strategies` can give each scope its own mission and cap. For example, a company-wide scope can be told never to name people (`HD/observations.mdx`).
  - Mental models are scoped by tags for both reading and visibility.
- **Gotcha:** the plugin tags each retain with `{session_id}` (`settings.json:34`). Dedup "only compares observations within the same tag scope", so per-session tags produce one near-duplicate observation per session unless `observation_scopes: "shared"` is set (`HD/observations.mdx:58`).
- **Multi-agent:** several agents can write to one bank. Facts are classified relative to the bank's own agent, as experience versus world. No per-agent observer/observed model exists. The plugin's `dynamicBankGranularity: ["agent","project"]` maps agents to banks. Cross-bank recall via `recallAdditionalBankFilters` exists in config [semantics unverified].
- **How the user model is built:** there is no explicit user profile object. The model is the observations about the user entity plus any mental models you define (for example "What does this user prefer?"). Mental models are a DB read with no LLM call (`HD/mental-models.mdx:22`). That makes them the cheap "profile" to load at session start.

### Honcho
- Personalisation is the core design. The **Peer** is the cross-session container, and conclusions drawn in session A are served in session B. A new session calls `session.context(peer_target=user, search_query=...)` or `peer.chat(...)`, which returns the peer card, the representation and summaries.
- **Theory of mind / multi-agent:** collections are keyed by (observer, observed). With `observe_others`, Alice forms her own representation of Bob from only the sessions Alice witnessed (`D/core-concepts/representation.mdx:33`). With `observe_me` (`src/schemas/configuration.py:250`), Honcho's global view of a peer is built from all of that peer's messages. Several agents learning about one person can therefore share the global (user, user) representation, or each keep a perspective-limited one. This is first-class, and Hindsight has no equivalent.
- **Isolation:** workspaces separate tenants. Scopes (named session sets) project one representation into bounded views, e.g. therapy versus billing (`D/features/advanced/scopes.mdx:19`). Scoped JWTs gate perspective reads (`src/routers/sessions.py`, the `get_session_context` checks).

---

## 4. Delete / forget / flush, contradictions, anti-hallucination

### Hindsight

**Forget APIs** (`H/api/http.py`):
- `DELETE /banks/{id}` — "Delete memory bank" (`:8946`). This is a full flush.
- `DELETE /banks/{id}/memories` — "Clear memory bank memories", optionally filtered by type. It keeps the bank profile (`:10793`). This is a flush by type.
- `DELETE /documents/{id}` (`:8426`). This cascades to the document's units and to the observations derived from them, and the remaining sources are re-queued for consolidation (`HD/observations.mdx:299`).
- `DELETE /observations` — "Clear all observations" (`:9731`). Also `DELETE /memories/{id}/observations` (`:9850`), which forces re-synthesis.
- `PATCH /memories/{id}` "Curate" can edit, invalidate or revert. "Invalidated memories are excluded from recall, consolidation, and graph maintenance but kept for audit (reversible)" (`:6263`). This is a reversible tombstone, which is better than hard delete for an anti-hallucination workflow.
- Mental models, directives and knowledge nodes each have their own DELETE.

**Contradictions** are handled by the LLM in consolidation:
- "PREFER UPDATE OVER CREATE" (`H/engine/consolidation/prompts.py:39`).
- "PRESERVE HISTORY … never DELETE" event observations (`:51`).
- Deletes only when an observation is "directly superseded or contradicted", with `merged_into` (`:177`).
- An updated observation keeps the journey, e.g. "User was previously a React enthusiast … now switched to Vue" (`HD/observations.mdx:99`).
- Near-duplicate observations above cosine 0.97 get an LLM merge/keep check (`H/config.py:1927`).
- Raw facts are never rewritten by consolidation.

**Staleness.** Observations and mental models carry freshness. Reflect's tools return `is_stale` (`H/engine/reflect/tools.py:299`). A stale model "no longer short-circuits retrieval" and must be checked against lower layers (`HD/mental-models.mdx:44`).

**Anti-hallucination:**
- Citation ID validation: available IDs are tracked, with the comment "prevents hallucinated citations" (`H/engine/reflect/agent.py:840`). Cited IDs not retrieved are filtered out (`:2557`).
- Hallucinated tool calls are dropped.
- Evidence is required before `done`.
- Observations carry `source_memory_ids`, quotes and `proof_count`, and a proof boost applies in ranking.
- Attachments are carried as evidence.
- Memory Defense provides 45-pattern regex PII/secret redaction or blocking. It is opt-in per bank (`HD/memory-defense/index.md:7`).
- There is no numeric confidence on facts, only proof_count.

### Honcho

**Forget APIs** (`D/features/advanced/deleting-data.mdx`):
- DELETE session (202, async cascade), DELETE workspace (only once no active sessions remain), DELETE conclusion (204), DELETE webhook.
- "Peers and individual messages cannot be deleted" (`:19`).
- Derived conclusions (deductive, inductive, contradiction) survive session deletion, because they are workspace-level; you must list and delete them per conclusion (`:104`).
- There is **no single "flush this user" call** short of deleting the workspace.
- Docs/code drift: the docs say "There is no soft delete" (`:7`). In code, `documents.deleted_at` (`src/models.py:436`) is a soft-delete column, and the reconciler cleans up rows soft-deleted more than 5 minutes ago (`src/reconciler/sync_vectors.py:54`). It is therefore permanent from the API's view, but not instant.

**Contradictions:**
- The deduction specialist is told to create an update observation and "DELETE the outdated observation immediately" (`src/dreamer/specialists.py:896`).
- Irreconcilable statements become `contradiction`-level conclusions.
- This runs only at dream time (≥50 new conclusions, 8 h cooldown, idle). Between dreams, stale and new explicit facts coexist, and recency is only a retrieval slot, not a ranking penalty.

**Anti-hallucination:**
- The deriver never attributes another peer's words to the target (`src/deriver/prompts.py:78`).
- Dreamer citations must use shown `[id:xxx]`, and "invented IDs are discarded" (`specialists.py:927`).
- `document_sources` records the premise tree, and `get_reasoning_chain` walks it.
- Inductive conclusions need ≥2 sources plus a confidence label.
- The dialectic prompt says "A confident 'I don't know' is ALWAYS correct" (`src/dialectic/prompts.py:330`).
- `include_evidence` returns what the agent read. It is collated by code, not cited by the model: "Collation is deterministic, costs no model tokens" (`D/features/advanced/evidence.mdx:63`). By design, "evidence over-reports" (`:61`).

---

## 5. Token cost per turn and caps

### Hindsight
- Recall returns at most `max_tokens` of memory text (default 4096). The Claude Code plugin sets **1024 tokens/turn**, observations only, budget `mid` (`hindsight-integrations/claude-code/settings.json:10,13`).
- Metadata does not count toward the budget. Chunks have a separate `max_chunk_tokens`.
- Write-side cost:
  - one LLM extraction call per chunk at retain time
  - a consolidation call per scope
  - mental-model refreshes
  - reflect, which runs up to 10 LLM rounds per call
- Recall itself needs no LLM: embedding, BM25, graph, cross-encoder and a local query analyzer.

### Honcho
- `session.context(tokens=N)`: the summary is capped at 40% of N and recent messages fill the rest, net of the representation and peer card (`src/routers/sessions.py:238`). With no `tokens`, the default ceiling is **100,000** (`src/config.py:1629`).
- The Hermes plugin's `contextTokens` cap is blank by default, and "Blank leaves it uncapped" (`hermes-plugin-honcho/config_schema.py:109`).
- Representation size is capped by `max_conclusions` (≤100) and `search_top_k`. The peer card is ≤40 entries.
- `peer.chat` costs an LLM loop of 1–10 tool iterations, with output capped at 250 tokens at minimal and 8192 by default.
- Write-side cost: the deriver LLM runs per ~1024-token batch, the summarizer every 20/60 messages, and dreams run 12+10 tool iterations (deduction/induction).

---

## 6. Better than a plain fact store, and gaps

### Hindsight — better
- It separates **episodic** (experience) from **semantic** (world), and keeps two time axes: occurred versus mentioned.
- Retrieval is the strongest of the two: four-way hybrid, RRF, cross-encoder, then budget packing. It handles temporal queries and multi-hop through the entity graph.
- Belief evolution keeps history and provenance (source_memory_ids, proof_count, quotes), and deletes cascade through derived observations.
- Reversible **invalidate** curation. Freshness flags.
- Citation-ID validation in reflect. A per-type flush endpoint. Tag-scoped consolidation strategies for multi-audience privacy.
- MIT licence.

### Hindsight — lacks
- No working/session memory object and no peer-perspective (observer→observed) model.
- No executable procedural store, and no external-source registry beyond document ids and attachment URLs.
- **Not deterministic:** "Extraction is not fully deterministic" (`HD/retain.md:317`). Consolidation temperature defaults to 0.0, but output still varies by model.
- Offline: local embeddings (`BAAI/bge-small-en-v1.5`, `H/config.py:1320`) and a local reranker are the defaults. The LLM defaults to `openai` (`H/config.py:1195`), with llama.cpp and OpenAI-compatible providers available. Without an LLM it degrades to a chunk store.
- Needs Postgres (or the embedded pg0).
- No code evidence: no file/commit/hash binding. A Claude Code bank stores conversation-derived facts only.

### Honcho — better
- First-class **person modelling**: peers, (observer, observed) collections, theory-of-mind perspectives, scopes as projections, a compact peer card and session summaries.
- Exhaustive working-memory assembly within a token budget.
- A premise tree (`document_sources`) with an explicit `contradiction` level.
- Inductive patterns with confidence, and reinforcement counts (`times_derived`).
- Deterministic evidence collation. A strong "say I don't know" dialectic prompt.

### Honcho — lacks
- No hybrid retrieval: no BM25 fusion over conclusions, no reranker, no entity or temporal graph. The representation is a fixed semantic/derived/recent slot blend.
- Contradiction resolution is batched and experimental (dreams).
- Forgetting is awkward:
  - no peer delete and no message delete
  - derived conclusions outlive sessions
  - no one-call "flush user"
- No procedural or external types.
- Not deterministic: LLM-written conclusions, and dreams triggered by heuristics.
- Offline is possible only by pointing the OpenAI transport at Ollama or vLLM (`docs/v3/contributing/configuration.mdx:151`). Embeddings are OpenAI or Gemini only (`src/config.py:28`) [a local OpenAI-compatible embedding endpoint is plausible but unverified]. The default models are hosted (`gpt-5.4-mini`, `text-embedding-3-small`). Hosted Honcho uses custom-trained reasoning models (`D/core-concepts/reasoning.mdx:23`) that are not in the repo [unverified beyond the docs].
- No code evidence.
- **AGPL-3.0**: network use triggers source-disclosure obligations, a material constraint if you embed or modify it in a hosted product.

---

## 7. What to borrow for the five-type design (my synthesis, not from either repo)

- **Working:** use Honcho's `session.context` budget split. The summary takes ≤40% of the budget and recent turns take the rest, with recursive short and long summaries.
- **Episodic:** keep raw turns verbatim (Honcho messages, Hindsight documents/chunks) plus Hindsight's experience facts with occurred/mentioned timestamps.
- **Semantic:** Hindsight's world facts, consolidated into observations with `source_memory_ids`, `proof_count` and history, plus Honcho's (observer, observed) keying and a ≤40-entry peer card as the always-injected profile.
- **Procedural:** neither has one. Hindsight directives (tagged, prioritised hard rules) and Honcho `INSTRUCTION:` peer-card entries are seeds.
- **External:** neither has one. Hindsight's attachment URLs and Honcho's message-id evidence show the pointer-with-provenance shape.
- **Flush:**
  - Hindsight's per-type `DELETE /memories?type=` and reversible invalidate.
  - Avoid Honcho's trap where derived conclusions survive source deletion. Cascade by premise edges, as Hindsight does with observations.
- **Anti-hallucination:** combine Hindsight's ID-whitelist citation filter with Honcho's code-collated evidence, and add freshness/stale flags. Prefer deterministic code for dedup thresholds, ranking and budgets, and reserve the LLM for extraction and consolidation.
