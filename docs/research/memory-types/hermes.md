# Hermes agent memory: how it works (source-verified)

Target: NousResearch hermes-agent at commit `1d94f832e6`, path
`~/Desktop/Developer/work/Product/Open Source Projects Testing/hermes-agent`.
Read-only. I did not open `~/.hermes` or any backups. Every citation below is
`file:line` followed by the line exactly as `grep -n "<literal>" <file>` printed it. Paths are relative to the repo root.
Anything I did not open is marked [unverified].

---

## 0. One-paragraph summary

Hermes has **no single "memory system"**. It has about eight separate mechanisms:

1. **Two tiny curated files**, MEMORY.md (agent notes) and USER.md (user profile). They are capped at 2,200 and 1,375 characters. A frozen snapshot of both goes into the system prompt at session start.
2. **A full SQLite transcript store** with FTS5, searched on demand by a `session_search` tool that makes no LLM calls.
3. **Skills** (SKILL.md folders) as procedural memory. A compact index sits in the system prompt and full bodies load on demand.
4. **A post-turn "background review" fork.** Every N turns or tool iterations it replays the conversation and decides whether to write memory or patch skills. This is the "self-improving" loop.
5. **A weekly "curator"** that marks skills stale and archives unused agent-created skills.
6. **A large context compressor** that turns the middle of a long conversation into a structured summary.
7. **Context files** (AGENTS.md, .hermes.md, SOUL.md, and similar), plus lazily discovered subdirectory hints.
8. **A pluggable external MemoryProvider slot.** Exactly one external provider can run alongside the built-in store: Honcho, Mem0, Hindsight, Holographic, OpenViking, RetainDB, Supermemory or ByteRover.

Everything is model-written through tools. Safety comes from regex threat scanning, character caps, file locks, drift guards and an optional approval gate. None of it comes from evidence, provenance-to-code or staleness checks.

---

## 1. Every kind of memory, mapped to the five types

| # | Hermes mechanism | Storage | Five-type mapping |
|---|---|---|---|
| A | **MEMORY.md**: agent's personal notes (env facts, conventions, tool quirks) | `$HERMES_HOME/memories/MEMORY.md` | **Semantic** (what is true about environment/project) |
| B | **USER.md**: user profile (preferences, style) | `$HERMES_HOME/memories/USER.md` | **Semantic** (about the user) |
| C | **Session transcripts + `session_search`** | `state.db` SQLite (`sessions`, `messages`, FTS5) | **Episodic** |
| D | **Skills** (SKILL.md + references/templates/scripts) | `$HERMES_HOME/skills/<name>/` | **Procedural** |
| E | **Background review fork**: writes A/B/D after turns | (process, writes to A/B/D) | Consolidation path (episodic to semantic/procedural) |
| F | **Curator**: skill lifecycle (stale/archive/consolidate) | `.usage.json`, `.archive/`, ledger | Procedural-memory maintenance and forgetting |
| G | **Context compression**: structured summary of dropped middle turns | in-conversation messages, plus DB rows marked compacted | **Working** memory management (and a bridge to episodic) |
| H | **Todo list**: in-session task plan | on the AIAgent instance, re-injected after compression | **Working** |
| I | **Context files** (.hermes.md / AGENTS.md / CLAUDE.md / .cursorrules, SOUL.md) + subdirectory hints | repo files | **Semantic/procedural** (human-authored project rules) |
| J | **`@` context references** (`@file`, `@url`, `@git`, ...) | fetched on demand | **External** |
| K | **External MemoryProvider plugin** (Honcho, Mem0, Hindsight, Holographic, ...) | provider-specific (cloud or local SQLite) | **Semantic + episodic** (per provider); retrieval is **external** |
| L | Learning graph (desktop visualization of skills + memory chunks) | derived | Visualization only, not a retrieval graph |

Citations:

- A/B: two stores, frozen snapshot
  - `tools/memory_tool.py:11` `Both are injected into the system prompt as a frozen snapshot at session start.`
  - `tools/memory_tool.py:66` `    return get_hermes_home() / "memories"`
- C: no LLM in recall
  - `tools/session_search_tool.py:27` `No LLM calls anywhere — every shape returns actual messages from the DB.`
- D
  - `tools/skill_manager_tool.py:10` `Skills are the agent's procedural memory: they capture *how to do a specific`
- E
  - `agent/background_review.py:465` `_MEMORY_REVIEW_PROMPT = (`
  - `agent/background_review.py:476` `_SKILL_REVIEW_PROMPT = (`
- F
  - `agent/curator.py:17` `  - Never auto-deletes — only archives. Archive is recoverable.`
- G
  - `agent/context_compressor.py:116` `SUMMARY_PREFIX = (`
- H
  - `tools/todo_tool.py:5` `Provides an in-memory task list the agent uses to decompose complex tasks,`
  - `tools/todo_tool.py:7` `lives on the AIAgent instance (one per session) and is re-injected into`
- I
  - `agent/prompt_builder.py:2404` `      1. .hermes.md / HERMES.md  (walk to git root)`
  - `agent/subdirectory_hints.py:1` `"""Progressive subdirectory hint discovery.`
- J
  - `agent/context_references.py:24` `BUILTIN_PREFIXES = frozenset({"diff", "staged", "file", "folder", "git", "url"})`
- K
  - `agent/memory_provider.py:110` `class MemoryProvider(ABC):`
- L
  - `agent/learning_graph.py:5` `- memory chunks from ``MEMORY.md`` / ``USER.md`` as first-class nodes.`

The memory tool's schema text spells out the intended split between the types: memory holds facts, `session_search` holds what happened, and skills hold procedures.

- `tools/memory_tool.py:1282` `        "SKIP: trivial/obvious info, easily re-discovered facts, raw data dumps, task progress, "`
- `agent/prompt_builder.py:197` `    "in 7 days. If a fact will be stale in a week, it does not belong in memory. "`

---

## 2. Data structures, storage, caps, injection, budgets

### 2a. MEMORY.md / USER.md (built-in store)

- **Format:** plain text entries joined by a section-sign delimiter. No IDs, no timestamps, no metadata per entry.
  - `tools/memory_tool.py:16` `Entry delimiter: § (section sign). Entries can be multiline.`
  - `tools/memory_tool.py:78` `ENTRY_DELIMITER = "\n§\n"`
- **Caps are characters, not tokens.** The cap covers the whole file, not each entry.
  - `tools/memory_tool.py:178` `        memory_char_limit: int = 2200,`
  - `tools/memory_tool.py:179` `        user_char_limit: int = 1375,`
  - `hermes_cli/config_defaults.py:2007` `        "memory_char_limit": 2200,   # ~800 tokens at 2.75 chars/token`
  - `hermes_cli/config_defaults.py:2008` `        "user_char_limit": 1375,     # ~500 tokens at 2.75 chars/token`
- **Scope is per profile (`HERMES_HOME`), not per user or per chat.** `get_memory_dir()` takes no user argument. Its only callers are inside `tools/memory_tool.py`, so every gateway user of one profile shares the same MEMORY.md and USER.md. (Verified: `grep -rn "get_memory_dir()"` returns only memory_tool.py lines 64, 244, 341 and 389.)
- **Writes are atomic** (temp file plus rename) under an exclusive `.lock` file.
  - `tools/memory_tool.py:906` `            atomic_write_text(path, content, tmp_prefix=".mem_")`
- **Rendered block** includes a usage meter. The header reads, for example, `MEMORY (your personal notes) [63% — 1,400/2,200 chars]`.
  - `tools/memory_tool.py:770` `        separator = "═" * 46`

**Injection:**

- The snapshot is frozen at `load_from_disk()` during agent init.
  - `agent/agent_init.py:1889` `                agent._memory_store.load_from_disk()`
- It goes into the **volatile tail** of the system prompt, after the skills index.
  - `agent/system_prompt.py:806` `    # ── Volatile tier (most likely to differ on a rebuild; kept last so the stable prefix stays reusable) ──`
  - `agent/system_prompt.py:825` `            mem_block = agent._memory_store.format_for_system_prompt("memory")`
- Writes made mid-session reach disk immediately but **do not change the prompt until the next session or a prompt rebuild.** This keeps the prefix cache valid. Tool responses show the live state.

### 2b. Session store (episodic)

- **SQLite `state.db`.** Schema version 26.
  - `hermes_state_common.py:329` `SCHEMA_VERSION = 26`
- **`sessions` table** holds:
  - source, `user_id`, `session_key`, `chat_id`, `chat_type` and `thread_id` for gateway peers
  - `parent_session_id` lineage
  - `title`, `end_reason`, `cwd`, `git_branch` and `git_repo_root`
  - token and cost counters
  - Citations:
    - `hermes_state_common.py:369` `CREATE TABLE IF NOT EXISTS sessions (`
    - `hermes_state_common.py:372` `    user_id TEXT,`
- **`messages` table** holds full OpenAI-shaped rows: role, content, tool_calls, reasoning, and `api_content` (the exact bytes sent).
  - Compaction flags are stored per row: `active` and `compacted`. Compacted rows stay searchable.
  - Citations:
    - `hermes_state_common.py:430` `CREATE TABLE IF NOT EXISTS messages (`
    - `hermes_state_common.py:450` `    active INTEGER NOT NULL DEFAULT 1,`
    - `hermes_state_common.py:451` `    compacted INTEGER NOT NULL DEFAULT 0,`
- **FTS5 indexes:**
  - An external-content FTS5 index over content, tool_name and tool_calls, kept current by triggers.
  - A **trigram** FTS5 index for CJK and substring search, which excludes tool rows.
  - A CJK table in `hermes_state.py`.
  - Citations:
    - `hermes_state_common.py:595` `CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(`
    - `hermes_state_common.py:670` `    tokenize='trigram'`
- **Index for gateway peers:**
  - `hermes_state_common.py:566` `CREATE INDEX IF NOT EXISTS idx_sessions_gateway_peer`
- **No embeddings and no vectors** in the core session store. Ranking is BM25 (`ORDER BY rank`) with an optional newest/oldest sort.

### 2c. Skills

- **Layout:** a directory per skill with a `SKILL.md` that has YAML frontmatter (agentskills.io-compatible), plus `references/`, `templates/`, `scripts/` and `assets/`.
  - `tools/skills_tool.py:9` `Inspired by Anthropic's Claude Skills system with progressive disclosure architecture:`
  - `tools/skills_tool.py:10` `- Metadata (name ≤64 chars, description ≤1024 chars) - shown in skills_list`
- **Caps:**
  - `tools/skill_manager_tool.py:547` `MAX_SKILL_CONTENT_CHARS = 100_000   # ~36k tokens at 2.75 chars/token`
  - `tools/skill_manager_tool.py:548` `MAX_SKILL_FILE_BYTES = 1_048_576    # 1 MiB per supporting file`
- **The index is cached** in an in-process LRU and a disk snapshot (`.skills_prompt_snapshot.json`) validated by mtime and size.
  - `agent/prompt_builder.py:1739` `def build_skills_system_prompt(`
- **Usage telemetry** lives in a sidecar file, `~/.hermes/skills/.usage.json`.
  - `tools/skill_usage.py:3` `Tracks per-skill usage metadata in a sidecar JSON file (~/.hermes/skills/.usage.json)`

### 2d. Per-turn external-provider injection

- Before each turn, `prefetch_all(query)` runs on the user message. It is skipped when the message is trivial (for example "ok", "thanks", or a slash command).
  - `agent/turn_context.py:1391` `            if not is_trivial_prompt(_query):`
  - `agent/memory_provider.py:81` `TRIVIAL_PROMPT_RE = re.compile(`
- The result is wrapped in `<memory-context>` fences and **appended to the API copy of the current user message**, not to the system prompt. The exact bytes are persisted as `api_content` so later turns replay the same bytes and the cache still hits.
  - `agent/turn_context.py:62` `    target="user_message" (the default). Both are appended to the *API copy*`
  - `agent/turn_context.py:79` `        fenced = build_memory_context_block(ext_prefetch_cache)`
- **External prefetch is capped at 8 seconds.** On timeout the turn proceeds without it.
  - `agent/memory_manager.py:51` `_EXTERNAL_PREFETCH_TIMEOUT_S = 8.0`
- **A deterministic "recalled N memories" status line** is emitted. It does not depend on whether the model mentions it.
  - `agent/memory_manager.py:641` `    def describe_recall(self) -> str:`

### 2e. Token budgets

- **Built-in memory:** about 800 + 500 tokens by default (the comments at config_defaults.py:2007–2008).
- **Context files:** 20K characters per source by default, scaled with the context window.
  - `agent/prompt_builder.py:1414` `CONTEXT_FILE_MAX_CHARS = 20_000`
- **Compression** triggers at 50% of the window by default, floored at 0.75 below 512K windows per the comment.
  - `hermes_cli/config_defaults.py:808` `        "threshold": 0.50,            # compress when context usage exceeds this ratio.`
- **Summary size** is 20% of the compressed content, with a minimum of 2K tokens and a ceiling of 10K tokens.
  - `agent/context_compressor.py:648` `_SUMMARY_RATIO = 0.20`
  - `agent/context_compressor.py:646` `_MIN_SUMMARY_TOKENS = 2000`
  - `agent/context_compressor.py:652` `_SUMMARY_TOKENS_CEILING = 10_000`
- **Honcho auto-injected dialectic** is capped at 600 characters.
  - `plugins/memory/honcho/client.py:424` `    dialectic_max_chars: int = 600`
- **Review fork** input budget is 600K tokens.
  - `agent/background_review.py:222` `_REVIEW_MAX_INPUT_TOKENS_DEFAULT = 600_000`

---

## 3. Write path

**Who writes:** the model, through tools. The `memory` tool handles MEMORY.md and USER.md, and `skill_manage` handles skills. Nothing is extracted automatically into the built-in store; that only happens if an external provider does its own extraction.

**`memory` tool actions:**
- The actions are `add`, `replace` and `remove`. There is **no read action**: memory is read through the prompt snapshot.
  - `tools/memory_tool.py:1291` `                "enum": ["add", "replace", "remove"],`
- Replace and remove target an entry with a **short unique substring**. There are no IDs.
  - `tools/memory_tool.py:21` `- replace/remove use short unique substring matching (not full text or IDs)`
- An atomic `operations` batch checks the character limit only against the final state. This lets the model consolidate and add in one call.
  - `tools/memory_tool.py:586` `    def apply_batch(self, target: str, operations: List[Dict[str, Any]]) -> Dict[str, Any]:`
  - `tools/memory_tool.py:595` `        Semantics: all-or-nothing. If any op is malformed, doesn't match, or`

**Write policy is set by prompt text:**
- `tools/memory_tool.py:1276` `        "Priority: user preferences & corrections > environment facts > procedures. The best "`
- `agent/prompt_builder.py:200` `    "Write memories as declarative facts, not instructions to yourself. "`

This rule is notable: imperative memories get re-read later as commands, so the prompt asks for statements of fact instead.

**When writes happen:**
1. **Foreground:** whenever the model decides to write.
2. **Background review on a memory nudge:** every `nudge_interval` user turns (default 10).
   - `hermes_cli/config_defaults.py:2012` `        "nudge_interval": 10,`
   - `agent/turn_context.py:744` `        if agent._turns_since_memory >= agent._memory_nudge_interval:`
3. **Background review on a skill nudge:** every `creation_nudge_interval` tool iterations (default 10).
   - `agent/agent_init.py:1986` `        agent._skill_nudge_interval = int(skills_config.get("creation_nudge_interval", 10))`
   - `agent/turn_finalizer.py:782` `            and agent._iters_since_skill >= agent._skill_nudge_interval`
4. **How the review runs:**
   - It starts **after** the response is delivered.
   - It is a forked AIAgent that inherits the parent's model and prompt cache.
   - A tool whitelist limits it to memory and skill tools.
   - It runs with `skip_memory=True`, so it does not double-feed the external provider.
   - Citations:
     - `agent/turn_finalizer.py:807` `            agent._spawn_background_review(`
     - `agent/background_review.py:1517` `                    "Background review denied non-whitelisted tool: "`
     - `agent/background_review.py:1313` `                skip_memory=True,`
   - If it is routed to a cheaper model, it replays a **digest** (the last 24 messages verbatim, with older turns compressed into one line each).
     - `agent/background_review.py:417` `def _digest_history(messages_snapshot: List[Dict], tail: int = 24) -> List[Dict]:`
5. **External providers:** they get `sync_turn` after every turn, `on_session_end` at session boundaries, `on_pre_compress` before compaction, and `on_memory_write` to mirror built-in writes.

**Dedupe:**
- Exact-string dedupe on load.
  - `tools/memory_tool.py:251` `        self.memory_entries = list(dict.fromkeys(self.memory_entries))`
- Exact duplicates are rejected on add.
  - `tools/memory_tool.py:444` `            # Reject exact duplicates`
- **There is no semantic or near-duplicate detection.** When the store is full, the add fails and the error lists the current entries so the **model** can consolidate. After 3 failures in one turn the tool gives up gracefully.
  - `tools/memory_tool.py:174` `    _MAX_CONSOLIDATION_FAILURES_PER_TURN = 3`

**Security scanning (prompt injection):**
- `tools/threat_patterns.py` is a shared regex library with three scopes: `all`, `context` and `strict`. Memory uses `strict`.
  - `tools/threat_patterns.py:63` `_PATTERNS: List[Tuple[str, str, str]] = [`
  - `tools/threat_patterns.py:17` `- ``"strict"`` — applied to memory writes + skill installs only`
- What the patterns catch:
  - "ignore previous instructions", role hijack, C2/promptware vocabulary
  - curl/wget exfiltration with `$KEY` variables, reading `.env` files
  - `authorized_keys`, attempts to modify AGENTS.md or CLAUDE.md, hardcoded secrets
  - invisible Unicode characters
  - `tools/threat_patterns.py:141` `INVISIBLE_CHARS = frozenset({`
- Content is scanned **on write**, and the write is rejected on a hit.
  - `tools/memory_tool.py:421` `        scan_error = _scan_memory_content(content)`
- Content is scanned **again on load**. A poisoned entry becomes a `[BLOCKED: …]` placeholder in the prompt but stays on disk so the user can see and remove it.
  - `tools/memory_tool.py:286` `            findings = scan_for_threats(entry, scope="strict")`
- **Skills written by the agent are NOT scanned by default.** Hub installs are always scanned.
  - `tools/skill_manager_tool.py:148` `    No-op when skills.guard_agent_created is disabled (the default).`
  - `hermes_cli/config_defaults.py:2210` `        "guard_agent_created": False,`

**Integrity guards:**
- **Drift detection:** if the file was edited outside the tool, so that it no longer round-trips or has an entry longer than the cap, Hermes writes a `.bak.<ts>` copy and refuses replace and remove.
  - `tools/memory_tool.py:839` `    def _detect_external_drift(self, target: str, raw: str) -> Optional[str]:`
  - `tools/memory_tool.py:880` `        drift_detected = (raw.strip() != roundtrip) or (max_entry_len > char_limit)`
- **An unreadable file is never treated as empty.** This prevents a write from wiping memory.

**Approval gate (off by default):**
- In the foreground CLI, writes prompt inline.
- In the background or gateway, writes are **staged** and reviewed with `/memory pending`, `/memory approve <id>` and `/memory reject <id>`.
- Citations:
  - `hermes_cli/config_defaults.py:2006` `        "write_approval": False,`
  - `tools/memory_tool.py:979` `    decision = wa.evaluate_gate(wa.MEMORY, inline_summary=summary, inline_detail=detail)`
  - `tools/memory_tool.py:1237` `def apply_memory_pending(payload: Dict[str, Any], store: "MemoryStore") -> Dict[str, Any]:`
- Skills have the same gate.
  - `hermes_cli/config_defaults.py:2234` `        "write_approval": False,`

**Anti-thrash design:** a successful write returns a terminal message and deliberately does **not** echo the entries back. Echoing them led the model to repeat the same write.
- `tools/memory_tool.py:752` `        resp["note"] = "Write saved. This update is complete — do not repeat it."`

---

## 4. Read and recall path

**Built-in memory:** always present in the prompt as a frozen snapshot. There is no retrieval step and no ranking: everything in the file is shown.

**Past sessions (`session_search`):**
- **No LLM is involved.** An older summarizing LLM path was removed.
  - `hermes_cli/config_defaults.py:1143` `        # Note: session_search no longer uses an auxiliary LLM (PR #27590 —`
- It has four modes, chosen from the arguments:
  - discovery (FTS5)
  - scroll (a window around a message ID)
  - read (a whole session, as head and tail)
  - browse (recent sessions)
  - `tools/session_search_tool.py:8` `  1. DISCOVERY — pass ``query``. Runs FTS5 and dedupes hits by session lineage.`
- **Discovery flow:**
  1. It scans 300 FTS rows.
     - `tools/session_search_tool.py:62` `_DISCOVER_SCAN_LIMIT = 300`
  2. It excludes subagent, kanban and tool sessions, and **demotes cron sessions** so they don't crowd out interactive ones.
     - `tools/session_search_tool.py:46` `_HIDDEN_SESSION_SOURCES = ("kanban", "subagent", "tool")`
     - `tools/session_search_tool.py:56` `_DEMOTED_SESSION_SOURCES = ("cron",)`
  3. It dedupes by lineage root (`parent_session_id`) and skips the live session unless the hit is a compacted row.
  4. The top hit is fully hydrated with a ±5 message window plus 3 bookend messages. Lower-ranked hits return only the anchor message (adaptive detail).
     - `tools/session_search_tool.py:874` `            view = db.get_anchored_view(hit_sid, msg_id, window=5, bookend=3)`
  5. It returns 1–10 results, default 3.
     - `tools/session_search_tool.py:1046` `    limit = max(1, min(limit, 10))`
- **Compaction summaries are filtered out** of bookends so a stale summary isn't re-imported (`_COMPACTION_PREFIXES`).
- The model is told when to use it: "When the user references something from a past conversation…".
  - `agent/prompt_builder.py:223` `SESSION_SEARCH_GUIDANCE = (`

**Cross-session continuity:**
- Built-in memory and skills are shared across all sessions in a profile.
- Gateway Slack and Discord channels get a deterministic continuity note after an auto-reset. It points the model at the prior `session_id`.
  - `gateway/session.py:1009` `def build_channel_continuity_note(`
- **Search can cross profiles** (read-only) through `@session:<profile>/<id>` links.

**Per-user and per-platform separation:**
- **Conversation isolation:** `build_session_key` keys a session by platform, DM or group, chat_id, thread_id and, optionally, user_id.
  - `gateway/session.py:1090` `def build_session_key(`
  - `gateway/session.py:1092` `    group_sessions_per_user: bool = True,`
- **Built-in memory is NOT per user.** MEMORY.md and USER.md are per profile (see 2a). A multi-user Telegram or Discord bot on one profile shares one USER.md across everyone. Isolation needs a separate profile or `HERMES_HOME`.
- **`session_search` has no user filter.** `search_messages(...)` takes `source_filter`, `exclude_sources`, `role_filter`, `limit`, `offset`, `sort`, `include_inactive` and `fields`, with no `user_id` parameter.
  - `hermes_state_search.py:1415` `    def search_messages(`
  - The tool handler passes no user identity. I conclude that any gateway user can search other users' transcripts within the same profile. This is inferred from the signature; I did not trace every caller.
- **External providers do get identity.** `user_id`, `user_id_alt`, `chat_id`, `thread_id` and `gateway_session_key` are passed to `initialize`.
  - `agent/agent_init.py:1942` `                        _init_kwargs["user_id"] = agent._user_id`
  - `agent/memory_provider.py:154` `          - user_id (str): Platform user identifier (gateway sessions).`
- **Honcho** maps runtime IDs to user "peers". It has `pin_peer_name` to merge one person across platforms, and a session strategy (default per-directory).
  - `plugins/memory/honcho/client.py:401` `    pin_peer_name: bool = False`
  - `plugins/memory/honcho/client.py:475` `    session_strategy: str = "per-directory"`
- **Providers are told to skip writes from cron, subagent and flush contexts.**
  - `agent/memory_provider.py:148` `            Providers should skip writes for non-primary contexts (cron system`

---

## 5. Forgetting, flush, reset, replace and remove; stale or wrong memory

**Built-in memory:**
- `replace` and `remove` work by substring. An ambiguous match is rejected with previews.
- There is **no TTL, no decay, no timestamps, no source and no confidence** on entries.
- Staleness is handled only by:
  - (a) the prompt rule "If a fact will be stale in a week, it does not belong in memory" (prompt_builder.py:197)
  - (b) the model consolidating when the store is full, with errors telling it to "remove stale or less important entries"
  - (c) the user editing the files
- **"Wrong assumption" saves by the background fork were a reported problem.** The approval gate exists for that reason.
  - The config comment at `hermes_cli/config_defaults.py:1994–1996` mentions `the source of unprompted "wrong assumption" saves users reported`.

**Sessions:**
- `prune_sessions(older_than_days=90, ...)`, `delete_session`, `archive_sessions` and similar exist.
- Auto-prune is **off by default** for session history.
  - `hermes_cli/config_defaults.py:3266` `        "auto_prune": False,`
- `/reset` and `/new` rotate the `session_id`. They fire `on_session_end` and then `on_session_switch(reset=True)` on providers, serialized in that order.
  - `agent/memory_manager.py:966` `    def commit_session_boundary_async(`

**Skills (forgetting by curator):**
- A skill becomes stale after 30 days unused and is archived after 90. Archive is never a delete. Pinned skills are exempt.
  - `hermes_cli/config_defaults.py:2262` `        "stale_after_days": 30,`
  - `hermes_cli/config_defaults.py:2265` `        "archive_after_days": 90,`
- The curator runs weekly while idle, and its LLM consolidation step is off by default.
  - `hermes_cli/config_defaults.py:2258` `        "interval_hours": 24 * 7,`
  - `hermes_cli/config_defaults.py:2273` `        "consolidate": False,`
- An **audit ledger** records hashes before and after each mutation, with content-addressed backups and single-entry rollback.
  - `hermes_cli/config_defaults.py:2242` `        "ledger": True,`

**Compression ("flush" of working memory):**
- Tool outputs are pruned first, then the middle turns are summarized into a fixed template. The template sections include Goal, Constraints & Preferences, Completed Actions, Active State, Blocked, Key Decisions, Resolved Questions, Relevant Files and Critical Context.
  - `agent/context_compressor.py:4437` `## Resolved Questions`
- The summary is updated iteratively across compactions.
  - `agent/context_compressor.py:12` `  - Iterative summary updates (preserves info across multiple compactions)`
- Old tool output is replaced with a placeholder.
  - `agent/context_compressor.py:674` `_PRUNED_TOOL_PLACEHOLDER = "[Old tool output cleared to save context space]"`
- Loaded skill bodies are pruned to a marker and reloaded on demand.
  - `agent/context_compressor.py:722` `SKILL_PRUNED_MARKER_PREFIX = "[SKILL_PRUNED:"`
- In "lean" tail mode there is a **mechanically extracted anchor index** (exact identifiers that survive summarization).
  - `agent/context_compressor.py:1005` `_LEAN_ANCHOR_HEADING = "## Anchor Index (mechanically extracted, exact)"`
- Providers get `on_pre_compress`, so they can save insights before turns are discarded. A v2 "checkpoint" contract can fail closed, refusing a lossy compaction unless a provider confirmed the checkpoint.
  - `agent/memory_provider.py:48` `PRE_COMPRESS_CHECKPOINT_API_VERSION = 2`
  - `agent/memory_manager.py:1083` `    def on_pre_compress(`

**Anti-hallucination measures that exist:**
- **The summary is framed as reference only.** "REFERENCE ONLY… Do NOT answer questions or fulfill requests mentioned in this summary… latest user message WINS".
  - `agent/context_compressor.py:116` `SUMMARY_PREFIX = (`
- **Review prompts forbid saving:**
  - negative tool claims (these harden into permanent refusals)
  - environment-specific failures
  - one-off narratives
  - unresolved failed attempts presented as a "workflow"
  - Citations:
    - `agent/background_review.py:586` `    "  • Negative claims about tools or features ('browser tools do not "`
    - `agent/background_review.py:596` `    "  • Unresolved failures: if the session ended WITHOUT actually "`
- **Read-before-write for skills in the review fork.** The fork must `skill_view` a skill before patching it. Transcript quotes don't count.
  - `agent/background_review.py:542` `    "Read-before-write (ENFORCED — skill_manage refuses otherwise): "`
  - `tools/skill_manager_tool.py:77` `def mark_background_review_skill_read(path: Path) -> None:`
- **`session_search` returns real DB rows, not LLM summaries** (no paraphrase drift).
- **Holographic provider only:**
  - trust score per fact, with feedback of +0.05 for helpful and −0.10 for unhelpful
  - optional temporal decay
  - an automated `contradict` action (shared entities plus divergent content)
  - Citations:
    - `plugins/memory/holographic/store.py:23` `    trust_score     REAL DEFAULT 0.5,`
    - `plugins/memory/holographic/store.py:80` `_HELPFUL_DELTA   =  0.05`
    - `plugins/memory/holographic/store.py:81` `_UNHELPFUL_DELTA = -0.10`
    - `plugins/memory/holographic/retrieval.py:61` `        4. Temporal decay (optional): decay = 0.5^(age_days / half_life)`
    - `plugins/memory/holographic/retrieval.py:352` `    def contradict(`

**Measures that work against caution:**
- The provider recall block tells the model to **treat recalled memory as authoritative**.
  - `agent/memory_manager.py:396` `        "NOT new user input. Treat as authoritative reference data — "`
- The compaction prefix says MEMORY.md and USER.md are "ALWAYS authoritative".
  - `agent/context_compressor.py:142` `    "IMPORTANT: Your persistent memory (MEMORY.md, USER.md) in the system "`
- No mechanism checks a remembered fact against the current code or environment.

---

## 6. Skills as procedural memory

**Created by:**
- The model, through `skill_manage` (create, patch, delete, write_file, remove_file).
  - `tools/skill_manager_tool.py:1782` `                "enum": ["create", "patch", "delete", "write_file", "remove_file"],`
- The schema says to confirm with the user before creating or deleting.
  - `tools/skill_manager_tool.py:1774` `        "skill_view() for format). Confirm with the user before "`
- The background review fork creates them autonomously (see section 3).

**The "self-improving" loop:**
- **The system prompt tells the model to patch skills immediately** when it finds them wrong.
  - `agent/prompt_builder.py:241` `SKILLS_GUIDANCE = (`
- **The review fork is told to be ACTIVE**, with a fixed preference order:
  1. patch a currently loaded skill
  2. patch an existing class-level "umbrella" skill
  3. add a `references/`, `templates/` or `scripts/` support file
  4. create a new class-level umbrella
- The fork **must not** name skills after PR numbers or session artifacts.
- User style complaints are treated as **skill** signals, not only memory signals.
- Citation:
  - `agent/background_review.py:476` `_SKILL_REVIEW_PROMPT = (`
- **Protected skills:** bundled, hub-installed, external_dirs, pinned and user-owned skills cannot be edited by the fork. Only skills marked as curator-managed can be.
- **Curator:**
  - Lifecycle transitions based on the usage sidecar: active, then stale, then archived.
  - An optional LLM consolidation into umbrellas.
  - It touches only agent-created skills.
  - `agent/curator.py:16` `  - Only touches agent-created skills (see tools/skill_usage.is_agent_created)`

**Selection and progressive loading:**
- **Tier 1:** a compact index of names and short descriptions in the system prompt, under a "Skills (mandatory)" heading. The model must scan it and load anything even partly relevant.
  - `agent/prompt_builder.py:2086` `            "## Skills (mandatory)\n"`
  - `agent/prompt_builder.py:2103` `            "<available_skills>\n"`
  - Some categories can be shown as names only, for example in the coding posture.
- **Tier 2:** `skill_view(name)` loads the SKILL.md body.
- **Tier 3:** `skill_view(name, "references/x.md")` loads support files.
- **Selection is done entirely by the model reading the index.** There is no retrieval or embedding step for skills. The index sits at the front of the volatile prompt tier.
- **The user can force a skill** with the `/skill-name` slash command. Providers' prefetch strips the expanded skill body back to the user's instruction.

---

## 7. Pluggable memory providers

**Interface:** `agent/memory_provider.py` (ABC).

Required methods:
- `name`
- `is_available()` (no network)
- `initialize(session_id, **kwargs)`
- `get_tool_schemas()`

Lifecycle and optional hooks:
- `system_prompt_block()` (static)
- `prefetch(query, session_id)` (fast, cached) and `queue_prefetch()` (background, for the next turn)
- `recall_status()`
- `sync_turn(user, assistant, messages=…)` (non-blocking)
- `handle_tool_call()`
- `on_turn_start()`, `on_session_end(messages)`, `on_session_switch(new_id, parent, reset, rewound)`
- `on_pre_compress(messages) -> str` (with v2 checkpoint semantics)
- `on_memory_write(action, target, content, metadata)` (mirrors built-in writes)
- `on_delegation(task, result)` (the parent observes subagent work)
- `get_config_schema()`, `save_config()`, `backup_paths()`, `shutdown()`

Citations:
- `agent/memory_provider.py:178` `    def prefetch(self, query: str, *, session_id: str = "") -> str:`
- `agent/memory_provider.py:213` `    def sync_turn(`
- `agent/memory_provider.py:273` `    def on_session_switch(`
- `agent/memory_provider.py:381` `    def on_memory_write(`
- `agent/memory_provider.py:329` `    def on_delegation(self, task: str, result: str, *,`

**Manager rules:**
- The built-in provider plus **at most one** external provider.
  - `agent/memory_manager.py:6` `Only ONE external plugin provider is allowed at a time — attempting to`
- Provider tools cannot shadow core tool names.
  - `agent/memory_manager.py:488` `                    "Memory provider '%s' tool '%s' shadows a reserved core "`
- Writes run on one background worker thread, so they are serialized.
- Mirroring only fires after a **committed** built-in write, never a staged one.
  - `agent/memory_manager.py:1225` `    def notify_memory_tool_write(`

**Providers shipped in `plugins/memory/`** (all `plugin.yaml` description lines are at line 3):

| Provider | What it is |
|---|---|
| **Honcho** | Cloud. Dialectic Q&A over a user "peer" model, peer cards, conclusions. Recall modes are hybrid, context-only or tools-only. Tools: honcho_profile, honcho_search, honcho_reasoning (the only one that calls an LLM), honcho_context, honcho_conclude (create, delete or list conclusions, for PII removal). |
| **Mem0** | "server-side LLM fact extraction with semantic search, automatic deduplication, and opt-in reranking". Tools: mem0_search, mem0_add, mem0_update, mem0_delete. |
| **Hindsight** | "long-term memory with knowledge graph, entity resolution, and multi-strategy retrieval". Tools: retain, recall, reflect. |
| **Holographic** | Local SQLite: `facts` plus `entities` plus `fact_entities`, FTS5, HRR vectors (1024-dim, numpy optional), and a trust score. Retrieval is FTS5 candidates, then a Jaccard rerank, then an HRR similarity score, then multiplication by trust, then optional decay. Actions: add, search, probe, related, reason, contradict, update, remove, list. Feedback tool: `fact_feedback`. Fact extraction at session end is optional and off by default. The header says "Single-user". |
| **OpenViking** | "session-managed memory with automatic extraction, tiered retrieval, and filesystem-style knowledge browsing". Tools: search, read, browse, remember, forget, add_resource. |
| **RetainDB** | "cloud memory API with hybrid search and 7 memory types". Also has file tools. |
| **Supermemory** | Semantic long-term memory with profile recall. Tools: store, search, forget, profile. |
| **ByteRover** | "persistent knowledge tree with tiered retrieval via the brv CLI". |

Holographic citations:
- `plugins/memory/holographic/__init__.py:60` `                "enum": ["add", "search", "probe", "related", "reason", "contradict", "update", "remove", "list"],`
- `plugins/memory/holographic/retrieval.py:60` `        3. Trust weighting: final_score = relevance * trust_score`

**Gap I found:** Holographic's `on_memory_write` mirrors only `add`. Built-in `replace` and `remove` are not propagated, so the two stores drift apart.
- `plugins/memory/holographic/__init__.py:247` `        if action == "add" and self._store and content:`

I did not read the internals of Hindsight, Mem0, RetainDB, Supermemory or ByteRover beyond their tool names and plugin.yaml descriptions [unverified internals].

---

## 8. What to copy, and what Hermes lacks

### Copy these

1. **Frozen-snapshot injection plus a live tool view.** Memory reaches the prompt once per session, so the prefix cache stays valid, while writes go to disk immediately. Per-turn recall goes on the **user message API copy**, and the exact bytes are persisted (`api_content`) so later turns replay byte-for-byte.
2. **Hard small budgets with a visible usage meter** ("63% — 1,400/2,200 chars"). When an add would overflow, the error returns the current entries and the model must consolidate. An atomic batch is checked against the final budget, and retries are capped per turn.
3. **Clear rules for what goes where:**
   - facts go to memory, procedures to skills, and history to search
   - "declarative, not imperative"
   - "stale in 7 days → don't save"
   - "no negative tool claims"
   - "no unresolved failures as workflows"
   These are cheap and well-reasoned anti-poisoning rules.
4. **Episodic recall without an LLM:**
   - FTS5 over raw transcripts
   - lineage dedupe
   - cron demotion
   - anchored windows with bookends
   - adaptive detail (only the top hit fully expanded)
   - an explicit scroll API
   - compacted rows kept searchable
5. **Threat scanning at write time and again at load time.** A poisoned entry is shown to the user but blocked from the prompt. Drift guards, `.bak` copies, atomic writes, and never treating an unreadable file as empty.
6. **Progressive skill disclosure** in three tiers (index, body, references), with **read-before-write** for autonomous edits, protected and pinned ownership classes, an **audit ledger with rollback**, and archive-never-delete lifecycle based on usage telemetry.
7. **A provider interface with rich lifecycle hooks**:
   - `on_pre_compress` with fail-closed checkpointing
   - `on_session_switch` with reset/rewound flags
   - `on_delegation`
   - a deterministic recall indicator
   - skipping trivial prompts
   - a prefetch timeout
   - non-primary contexts don't write
8. **Structured compaction template**, with an "anchor index" of exact identifiers extracted mechanically, and "REFERENCE ONLY / latest message wins" framing.

### What Hermes lacks (gaps a new design can fill)

1. **No provenance or evidence on semantic memory.**
   - Entries are bare strings: no source session, no timestamp, no author (foreground vs. review fork), and no link to code (file, commit or hash).
   - Nothing checks a fact against the current repo, so code-related "facts" go stale silently.
   - The holographic provider has `updated_at` and trust, but no code anchoring either.
2. **No staleness detection.** Forgetting depends on the model choosing to consolidate when the store is full, plus a prompt rule. The built-in store has no TTL, decay, last-used counter or contradiction check (the holographic `contradict` is plugin-only and needs numpy).
3. **Recalled memory is labelled authoritative** (memory_manager.py:396, context_compressor.py:142). This is the opposite of a "verify before trusting" stance.
4. **No retrieval over built-in memory.** It is always fully injected, so it can't scale past about 1.3K tokens. A larger store means an external provider, and only one is allowed.
5. **No per-user scoping of built-in memory or session search in multi-user gateways.** MEMORY.md and USER.md are per profile, and `search_messages` has no `user_id` filter. Conversation keys are isolated; memory is not.
6. **IDs are substrings.** replace/remove target entries by substring match, so ambiguity and model errors are frequent: the code has several issue-number comments about retry loops.
7. **No graph in the core.** Skills link only through declared `related_skills`. The "learning graph" is a desktop visualization based on lexical overlap. Entity and graph memory exist only in providers (Hindsight, Holographic).
8. **Skill selection is purely the model scanning a "mandatory" index.** There is no retrieval or ranking, so cost and noise grow with the size of the library. Category compaction helps somewhat.
9. **Security scanning of agent-written skills is off by default** (`guard_agent_created: False`). The reasoning given is that the terminal tool is ungated anyway.
10. **Mirror drift between stores.** Holographic mirrors only adds.
11. **No episodic summarisation index.** Past sessions are found only by keyword (BM25). There are no embeddings or session-level summaries in the core, though titles exist.
12. **No "external memory" registry** of "where to fetch X". `@url`, `@file` and `@git` references are user-typed, and MCP and web tools are generic tools, not a memory layer.
13. **The review fork is LLM-judged and can write without the user present.** The approval gate exists but is off by default, and the comment in config_defaults.py:1994–1996 acknowledges reports of "wrong assumption" saves.
