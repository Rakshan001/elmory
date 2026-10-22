# Five-type memory system — research and council results (2026-10-21)

**Status:** research only. Nothing is built, nothing approved. Both council verdicts are
advisory. Next step is the owner's decision (see "Waiting for the owner").

The source reports are in `docs/research/memory-types/`. Each was written by a
research agent that read source code or papers on 2026-10-21. Key citations were re-checked
with `grep -n` against the clones before being used here.

| Report | What it covers |
|---|---|
| `hermes.md` | Hermes agent memory, from source (commit 1d94f832e6) |
| `hindsight-honcho.md` | Hindsight (MIT, a7ab53c) and Honcho (AGPL-3.0, 607438d) |
| `oss-survey.md` | 29 open-source memory systems, 13 cloned and grepped |
| `papers.md` | Research papers incl. MIT (SEAL, MEM1), hallucination, benchmarks |
| `jev.md` | Jev (TypeSafe), Clef, local verifier models |
| `a2a.md` | Google A2A, MCP 2026, agent selection |
| `rea.md` | morluto/rea security review and borrowable concepts |

## 1. The five types, and who covers them

Owner's taxonomy: working (now/context) · episodic (what happened) · semantic (what is
true) · procedural (how to do it: skills) · external (where to fetch it).

| System | Working | Episodic | Semantic | Procedural | External |
|---|---|---|---|---|---|
| Hermes | compressor summary + todo | SQLite `state.db`, FTS5 search | MEMORY.md + USER.md, capped by chars | SKILL.md folders, weekly curator | `@file/@url/@git` refs |
| Hindsight | none (caller owns it) | "experience" facts + raw docs | world facts → observations with sources, proof counts | directives only | doc/chunk ids |
| Honcho | session summaries (20/60 msgs) | messages verbatim | conclusions per (observer, observed) peer; peer card | `INSTRUCTION:` card entries | none |
| MIRIX | core | episodic | semantic | procedural + skill experience | resource (+ knowledge vault) |
| tigerless agent-memory | deterministic MEMORY.md | `event` (append-only) | profile/preference/entity/fact/decision | procedure/experience | reference |
| Baton today | — | — | facts with file@hash anchors | skills catalog | — |

**Gaps no checked system covers** (oss-survey §4): a pre-serve check that an external
pointer still resolves; a flushable working memory separate from long-term forget; forget
that cascades into skills distilled from a forgotten episode; a skill-vs-newer-fact
contradiction check; OKF as live storage; a coding-agent memory benchmark.

## 2. What the evidence says about memory-induced hallucination

- Deterministic (subject, relation, object) supersession with valid-from/valid-to, no LLM:
  0.95–1.00 vs plain RAG 0.20–0.47 on serving the current value (arXiv:2606.26511,
  single-author preprint).
- Multi-hop conflict resolution is ≤7% for every system tested; BM25 (60.5%) beats MemGPT
  (34.3%); graph retrieval adds ~5 points (arXiv:2507.05257).
- Poisoning works at <0.1% poisoned records (>80% success, arXiv:2407.12784).
- Summaries save tokens but raw evidence is more accurate (TierMem, arXiv:2602.17913).
- For coding agents, 11 of 12 memory setups fail to beat no memory (VibeMemBench,
  arXiv:2609.23570). Raw traces cause negative transfer; insights and validation routines
  transfer (arXiv:2604.14004).
- Only deletion from an external store is verifiable; weight unlearning is not
  (arXiv:2510.25117).
- Hermes labels recalled memory "authoritative" (`agent/memory_manager.py:396`) — the
  opposite of what the evidence supports.

Design consequences used below: every claim cites evidence; supersession is code, not a
model; memory is untrusted input; abstention is a first-class result; release is gated on
beating memory-off.

## 3. Council 1 — architecture (deep tier, advisory)

Transcript: `.baton/council/2026-10-21-five-type-memory-system-architecture.md`.

**One versioned record envelope for all five types**, with one invariant: every semantic,
procedural and profile record cites ≥1 live evidence id (episode, `path@hash`, url) and is
served only while that chain is live. Episodes are append-only but physically deletable.
Forget cascades through files, index, vectors and skills and returns a report; flush
(working memory) is a separate verb. Subject id in every key, full SHA-256 ids, union
provenance on collision, skills stay SKILL.md, links are records (the owner's linking
algorithm writes these). 0 of 5 seats chose five separate stores or building on an existing
system. Confidence medium (the brief leaned toward evidence-required designs).

## 4. Council 2 — feature audit (deep tier, advisory)

Transcript: `.baton/council/2026-10-21-five-type-memory-feature-set-audit.md`.

**Release 1 = a model-free core.** IN: version key, evidence gate, deletable episodes,
cascading forget, tombstones, flush, subject id, SHA-256 ids, gated SKILL.md, manual links,
deterministic supersession, Markdown truth + rebuildable index, BM25 + token budget,
per-session snapshot + per-turn injection, scan at write and load, async URL check,
abstention, graph view, MCP server, memory-off release gate, evidence label, decay as a
ranking signal only.

DEFER (with trigger): embeddings and the Jev/judge plug-in (BM25 loses in the eval) ·
skill-vs-fact contradiction check (seen in replay) · LLM consolidation, id-to-integer swap,
task/conversation routing (consolidation requested) · per-observer views (a second agent
writes about the same person) · A2A Agent Card (a named consumer) · open-questions register.

**ADD — found by the audit, missing from the proposal:**
1. Person-scoped records live only in gitignored storage, enforced in code. Baton's default
   memory area is git-tracked (`src/memory.ts:471`), so a "forgot" report would be false while
   history and clones keep the data, and `git pull` brings files back (`:381`).
2. A real delete path — Baton's remove archives (`src/memory.ts:1194`).
3. Compare-and-swap on (subject, relation) for concurrent writers.
4. Invalidate the per-session snapshot on forget/flush.
5. A cascade rule for an episode that involves two people.
6. Observer id and recorded_at in every envelope; preserve unknown fields.
7. A reverse evidence index (evidence → dependents) so liveness is materialised at write time.

Overturn: BM25-only fails to beat memory-off → embeddings and the judge plug-in move in; a
forgotten value is found in `git log -p -S` or a fresh clone → release blocked; person
records must sync across machines → per-subject encryption with key destruction.

## 5. Topic answers

- **Personalisation across chats / resume a stopped chat:** episodes per subject + profile
  claims citing the utterance that stated them; resume = working-memory view rebuilt from the
  last session's episodes. Several agents learning about one person: subject id in every key
  now, Honcho-style per-observer views later.
- **Flush vs forget:** flush clears working memory only; forget deletes a person, item or
  everything, cascades, and reports what it removed and what it could not reach.
- **Token saving:** small always-loaded index (Hermes-style frozen snapshot, prompt-cache
  safe) + per-turn recall packed to a token budget; summaries are a cache, never truth.
- **Self-learning:** skills distilled from insights and validation routines (not raw traces),
  gated before activation; consolidation later, from a menu the code drafts (tigerless).
- **Graph view:** derived from link and evidence records — no graph database needed.
- **Hash / OKF:** SHA-256 content ids; Markdown with OKF-style frontmatter as truth; SQLite
  FTS5 + entity hash map as a rebuildable cache.
- **Jev:** a hosted typed-judgement model (Choice/Score/Noul). Best fit is an optional plug-in
  (rerank, contradiction check, answer-or-abstain), with Clef (open weights, Apache-2.0) or a
  small local NLI model as offline options. Not in release 1.
- **A2A:** stay MCP-first. A2A v1.0 is real but does not pick "the best agent"; Agent Card
  text is an attack surface. Build agent selection as a capability index + outcome ledger in
  Baton's routing; optionally serve a signed read-only Agent Card later.
- **rea:** a binary reverse-engineering MCP tool (MIT), not a memory system. Don't run it via
  unpinned `npx -y rea-agents@latest`. Borrow: content-hash evidence ids
  (`src/domain/evidence.ts:280`), observed/derived/inferred confidence, coverage tri-state,
  open-questions register, summary-then-page reads.

## 6. Baton integration path (later)

Baton's memory core already has file@hash anchors, computed (not stored) keys, per-query
BM25 and a stale check before serving. Known fixes before any format freezes (council 5,
2026-10-21): hash in the caller's worktree, not main; check anchor paths at parse time; hold
pulled facts as candidates; prefixed hashes and a version key. Integration order: package
core → MCP server → Baton consumes it as its memory store → dashboard graph view.

## 7. Waiting for the owner

1. Approve (or change) the two council directions above.
2. Where should person-scoped chat memory live: local only, or synced across machines (which
   brings in encryption with key destruction)?
3. Package language and licence (Baton is AGPL-3.0; a standalone package wants permissive).
4. The owner's own linking/unlinking algorithm — the design reserves `link` records for it.
5. Earlier open item: run council 5's read-only 90-day replay of suspect-fact share?

Then: brainstorming design sections → written spec in `docs/superpowers/specs/` → owner
review → implementation plan. No code before that.
