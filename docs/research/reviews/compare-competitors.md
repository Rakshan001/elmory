# Competitor check: five-type memory proposal vs shipping systems (2026-10-21)

Proposal: `docs/superpowers/specs/2026-10-21-five-type-memory-system-design.md` (v2).
Sources checked today: `gh api repos/<r>`, `gh api repos/<r>/releases/latest`, `gh api repos/<r>/commits?per_page=1`, `gh api repos/<r>/readme`, `gh api search/repositories`, WebFetch on vendor docs. Clones in `scratchpad/memtypes/sandbox-{a,b}/` (made earlier today at the commits shown) plus a new shallow clone of `mex-memory/mex` in `scratchpad/cc/mex`. READMEs fetched today are in `scratchpad/cc/readmes/`. WebSearch was exhausted (200/200), so no web search was used. Nothing was installed or run.

Legend: **Y** ships it · **P** partial · **N** not seen · **?** [unverified]

## 1. Current state

| System | Licence | Lang | Stars | Latest release | Last commit |
|---|---|---|---|---|---|
| mem0ai/mem0 | Apache-2.0 | Py | 67,563 | ts-v3.3.1 (2026-09-25) | 2c81af3b 2026-10-21 |
| letta-ai/letta-code (letta-ai/letta is now a pointer, 25.2k★) | Apache-2.0 | TS | 3,671 | v0.34.19 (2026-10-20) | c25f091d 2026-10-21 |
| getzep/graphiti | Apache-2.0 | Py | 32,099 | v0.31.2 (2026-10-20) | 8e320f88 2026-10-21 |
| getzep/zep (Cloud integrations only) | Apache-2.0 | Py | 4,966 | zep-ingest-v0.4.0 (2026-10-14) | a3a9194d 2026-10-20 |
| topoteretes/cognee | Apache-2.0 | Py | 32,616 | v1.6.5 (2026-10-16) | 37f788bd 2026-10-16 |
| vectorize-io/hindsight | MIT | Py | 52,158 | **v1.0.0 (2026-10-13)** | 8d59b22a 2026-10-21 |
| plastic-labs/honcho | AGPL-3.0 | Py | 7,717 | v3.3.0 (2026-10-14) | 607438d2 2026-10-20 |
| AVIDS2/memorix | Apache-2.0 | TS | 852 | v1.9.12 (2026-10-17) | f9dc4b29 2026-10-20 |
| tigerless-labs/agent-memory | MIT | Py | 4,269 | none | 327bc511 2026-10-16 |
| basicmachines-co/basic-memory | AGPL-3.0 | Py | 4,298 | v0.23.2 (2026-08-25) | 976a10c8 2026-10-20 |
| Mirix-AI/MIRIX | Apache-2.0 | Py | 3,457 | none | 8cb06a62 2026-08-20 |
| langchain-ai/langmem | MIT | Py | 1,716 | none | 48e3c11f 2026-10-02 |
| vshulcz/deja-vu | MIT | Go | 1,267 | **v0.23.0 (2026-10-21)** | eaca6c12 2026-10-21 |
| **NEW** mex-memory/mex | MIT | TS | 1,775 | – | 676b9c5 2026-10-19 (created 2026-03-21) |
| **NEW** DanceNitra/inspeximus | MIT | Py | 8 | – | pushed 2026-10-21 (created 2026-07-13) |
| **NEW** Anchorstate-Lab/GMR | MIT | Rust | 8 | npm @anchorstate-lab/gmr | pushed 2026-09-16 (created 2026-07-28) |
| **NEW** okf-memory/okf-agent-memory | MIT | Go | 826 | – | pushed 2026-10-20 (created 2026-09-05) |
| rohitg00/agentmemory (not in prior survey) | Apache-2.0 | TS | 29,736 | – | pushed 2026-10-20 |
| Claude Code memory | proprietary | – | – | docs at code.claude.com/docs/en/memory | – |
| GitHub Copilot Memory | proprietary | – | – | **public preview** | – |
| Cursor Memories | proprietary | – | – | **no longer in docs** (see §3) | – |

## 2. Matrix

D1 evidence-gated serving · D2 hash anchors + auto-suspect + propagation · D3 immutable git Markdown, per-branch derived state, merge driver, PR diff · D4 deterministic supersession · D5 truthful cascading forget · D6 five types + flushable working memory · D7 model-free core · D8 per-subject personalisation + resume · D9 graph from link records · D10 memory-on/off release gate

| System | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 |
|---|---|---|---|---|---|---|---|---|---|---|
| mem0 | N | N | N | N | P | P | N | P | N | N |
| Letta (letta-code) | N | N | P | N | P | P | P | P | N | N |
| Graphiti / Zep | P | N | N | P | P | N | N | P | Y* | N |
| Cognee | N | N | N | N | P | P | N | P | Y | N |
| Hindsight | P | N | N | N | P | P | P | P | P | N |
| Honcho | P | N | N | N | P | P | N | **Y** | N | N |
| Memorix | **P+** | **P+** | N | ? | ? | P | P | N | P | ? |
| tigerless agent-memory | P | N | P | P | N | P | **Y** | P | N | P |
| Basic Memory | N | N | P | P | P | N | Y | N | **Y** | N |
| MIRIX | N | N | N | N | P | P | N | P | ? | N |
| LangMem | N | N | N | N | P | P | N | P | N | N |
| Claude Code memory | N | N | P | N | P | N | P | N | N | N |
| Copilot Memory | **Y** | P | N | N | P | N | N | P | N | **Y** |
| Cursor Memories | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| **MEX** (new) | P | **P+** | **P+** | N | N | N | P | N | P | N |
| inspeximus (new) | N | N | N | **Y** | **P+** | N | Y | P | N | N |
| GMR (new) | P | P | N | N | N | N | Y | N | N | N |
| deja-vu | N | P | N | N | P | N | Y | N | N | N |

\* Graphiti's graph is the store itself, not derived from link records.

## 3. Evidence, per system

**mem0.** ADD-only LLM extraction (`mem0/configs/prompts.py:472` "Your sole operation is ADD"), so old and new values co-exist with no current-value rule (D4 N). `delete_all(user/agent/run)` and `history()` audit (`mem0/memory/main.py:1960`), with no cascade report (D5 P). OSS graph store removed; graph is now a platform feature (D9 N). Personalisation is keyed by user_id/agent_id/run_id, with no resume view (D8 P).

**Letta (letta-code).** Memory is a git repo of Markdown (memfs). Frontmatter is validated in a pre-commit hook (`src/memory-frontmatter.ts:94`) and commits are signed. Git merge/rebase conflicts in memory are detected (`src/agent/memory-conflict-repair.ts`, MERGE_HEAD/REBASE_HEAD) and handed to a **repair worker** (an agent), not a deterministic merge driver. Files are mutable and there is no derived per-branch state (D3 P). `system/` is pinned working memory, but it is model-managed with no flush verb (D6 P).

**Graphiti.** Every edge carries `episodes` provenance (`graphiti_core/edges.py:267`) and bitemporal `valid_at/invalid_at` (`:281`). Contradictions are found by an LLM; invalidation is then applied in code (`utils/maintenance/edge_operations.py:715`) (D4 P). It serves edges whether or not their source is still valid: the provenance is lineage, not a gate (D1 P). `remove_episode` (`graphiti.py:2174`) (D5 P).

**Cognee.** One `forget()` with scopes data item / dataset / everything / `memory_only` (`cognee/api/v1/forget/forget.py:22-28`). No report of what could not be reached, and no skill cascade (D5 P). `visualize_graph()` (`cognee/api/v1/visualize/visualize.py:193`) (D9 Y).

**Hindsight (v1.0.0, 2026-10-13).** Retraction: mental models whose cited facts are deleted or invalidated are pruned (`hindsight_api/engine/reflect/retractions.py:1-30`, pure code; the rewrite uses an LLM) (D1 P). `delete_document` cascade-deletes memory units, observations and co-sources (`engine/memory_engine.py:11321-11391`). It has no tombstones and no unreachable report (D5 P). `LLM_PROVIDER=none` turns it into a chunk store, but embeddings are still required (D7 P). It has no working-memory object (D6 P). New since the survey: v1.0.0, and three commits after a7ab53c (reflect fixes only, via `gh api compare`).

**Honcho.** It has peers, per-(observer, observed) representations and `session.context(tokens, …)` for budgeted resume (prior source study, `hindsight-honcho.md` §1–2) (D8 **Y**, the strongest here). `delete_session` hard-deletes and cascades through queue, embeddings, documents and messages, and returns a `SessionDeletionResult` with cascade counts (`src/crud/session.py:614-635`). That is close to a forget report. Cross-session conclusions and tombstones were not seen (D5 P). The `document_sources` premise tree gives lineage (`src/crud/document.py:1846`) but is not a gate (D1 P).

**Memorix.** It already ships much of D1/D2:
- `CodeRefStatus = 'current' | 'suspect' | 'stale' | 'unbound'` (`src/codegraph/types.ts:7`).
- `evaluateCodeRefFreshness` (`src/codegraph/freshness.ts`): a missing file or symbol gives `stale`; a changed **symbol content hash** gives `suspect`; a changed file hash with no symbol gives `suspect`. Symbol hashes come from its code graph (`src/codegraph/binder.ts:54-69`; `lite-provider.ts:281`; SCIP provider also present). This survives line shifts at symbol level (D2 P+).
- Claims bound to code are requalified after a graph refresh. Stale gives status `unknown` with confidence ≤ 0.2; suspect gives confidence ≤ 0.5 and `needs-review` (`src/knowledge/claims.ts:420-450`). This propagates one level only (code ref → claim); transitive fact→fact propagation was not seen.
- The context governor **defers stale evidence** and compacts unknown evidence (`src/knowledge/governor.ts:77-90`). Suspect evidence is still served, at reduced confidence (D1 P+).
- Storage is SQLite + Orama, not git Markdown (D3 N).
- Supersede status exists; who decides it is [unverified] (D4 ?).

**tigerless agent-memory.**
- No LLM in the core; files are truth and the index is a cache (README "No LLM client inside the library"; `CLAUDE.md:26`) (D7 Y).
- `valid_from`/`invalid_at` with `mem supersede <old> <new>` and `recall --as-of` (README §The store). Supersession is explicit and needs no LLM, but an agent or the Manage reasoner picks it, and it writes `invalid_at` into the old file (D4 P).
- `mem delete` only "ends current validity"; physical delete is human-only (D5 N).
- It reports a **no-memory arm**: LongMemEval-S, agent-memory 52.9% vs no memory 5.8% (README §Proof it works). That is a published A/B, not a release gate on coding tasks (D10 P).
- Each sleep is a git commit; there is no merge driver or per-branch derivation (D3 P).

**Basic Memory.**
- Markdown truth with an FTS5 index (`repository/sqlite_search_repository.py:61`). Parsing is deterministic (D7 Y).
- Authored valid time `@effective[a,b)` (`markdown/temporal_qualifier.py:6`) (D4 P).
- Graph from typed relations/wikilinks (D9 Y).
- `delete_note` with no cascade (D5 P).
- Git is left to the user (D3 P).

**MIRIX.** Six types including core/working and a sensitive vault (`mirix/orm/knowledge_vault.py:72`), all LLM-routed (D6 P, D7 N). Per-table soft delete (D5 P). Last commit 2026-08-20; no release.

**LangMem.** `enable_deletes=False` by default (`src/langmem/knowledge/extraction.py:226`). Procedural memory is done as prompt optimisation. Last commit 2026-10-02.

**Claude Code memory** (https://code.claude.com/docs/en/memory):
- CLAUDE.md (user-written, can be in git) plus auto memory: `MEMORY.md` index + topic files at `~/.claude/projects/<project>/memory/`, "machine-local", shared across worktrees (doc lines ~508–536). It is not in git and not per-branch (D3 P only via CLAUDE.md).
- No citations and no hash checks. `/doctor prompt-audit` asks Claude (an LLM) to look for "references to files or commands that don't exist" (D2 N; this is an on-demand LLM lint).

**GitHub Copilot Memory** (https://docs.github.com/en/copilot/concepts/agents/copilot-memory; public preview):
- Facts are "stored with citations pointing to the code that supports them". Before use, Copilot "checks those citations against the current branch… Only validated facts are used" (D1 **Y**).
- Mechanism (https://github.blog/ai-and-ml/github-copilot/building-an-agentic-memory-system-for-github-copilot/, 2026-01-15): "the agent is prompted to verify its accuracy and relevance by checking the cited code locations". This is an LLM check, not a hash, and has no dependency propagation (D2 P).
- Unused memories auto-delete after 28 days (D5 P).
- A/B: coding agent PR merge 90% with memory vs 83% without, review 77% vs 75%, p < 0.00001 (D10 **Y** in substance).

**Cursor Memories.** `https://docs.cursor.com/en/context/memories` now 308-redirects to `https://cursor.com/docs`. The docs index (`cursor.com/docs/llms.txt`) lists no memory page. The rules docs cover only Project/User/Team Rules and AGENTS.md. The changelog (latest entry 2026-10-16) says nothing about Memories. Removal or rename is likely, but not confirmed [unverified].

**MEX (new, MIT, TS, 1.8k★).** This is the closest coding-side competitor:
- "Lives in your repo. Shared through Git." "Git carries the meaning; setup or explicit maintenance commands rebuild the indexes against each checkout's own branch and working tree" (README:196). That is per-checkout derived indexes (D3 P+).
- Wiki claims are grounded to tree-sitter graph nodes, storing "node ID and identity fingerprint… a body hash". Verdicts are intact / changed / **moved** / missing / ambiguous / unverified (README:229-235; `src/wiki/grounding/verdict.ts:13-48`; `src/committed-groundings.ts:73`) (D2 P+).
- But: "Drift is a review signal. It does **not** prove that prose is false". Drifted claims are flagged, not withheld (D1 P).
- No merge driver (`.gitattributes` only has fixture rules), no immutable or content-addressed records, no fact→fact propagation seen, no forget, and no chat/person memory.

**inspeximus (new, MIT, 8★).** "`remember(key=...)` retires the old value by key… `revert()` does, as a recorded decision" (D4 Y). "`forget_subject()` removes every record about a person, leaves a signed content-free tombstone, and `erasure_certificate()` lets a third party check it" (D5 P+: tombstones and proof, but no derived-skill cascade or unreachable list seen). Zero-dependency base package (D7 Y). It publishes a correction-recurrence comparison: inspeximus 0%, Graphiti 13.3%, mem0 46.7%.

**GMR (new, MIT, Rust, 8★).** An "anchor" state machine per code coordinate (`gmr anchor src/auth.ts#createSession`); `gmr check` exits 1 and hands back notes when an anchor moved. Formatting-only edits are ignored (README:24-50, 166-199) (D2 P). It is the subject of a preregistered stale-memory benchmark, `YuxiaoMa66/drifttrap-bench`, which compares stale notes vs a detector hook.

**deja-vu.** "Says when the ground moved. A hit reports *4 files this session touched have changed since*" (README:77) (D2 P, file-level). No model (D7 Y). `deja forget` survives rebuilds (D5 P). v0.23.0 released today.

**okf-agent-memory (new, Go, 826★).** Git-native, "Built on Google OKF v0.2" with `sources`, `generated`/`verified`, `status`, `stale_after` as its **live** format (README:81-83). It has no code anchors.

**Other relevant 2026 projects (README only):**
- `mcncarl/agent-memory-vault` (335★): Markdown + git, `evidence_ref` required, `supersedes` explicit, search excludes superseded.
- `oliver-zehentleitner/keep-the-why` (232★): `Superseded by`, evidence `confirmed/inferred/unknown`.
- `rohitg00/agentmemory` (29.7k★): decay, auto-forget, LLM contradiction resolution; no code anchoring seen.
- `junha6316/memory-invalidation` (0★): self-invalidating facts when cited code changes, with a PoC that cuts stale serving from 100% to 28%.

## 4. Uniqueness verdict per differentiator

| # | Unique? | Already shipped by |
|---|---|---|
| D1 | **No.** The "served only while evidence is live" policy is shipped | Copilot Memory (agent-validated, "only validated facts are used"); Memorix governor defers stale evidence. Left for us: a *deterministic* gate that also withholds `suspect` |
| D2 | **Mostly no** | Memorix (symbol content hash → suspect/stale), MEX (symbol body hash with moved detection), GMR (anchors), deja-vu (file-level). Left for us: a parser-free sliding excerpt window, plus **transitive** suspect propagation with restore through fact→fact citations. Nobody was seen doing that |
| D3 | **Partly unique** | Git-tracked Markdown memory is common (MEX, letta-code, tigerless, Basic Memory, AMR spec, okf-agent-memory, agent-memory-vault). MEX already derives indexes per checkout/branch. Not seen anywhere: immutable content-addressed records, a deterministic git merge driver (letta-code uses an agent repair worker), and a PR diff showing facts that went suspect |
| D4 | **No** | inspeximus (key-based retirement), tigerless (explicit supersede + as-of), Basic Memory (`@effective`), agent-memory-vault (`supersedes`). Left for us: an order derived without writing to old files, so every branch computes the same head |
| D5 | **Partly unique** | inspeximus (subject erase + signed tombstone + certificate), Honcho (cascade with counts), Hindsight (cascade + retraction), Cognee (scopes). Not seen: deleting derived *skills* in the cascade, and an explicit "unreachable" list |
| D6 | Weak | tigerless, MemOS, MIRIX have equivalent type sets. A `flush` separate from forget was not seen, but it is a small feature |
| D7 | **No** | tigerless, Basic Memory, deja-vu, inspeximus, GMR, okf-agent-memory |
| D8 | **No** | Honcho does it more fully; mem0, Zep Cloud, Memobase also do it |
| D9 | **No** | Basic Memory, Cognee, Hindsight control plane, MEX context graph |
| D10 | **No** as a capability | Copilot ran memory on/off A/B (90% vs 83%); tigerless publishes a no-memory arm. Making it a release *gate* is a process choice, not a differentiator |

The true novelty is the combination: deterministic evidence gating, excerpt anchors with transitive propagation, immutable content-addressed git records with a merge driver and suspect-in-PR, and a skill-cascading forget report. Each piece except the merge driver, PR-suspect diff and transitive propagation is shipped somewhere.

## 5. Changes since the prior survey (oss-survey.md, earlier today)

- Hindsight cut **v1.0.0** (2026-10-13). HEAD moved a7ab53c → 8d59b22a (reflect fixes only).
- deja-vu released v0.23.0 today.
- **Memorix is stronger than the survey said.** It has symbol-level hashes (`capturedSymbolHash`) and the same `current/suspect/stale` vocabulary, not just `capturedHash`. The spec's "symbol-level hashing stays deferred" is something a competitor already ships.
- **MEX was missed by the survey.** It is the closest match to the v2 git/branch principle.
- **Survey gap #5 is false.** It said "No OKF-native writer", but okf-agent-memory writes OKF v0.2 live.
- **Spec §10 needs softening.** It says "which no surveyed project shows". That still holds for the PR-diff-of-suspect-facts claim specifically, but MEX does per-branch derivation.
- **inspeximus** directly targets D4/D5 with published comparisons. It is tiny (8★) but should be cited.
- Copilot Memory is still public preview. Its A/B (Jan 2026) means "the release must beat memory-off" has already been demonstrated by a competitor.
- Cursor Memories no longer has a docs page (old URL redirects) [removal unverified].
