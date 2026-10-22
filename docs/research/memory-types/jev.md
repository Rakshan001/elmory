# Jev and typed-judgement models in a memory system: research report

Researched 2026-10-21. Every claim below comes from a page or source file opened in this session. Anything not opened is marked **[unverified]**.

Note on the local Hindsight clone: the directory at `scratchpad/hindsight` has folders but **0 files** (`find -type f | wc -l` returned 0). I read Hindsight from GitHub instead, pinned at `main` = `a7ab53c84a847664d3377dfb7987d3e6bbaf4b17` (pushed 2026-10-20). The grep lines below were run against the raw files at that SHA.

---

## 0. Headline findings (what changed since the 2026-09-24 blog)

1. **A Jev-compatible model with open weights now exists.** Cloudflare's **Clef** family (blog 2026-10-01) is "fully Jev-API compatible" and released on Hugging Face under **Apache-2.0**:
   - `Cloudflare/clef-flash`: 9.41B params, post-trained from Qwen3.5-9B
   - `Cloudflare/clef`: 27.36B, from Qwen3.8-27B
   - `Cloudflare/clef-omni`: 35.26B, from Qwen3-Omni-30B-A3B

   llama.cpp merged text-only Clef support on 2026-10-03 (PR #29831). `ggml-org/Clef-Flash-GGUF` ships Q4_K_M at 6.49 GB and Q8_0 at 9.66 GB, served at `/v1/systemone`. This answers "is there a local/offline Jev?": **not Jev itself, but a wire-compatible substitute**.
2. **OpenAI has a Decisions API** (`/v1/decisions`, public beta, `gpt-6-luna`, $0.10 per 1M input tokens, ZDR available). It has the same three question kinds under other names (predicate/choice/score).
3. **Jev 1.14.0 shipped 2026-10-14.** The models page, fetched today, lists `jev-1.14.0` and `jev-1.13.0`. On that page `jev-latest` still points to 1.13.0 and `jev-preview` to 1.14.0. The 2026-10-14 blog said `jev-latest` would move "in a week". The 1.14 additions are experimental: images, the `box` question type, and a 262k long-context header. TypeSafe also raised an $870M Series A on 2026-10-09.
4. **Hindsight went well beyond reranking after the blog.** Between 2026-10-15 and 2026-10-20 it added the following, on `main` after v1.0.0 (2026-10-13), so not yet in a tagged release:
   - a generic **"decision model"** layer with providers `typesafe`, `cloudflare` (Clef) and `openai` (Decisions)
   - **consolidation triage**: new fact vs stored observations, decided as restates / new / changes / chatter
   - **evidence sufficiency**, which stops a reflect loop
   - **page-impact gating**
5. **Hindsight partly reversed the blog's main lesson.** The blog says listwise Choice beats per-candidate scoring (recall@1 0.94 vs 0.87). The newer recall decision reranker uses **one Noul per candidate**, batched in one request. The reason: listwise ranks the head better but not the tail, and end-to-end answer quality was **0.59 (listwise) vs 0.79 (per-candidate)** when dozens of memories go to a generator.

---

## 1. Jev official facts (docs.typesafe.ai, typesafe.ai)

| Item | Fact | Source |
|---|---|---|
| Model IDs | `jev-1.14.0` (from 2026-10-14) and `jev-1.13.0`. Aliases: `jev-latest` → 1.13.0 (stable), `jev-preview` → 1.14.0 | docs.typesafe.ai/models |
| Older IDs seen | `jev-1.12` (cookbooks dated 2026-08) | cookbooks/citation_check, rerank_typesafe |
| Endpoint | `POST https://api.typesafe.ai/v1/systemone`, body `{model, state, questions:{id:{type, instructions, criteria}}}` | models, primitives |
| Question types | **Choice** (`choice`, `probabilities`, `confidence`), **Score** (`score`, `legend`, `probabilities`, `confidence`), **Noul** (`noul`, the probability of yes; no `confidence`), **Box** (image bounding box; 1.14 only, experimental "Danger-Zone-Images" header) | primitives, primitives/box |
| Context | 64k tokens per request (state + all questions) and 32k per question (state + one question). No cap on question count. With the `TypeSafe-Danger-Zone-Long-Context: true` header both limits become 262k, which is "slower and less accurate" | models |
| Request rules | 32 MiB body, 64 nesting levels, finite numbers only. Over-length requests return `400 max_tokens_exceeded` | api/errors |
| Price | **$42 per billion input tokens ($0.042/M). Output tokens are free.** The same for long context | models |
| Billing shape | State is counted once per request. In the GDPR cookbook, 13 questions in 1 call cost $0.000497 / 0.27 s, against $0.006090 / 2.71 s for 13 separate calls (12.2x cheaper, 10x faster) | cookbooks/parallel_questions |
| Latency | Homepage: "Completed in 0.114s". Cloudflare's measurement of Jev: 524.1 ms median / 536.0 ms p95. Hindsight: 0.027 s/query at 30 candidates and 0.063 s at 240 (their harness). See §2 | typesafe.ai; Cloudflare blog; Hindsight blog |
| Input | Text only for production (string, JSON, arrays). Images are experimental in 1.14. English is best; other languages are weaker | models, system-one |
| Calibration | Trained with "RLCD". `confidence` is derived from `probabilities`, with exact formulas published per type. Calibration "does not guarantee that an individual answer is correct" | confidence, system-one |
| Customisation | No fine-tuning or LoRA. The same weights serve every account | models |
| Local / offline / open weights | **None from TypeSafe.** The docs and blog pages I opened mention no on-prem, VPC or open-weights option. One press page I found in a web search, but did not open, says observers suspect it is built on an open-weight base | models, blog, search result (letsdatascience) |
| Data | "Jev is not trained on customer requests or responses." ZDR is offered to **enterprise** customers only. The DPA (updated 2026-04-24) says data is kept "as long as necessary", with no fixed period | models, legal, typesafe.ai/legal/data-processing |
| SDKs | Python `typesafe-sdk` (v0.7.5, 2026-10-14). JS/TS `@typesafe-ai/sdk` (v0.7.0, 2026-10-14; needs Node ≥ 22; zstd compression; images/box). Both retry 429/529 by default. There is also an agent skill for Claude Code/Codex | sdk, changelogs, agent-skill |
| Rate limits | Per organisation, in tokens/s and requests/s. Returns 429; 529 means overloaded | models, api/errors |
| Releases since 2026-09-24 | Python SDK 0.7.2 to 0.7.5; Jev 1.14.0 and JS SDK 0.7.0 (2026-10-14); Series A (2026-10-09); the "Simple memory system" cookbook (numbers from jev-1.13.0, 2026-09-28) | changelogs, blog |

**Known failure modes (TypeSafe's own "Jev 1.13 jaggedness" page, reviewed 2026-10-02).** Several of these matter for memory work:

1. Literal reading of the instructions.
2. Math, numbers and counting are unreliable; keep them in code.
3. **Date and time comparison is unreliable.** Extract the parts with the model and compare in code.
4. Indirection or multi-hop questions lose accuracy.
5. **A large state full of irrelevant detail costs accuracy** ("context rot"). Filter first.
6. **Adversarial content in the state can steer the answer.** It is not treated as hostile.
7. Instructions that contradict the criteria confuse it.
8. **Choice option order bias**: it leans toward the first option. Reorder and re-check.
9. It is not a generator.

---

## 2. How Hindsight calls Jev

All lines come from `grep -n "<literal>" <file>` at SHA `a7ab53c8`.

### 2a. Reranker provider `typesafe` (shipped in 0.10.1)

```
$ grep -n "class TypeSafeCrossEncoder" hindsight-api-slim/hindsight_api/engine/cross_encoder.py
1190:class TypeSafeCrossEncoder(CrossEncoderModel):
$ grep -n "SYSTEMONE_PATH = " hindsight-api-slim/hindsight_api/engine/cross_encoder.py
1221:    SYSTEMONE_PATH = "/v1/systemone"
$ grep -n "_RANK_INSTRUCTIONS_PREFIX = " hindsight-api-slim/hindsight_api/engine/cross_encoder.py
1164:_RANK_INSTRUCTIONS_PREFIX = "Which candidate answers the question: "
$ grep -n "\"type\": \"choice\"," hindsight-api-slim/hindsight_api/engine/cross_encoder.py
1364:                    "type": "choice",          <- rank: one Choice, options = whole pool (c0..cN)
1542:                    "type": "choice",          <- could_change_page (yes/no Choice)
$ grep -n "\"type\": \"score\"," hindsight-api-slim/hindsight_api/engine/cross_encoder.py
1493:                            "type": "score",   <- evidence_is_sufficient
1591:                    "type": "score",           <- the cut (prune depth)
$ grep -n "MAX_OPTIONS = 250" .../cross_encoder.py
1230:    MAX_OPTIONS = 250
$ grep -n "SHORTLIST = 12" .../cross_encoder.py
1234:    SHORTLIST = 12
$ grep -n "MAX_QUESTION_TOKENS = 26_000" .../cross_encoder.py
1247:    MAX_QUESTION_TOKENS = 26_000
$ grep -n "CUT_DEPTHS =" .../cross_encoder.py
1267:    CUT_DEPTHS = [1, 2, 3, 5, 10, None]  # None keeps the whole shortlist
$ grep -n "(len(order) - position) / len(order)" .../cross_encoder.py
1625:            scores[index] = (len(order) - position) / len(order) if position < keep else 0.0
$ grep -n "def evidence_is_sufficient" .../cross_encoder.py
1470:    async def evidence_is_sufficient(self, query: str, evidence: str) -> bool:
$ grep -n "def could_change_page" .../cross_encoder.py
1515:    async def could_change_page(self, topic: str, page: str, memory: str) -> bool:
$ grep -n "DEFAULT_RERANKER_TYPESAFE_MODEL = " hindsight-api-slim/hindsight_api/config.py
1562:DEFAULT_RERANKER_TYPESAFE_MODEL = "jev-latest"
$ grep -n "DEFAULT_RERANKER_TYPESAFE_PRUNE_CANDIDATES = " hindsight-api-slim/hindsight_api/config.py
1566:DEFAULT_RERANKER_TYPESAFE_PRUNE_CANDIDATES = False
```

The rank request is `{"state": "Question: <q>", "model": ..., "questions": {"rank": {"type": "choice", "instructions": "Which candidate answers the question: <q>", "criteria": {"c0": doc0, ...}}}}`. Hindsight sorts by `answers.rank.probabilities[c_i]`.

- Pools over 250 options or over the token budget are split into groups ranked in parallel. Each group's top advances to a finals Choice. Non-finalists keep their RRF order, because "probabilities are normalised within a call".
- A one-candidate Choice is rejected by Jev with "criteria must map 2 or more options".
- If Jev returns `max_tokens_exceeded`, the request is rebuilt at half the token budget, down to 3k. Jev's tokenizer counts mixed-script text at about 2x Hindsight's count (#5715), and the endpoint counted about 14% more than Hindsight on the same bodies (config.py comment).

The four instruction strings, verbatim:

- **Cut:** "How far down this ranked list does genuine relevance to the question extend? Count a candidate as relevant only if it helps answer the question."
- **Sufficiency:** "Does the evidence above answer the question? Judge only what the evidence states, not what could be guessed from it." Levels: does not answer / answers part, something missing / fully answers. Hindsight takes the **argmax level, not the rounded expected score**: "an expected 1.43 is 'partly' when rounded, though 'fully' was the likeliest verdict at 0.54".
- **Page impact:** "Could the new memory change this page? Answer yes if it adds to, updates, corrects or contradicts anything the page says ... Answer no only if the page would read the same with or without it." It is worded "so a doubt is a yes", because a wrong "no" is silent and permanent.

### 2b. Generic decision model (after the blog: #5607, #5613 on 2026-10-15, plus later fixes)

```
$ grep -n "/v1/systemone" hindsight-api-slim/hindsight_api/engine/decision_model.py
12:- ``typesafe`` (Jev): System One at ``<base_url>/v1/systemone``.
373:        return DecisionResponse.model_validate(await self._post("/v1/systemone", body))
$ grep -n "MAX_QUESTIONS = 700" .../decision_model.py
212:    MAX_QUESTIONS = 700
$ grep -n "max_tokens_exceeded" .../decision_model.py
95:    return isinstance(exc, UpstreamHTTPError) and exc.status_code == 400 and "max_tokens_exceeded" in exc.body
$ grep -n "\"cloudflare\": _DecisionProviderDefaults" hindsight-api-slim/hindsight_api/config.py
1587:    "cloudflare": _DecisionProviderDefaults(model="clef", base_url=None),
$ grep -n "DEFAULT_DECISION_MODEL_PROVIDER = " .../config.py
1591:DEFAULT_DECISION_MODEL_PROVIDER = "none"
```

- They measured that about 750 single-candidate questions fit one System One request and 775 overflow, so the client caps a request at 700 questions.
- `ask_all` now **raises** on an unanswered question. The old code silently dropped it, which pushed candidates to the bottom (#5715): "an unanswered question is not a 'no'".

### 2c. Recall decision reranker: per-candidate Noul, reversing the blog (#5284, #5632; 2026-10-15)

```
$ grep -n "_KEEP_INSTRUCTIONS = " hindsight-api-slim/hindsight_api/engine/search/decision_reranker.py
47:_KEEP_INSTRUCTIONS = "Showing this memory to someone answering the question would help them, rather than distract them."
$ grep -n "type=\"noul\"" .../decision_reranker.py
97:                type="noul",
$ grep -n "0.59 against 0.79" .../decision_reranker.py
58:    0.59 against 0.79 on a 20-question answer-quality set.
```

- This wording was the best of four they tried: the wanted candidate scored 0.74 vs 0.59 for "contains information needed to answer", with the pool median held at 0.08.
- Shared context (the date, the bank framing) goes into the state once, not into each candidate.
- With this reranker, Hindsight's recency, temporal and proof-count boosts are skipped.

### 2d. Consolidation triage (#5664, 2026-10-16): the closest existing design to "contradiction/support"

```
$ grep -n "_RELATION = {" hindsight-api-slim/hindsight_api/engine/consolidation/triage.py
40:_RELATION = {
$ grep -n "def stated_after" .../triage.py
205:def stated_after(observation_at: Any, fact_at: Any) -> bool:
$ grep -n "hindsight-decision" .../triage.py
35:#: hindsight-decision (answers 0.3-0.7) settle nothing, and needed retuning per model and per
```

There is **one request per new fact**, and the state holds `new_fact` and `existing_observations.o0..o9`, each with dates. The questions in that request are:

- `relation`: a Choice of **restates / new / changes / chatter**
- `match`: a Choice over the candidates
- for each candidate, `covers_oK` and `touches_oK`: yes/no Choices
- optionally `keep_as`, a Choice under the bank's mission

The **verdict stands only if the answers agree**. Any `touches=yes` disqualifies "new", "restates" and "chatter". Disagreement or failure sends the fact to the LLM. Date ordering is done **in code** (`stated_after`), which matches TypeSafe's own jaggedness advice.

They moved from Noul plus confidence thresholds (0.8 to 0.95, tuned to jev-latest) to argmax plus cross-question agreement. The reason: a "hedging" model (`hindsight-decision`, answers 0.3 to 0.7) settled nothing under fixed thresholds. Docs report about **40% fewer consolidation LLM calls at the same pass rate**, and that knowledge-page delta refresh went from 3 LLM calls to 1 with about 70% fewer input tokens. `hindsight-decision` appears to be a Hindsight-own decision model; I found no public card for it **[unverified]**.

### 2e. Blog lessons (hindsight-docs/blog/2026-09-24-adding-jev-reranker-what-we-learned.md)

1. **Listwise beats per-candidate for ranking the head.** One Choice over the pool gave recall@1 0.94 vs 0.87 per-candidate on 200 LoCoMo questions, at one-thirtieth of the calls. "Relative judgement is an easier task than absolute judgement." (§2c shows the later caveat for the tail.)
2. **"None of these" as a Choice option fails.** Options are "unrivalled alternatives, not points on a scale", so it "wins outright whenever the query is hard". **35 of 200 questions came back empty.** The fix was a **Score** with ordered depth levels (first 1/2/3/5/10/all).
3. **No escape hatch inside the Score either.** Adding a "nothing is relevant" level gave 7% empty queries and dropped gold retention from 0.81 to 0.65. Hindsight now always keeps at least one candidate.
4. **Ranking and filtering are separate product decisions.** The cut lifts precision from 0.051 to 0.850 (keeping 1.6 of 30) but loses 19% of the gold evidence, and caps output at 12. It ships **off** by default.
5. **Scores are positions, not confidences.** The returned score is the rank normalised to 1.0, 1 − 1/n, and so on. Two pools are not comparable, and an absolute `min_score` floor is meaningless, so Hindsight now rejects `min_scores.reranker` with HTTP 400.
6. **Operations.** It is hosted, so memory text leaves your infrastructure. It fails closed, so configure a fallback chain ending in `rrf`. It is configured per server, not per bank. The 32k context applies and the 0.10.1 provider did not truncate (it does now).
7. **Numbers** (LoCoMo, against the MiniLM `local` default):

   | Setting | Model | recall@1 | NDCG@10 | s/query |
   |---|---|---|---|---|
   | 30 candidates | MiniLM | 0.800 | 0.850 | 0.12 |
   | 30 candidates | Jev | **0.950** | **0.957** | **0.027** |
   | 240 candidates | MiniLM | 0.583 | 0.682 | 0.41 |
   | 240 candidates | Jev | **0.783** | **0.856** | **0.063** |

8. **A design that paid off by accident.** Retrieval arms pass ids and scores only. Text is hydrated just before rerank, so a networked reranker cost nothing extra.

---

## 3. Using Jev-style typed judgement in a memory system

Cost basis: Jev charges $0.042 per 1M input tokens and nothing for output. OpenAI Decisions charges $0.10/M. Local Clef or ONNX costs $0 in API fees. The token counts below are my estimates **[estimate]**.

### (a) Relevance reranking

- **Question type.** For a short head (top 1 to 5), use **one Choice over the pool** (Hindsight's listwise design). For a long list fed to a generator, use **one Noul per candidate batched in one request**, with the state holding the query and shared context once: "would showing this memory help rather than distract?". Hindsight measured 0.79 vs 0.59 end-to-end for the per-candidate Noul. For a cut, use a **Score** with ordered depth levels and no "none" level.
- **Cost.** 30 memories at about 100 tokens each, plus framing, is about 3.5k tokens: **≈ $0.00015 per query on Jev** and ≈ $0.00035 on OpenAI Decisions. 240 candidates (about 25k tokens) is ≈ $0.001.
- **Latency.** Hindsight measured 27 to 63 ms per query. Cloudflare measured Jev at about 524 ms median.
- **Failure modes.**
  - Choice probabilities are normalised within one call, so scores are not comparable across calls or pools.
  - Option-order bias, so shuffle or check consistency.
  - Over-abstention if you add "none".
  - Long memories overflow 32k per question.
  - Tokenizer mismatch leads to 400 errors.
  - The alias can drift (`jev-latest` moves), so pin a version ID.
  - It is a network dependency, so fail open to the fusion order.

### (b) Contradiction or support between a new fact and stored facts

- **Question type.** Copy Hindsight's triage. Use a **Choice `relation`** of restates / new / changes / chatter. For each candidate, ask **yes/no Choices** "covers" and "touches"; TypeSafe's citation cookbook uses supports / contradicts / says_nothing. Accept a verdict only when the answers agree, and escalate otherwise. **Compare dates in code**, never in the model.
- **Cost.** One request per new fact with 10 candidate facts and about 22 short questions is roughly 2 to 3k tokens: **≈ $0.0001 per write**.
- **Failure modes.**
  - Literal reading: "her home country" vs "Sweden" needed the reworded "should it now be worded differently" question in Hindsight's eval.
  - Date ordering.
  - Multi-hop indirection.
  - **Adversarial or injected memory text can steer the answer.** Memories written by agents are untrusted input.
  - Hedging models break fixed thresholds, so use argmax plus agreement.
  - A wrong "restates" silently loses the update. Bias the wording so doubt escalates.

### (c) "Is this memory still supported by this evidence?"

- **Question type.** Use a **Choice** of supports / contradicts / says_nothing with the evidence as the state, gated on `confidence` (the citation cookbook auto-accepts at ≥ 0.8 and sends the rest to a human). A Noul is an alternative.
- **Run a deterministic pre-check first.** In the TypeSafe cookbook an exact string match catches fabricated quotes before any model call. For code memories the analogue is a hash or commit match on the bound evidence. **Call the model only when the hash changed.**
- **Cost.** The evidence span is usually 0.5 to 5k tokens: **≈ $0.00002 to $0.0002 per check**. It is cheap enough to run on every changed file in a commit.
- **Failure modes.** The cookbook's `iat_future` and `pii_encryption` cases ended as "says_nothing" at confidence 0.27 or 0.56 and needed a human. A large, noisy state reduces accuracy, so send only the bound span. A literal reading of renamed symbols can fail **[unverified for code]**.

### (d) Answer or abstain

- **Question type.** Use a **Score** with ordered sufficiency levels: none / part, something missing / full. This is Hindsight's `evidence_is_sufficient`. Take the **argmax level**, not the rounded expectation. Make the abstain decision **in code**: abstain if the argmax is below "full", or if Score confidence is below a threshold tuned on your own data.
- **Cost.** About 1 to 25k tokens of evidence: **≈ $0.00004 to $0.001**.
- **Failure modes.**
  - **Do not offer an "I can't answer" option inside the model question.** Both Hindsight experiments show it is over-chosen (35 of 200 and 7% empty).
  - Hindsight uses sufficiency to *stop retrieving*, not to refuse. Abstention policy is untested there **[unverified]**.
  - "Partly" must not round up to "yes".
  - Calibration is per population, not per answer (TypeSafe's own caveat).

---

## 4. Local, offline alternatives with typed or probability output (no generation)

Data from the Hugging Face API and model cards, fetched today.

| Model | Params | Licence | Output | Node / offline | Notes |
|---|---|---|---|---|---|
| `cross-encoder/ms-marco-MiniLM-L6-v2` | 22.7M | Apache-2.0 | relevance logit | ONNX in repo. `Xenova/ms-marco-MiniLM-L-6-v2` (transformers.js) int8 **23 MB** | NDCG@10 DL19 74.30, MRR@10 39.01, 1800 docs/s on V100. Hindsight's default; 0.800 recall@1 vs Jev 0.950 |
| `cross-encoder/ms-marco-MiniLM-L12-v2` | 33.4M | Apache-2.0 | logit | ONNX | 74.31 / 39.02, 960 docs/s. No gain over L6 |
| `mixedbread-ai/mxbai-rerank-xsmall-v1` | 70.8M | Apache-2.0 | logit | transformers.js, quantized 87 MB | |
| `Alibaba-NLP/gte-reranker-modernbert-base` | 149.6M | Apache-2.0 | logit | ONNX and transformers.js | |
| `BAAI/bge-reranker-v2-m3` | 568M | Apache-2.0 | logit | no ONNX in repo | multilingual |
| `jinaai/jina-reranker-v2-base-multilingual` | 278M | **CC-BY-NC-4.0** | logit | ONNX | not usable commercially |
| `cross-encoder/nli-deberta-v3-xsmall` | 70.8M | Apache-2.0 | **3-way softmax: contradiction / entailment / neutral** | `Xenova/nli-deberta-v3-xsmall` int8 **≈ 90 MB**, transformers.js zero-shot | SNLI 91.64, MNLI-mm 87.77 |
| `cross-encoder/nli-deberta-v3-small` | 141.9M | Apache-2.0 | 3-way | Xenova int8 161 MB | MNLI-mm 87.55 |
| `cross-encoder/nli-deberta-v3-base` | 184.4M | Apache-2.0 | 3-way | ONNX | SNLI 92.38, MNLI-mm 90.04 |
| `MoritzLaurer/deberta-v3-{base,large}-zeroshot-v2.0` | 184M / 435M | MIT | entail / not | ONNX | zero-shot "hypothesis" classifier |
| `vectara/hallucination_evaluation_model` (HHEM-2.1-Open) | 109.6M | Apache-2.0 (gated form) | 0 to 1 consistency, premise → hypothesis (asymmetric) | no ONNX in repo, Python | flan-t5-base. Fits use (c) directly |
| `KRLabsOrg/lettucedect-base-modernbert-en-v1` | 149.6M | MIT | token spans unsupported by context | Python | 8192-token context, RAGTruth |
| `lytang/MiniCheck-Flan-T5-Large` | not in API **[unverified size]** | MIT | supported prob. | Python | |
| `bespokelabs/Bespoke-MiniCheck-7B` | 7.74B | **CC-BY-NC-4.0** | supported prob. | | non-commercial |
| **`Cloudflare/clef-flash`** (2026-09-30) | 9.41B | **Apache-2.0** | **Jev/System One schema**: choice / score / noul, one logit per option from a "joint schema head", single forward pass | GGUF Q4_K_M 6.49 GB / Q8_0 9.66 GB. `llama serve`; llama.cpp PR #29831 merged 2026-10-03 (text-only). MLX 4/8-bit ports. SGLang on H200 | Cloudflare-reported: 38.8 ms median / 122.4 ms p95 (their GPUs). Beats Jev on BFCL, ToolRet, API-Bank in **Cloudflare's own** table. Laptop latency **[unverified]** |
| `Cloudflare/clef` / `clef-omni` | 27.36B / 35.26B | Apache-2.0 | same | GGUF / NVFP4 / GPTQ ports exist | 209.3 ms median (Cloudflare) |
| `kgptalkie/mini-clef` | 0.85B | Apache-2.0 | System One shape | Mac MPS | **teaching model**, one domain, "does not generalise" |
| `ibm-granite/granite-guardian-3.3-8b` | 8.17B | Apache-2.0 | guardian / judge | | card not opened in detail **[unverified capabilities]** |

**Node path.** transformers.js (`npm i @huggingface/transformers`, per the Xenova card) runs the ONNX MiniLM cross-encoder and the DeBERTa-v3 NLI models in-process. Together they are about 113 MB at int8. NLI's contradiction / entailment / neutral maps one-to-one onto the citation cookbook's contradicts / supports / says_nothing. That covers (a), (b) and (c) offline, at lower quality than a decision model; the NLI cards report sentence-pair accuracy only, not long-evidence performance.

For (d), no small local model in this list returns graded sufficiency except Clef. A practical local substitute is HHEM or NLI entailment of the drafted answer against the evidence **[design inference]**.

---

## 5. Recommendation: what goes in the core and what goes in a plug-in

**Core: offline, deterministic, zero model dependency.**

- The **typed-judgement interface**, using the System One wire shape (`state` plus `questions{id: {type: noul|choice|score, instructions, criteria}}` returning `answers` with `probabilities`) as the internal type. Three vendors (TypeSafe, Cloudflare, OpenAI with renamed fields) and llama.cpp/SGLang already converge on it. Hindsight's `decision_model.py` is a working adapter for all three.
- The core ships a **null judge**. Every judgement-dependent step must have a deterministic fallback: fusion order for rerank, "escalate / keep both" for conflicts, "stale until re-verified" for support, and "answer with citations, no abstain gate" or a lexical-coverage rule for answering.
- **Deterministic pre-checks that never need a model:**
  - evidence hash or commit binding (unchanged hash means still supported)
  - exact quote or normalised string match (TypeSafe's own cookbook does this first)
  - **date and time ordering in code** (TypeSafe's jaggedness doc; Hindsight's `stated_after`)
  - counting and numerics in code
  - exact or normalised dedupe
- **Policy in code.** Thresholds, the argmax-plus-agreement rule, "doubt escalates", and "never offer a none/abstain option to the model; decide abstention in code from ordered levels". Trace every judgement call: inputs, model version ID and probabilities (Hindsight records each `decision_*` call).
- **Treat memory text as untrusted state.** It must never be placed in `instructions`, because of adversarial steering (jaggedness #6).

**Plug-ins: optional, off by default, fail open to core behaviour.**

1. **`local-small`**: transformers.js ONNX MiniLM-L6 cross-encoder (23 MB) and DeBERTa-v3-xsmall NLI (about 90 MB). CPU, offline, Apache-2.0. Covers rerank and the supports / contradicts / neutral check.
2. **`local-decision`**: any `/v1/systemone` endpoint at a localhost `base_url`, such as llama.cpp `llama serve -hf ggml-org/Clef-Flash-GGUF` or SGLang. This is Apache-2.0 open weights with the same wire format as Jev, and is the only offline option with Score/Choice/Noul semantics. It needs about 6.5 GB or more of model and likely a GPU or Apple Silicon for good latency **[unverified on laptops]**.
3. **`hosted-decision`**: TypeSafe Jev (pin `jev-1.13.0` / `jev-1.14.0`, not `jev-latest`), Cloudflare Workers AI `clef`/`clef-flash`, or OpenAI Decisions. Memory content leaves the machine. ZDR is enterprise-only on TypeSafe and "eligible customers" on OpenAI. This must be an explicit opt-in.

Because every plug-in speaks one wire shape, switching provider is a `base_url` and model change. The evaluation harness (LoCoMo-style recall@k plus end-to-end answer quality, measured on both head and tail) should live in the core repo, so each plug-in is judged on the owner's data. Hindsight's reversal shows that the head metric alone picked the wrong design.

---

## 6. Not verified in this session

- Jev's architecture or base model. A press page from my web search, which I did not open, says only that observers suspect an open-weight base.
- Laptop or CPU latency for Clef-Flash GGUF.
- MiniCheck-Flan-T5-Large parameter count.
- Granite Guardian capabilities.
- The `hindsight-decision` model's origin.
- Workers AI pricing for Clef: not stated in the Cloudflare blog.
- How Jev, NLI or HHEM perform on **code** evidence. Everything quoted above is measured on prose: LoCoMo, RFC 7519, CLERC, GDPR.
- Whether `jev-latest` moved to 1.14.0 today. The models page fetched today still shows 1.13.0.

## Sources opened

- Hindsight @a7ab53c8: `hindsight-docs/blog/2026-09-24-adding-jev-reranker-what-we-learned.md`; `hindsight-api-slim/hindsight_api/engine/{cross_encoder.py, decision_model.py, search/decision_reranker.py, consolidation/triage.py, reflect/agent.py}`; `hindsight_api/config.py`; `hindsight-docs/docs/developer/{models.mdx, configuration.mdx}`. Also the GitHub commits API for file history and the releases API (v1.0.0 2026-10-13, v0.10.1 2026-09-21).
- TypeSafe: typesafe.ai; typesafe.ai/blog; /blog/jev-1-14; /blog/series-ai; /legal/data-processing; docs.typesafe.ai/{llms.txt, models, api/errors, confidence, model-jaggedness/jev-1.13, primitives, primitives/noul, primitives/box, introduction, introduction/coding-agents, concepts/system-one, legal, sdk, sdk/javascript, sdk/javascript/changelog, sdk/python/changelog, cookbooks/citation_check, cookbooks/basic_memory, cookbooks/parallel_questions, cookbooks/rerank_typesafe}.
- Cloudflare: blog.cloudflare.com/clef-decision-models. HF: Cloudflare/clef, clef-flash (README), clef-omni, ggml-org/Clef-Flash-GGUF (README and tree), kgptalkie/mini-clef. GitHub ggml-org/llama.cpp PR #29831.
- OpenAI: developers.openai.com/api/docs/guides/decisions.
- HF API and cards for every model in §4.
