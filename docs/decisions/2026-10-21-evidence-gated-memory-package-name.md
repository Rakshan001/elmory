# Council: name for the evidence-gated agent memory package

- **Date:** 2026-10-21
- **Status:** rejected — owner asked for a different, brandable name not tied to the meaning (2026-10-21); follow-up shortlist picked "elmory"
- **Tier:** standard
- **Run:** 4 seats (4 subagent) · review 3/3 · diversity ✓
- **Degraded:** partial — GitHub search API rate-limited mid-run (counts re-run by reviewers); no trademark register searched; framing lean toward option B flagged by 2 reviewers (confidence capped at medium)
- **Prior verdict:** none — recall_memory("memory package name naming council") returned no naming decision; council folder has no naming transcript

## Question (as asked)

"but that name is already taken right it should be unique and realateble and catchy i should not get same name product see example baton its very diluted there is so many proejcts i needed name so they shoyld not confused with other resources availbe right and rn /llm-council find the best name and give me that so i can create the repo name"

## Brief

DECISION: Which name to give a new open-source memory package for AI agents, to be used as the GitHub repo name and package name.
OPTIONS: (A) an invented/coined word · (B) a real word or metaphor, possibly with a suffix/prefix to make it unique · (C) a descriptive compound word. Members propose one concrete name within their chosen option.
CONSTRAINTS:
- Owner's requirements: unique (not confused with existing products/projects), relatable, catchy.
- What the product does: agents save facts that must cite evidence (a quoted excerpt of code, a file, a message, a URL); a fact is served to agents only while its evidence still matches; when code changes, the fact and every fact built on it become "suspect"; the current value is decided by code, not an AI model; facts are Markdown files in git; forget really deletes and reports what it removed. First release targets coding agents (via MCP + CLI); chat/personal memory may come later.
- Will be published on GitHub, npm (TypeScript), possibly PyPI.
GROUNDING (checked today):
- npm view baton name → baton ; gh api 'search/repositories?q=baton+in:name' --jq .total_count → 1842 ; PyPI /pypi/baton/json → 200
- npm view tally name → tally ; gh repos with "tally" in name → 11421 ; PyPI tally → 200
- npm view tallymem name → npm error (404, free) ; gh repos "tallymem" → 0 ; PyPI tallymem → 404
- npm view cairn name → cairn ; gh repos "cairn" → 2171 ; PyPI cairn → 200
- Nearby memory products already named: mem0, Letta, Zep/Graphiti, Cognee, Hindsight, Honcho, Memorix, MEX, basic-memory, okf-agent-memory, agentmemory, inspeximus, deja-vu, GMR, MIRIX, LangMem.
OUT OF SCOPE: the product's design and scope; whether to build it.

Clarifying question asked: none

## Seats

| # | Lens | Seat type | Model / provider | Tension with |
|---|---|---|---|---|
| 1 | User-advocate | subagent | host | Contrarian (catchy familiar word vs collision risk) |
| 2 | Contrarian | subagent | host | User-advocate |
| 3 | Ecosystem (searchability, registries, trademarks) | subagent | host | Expansionist (unique coined vs broad meaning) |
| 4 | Expansionist (survives scope growth to chat/RAG) | subagent | host | Ecosystem |

## Answers

### Seat 3 — Ecosystem

POSITION: Option B (real word + suffix) — **vouchmem**.

REASONING: In a list of hundreds of tools the name must win two tests at once: be the only result for an exact search, and still say what it does. A bare real word fails the first (tally, cairn taken on npm+PyPI; "vouch" itself is taken: npm `vouch`, Vouch Proxy 3.2k★ on GitHub, Vouch Insurance at vouch.us). A coined word passes the first but fails the second — next to mem0, Cognee, MIRIX, inspeximus it reads as noise. "Vouch" names the core mechanic: a fact is served only while its evidence still vouches for it; when it stops, the fact is suspect. The "-mem" suffix makes it unique and slots it into the category's naming convention (mem0, LangMem, Memorix, agentmemory). Free on all four registries, zero GitHub repos, .com unregistered. Easy to say and type; `npx vouchmem` works as a CLI. Prefer it over tallymem because "tally" reads as counting, not evidence.

CLAIMS:
`npm view vouchmem name` → npm error code E404
`gh api "search/repositories?q=vouchmem+in:name" --jq .total_count` → 0
`curl -s -o /dev/null -w '%{http_code}' https://pypi.org/pypi/vouchmem/json` → 404
`gh api users/vouchmem --jq .login` → {"message":"Not Found",... (GitHub org free)
`whois vouchmem.com` → No match for domain "VOUCHMEM.COM".

WHAT WOULD CHANGE MY MIND: a "Vouch" trademark covering software in a way that reaches "-mem" names, or a memory/evidence product launching under "vouch" — either flips me to citemem; or owner testing shows people misread it as "voucher".

RUNNERS-UP: citemem (npm/PyPI free, GitHub org free, 2 repos, citemem.com unregistered) · attestmem (npm/PyPI free, GitHub org free, 1 repo).

Note (seat): GitHub search API hit its shared rate limit partway; vouchmem and citemem repo counts are from the first pass.

### Seat 1 — User-advocate

POSITION: Option B (real-word metaphor + suffix) — **witnessmem**.

REASONING: A developer scanning an MCP server list, and an agent reading tool names, must grasp what the tool does from the name alone. "Witness" carries the core promise in one familiar word: a witness gives testimony backed by evidence, and when the evidence no longer matches, the testimony is suspect — exactly the product's "fact goes suspect when code changes" behaviour. The "mem" suffix tells the category with no lookup. Easy to spell, say, and clean on all three registries. I avoided "cite" names because they are a trap: **memcite** exists on PyPI ("attaches a source to each stored memory and checks whether sources are still valid") and **citefold** ("evidence-backed memory for agents") on GitHub/PyPI — near-identical jobs, so "citemem" would be confused on day one. A coined word (Option A) costs every new user a lookup; bare real words (tally, cairn, receipts, alibi) are taken everywhere.

CLAIMS:
npm view witnessmem name → npm error code E404
gh api "search/repositories?q=witnessmem+in:name" --jq .total_count → 0
curl -s -o /dev/null -w '%{http_code}' https://pypi.org/pypi/witnessmem/json → 404
curl -s -o /dev/null -w '%{http_code}' https://pypi.org/pypi/memcite/json → 200
gh api repos/in-toto/witness → in-toto/witness stars=551 "verifies software artifact provenance"

WHAT WOULD CHANGE MY MIND: Users confuse it with in-toto/witness (a provenance tool in the same dev-tooling space) — a 5-developer test where they read "witnessmem" as a supply-chain/attestation tool rather than memory. Then switch to receiptmem ("facts with receipts") despite the spelling risk.

RUNNERS-UP: receiptmem (npm E404, PyPI 404, 2 unrelated GitHub repos) · proofmem (npm E404, PyPI 404, 2 GitHub repos).

### Seat 2 — Contrarian

POSITION: Option (A) coined word — **stillso** ("still so": a fact is served only while its evidence is still so).

REASONING: The obvious picks fail predictably. "tallymem" is free on all three registries but "Tally" already means TallyPrime (huge trademarked accounting software in India) and Tally.so (forms); "-mem" makes it sound like a mem0 clone, and "tally" reads as counting, not evidence. Descriptive names fail worse: **citebound** is what everyone reaches for — citebound.com is an AI-SEO agency and 5 GitHub repos named citebound are citation-grounded RAG tools, an in-category collision. **provenote** is an existing C2PA "claims register" project (same provenance space). **kenning** is antmicro's ML framework. **evicite** reads as "evict". **factcite** collides with FactCite, an existing reference database (unverified; factcite.com redirects to a login). stillso is clean on all three registries; the only GitHub hit is an empty Stillso/Stillso repo, the other 23 are fuzzy matches. It states the core promise (true only while still so) and fits both coding and later chat memory. Weak point is spelling ("stilso"); we'd notice install/search typos in issues — reserve "stilso" on npm too.

CLAIMS:
npm view stillso name → npm error code E404
gh api "search/repositories?q=stillso+in:name" --jq .total_count → 24
curl -s -o /dev/null -w '%{http_code}' https://pypi.org/pypi/stillso/json → 404
curl https://citebound.com title → Citebound - The AI search visibility agency for operators
gh api "search/repositories?q=provenote+in:name" --jq .total_count → 2

WHAT WOULD CHANGE MY MIND: a registered "Stillso" trademark or live company/product, or user tests where most people can't spell it after hearing it once.

RUNNERS-UP: witnessmem (npm E404, gh 0, PyPI 404; risks confusion with in-toto/witness [unverified]) · tallymem (free everywhere, but clashes with Tally brands).

### Seat 4 — Expansionist

POSITION: Option B (real word + suffix) — **kenwise**.

REASONING: For upside, the name should describe knowing, not storage, code or agents. "Ken" means the range of what you know ("beyond my ken"), so it still fits if the product grows from coding-agent facts into chat or personal memory, a hosted "Kenwise Cloud", or an open fact format (`*.ken.md`). It also gives a short CLI and verb, `ken` ("ken it", `ken forget`) — how a brand becomes a verb. Names built on code, mem or cite lock the product into release one. Evidence-word names were taken or already used in AI: evidra (clinical-trials AI company), provyn.dev ("AI Incident Database"), kenning (Antmicro's AI deployment framework, 149★). kenwise is free on npm, PyPI and GitHub; its .com is only a parked drop-catcher registration. Weakness: it does not hint at evidence or "suspect", so the tagline must carry that.

CLAIMS:
`npm view kenwise name` → npm error code E404
`gh api "search/repositories?q=kenwise+in:name" --jq .total_count` → 2 (Iren8/Kenwise 0★, kenwise/hello-world 0★)
`curl -s -o /dev/null -w '%{http_code}' https://pypi.org/pypi/kenwise/json` → 404
`whois kenwise.com` → Registrar: DropCatch.com 1165 LLC, Creation Date: 2021-12-17 (parked, no live site)
CLI/verb `ken` free on npm → [unverified]

WHAT WOULD CHANGE MY MIND: a live AI/knowledge product called Kenwise; or a quick test showing developers can't spell/say it after hearing it once ("ken" too archaic or read as the name Ken) — either moves me to avowd.

RUNNERS-UP: avowd (npm 404, PyPI 404, gh 0; avowd.com is Avow Diagnostics, a food-allergen company) · kenfile (npm 404, PyPI 404, gh 5).

## Diversity check

Real spread: four different names across two options — stillso (A, coined), witnessmem / vouchmem / kenwise (B, real word + suffix), for clearly different reasons (spelling-collision avoidance; instant meaning; search uniqueness + category fit; growth/verb). Re-seated: none.

## Review — mapping (written before dispatch)

Response A = Seat 2 Contrarian (stillso) · Response B = Seat 4 Expansionist (kenwise) · Response C = Seat 1 User-advocate (witnessmem) · Response D = Seat 3 Ecosystem (vouchmem)

Citation slices (disjoint): R1 → A1–A5, B1–B2 · R2 → B3–B5, C1–C4 · R3 → C5, D1–D5

## Reviews

### R2 (slice B3–B5, C1–C4)

CRITIQUE:
Response A: strongest: real collision research on rivals (citebound, provenote, kenning) · weakest: "stillso" is hard to spell after hearing it, and it calls the name "clean" without noting stillso.com has been registered since 2016 (whois: Xin Net).
Response B: strongest: "kenwise" can grow past coding memory · weakest: nothing in the name signals evidence or verification, and the `ken` verb it relies on is taken on npm.
Response C: strongest: names the closest competitor (PyPI memcite: "Repo memory for AI agents — every memory has a source, every source gets verified") and gives a clear metaphor · weakest: "-mem" reads generic, and the in-toto/witness overlap is only half handled.
Response D: strongest: clean on all four registries plus the .com, and the metaphor names the mechanism · weakest: lives in the shadow of Vouch Proxy/Vouch Insurance; admits its GitHub counts may be partial.

BIGGEST BLIND SPOT: B. It never checks the short CLI/verb its case depends on. `ken` is an existing npm package with a `ken` binary.
ALL MISSED: no response ran a trademark search (USPTO/EUIPO) on its pick.
RE-RUN CHECK:
- B3 `curl … pypi/kenwise/json` → 404 — match
- B4 `whois kenwise.com` → Registrar: DropCatch.com 1165 LLC; Creation Date: 2021-12-17T19:06:34Z — match
- B5 `npm view ken name` → ken — MISMATCH (taken: v0.0.34 "Simple web application framework", bin `ken`)
- C1 `npm view witnessmem name` → npm error code E404 … 404 Not Found — match
- C2 `gh api "search/repositories?q=witnessmem+in:name" --jq .total_count` → 0 — match
- C3 `curl … pypi/witnessmem/json` → 404 — match
- C4 `curl … pypi/memcite/json` → 200 — match
FALSE OR UNSUPPORTED CLAIMS: B5 — says "`ken` free on npm", but `npm view ken name` printed `ken`. B's CLI/verb argument rests on it.
FRAMING: leans toward B: "possibly with a suffix/prefix to make it unique" and "tallymem is free".
FINAL RANKING:
1. Response C
2. Response D
3. Response A
4. Response B

### R3 (slice C5, D1–D5)

CRITIQUE:
Response A: strongest: "stillso" states the core promise and argues against rivals with evidence · weakest: hard to spell and say; stillso.com registered since 2016 (Xin Net, no live site).
Response B: strongest: "kenwise" fits if the product moves into chat/personal memory · weakest: says nothing about evidence or suspect facts; `ken` CLI idea is wrong — `ken` is taken on npm.
Response C: strongest: an agent or developer can tell what "witnessmem" does from the name alone; clean on all three registries · weakest: close to in-toto/witness, also a provenance/verification tool.
Response D: strongest: tight logic (unique on exact search, says what it does) and the most fully checked availability (npm, PyPI, GitHub org, .com) · weakest: "Vouch" is crowded; Vouched (vouched.id) does digital identity verification, close to agent trust.
BIGGEST BLIND SPOT: B — recommends `ken` as CLI/verb without checking npm; `ken` is taken ("Simple web application framework", v0.0.34).
ALL MISSED: no response checked trademark classes for software (USPTO/EUIPO class 9/42). Registry availability is not legal clearance.
RE-RUN CHECK:
- C5 `gh api repos/in-toto/witness --jq '.stargazers_count, .description'` → 551 / "Witness is a pluggable framework for software supply chain risk management.  It automates, normalizes, and verifies software artifact provenance." → match
- D1 `npm view vouchmem name` → npm error code E404 … 404 Not Found - GET https://registry.npmjs.org/vouchmem → match
- D2 `gh api "search/repositories?q=vouchmem+in:name" --jq .total_count` → 0 → match
- D3 `curl -s -o /dev/null -w '%{http_code}' https://pypi.org/pypi/vouchmem/json` → 404 → match
- D4 `gh api users/vouchmem --jq .login` → {"message":"Not Found",...,"status":"404"} → match
- D5 `whois vouchmem.com` → No match for domain "VOUCHMEM.COM". → match
- Collision check: none of stillso, kenwise, witnessmem, vouchmem on .com/.dev served a live site (curl 000). whois: witnessmem.com unregistered, stillso.com registered 2016, kenwise.com held by DropCatch since 2021-12-17. No well-known product using any of the four exact names.
FALSE OR UNSUPPORTED CLAIMS: B5 ("`ken` free on npm", [unverified]) is false. Nothing in my slice was wrong.
FRAMING: Mostly neutral; "relatable, catchy" lean slightly away from option A (coined word).
FINAL RANKING:
1. Response D
2. Response C
3. Response A
4. Response B

### R1 (slice A1–A5, B1–B2)

CRITIQUE:
Response A: Strongest: "still so" names the mechanism exactly; checked rival names (citebound, provenote, kenning). Weakest: calls Stillso/Stillso an "empty" repo, but it is 228 KB, and GitHub user Stillso (17 repos, blog www.stillso.com, domain registered 2016) owns both the org name and the .com.
Response B: Strongest: works beyond coding memory; short verb `ken`. Weakest: "ken" is obscure (and Barbie's Ken), says nothing about evidence; "free on GitHub" contradicted by its own B2 — account `kenwise` exists.
Response C: Strongest: tells what it does from the name; found real "cite" collisions (memcite). Weakest: in-toto/witness is nearby provenance space; "witness memory" is an existing forensic-psychology term.
Response D: Strongest: widest availability check (npm, PyPI, GitHub repos and org, .com). Weakest: Vouch Proxy and Vouch Insurance own the root word; may be misread as "voucher".
BIGGEST BLIND SPOT: A — a coined word is worth choosing only if you own its whole namespace; A never checked the GitHub handle or .com, both held by an existing Stillso.
ALL MISSED: no response searched a trademark register (USPTO/EUIPO).
RE-RUN CHECK:
- A1 `npm view stillso name` → "npm error code E404 … stillso - Not found" | match
- A2 `gh api "search/repositories?q=stillso+in:name" --jq .total_count` → 24 | match
- A3 `curl … pypi/stillso/json` → 404 | match
- A4 `curl -sL https://citebound.com | grep -io '<title>…'` → "<title>Citebound - The AI search visibility agency for operators</title>" | match
- A5 `gh api "search/repositories?q=provenote+in:name" --jq .total_count` → 2 | match
- B1 `npm view kenwise name` → "npm error code E404 … kenwise - Not found" | match
- B2 `gh api "search/repositories?q=kenwise+in:name"` → 2; Iren8/Kenwise 0★, kenwise/hello-world 0★ | match
Collision checks: stillso.com registered 2016 (Xin Net), GitHub user Stillso exists; kenwise.com registered 2021 (DropCatch), GitHub user kenwise exists, no company found; witnessmem.com and vouchmem.com unregistered, both GitHub handles free (404); web search for vouchmem / witnessmem returned no product or company.
FALSE OR UNSUPPORTED CLAIMS: A — "only GitHub hit is an empty Stillso/Stillso repo" (size 228; account has 17 repos + stillso.com blog). B — "free on … GitHub" (`gh api users/kenwise` → "kenwise User repos=1"). B5 [unverified] and load-bearing.
FRAMING: leans toward option B: "tallymem is free (npm, PyPI, 0 repos)" and "possibly with a suffix/prefix to make it unique".
FINAL RANKING:
1. Response D
2. Response C
3. Response A
4. Response B

## Claim checks (orchestrator, per name, run 2026-10-21)

| Seat | Claim | Checked with | Line as found | Re-run | Result |
|---|---|---|---|---|---|
| Contrarian | A1 stillso npm free | `npm view stillso name` | E404 | R1: E404 match | kept |
| Contrarian | A2 stillso 24 repos | gh search stillso | (R1 only) | R1: 24 match | kept |
| Contrarian | A3 stillso PyPI free | curl pypi/stillso | (R1 only) | R1: 404 match | kept |
| Contrarian | A4 citebound.com is AI-SEO agency | curl citebound.com title | (R1 only) | R1: match | kept |
| Contrarian | "only hit is an empty Stillso/Stillso repo" | `gh api users/Stillso` | Stillso repos=17 blog=www.stillso.com | R1: size 228, 17 repos | struck — GitHub handle and .com are held by an existing Stillso |
| Expansionist | B1 kenwise npm free | `npm view kenwise name` | (R1) E404 | R1 match | kept |
| Expansionist | "free on GitHub" | `gh api users/kenwise` | kenwise User | R1: user exists | struck — handle taken |
| Expansionist | B5 `ken` CLI free on npm | `npm view ken name` | ken | R2: ken — MISMATCH | struck — re-run disagrees |
| User-advocate | C1 witnessmem npm free | `npm view witnessmem name` | E404 | R2: match | kept |
| User-advocate | C3 witnessmem PyPI free | `curl pypi/witnessmem` | 404 | R2: match | kept |
| User-advocate | GitHub handle / .com | `gh api users/witnessmem`; `whois witnessmem.com` | Not Found; No match for domain "WITNESSMEM.COM". | R1: free | kept |
| User-advocate | C4 memcite exists on PyPI | `curl pypi/memcite` | 200 | R2: match | kept |
| User-advocate | C5 in-toto/witness 551★ provenance | `gh api repos/in-toto/witness` | 551 | R3: match | kept |
| Ecosystem | D1 vouchmem npm free | `npm view vouchmem name` | E404 | R3: match | kept |
| Ecosystem | D3 vouchmem PyPI free | `curl pypi/vouchmem` | 404 | R3: match | kept |
| Ecosystem | D4 GitHub org free | `gh api users/vouchmem` | Not Found | R3: match | kept |
| Ecosystem | D5 .com unregistered | `whois vouchmem.com` | No match for domain "VOUCHMEM.COM". | R3: match | kept |

Not checked by anyone: trademark registers (USPTO/EUIPO) for any name.

## Tally

AVERAGE RANK (lower is better): D (vouchmem) 1.33 · C (witnessmem) 1.67 · A (stillso) 3.0 · B (kenwise) 4.0 — 3 of 3 rankings parsed.
Framing flags: R1 and R2 quote a lean toward option B ("possibly with a suffix/prefix to make it unique", "tallymem is free"); R3 "mostly neutral", slight lean away from A ("relatable, catchy"). → confidence capped at medium.

## Verdict (chairman, fresh subagent — verbatim)

### Framing
Pick one GitHub/npm name for an evidence-gated agent memory package that is unique, relatable and catchy. Two reviewers said the brief leans toward option B ("possibly with a suffix/prefix to make it unique", "tallymem is free"). Nobody searched a trademark register.

### Positions
Ecosystem: "Option B (real word + suffix) — **vouchmem**."
User-advocate: "Option B (real-word metaphor + suffix) — **witnessmem**."
Contrarian: "Option (A) coined word — **stillso** ("still so": a fact is served only while its evidence is still so)."
Expansionist: "Option B (real word + suffix) — **kenwise**."

### Where the members agree
3 of 4 seats chose option B: a real word plus a suffix. All four rejected bare real words (tally, cairn, vouch) because they are taken everywhere. Every reviewer ranked vouchmem and witnessmem as the top two, in one order or the other.

### Where they clash
The real choice is vouchmem against witnessmem. Witnessmem tells a new reader the most. Vouchmem is the best checked: npm, PyPI, GitHub org and .com are all free, and reviewers re-ran each check. Stillso and kenwise lose weight because claims they rested on were struck. An existing Stillso already owns the GitHub handle and stillso.com. The kenwise GitHub handle is taken, and so is `ken` on npm.

### Blind spots
Four read-only checks settled the tie:
- `witness-memory-chain` is already a published npm package. Its GitHub repo calls it "Cryptographically-signed memory storage for AI agents".
- inspeximus, a memory tool already on the brief's list, advertises "witness-backed … receipts".

So "witness" is already used in agent memory, which is exactly the confusion the owner wants to avoid. "Vouch" has only hackathon repos in this space (egbujor-emmanuel/vouch with 1★, and recant, which uses the word "vouches"). Vouch Proxy, Vouch Insurance and Vouched identity verification all sit in other markets.

### Recommendation
**vouchmem**. A fact is served only while its evidence still vouches for it. The name is free on every registry checked.

Confidence: medium — every registry check holds up, but nobody searched a trademark register and the brief leaned toward option B.

### What would overturn it
- A USPTO/EUIPO search finds a live "VOUCH" mark in class 9 or 42 (software) owned by Vouch Insurance or Vouched. Then switch to **citemem**, the Ecosystem seat's runner-up. Its closeness to memcite (a PyPI memory package doing the same job) is a known risk.
- In a test with 5 developers, most read it as "voucher" or can't say what it does. Then switch to witnessmem and accept the witness-memory-chain overlap.
- A memory or agent product called "vouch" launches before the repo exists.

### First step
Search USPTO (tmsearch.uspto.gov) and EUIPO for "VOUCH" in classes 9 and 42. If nothing blocks it, reserve the empty names (`vouchmem` GitHub org, a placeholder npm package and vouchmem.com) before announcing the name. All of these can be released later.

Chairman's checks (read-only): `npm view vouch` → taken; `npm view witness` → taken; gh search "vouch memory agent" 3 hits, "witness memory agent" 11 hits incl. SeMmyT/witness-memory-chain and DanceNitra/inspeximus; only `witness-memory-chain` taken among witness-memory-chain, witness-memory, vouch-memory, vouchmemory, witnessmemory.
Orchestrator re-check: `npm view witness-memory-chain name` → witness-memory-chain ; `gh api repos/SeMmyT/witness-memory-chain --jq .description` → Cryptographically-signed memory storage for AI agents
Memory: mem-council-decision-evidence-gated-memory-package (advisory, local-only)
