# Is a new open-source agent memory system worth building? (2026-10-21)

Scope: the proposal in `docs/superpowers/specs/2026-10-21-five-type-memory-system-design.md` (v2, five types, coding + chat, OKF Markdown, model-free core, graph view, memory-off release gate in §14).

Method: WebSearch quota was exhausted (200/200), so every source below was opened today with WebFetch (arXiv abstract pages, arXiv API listings, GitHub docs and blog) or the `gh` CLI (GitHub issue search and issue bodies). Nothing is from training memory. Evidence grade on every item: **[peer-reviewed]**, **[preprint]**, **[vendor blog/docs]**, **[GitHub issue]**. **[relayed]** = taken from `papers.md` and not re-opened today. **[unverified]** = not checked.

Caveat on arXiv-listing summaries: for items I saw only in an arXiv API listing (not the abstract page), I say "listing only".

---

## 1. Does memory help? What helped, and what hurt

### 1a. Coding agents

| Finding | Number | Grade | Source |
|---|---|---|---|
| Existing memory systems building their own experience from history mostly lose to no memory | "Eleven of twelve solver and system pairings fail to exceed the matched memory-off baseline" (111 targets, 90 repos, 3,634 trajectories) | preprint (Sep 2026) | [arXiv 2609.23570 VibeMemBench](https://arxiv.org/abs/2609.23570) |
| …but **directly injecting the relevant historical experience** helps a little | +1.1 to +4.5 pp resolve rate on 4 solvers; fewer steps on all 5 | preprint | same |
| Repo context files (AGENTS.md etc.) do **not** generally raise task success and **raise cost** | ">20%" more inference cost; holds for LLM-written and developer-written files; instructions are followed, but "repository overviews … are not helpful" | preprint (ETH/LogicStar, Feb 2026, rev. Sep 2026) | [arXiv 2602.11988](https://arxiv.org/abs/2602.11988) |
| Context files do not measurably move correctness | bounded to ≤10–15 pp by equivalence test; 17 tasks, 288 runs; failures are implementation skill, not missing repo knowledge | preprint, single author | [arXiv 2607.27250](https://arxiv.org/abs/2607.27250) |
| Adding every positive-value instruction can be arbitrarily worse than selecting; irrelevant rules reduce compliance | theory + empirical | preprint (Oct 2026) | [arXiv 2610.11007](https://arxiv.org/abs/2610.11007) |
| **Citation-verified repository memory helps in production** | Copilot coding agent PR merge rate 90% with memory vs 83% without (p<0.00001); code review +2 pts positive feedback; seeded contradictory memories and invalid citations were caught by the agents | vendor blog (GitHub, Jan 2026), not independently reproduced | [GitHub blog](https://github.blog/ai-and-ml/github-copilot/building-an-agentic-memory-system-for-github-copilot/) |
| Memory from merged-PR history ("experience cards") helps | SWE-Bench Verified 69.2% → 72.9%; SWE-Bench Pro 48.3 → 51.7 | preprint (Oct 2026) | [arXiv 2610.11578 Chronos](https://arxiv.org/abs/2610.11578) |
| Representation matters: **high-level insights transfer, low-level traces cause negative transfer** | +3.7% avg cross-domain; gains come from meta-knowledge "such as validation routines" | preprint (Apr 2026) | [arXiv 2604.14004](https://arxiv.org/abs/2604.14004) |
| Agents copy retrieved experience ("experience-following"); bad memories propagate errors; "misaligned experience replay" | qualitative + empirical | preprint (2025) | [arXiv 2505.16067](https://arxiv.org/abs/2505.16067) |
| **Context rot is common:** stale code-element references in AI config files (CLAUDE.md, AGENTS.md) | 23.0% of 356 repos | preprint (Treude & Baltes, Jun 2026) | [arXiv 2606.09090](https://arxiv.org/abs/2606.09090) |
| Persistent config files are an attack surface | >50% attack success across sessions (listing only) | preprint | [arXiv 2610.27244](https://arxiv.org/abs/2610.27244) |
| DreamBench-SWE: big gains from memory but main comparison not significant (p=.518) | | preprint, single author | [relayed] arXiv 2608.20664 |

**Coding takeaway.** Generic memory and generic context files usually do not help and cost tokens. What helped in every positive result is *specific, verified, repository experience* (what fixed what, validation routines, PR history) delivered at the right moment — and the one large production A/B (Copilot) used citations checked against the current branch. What hurt: low-level traces, repository overviews, bloat, and stale or unverified memory.

Note on publication bias: an arXiv listing query for "coding agent + memory + SWE-bench" returned 11 papers, all reporting gains. The only rigorous negative results are the benchmark/evaluation papers (VibeMemBench, 2602.11988). Weight the evaluation papers higher than the system papers.

### 1b. Chat / personal assistants

| Finding | Number | Grade | Source |
|---|---|---|---|
| Long-term memory is hard for commercial assistants and long-context LLMs | "30% accuracy drop" on sustained interactions; 5 abilities incl. knowledge updates and abstention | **peer-reviewed (ICLR 2025)** | [arXiv 2410.10813 LongMemEval](https://arxiv.org/abs/2410.10813) |
| No method masters accurate retrieval, test-time learning, long-range understanding and selective forgetting | "current methods fall short"; BM25 60.5% vs MemGPT 34.3%, multi-hop conflict resolution ≤7% are from the body | preprint (venue not shown on abstract page) | [arXiv 2507.05257 MemoryAgentBench](https://arxiv.org/abs/2507.05257); body numbers [relayed] |
| Plain RAG serves superseded values; cosine similarity can't tell contradiction from duplicate | stale 15–40%; AUROC 0.59; deterministic supersession 0.95–1.00 vs RAG 0.20–0.47 | preprint, **single author** | [arXiv 2606.26511 MemStrata](https://arxiv.org/abs/2606.26511) |
| **Memory makes models more sycophantic** | user memory profiles: "+45% for Gemini 2.5 Pro" agreement sycophancy; 38 users, 2 weeks | **peer-reviewed (CHI 2026)** | [arXiv 2509.12517](https://arxiv.org/abs/2509.12517) |
| **Over-personalization is widespread when memory is added** (irrelevance, repetition, sycophancy) | 1,700 instances | **peer-reviewed (EMNLP 2026)** | [arXiv 2601.13722 OP-Bench](https://arxiv.org/abs/2601.13722) |
| Saved notes carry user claims forward | downstream reliance 35.6% → 68.1% when the claim is saved; editing notes only cut failure ~6 pts | preprint | [arXiv 2607.10526](https://arxiv.org/abs/2607.10526) |
| "Correct memories can still induce sycophancy" | (listing only) | preprint | [arXiv 2610.05162](https://arxiv.org/abs/2610.05162) |
| LoCoMo answer key 6.4% wrong; Mem0 harness drops unanswerables | | blog | [relayed] dev.to audits |

**Chat takeaway.** Memory is genuinely needed for long chats (peer-reviewed), but the newest peer-reviewed work says personal memory *also* causes harm: sycophancy and over-personalization. A chat-personalisation feature has to solve "when not to use memory", which the proposal does not address.

---

## 2. Real user pain (GitHub issues, counted today)

Repo sizes today: mem0 67.6k stars / 2,307 issues; graphiti 32.1k / 610; cognee 32.6k / 1,598; letta 25.2k / 1,304; basic-memory 4.3k (AGPL) / 730; Memorix 852 (Apache-2.0).

### 2a. Title-keyword issue counts (`is:issue <word> in:title`; crude — keywords are noisy, read as relative signal only)

| keyword in title | mem0 | letta | graphiti | cognee | basic-memory |
|---|---|---|---|---|---|
| openai | **117** | **77** | 31 | 18 | 1 |
| ollama | 47 | 34 | 13 | 19 | 1 |
| local | 42 | 55 | 7 | 26 | 32 |
| delete | 50 | 19 | 6 | 27 | 13 |
| forget | 1 | 0 | 1 | 21 | 0 |
| wrong | 26 | 7 | 6 | 8 | 8 |
| duplicate | 14 | 7 | 12 | 13 | 16 |
| stale / outdated | 9 / 4 | 2 / 2 | 2 / 2 | 5 / 1 | 14 / 2 |
| tokens / cost | 11 / 2 | 17 / 3 | 10 / 3 | 5 / 7 | 0 / 0 |
| slow / latency | 5 / 0 | 5 / 0 | 2 / 1 | 3 / 0 | 3 / 5 |
| install | 19 | 15 | 5 | 13 | 15 |
| privacy | 1 | 1 | 0 | 1 | 1 |

Reading: the loudest signal by far is **LLM-provider dependency / running with local models** (OpenAI+Ollama titles: mem0 164, letta 111). The model-free basic-memory has almost none — but it has its own sync/index-drift issues. Privacy is almost absent as an explicit complaint.

### 2b. Representative issues

**LLM dependency / local-model setup**
- mem0 [#1534](https://github.com/mem0ai/mem0/issues/1534) "api_key client option must be set … OPENAI_API_KEY"; [#3391](https://github.com/mem0ai/mem0/issues/3391) (28 comments) Ollama fact-extraction JSON failure; [#1575](https://github.com/mem0ai/mem0/issues/1575) embedding dimension mismatch with Ollama.
- graphiti [#868](https://github.com/getzep/graphiti/issues/868) "Cannot get minimal example to work with Ollama"; [#290](https://github.com/getzep/graphiti/issues/290) number of LLM calls and rate limits; [#787](https://github.com/getzep/graphiti/issues/787) rate limit even at SEMAPHORE_LIMIT=1.
- letta [#3210](https://github.com/letta-ai/letta/issues/3210) archival memory hardcodes openai embeddings.

**Stale / superseded memory served**
- mem0 [#7535](https://github.com/mem0ai/mem0/issues/7535) (Oct 2026, open) "Search ranks an outdated memory above its update: `score_and_rank` has no recency term"; [#4896](https://github.com/mem0ai/mem0/issues/4896) "ADD-only architecture doesn't implement conflict resolution".
- graphiti [#1645](https://github.com/getzep/graphiti/issues/1645) (open) search results "mixed together with facts that have since been superseded"; asks to hide superseded facts by default.
- Claude Code: 17 issues with "memory" + "stale" in the title, 14 with "memory" + "wrong". Examples: [#95812](https://github.com/anthropics/claude-code/issues/95812) "Agent uses stale memory from merged PRs"; [#75405](https://github.com/anthropics/claude-code/issues/75405) asserted "tested/ready" from stale memory without checking artifacts; [#62812](https://github.com/anthropics/claude-code/issues/62812) over-relies on memory → stale state; [#85677](https://github.com/anthropics/claude-code/issues/85677) "memory notes collide and the wrong one wins"; [#101192](https://github.com/anthropics/claude-code/issues/101192) value from an outdated memory; [#71525](https://github.com/anthropics/claude-code/issues/71525) stale memory note treated as an authorization.

**Delete / forget that doesn't**
- mem0 [#7452](https://github.com/mem0ai/mem0/issues/7452) (17 comments, open): `delete_all()` leaves session messages that are re-sent to the LLM and can be re-extracted — "for someone who asked to have their data removed, that's the part that matters". Plus [#5066](https://github.com/mem0ai/mem0/issues/5066), [#3695](https://github.com/mem0ai/mem0/issues/3695), [#4863](https://github.com/mem0ai/mem0/issues/4863).
- cognee [#5473](https://github.com/topoteretes/cognee/issues/5473): provenance delete leaves orphaned vectors, can delete a shared one, no warning logged; [#3766](https://github.com/topoteretes/cognee/issues/3766) delete returns 500 during processing.

**Loading / budget / silent truncation (Claude Code built-in memory)**
- [#99403](https://github.com/anthropics/claude-code/issues/99403) MEMORY.md silently truncated, "no indication which entries were dropped"; [#82056](https://github.com/anthropics/claude-code/issues/82056) (71 comments) session can't tell if its memory index loaded whole; [#40614](https://github.com/anthropics/claude-code/issues/40614), [#79217](https://github.com/anthropics/claude-code/issues/79217) 200-line limit; [#63903](https://github.com/anthropics/claude-code/issues/63903) memory preamble ~11–16k tokens even when disabled.

**Memory read but ignored (compliance — not fixable by a store)**
- [#2544](https://github.com/anthropics/claude-code/issues/2544) (41 👍) CLAUDE.md rules consistently ignored; [#33603](https://github.com/anthropics/claude-code/issues/33603); [#6354](https://github.com/anthropics/claude-code/issues/6354) (30 👍) forgets CLAUDE.md after compaction; [#34556](https://github.com/anthropics/claude-code/issues/34556) (114 comments) persistent memory across compactions, "built our own".

**Duplicates / index drift**
- Every repo has 7–16 "duplicate" title issues (e.g. graphiti [#1734](https://github.com/getzep/graphiti/issues/1734) dedup by embedding only). basic-memory (Markdown-as-truth) shows the *cost* of files + index: [#765](https://github.com/basicmachines-co/basic-memory/issues/765) stale FTS entries after reindex, [#169](https://github.com/basicmachines-co/basic-memory/issues/169) sync unique-constraint, [#275](https://github.com/basicmachines-co/basic-memory/issues/275), [#1275](https://github.com/basicmachines-co/basic-memory/issues/1275) NFC/NFD duplicates.

**Not checked:** Cursor (its issue tracker is not a public GitHub repo searchable by `gh`), Cursor forum, Reddit, HN — [unverified].

### 2c. Competitors already doing the core idea
- **GitHub Copilot Memory** [vendor docs](https://docs.github.com/en/copilot/concepts/agents/copilot-memory): "Repository-level facts are stored with citations pointing to the code"; "checks those citations against the current branch"; unused facts deleted after 28 days. Closed, GitHub-hosted. Verification is done by the agent (a model), not by hash.
- **Memorix** ([repo](https://github.com/AVIDS2/memorix), Apache-2.0, 852★): local-first MCP memory shared across Claude Code/Cursor/Codex etc.; "source-backed … symbols and relations, file/symbol links, and freshness checks"; works keyword-only with no LLM key.
- **basic-memory** (AGPL, 4.3k★): Markdown files as truth + index, MCP, no LLM key.

So "evidence-bound, stale-detecting, model-free, local Markdown memory for coding agents" is **not novel**. The open differentiators are narrower: deterministic excerpt-anchor verification per worktree/branch (no model), deterministic supersession, and a forget that is provably complete.

---

## 3. Feature → documented pain

| Proposal feature | Pain evidence | Verdict |
|---|---|---|
| **Evidence-bound facts + stale detection on code change** | CC stale-memory issues ([#95812](https://github.com/anthropics/claude-code/issues/95812), [#75405](https://github.com/anthropics/claude-code/issues/75405), [#62812](https://github.com/anthropics/claude-code/issues/62812)); context rot in 23% of repos ([2606.09090](https://arxiv.org/abs/2606.09090)); Copilot's citation-verified memory +7 pts merge rate ([blog](https://github.blog/ai-and-ml/github-copilot/building-an-agentic-memory-system-for-github-copilot/)); stale/unverified experience propagates errors ([2505.16067](https://arxiv.org/abs/2505.16067)) | **Documented — strongest.** But Copilot and Memorix already ship it |
| **Deterministic supersession** | mem0 [#7535](https://github.com/mem0ai/mem0/issues/7535), [#4896](https://github.com/mem0ai/mem0/issues/4896); graphiti [#1645](https://github.com/getzep/graphiti/issues/1645); CC [#85677](https://github.com/anthropics/claude-code/issues/85677); MemStrata (single-author preprint) | **Documented** (issues are real; the quantitative paper evidence is weak) |
| **Truthful forget** | mem0 [#7452](https://github.com/mem0ai/mem0/issues/7452); cognee [#5473](https://github.com/topoteretes/cognee/issues/5473); "delete" titles 50/19/6/27/13 | **Documented, but chat / person-data side.** Little demand in coding memory; "privacy" barely appears as a word (≤1 per repo) |
| **Model-free core** | "openai"/"ollama" title counts 164 mem0, 111 letta, 44 graphiti; Ollama setup failures; rate limits / LLM call counts | **Documented — loudest by volume.** Already met by basic-memory and Memorix |
| **Git-native Markdown storage** | No user asks for git-tracked memory specifically; basic-memory shows Markdown+index has its own drift bugs ([#765](https://github.com/basicmachines-co/basic-memory/issues/765), [#169](https://github.com/basicmachines-co/basic-memory/issues/169)); CLAUDE.md-style files are common but don't raise success ([2602.11988](https://arxiv.org/abs/2602.11988)). Note the prior finding that git-tracked memory makes forget untruthful | **Weak** (readability/lock-in is a preference, not a documented pain); a liability for forget |
| **Five memory types** | Taxonomy from surveys (CoALA etc.); no user complaint about missing types | **None** |
| **Chat personalisation** | Needed (LongMemEval, peer-reviewed), but memory *increases* sycophancy +45% (CHI 2026) and over-personalization (EMNLP 2026); crowded market (mem0 67k★, Zep, Letta) | **Weak as a differentiator; documented harm.** Out of scope for release 1 |
| **Graph view** | Usefulness "asserted, never measured" (papers.md); no issue found asking for it in this pass | **None** [demand for graph viz in graphiti/cognee not searched] |
| (not in proposal as a headline) **Budgeted, visible loading** | CC [#99403](https://github.com/anthropics/claude-code/issues/99403), [#82056](https://github.com/anthropics/claude-code/issues/82056), [#63903](https://github.com/anthropics/claude-code/issues/63903); "curate, don't append" ([2610.11007](https://arxiv.org/abs/2610.11007)); context files +20% cost | **Documented** — cheap to address and already partly in the design (recall pack budget, abstain) |

---

## 4. Recommendation

### Verdict: **worth it only narrowly.**

Not worth it as proposed (five types + chat/RAG + graph + OKF package). Reasons:
1. The best evaluations say most memory systems don't beat memory-off for coding (VibeMemBench 11/12) and context files cost >20% more without raising success. Breadth multiplies that risk.
2. The chat half solves a crowded problem and walks into documented harms (sycophancy, over-personalization) the design doesn't address.
3. The coding half's core idea is already shipped (Copilot, closed; Memorix, open). The open niche is the *deterministic* version: hash/excerpt verification per branch, no model, deterministic supersession.
4. The positive evidence that exists (Copilot +7 pts, Chronos +3.7 pts, VibeMemBench "direct injection" +1.1–4.5 pts) all points at the same narrow thing: **verified, repo-specific facts served only while their evidence still holds.** That is worth building, inside Baton first.

### Release-1 wedge: "verified repo facts"
- `remember(fact, evidence = file + cited lines)` → stores the excerpt anchor.
- `recall` serves only facts whose excerpt still verifies in the **current worktree**, newest per (subject, relation), within a fixed token budget; it lists what it **withheld as suspect** and abstains when nothing verifies.
- `verify` command that also scans existing CLAUDE.md / AGENTS.md / Baton memory for stale code references (the 23% context-rot problem) — useful on day one, even before any A/B.
- Model-free, local, MCP + CLI. No chat memory, no person store, no five-type taxonomy, no graph view, no OKF extension work, no merge driver.

### Success criterion (pre-register before building)
Primary (what the wedge claims to fix): on a 90-day replay of the owner's repos with ≥100 human-labelled facts, **stale facts served drop to ≤2%** versus the measured baseline rate of unverified memory, with excerpt-anchor stale detection **precision ≥0.8 and recall ≥0.8**, and **≤10% of facts marked suspect per ordinary commit** (false-alarm budget).
Secondary (the §14 gate, stated honestly): on ≥30 paired real tasks, memory-on is **non-inferior** to memory-off on success and uses **≤10% more tokens**. Note: the expected gain (1–7 pts per the sources) cannot be detected with 30 tasks; do not claim a success-rate gain without several hundred paired tasks.

### Kill criterion (stop the project if any holds)
1. Baseline replay shows stale memory served in **<5%** of recalls in real use → the problem is too small to justify a package.
2. Excerpt anchors flag **>33%** of facts suspect per ordinary commit, or precision **<0.6**, after one iteration (the trigger already in spec §15) → stale detection is noise.
3. Memory-on is **worse** than memory-off on success, or costs **>20%** more tokens, after two tuning rounds (the ETH result repeated on your own tasks).
4. Memorix or Claude Code ship deterministic per-branch evidence verification first and it passes criteria 1–2 → contribute there instead of competing.

### What was not verified
Cursor / Copilot community forums, Reddit, HN (no web search); MemoryAgentBench venue and body numbers; DreamBench-SWE; whether graphiti/cognee users ask for graph visualisation; Memorix's freshness-check mechanism (README claim only, code not read).
