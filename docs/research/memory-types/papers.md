# Research that should shape the five-type memory design

Date: 2026-10-21. Every claim below was read today from the arXiv abstract/HTML page or the linked web page cited. Items marked [unverified] were seen only via search snippets or a secondary page, not the source itself. Numbers are as the source reports them; many are self-reported by system authors and not independently reproduced (see section 6).

Legend: WM = working, EP = episodic, SEM = semantic, PROC = procedural, EXT = external.

---

## 1. Taxonomy origin and current framing

| # | Claim | Number | Source |
|---|---|---|---|
| 1.1 | CoALA (Princeton: Sumers, Yao, Narasimhan, Griffiths) is the origin of the WM/EP/SEM/PROC split for LLM agents. WM = "active and readily available information as symbolic variables for the current decision cycle"; EP = "experience from earlier decision cycles"; SEM = "knowledge about the world and itself"; PROC = "implicit knowledge stored in the LLM weights, and explicit knowledge written in the agent's code". | — | arXiv:2309.02427 (v3, Mar 2024), https://arxiv.org/html/2309.02427v3 |
| 1.2 | CoALA explicitly warns that writing to PROC memory "is significantly riskier than writing to episodic or semantic memory, as it can easily introduce bugs or allow an agent to subvert its designers' intentions." | — | arXiv:2309.02427 §4.5 |
| 1.3 | "Memory in the Age of AI Agents" (47 authors, NUS/Renmin/Fudan et al.) says long/short-term taxonomies are "insufficient"; proposes forms (token-level / parametric / latent), functions (factual / experiential / working), dynamics (formation / evolution / retrieval); distinguishes agent memory from RAG and context engineering. | — | arXiv:2512.13564 (Dec 2025, rev. Jan 2026) |
| 1.4 | "A Survey of Agent Memory in the Second Half" (60 authors) organizes memory by storage substrate, cognitive mechanism (sensory, working, episodic, semantic, procedural) and personalization; claims memory is "the substrate through which agents self-evolve" and that portable, shareable skills are an emerging ecosystem. | — | arXiv:2602.06052 (Jan 2026, v. Aug 2026) |
| 1.5 | "Rethinking Memory in LLM-based Agents" splits parametric vs contextual (structured/unstructured) memory and names six atomic operations: consolidation, updating, indexing, forgetting, retrieval, condensation. Useful as the operation vocabulary for the design. | — | arXiv:2505.00675 (May 2025) |
| 1.6 | "Memory for Autonomous LLM Agents" frames memory as a write–manage–read loop with a 3-D taxonomy (temporal scope, representational substrate, control policy); lists open problems: continual consolidation, causally grounded retrieval, trustworthy reflection, learned forgetting. | — | arXiv:2603.07670 (Mar 2026) |
| 1.7 | ICML 2026 position paper (24 authors, from the Oct 2025 Dagstuhl seminar): continual learning at scale needs modular memory combining in-context learning (fast, no forgetting) with in-weight learning (stable); in-weight-only approaches make catastrophic forgetting unavoidable. | — | arXiv:2603.01761 (Mar 2026, rev. Jun 2026) |

Takeaway: the owner's five types map cleanly onto CoALA + "Second Half" (EXT ≈ CoALA's "external databases" feeding SEM, or 2512.13564's RAG/context-engineering boundary). The newer surveys add two axes the five-type list lacks: an operations axis (1.5) and a factual-vs-experiential split inside SEM/EP (1.3).

## 2. MIT work (affiliation verified unless noted)

| # | Claim | Number | Source |
|---|---|---|---|
| 2.1 | SEAL (MIT CSAIL / Improbable AI: Zweiger, Pari, Guo, Akyürek, Kim, Agrawal) trains a model via RL to write its own fine-tuning data ("self-edits") that are applied as weight updates. SQuAD knowledge incorporation: 32.7% base -> 46.3% with GPT-4.1 synthetic data -> 47.0% SEAL. ARC few-shot: 0% ICL -> 20% TTT -> 72.5% SEAL. | 47.0%; 72.5% | arXiv:2506.10943 (Jun 2025, rev. Sep 2025), https://arxiv.org/html/2506.10943v2 |
| 2.2 | SEAL's own limitations: "Performance on earlier tasks gradually declines as the number of edits increases, suggesting that SEAL is still susceptible to catastrophic forgetting"; each self-edit evaluation takes ~30–45 s. | 30–45 s/edit | same |
| 2.3 | MEM1 (SMART/NUS/MIT: Rus and Liang are MIT; ICLR 2026) trains an agent with RL to keep a constant-size internal state that merges memory and reasoning, discarding prior turns. MEM1-7B: 3.5x better and 3.7x less memory than Qwen2.5-14B-Instruct on 16-objective multi-hop QA; 27.1% peak token usage; trained on 2-objective tasks, generalizes to 16. Requires verifiable rewards. | 3.5x / 3.7x | arXiv:2506.15841 (Jun 2025), https://arxiv.org/html/2506.15841v1 |
| 2.4 | MIT NANDA (Media Lab Camera Culture, Raskar) is agent-internet infrastructure (discovery, identity, federation, interoperability), not a memory system. The NANDA Index paper proposes "AgentFacts": signed, schema-validated capability/identity documents with sub-second resolution and revocation, CRDT-based updates. Relevant to EXT memory only as a pattern for signed, verifiable metadata. | — | arXiv:2507.14263 (Jul 2025); https://www.media.mit.edu/projects/mit-nanda/overview/ |
| 2.5 | PersonaMem-v2 (UPenn-led; Gregory Wornell of MIT is a co-author) : frontier LLMs score 37–48% on implicit personalization; a Qwen3-4B model RL-fine-tuned to maintain a 2k-token human-readable memory reaches 55% using ~16x fewer input tokens than full 32k histories. Authors' claim: "reasoning, not long-context capabilities, drives success in implicit personalization." | 55% vs 37–48%; 16x fewer tokens | arXiv:2512.06688 (Dec 2025), https://arxiv.org/html/2512.06688v1 |
| 2.6 | No other 2025–2026 MIT CSAIL/Media Lab paper specifically on agent memory was found in the pages opened. [unverified: absence] |

## 3. Memory-induced hallucination and its fixes

| # | Claim | Number | Source |
|---|---|---|---|
| 3.1 | Imperfect retrieval is "inevitable, common, and harmful"; the bottleneck is knowledge conflict between internal and retrieved knowledge. Astute RAG (Google; ACL 2025) tracks source reliability and merges internal/external knowledge, matching or exceeding no-RAG even under worst-case retrieval. | — | arXiv:2410.07176 |
| 3.2 | Knowledge-conflict survey: three conflict types — context–memory, inter-context, intra-memory; conflicts "significantly impact the trustworthiness" of LLMs. | — | arXiv:2403.08319 |
| 3.3 | Stale facts: plain RAG over evolving knowledge "serves superseded values 15–40% of the time"; cosine similarity cannot separate a contradiction from a rephrase (AUROC 0.59). MemStrata applies deterministic (subject, relation, object) supersession in a bi-temporal ledger, no LLM call, ~2.1 s vs 16–18 s for LLM reranking; 0.95–1.00 accuracy on evolving knowledge vs RAG 0.20–0.47. (Single-author preprint.) | 15–40% stale; AUROC 0.59 | arXiv:2606.26511 (Jun 2026) |
| 3.4 | MemoryAgentBench "selective forgetting"/conflict resolution: single-hop best ~60% (GPT-4o), multi-hop conflict resolution max ~7% for every system tested — "forgetting out-of-date memory poses a significant challenge". | ≤7% multi-hop | arXiv:2507.05257, https://arxiv.org/html/2507.05257v3 |
| 3.5 | Memory poisoning — AgentPoison: backdoor via poisoned memory/RAG store, >80% attack success with <0.1% poisoning ratio and <1% benign degradation; no model training needed. | >80% ASR @ <0.1% | arXiv:2407.12784 |
| 3.6 | MINJA: any user can inject malicious records through normal queries only (bridging steps + progressive shortening of an indication prompt); reported >95% injection success and ~70% attack success under ideal conditions. | >95% / 70% | arXiv:2503.03704 (v5 Feb 2026); numbers restated in arXiv:2601.05504 |
| 3.7 | Defenses that worked in an EHR-agent study: I/O moderation with composite trust scoring; memory sanitization with trust-aware retrieval using temporal decay and pattern filtering; "pre-existing legitimate memories dramatically reduce attack effectiveness." | — | arXiv:2601.05504 (Jan 2026) |
| 3.8 | Admission control at write time: A-MAC scores each candidate memory on future utility, factual confidence, novelty, recency and content-type prior; F1 0.583, 31% lower latency than LLM-native memory; content-type prior was the strongest factor. Motivation: agents "accumulate ... hallucinated or obsolete facts." | F1 0.583; -31% latency | arXiv:2603.04549 (Mar 2026) |
| 3.9 | Provenance: Eywa stores immutable evidence before deriving facts ("evidence before belief"), validates extractions against source support, zero LLM calls in retrieval; LoCoMo 90.19%, LongMemEval-S 88.2%, BEAM 81.45%. No explicit hallucination-rate number. | — | arXiv:2605.30771 (May 2026) |
| 3.10 | TierMem: fast summary tier + immutable raw-log tier; escalate to raw only when summary evidence is insufficient; LoCoMo 0.851 vs 0.873 raw-only, with 54.1% fewer input tokens and 60.7% lower latency. Key framing: "compression decisions are made before the system knows what a future query will hinge on." | 0.851; -54% tokens | arXiv:2602.17913 (Feb 2026) |
| 3.11 | Hindsight separates facts (world, experience), entity summaries, and opinions; opinions carry a confidence c in [0,1] and formation timestamp; new facts reinforce/weaken/contradict existing opinions. LongMemEval 91.4%, LoCoMo 89.61% (vs 75.78% prior open). No per-network ablation published. | 91.4% / 89.61% | arXiv:2512.12818 (Dec 2025), https://arxiv.org/html/2512.12818v1 |
| 3.12 | Abstention: LongMemEval includes 30 false-premise questions; LongMemEval finds commercial assistants drop 37% (ChatGPT) and 64% (Coze) vs offline reading, and long-context LLMs drop 30–60% vs oracle retrieval. | 30–60% | arXiv:2410.10813, https://arxiv.org/html/2410.10813v2 |
| 3.13 | Abstention-aware RL for search agents (AWA-RL): +10.3% precision, +2.9% RA-F1 with marginal accuracy loss; standard RL objectives "don't adequately penalize fabricated responses when retrieval fails". | +10.3% precision | arXiv:2607.10738 (Jul 2026) |
| 3.14 | Ground-Truth-First instrument (single author): write-stage quality predicts downstream failure (weakly-written facts fail 24% vs 2%); a curated-map memory leads at 3 weeks (96%) but falls to 72% at 9 weeks while a provenance-typed graph rises to 90% (p=0.031) — the "tenure crossover"; full-history baseline shows no advantage at 9 weeks at ~2x read cost. | 24% vs 2%; 96->72% | arXiv:2607.21962 (Jul 2026) |
| 3.15 | Unlearning in weights: 180+ paper survey; evaluation has 18 benchmarks and 10 metric types; known weaknesses are relearning and superficial forgetting. Implication: deletion from external stores is the only forgetting that is verifiable today. | — | arXiv:2510.25117 (Oct 2025) |
| 3.16 | Episodic->semantic consolidation can be made a deterministic function whose output lives in a separate layer so the agent's certified identity hash is unchanged; outputs stored as DB rows with confidence and event provenance; ~79.8% fewer unproductive planner attempts (95% CI 78.0–81.5). | -79.8% | arXiv:2607.01988 (Jul 2026) |

What measurably reduces memory-caused hallucination, from the above: (a) deterministic supersession + bi-temporal validity (3.3); (b) write-time admission/confidence scoring (3.8, 3.14); (c) provenance-linked raw evidence that can be escalated to (3.9, 3.10); (d) separating facts from beliefs with confidence (3.11); (e) trust-scored retrieval with temporal decay against poisoning (3.7); (f) reward/instruct abstention explicitly (3.12, 3.13). Nothing opened shows that "more memory" by itself reduces hallucination; two sources show it can increase it (3.3, 3.8).

## 4. Procedural memory / skill learning

| # | Claim | Number | Source |
|---|---|---|---|
| 4.1 | Voyager: skills are executable code, "temporally extended, interpretable, and compositional"; verified via environment feedback, execution errors and self-verification before being added; 3.3x more unique items, 15.3x faster tech-tree milestones. Storing code (not prose) avoids catastrophic forgetting. | 3.3x; 15.3x | arXiv:2305.16291 |
| 4.2 | Agent Workflow Memory (CMU; ICML 2025): induce reusable workflows from past trajectories, offline or online; +24.6% relative on Mind2Web, +51.1% relative on WebArena, fewer steps; online AWM gains 8.9–14.0 absolute points as train/test distribution gap widens. | +51.1% rel. | arXiv:2409.07429 |
| 4.3 | ReasoningBank (Google; ICLR 2026): distill reasoning strategies from self-judged successes AND failures; memory-aware test-time scaling (MaTTS) generates diverse experiences to strengthen memory synthesis; beats raw-trajectory memory on web and SWE benchmarks in effectiveness and efficiency. | — | arXiv:2509.25140 |
| 4.4 | Memory Transfer Learning (coding agents): of four representations (trajectory, workflow, summary, insight), "high-level insights generalize well, whereas low-level traces often induce negative transfer"; cross-domain memory +3.7% avg across six coding benchmarks; transfer happens via meta-knowledge "such as validation routines, rather than task-specific code"; memories transfer across models. | +3.7% | arXiv:2604.14004 (Apr 2026) |
| 4.5 | Dynamic Cheatsheet: persistent store of concise strategies/code snippets at inference; Game of 24 GPT-4o 10% -> 99%; AIME Claude 3.5 more than doubled; +9% GPQA-Diamond. "Concise, transferable snippets rather than entire transcript." | 10% -> 99% | arXiv:2504.07952 |
| 4.6 | Reflexion: verbal reflections kept in an episodic buffer; HumanEval pass@1 91% vs 80% GPT-4. | 91% | arXiv:2303.11366 |
| 4.7 | LEGOMem (Microsoft; AAMAS 2026): procedural memory split into orchestrator-level (decomposition/delegation) and agent-level (execution) units; small models benefit most. | — | arXiv:2510.04851 |
| 4.8 | Authoring Agent Skills (SKILL.md): skills should have single responsibility, interface/implementation separation, low coupling, token economy, and "behavioural evaluation in place of deterministic testing"; discusses third-party skill trust. | — | arXiv:2607.25032 (Jul 2026) |
| 4.9 | ALMA (Clune lab): a meta-agent searches over memory designs expressed as code (schemas, retrieval, update protocols) and beats hand-designed memories on four sequential decision benchmarks. | — | arXiv:2602.07755 (Feb 2026, ICLR 2026) |
| 4.10 | Memento 2: theory that a stateful reflective memory with write/read operations converges to the optimal policy as memory coverage grows, without weight updates. | — | arXiv:2512.22716 |

## 5. Episodic memory, consolidation, sleep-time compute

| # | Claim | Number | Source |
|---|---|---|---|
| 5.1 | Generative Agents: memory stream scored by recency x importance x relevance; "reflections" synthesize higher-level statements; ablation shows removing reflection significantly degrades believability. | — | arXiv:2304.03442 |
| 5.2 | MemoryBank: Ebbinghaus-style decay — memories reinforced when recalled, otherwise fade. | — | arXiv:2305.10250 |
| 5.3 | MemGPT: OS-style tiered memory (main context vs external), self-editing via function calls; basis for Letta. | — | arXiv:2310.08560 |
| 5.4 | Sleep-time compute (Letta/Berkeley): precompute over context before queries; ~5x less test-time compute at same accuracy; +13% (GSM-Symbolic) / +18% (AIME) with more sleep-time scaling; 2.5x cheaper per query when amortized across related queries; helps only when queries are predictable from context. | 5x; +13/18% | arXiv:2504.13171 |
| 5.5 | Where consolidation hurts: TierMem shows summaries alone lose details needed later (allergy example) and that raw-only is more accurate (0.873 vs 0.851) — summaries save cost, not accuracy (3.10). Ground-Truth-First shows curated/consolidated maps degrade with tenure (96% -> 72%) while provenance-typed stores do not (3.14). Memory Transfer Learning shows low-level traces cause negative transfer but insights help (4.4). | — | arXiv:2602.17913; 2607.21962; 2604.14004 |
| 5.6 | Working-memory compaction in coding agents: Active Context Compression (agent decides when to consolidate into a persistent knowledge block) cut tokens 22.7% (14.9M -> 11.5M), up to 57% per task, with identical accuracy (3/5) — tiny eval. | -22.7% | arXiv:2601.07190 (Jan 2026) |
| 5.7 | "Measure Before You Manage": semantically different working-memory objects (instructions, artifacts, tool outputs, agent state) compress differently; calibration gains may not transfer to held-out tasks; equal token budgets do not mean equal delivered context. | 55 trajectories | arXiv:2608.31057 (Aug 2026) |
| 5.8 | SWE-MeM: RL-trained agent decides when/what/how to compress; 43.4% (4B) and 60.2% (30B) on SWE-Bench Verified, beating memory-management baselines on both accuracy and tokens. | 60.2% | arXiv:2606.28434 (Jun 2026) |
| 5.9 | SCM "sleep-consolidated memory" (single author): NREM/REM phases + value-based forgetting; 90.9% noise reduction, perfect recall over 10-turn conversations — tiny, self-evaluated. [weak evidence] | — | arXiv:2604.20943 |
| 5.10 | HiPS (EMNLP 2026): memory retain/compress/discard rules split into a universal strategy plus per-persona deltas, promoted/demoted by task outcomes; consistent gains over fixed strategies. | — | arXiv:2608.25329 |

## 6. Benchmarks and honest numbers

| # | Claim | Number | Source |
|---|---|---|---|
| 6.1 | LoCoMo (ACL 2024): ~300 turns / ~9k tokens avg, up to 35 sessions; long-context and RAG both "substantially lag behind human performance". | — | arXiv:2402.17753 |
| 6.2 | LoCoMo answer key audited: 99 of 1,540 questions (6.4%) score-corrupting errors (hallucinated facts in key, wrong temporal resolution, 24 speaker misattributions); gpt-4o-mini judge accepted 62.81% of deliberately wrong answers; ceiling for a perfect system ~93.6%. Repo: github.com/dial481/locomo-audit. | 6.4%; 62.81% | https://dev.to/penfieldlabs/we-audited-locomo-64-of-the-answer-key-is-wrong-and-the-judge-accepts-up-to-63-of-intentionally-33lg (Apr 2026) |
| 6.3 | The widely used Mem0 LoCoMo harness drops Category 5 (446 unanswerable questions, 22.5%) and the answer prompt says "NEVER say 'not specified'… COMMIT AND ANSWER" — abstention is invisible to the score. [page's stated date looks inconsistent; treat date as unverified] | 22.5% excluded | https://dev.to/gde03/the-ai-memory-benchmark-everyone-quotes-forbids-saying-i-dont-know-o1n |
| 6.4 | Zep's rebuttal to Mem0 (May 2025): Mem0 misconfigured Zep (both speakers as one user, timestamps appended to text, sequential search); Zep reports 75.14% on LoCoMo vs Mem0's best 68.44%; LoCoMo convos (16–26k tokens) fit in context so it does not stress memory; no knowledge-update tests; Category 5 unusable. | 75.14 vs 68.44 | https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/ |
| 6.5 | Mem0 paper's own numbers: +26% LLM-judge over OpenAI memory, 91% lower p95 latency, >90% token savings vs full context; graph variant ~+2%. | >90% tokens | arXiv:2504.19413 |
| 6.6 | LongMemEval (ICLR 2025): 500 questions, 5 abilities incl. knowledge updates and abstention; design wins measured: fact-augmented key expansion +9.4% recall@k / +5.4% accuracy; time-aware query expansion +11.3% on temporal (round-level) ; session->round decomposition helps GPT-4o; Chain-of-Note + JSON reading up to +10 points. | +9.4 / +5.4 / +11.3 | arXiv:2410.10813, html v2 |
| 6.7 | MemoryAgentBench (UCSD): accurate retrieval — BM25 60.5%, HippoRAG-v2 65.1%, GPT-4o long-context 58.1%, MIRIX 47.5%, MemGPT 34.3%; test-time learning and long-range understanding — long-context models win (Claude-3.7 53.9% / 62.2%), RAG systems 12–45% / 20–37%; commercial systems (Mem0, Cognee, Zep, MemGPT) "struggle across most benchmarks"; multi-hop conflict resolution ≤7% for everyone. | BM25 60.5% | arXiv:2507.05257, html v3 |
| 6.8 | Hindsight 91.4% LongMemEval / 89.61% LoCoMo; Memanto 89.8% / 87.1% with sub-90 ms single-query retrieval and no ingestion cost, arguing KG complexity is unnecessary; Eywa 88.2% LongMemEval-S / 90.19% LoCoMo; Zep up to +18.5% LongMemEval over baseline with 90% lower latency; TierMem 0.851 LoCoMo. All self-reported, different models/judges, not comparable. | — | 2512.12818; 2604.22085; 2605.30771; 2501.13956; 2602.17913 |
| 6.9 | MemPalace critical analysis: its 96.6% Recall@5 comes from verbatim storage + default ChromaDB embeddings, not the spatial metaphor; its real contributions are ~170-token wake-up cost and deterministic zero-LLM writes; Mem0's Apr 2026 change moved its LongMemEval from ~49% to 93.4%. | 96.6% | arXiv:2604.21284 |
| 6.10 | Coding: VibeMemBench (111 targets, 90 SWE-Bench V2 repos, 3,634 history trajectories): injecting verified historical experience directly raises resolve rate 1.1–4.5 pp and cuts steps, but 11 of 12 solver x memory-system pairings fail to beat the memory-off baseline. | 11/12 fail | arXiv:2609.23570 (Sep 2026) |
| 6.11 | DreamBench-SWE (single author): no memory 11.67%; event memory 45.56%; typed+raw 46.11%; hosted Mem0 literal storage 53.89% (180 cases); original study's main comparison not significant (p=.518). | 11.7% -> ~46–54% | arXiv:2608.20664 |
| 6.12 | SWE-Bench-CL: chronologically ordered issues per repo + FAISS semantic memory; measures transfer, accumulation, forgetting (stability–plasticity). No headline number on the abstract page. | — | arXiv:2507.00014 |
| 6.13 | PersonaMem-v2: frontier LLMs 37–48% on implicit preference inference; 2k-token readable memory + RL 4B model 55%. | 55% | arXiv:2512.06688 |

## 7. Retrieval structures

| # | Claim | Number | Source |
|---|---|---|---|
| 7.1 | BM25 beats or ties most "agentic" memory systems on accurate retrieval (60.5% vs MemGPT 34.3%, MIRIX 47.5%); HippoRAG-v2 (graph) is best at 65.1% — a +4.6 pt graph premium over BM25 on that benchmark. | 65.1 vs 60.5 | arXiv:2507.05257 |
| 7.2 | HippoRAG (NeurIPS 2024): KG + Personalized PageRank; up to +20% on multi-hop QA vs RAG; single-step retrieval comparable to iterative at 10–30x cheaper / 6–13x faster. HippoRAG 2 (ICML 2025): +7% on associative memory tasks over best embedding models. | +20%; +7% | arXiv:2405.14831; 2502.14802 |
| 7.3 | A-MEM (NeurIPS 2025): Zettelkasten-style notes with LLM-generated keywords/tags/links; new notes can update old notes' attributes; LoCoMo (GPT-4o-mini) temporal F1 45.85 vs MemGPT 25.52, multi-hop 27.02 vs 26.65; ~1,200 tokens per op vs ~16,900 for MemGPT/LoCoMo baselines (85–93% fewer); simpler methods sometimes better at single-hop. | 85–93% fewer tokens | arXiv:2502.12110, html |
| 7.4 | "Is GraphRAG Needed?" (ACL 2026 GEM): nine standardized scenarios across basic/Graph/Modular/Agentic RAG; context engineering cuts tokens 19–53%; finds a "retrieval-generation gap" — more retrieval does not proportionally improve answers. | 19–53% | arXiv:2606.25656 |
| 7.5 | A2RAG: graph abstraction has "extraction loss" (details stay only in source text); adaptive escalation gives +9.9–11.8 Recall@2 on HotpotQA/2Wiki at ~50% fewer tokens than iterative baselines. | +9.9–11.8 | arXiv:2601.21162 |
| 7.6 | ARK (ACL 2026): agent with only two tools — global lexical search over node descriptors + one-hop expansion — reaches 59.1% Hit@1 on STaRK; BM25 is more precise than dense on AMAZON/PRIME, and dense retrieval's single-pass advantage "does not directly carry over to iterative retrieval" because the agent can refine subqueries. | 59.1% Hit@1 | arXiv:2601.13969 |
| 7.7 | Memanto: 13 typed categories + conflict resolution + temporal versioning, single query, <90 ms, zero ingestion cost; 89.8% LongMemEval — argues against KG complexity. | <90 ms | arXiv:2604.22085 |
| 7.8 | MemStrata: deterministic (s, r, o) supersession, no embeddings threshold, no LLM in the write path (3.3). Eywa: zero LLM calls inside retrieval (3.9). MemPalace: deterministic zero-LLM writes, ~170-token wake-up (6.9). | — | 2606.26511; 2605.30771; 2604.21284 |
| 7.9 | Hash indexes: no paper opened today evaluated content-hash/exact-match indexes for agent memory; the web-search budget ran out before this query. [unverified / not found] | — | — |

---

## Design implications

1. Keep CoALA's four + external as the public vocabulary (1.1, 1.4), but implement the operations axis from 2505.00675 — consolidate, update, index, forget, retrieve, condense — as explicit, logged functions; most published failures are failures of one operation, not of a "type".
2. Treat PROC writes as privileged (1.2): skills get their own verification gate (execution/behavioural eval, 4.1, 4.8) and are stored as code or SKILL.md, not prose summaries; store insights/validation routines rather than raw traces, which cause negative transfer (4.4).
3. Make every SEM fact a (subject, relation, object, valid_from, valid_to, source_ids) row; retire by deterministic supersession, not embedding similarity (3.3, 3.14). This is the single best-evidenced hallucination fix.
4. Keep EP as an immutable append-only raw log with ids; SEM/summary rows must link back to EP evidence; retrieval escalates to raw when summary support is insufficient (3.9, 3.10). Summaries are a cost optimization, never the source of truth (5.5).
5. Add write-time admission control (3.8): score confidence, novelty, content type, recency before anything enters SEM; log rejected candidates. Weakly written facts fail 12x more often downstream (3.14).
6. Separate facts from beliefs/preferences with a confidence field and formation timestamp (3.11); personalisation rows (user preferences) belong in this belief layer, updated by reinforce/weaken/contradict events.
7. Default retriever: BM25 (or lexical over typed node descriptors) + metadata filters; add embeddings as a hybrid, and graph traversal only for explicit multi-hop/associative queries (7.1, 7.2, 7.6). At small/medium scale the graph premium is ~+5 pts on retrieval and the graph's main value is the view and provenance links, not recall.
8. Keep LLM calls out of the read path and out of the write path for structured facts (3.3, 3.9, 7.8); use the LLM only for consolidation/reflection jobs that run as scheduled "sleep-time" work when the next queries are predictable (5.4).
9. Flush/forget = delete rows from the external store plus tombstone the EP evidence; do not promise weight-level unlearning (3.15). Add temporal decay only as a ranking signal (5.2, 3.7), not as silent deletion.
10. Threat model memory like an input channel: trust score per source, temporal decay, pattern filtering, and quarantine of records written during a session before they become retrievable to other sessions (3.5–3.7). A memory that any user can write to is a backdoor.
11. Build abstention in: store "unknown/unsupported" as a first-class retrieval outcome and evaluate it (6.3, 3.12, 3.13); never instruct the answering model to "commit and answer".
12. Token saving: a 2k-token readable profile/state block (2.5), ~1k-token memory ops (7.3), compact wake-up (6.9), and condense-on-budget policies that distinguish instructions, artifacts, tool outputs and agent state (5.7).
13. For coding agents, inject verified repository history (what fixed what, validation routines) rather than generic memory; measure against a memory-off baseline because most memory systems currently lose to it (6.10, 6.11, 4.4).
14. Evaluate on LongMemEval (has updates + abstention) and MemoryAgentBench (has conflict resolution), treat LoCoMo scores as ±6 pt noise with a ~93.6 ceiling, and never compare vendor numbers across judges/models (6.2–6.8).
15. Self-learning: start with Reflexion/ReasoningBank-style verbal memory from both successes and failures (4.3, 4.6); keep weight updates (SEAL) out of scope — forgetting and 30–45 s/edit cost are unsolved (2.2).

## Open questions research does not answer

- Which of the five types should a flushed/forgotten fact be purged from when a summary already absorbed it; no paper measures leakage from consolidated SEM after EP deletion.
- No controlled study compares BM25 vs embeddings vs graph vs hash/exact-match at the 10^3–10^5 item scale of a personal or per-repo memory; all retrieval numbers above come from document QA or 500–1,500-question conversational sets.
- Multi-hop conflict resolution is ≤7% for every system (3.4); nothing opened shows how to fix it beyond deterministic single-fact supersession.
- When model-written consolidation helps vs hurts is only indirectly measured (5.5); no paper varies summarization frequency or compares LLM vs rule-based consolidation on the same corpus.
- Memory-poisoning defenses were tested only on an EHR agent with three small models (3.7); no evidence for coding agents or shared team memories.
- Cross-agent/shared memory: HiPS and LEGOMem split global vs per-user/per-role memory but give no guidance on conflict ownership across agents.
- Coding-memory benchmarks are new, single-author or single-lab, and show memory often losing to no-memory (6.10, 6.11); no result yet shows which memory type (EP vs PROC vs SEM) drives the gains.
- Procedural skill *revocation* (what to do when a stored skill becomes wrong after a dependency change) is not studied; Voyager/AWM only add skills.
- Graph view usefulness for humans is asserted, never measured.
- Abstention is mostly measured on false-premise questions (30 in LongMemEval); calibration of memory confidence fields (3.11) against actual error rates is not reported anywhere opened.
