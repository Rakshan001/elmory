# Council: build on an existing memory system, borrow from them, or keep the proposed package design

- **Date:** 2026-10-21
- **Status:** advisory — not acted on
- **Tier:** standard
- **Run:** 4 seats (4 subagent; seat 4 User-advocate re-seated as Security) · review 3/3 · diversity re-seated, consensus survived
- **Degraded:** framing lean flagged by 2 reviewers (medium cap); external research relayed
- **Prior verdict:** `mem-council-decision-memory-package-components-and` (2026-10-08, medium, advisory) — re-run on the owner's request with fresh live research (13 days since; none of its overturn conditions has been tested). Members are not told the prior recommendation.

## Question (as asked)

"so now tell me is there any this type of memory available in internet better vesion of this this compare to this /llm-council i want to improve this"

Clarifying question asked: re-run vs keep prior verdict → "Re-run with fresh research (Recommended)".

## Research (fresh, 2026-10-21)

Three research agents (open-source coding memory · hosted coding tools · code-coupled docs, git-native metadata, re-anchoring, formats). Summaries below; their full reports are in the session record.

### R-A — open-source coding memory (agent report, key source lines re-checked by orchestrator)

Closest: **coldstart** (AkashGoenka/coldstart, MIT, TS, 11 stars, v2.3.4 2026-09-29, @b1d0412) — committed append-only `.coldstart/notebook/.raw/<id>.jsonl`, rendered `.md` gitignored; whole-file sha256 checked at read; states fresh/changed/missing/moved; code injects hashes, agent never writes one; absence notes; no LLM. **Graphicle** (Graphicle-AI/graphicle, Apache-2.0, Rust, 333 stars, created 2026-10-14, @8a5df4a) — SQLite in app-data, symbol-level anchors, transitive BFS invalidation, stale withheld. **memwarden** (saiyam1814/memwarden, Apache-2.0, TS, 16 stars, v0.2.0 2026-10-06, @4a12fd0) — libSQL in ~/.memwarden, hash-chained op log, per-file sha256, states verified/cosmetic/sourced_unverified/stale/unsourced, worktree-aware verification, local MiniLM. **Memorix** now @f9dc4b2 (v1.9.12): still SQLite/Orama, no in-repo Markdown; roadmap adds "Context Receipt" (why each memory was served/omitted) and candidate→qualified→durable. **Kage** now GPL-3.0, OKF Markdown in `.agent_memory/packets/`, citations checked at write/recall/diff, BM25. **mcp-memory** (MIT, Python) OKF v0.2 + FTS5, no code evidence. **agent-memory** (Go, Apache-2.0) Markdown + FTS5 shadow, propose→review→apply, Jaccard dup, secret reject. **agentmemory** (29.7k stars) SQLite, BM25+vector+graph, no hash invalidation. **Agent Memory Repo** (Cognition spec) MEMORY.md one-liners with source/added, cleanup by a "Dreaming" agent.
Re-checked by orchestrator:
- grep -n "createHash('sha256')" coldstart/src/kb/freshness.ts → 31:    return 'sha256:' + createHash('sha256').update(buf).digest('hex').slice(0, 12);
- grep -n "state = 'moved'" coldstart/src/kb/freshness.ts → 51:        state = 'moved';
- grep -n "never" coldstart/src/kb/raw-log.ts → 5: * live hash for every path the agent marked `verified` (the agent never writes | 7: * are skipped with a warning, never a hard error — the log is a forever-format
- grep -n "pub fn invalidate_source(" graphicle/crates/graphicle/src/invalidation.rs → 108:pub fn invalidate_source(
- grep -n "\"cosmetic\"" memwarden/src/functions/verify.ts → 115:  | "cosmetic" | 321:      status: "cosmetic",
- grep -n "verifyAgainstRoot" memwarden/src/functions/verify.ts → 177, 215, 223, 240 (4 hits)
None does all of: OKF Markdown in repo + content-hash evidence + stale withholding under a permissive licence (Kage closest, GPL); early-cutoff invalidation walk; agent-written consolidation with code-checked source ids; SQLite purely as rebuildable cache.

### R-B — hosted coding tools + papers (agent report, not re-checked; URLs in session record)

Only **GitHub Copilot Memory** ties memory to code: model-written facts with code citations, "checks those citations against the current branch … Only validated facts are used", unused facts deleted after 28 days; on contradiction stores a corrected memory; GitHub reports PR merge 90% vs 83%. Cursor (MEMORIES.md for automations, Projects), Windsurf (local, not committed), Devin Knowledge (cloud, repo-pinned), Claude Code (CLAUDE.md + machine-local auto memory), Codex (~/.codex/memories, idle background job, redacts secrets), Gemini Code Assist (learns only from merged PRs), Augment (human Approve/Edit/Discard per memory), Kiro (`.kiro/steering/`, fileMatch scoping), Cline Memory Bank (repo Markdown, manual) — none ties memory to code evidence. No hosted tool stores machine-written memory as reviewable repo files.
Papers: **Planfence** arXiv 2609.03340 — TTL freshness caught 0/30 conflicts, input-provenance check caught 30/30 at ~1/10 the traffic. **MemTrace** arXiv 2610.04838 — records anchored to files, symbols and tests; 57% of records had a bound file change; "an unchanged target function alone is insufficient" (dependencies matter); links between records 32.1→44.2, plus repo-structure layer →56.6 DeepSWE pass@1; records alone below the 35.4 baseline. **STALE** arXiv 2605.06527 — best model noticed silent invalidation 55.2%.

### R-C — code-coupled docs, git-native metadata, re-anchoring, formats (agent report, key lines re-checked)

Swimm Auto-sync (patented, algorithm undocumented). **docrot** (MIT, Python) — AST-normalised symbol hash, RESOLVED/BROKEN/UNKNOWN with UNKNOWN silent, history gate ("valid when written?"). **Gerrit GitPositionTransformer** — follows renames, shifts positions through diff hunks, conflict only on overlap; drop or keep-as-file-level strategies. GitHub PR comments keep original_line/original_commit_id + current line. `git log -L :func:file` tracks function ranges without a parser. SCIP symbol grammar (needs an indexer). Agent Trace (Cursor RFC) — line range + per-range content_hash to follow moved code. **Beads** demoted JSONL-in-git to optional export; Dolt is primary. git-bug op-based CRDT in refs; git-appraise git notes with cat_sort_uniq. OKF still v0.2, no spec merge since 10-08; open #437 `revision: "sha256:…"`, #438 excerpt, #120/#463 relationships.
Suggested cheapest robust path for zero-dep TS (agent's inference): {path, line range, hash of normalised range text}; `git diff -M -U0` + Gerrit-style shifting; suspect only on hunk overlap; relocate by range hash before declaring lost.
Re-checked by orchestrator:
- grep -n "include_attributes=False" docrot/src/docrot/rules/anchors.py → 65:            return hashlib.sha256(ast.dump(node, include_attributes=False).encode()).hexdigest()
- grep -n "Dolt is the primary datastore" beads/CHANGELOG.md → 6613:  Dolt is the primary datastore. `.beads/issues.jsonl` is now treated as an
- grep -n "If a position overlaps" GitPositionTransformer.java → 61: *       shift each encountered position by the currently tracked amount. If a position overlaps
- grep -n "BestPositionOnConflict" GitPositionTransformer.java → 646:  public enum BestPositionOnConflict implements PositionConflictStrategy { (first of hits shown)
- grep -rn "OKF version" knowledge-catalog --include=SPEC.md → knowledge-catalog/okf/SPEC.md:768:This document specifies OKF version **0.2**. Revisions are versioned as

## Brief

DECISION: For the owner's planned open-source memory package (to be used inside Baton), choose the base: build on an existing system, build the proposed design, build a modified version of the proposed design, or keep extending Baton's in-tree memory.

OPTIONS (neutral order):
A. Build on (fork or contribute to) an existing open-source system — candidates found 2026-10-21: coldstart (MIT, TypeScript), memwarden (Apache-2.0, TypeScript), Graphicle (Apache-2.0, Rust), Memorix (Apache-2.0, TypeScript).
B. The proposed package design as written: OKF v0.2 Markdown fact files committed in the project's repo; per-fact evidence = file path + content hash at write time; a reverse index (file -> facts) marks facts `suspect` when an evidence file's hash changes (breadth-first, stops when a re-checked fact is unchanged); entity -> facts hash map + SQLite FTS5 BM25 as a rebuildable cache; `candidate` state + frontmatter lint + duplicate check + secret redaction; archive instead of delete; consolidation written by the user's own agent with source fact ids checked by code; no embeddings and no model inside the core.
C. The proposed design changed by mechanisms taken from other systems (which ones, if any, is part of the answer).
D. Status quo: keep improving Baton's existing memory module (src/memory.ts) inside Baton, no separate package.

CONSTRAINTS:
- Baton is AGPL-3.0-or-later (package.json "license"); the package licence is the owner's decision.
- Baton conventions: daemon stays zero-dependency raw node:http; git calls go through src/util/exec.ts; strict TypeScript; local and offline use must work.
- Owner's design rules: a model may reorganise memory but never originate facts; no invented progress/savings numbers.
- The owner wants to design their own evidence-based linking/unlinking algorithm and plans to add a new memory type not yet specified.
- Nothing is built yet; no spec exists.

STAKES: A published fact format is costly to change once other projects store facts in it. A staleness rule that is too loose serves facts the code no longer supports; one that is too strict marks so many facts suspect that agents stop using memory. Building on an external base ties Baton to that project's licence, language, storage and roadmap; building alone costs months of maintenance.

GROUNDING (Baton code, checked 2026-10-21 by the orchestrator):
- grep -n "sha1" src/memory.ts → 36:  hash: string; // sha1 of content at save time ('' = file was absent) | 145: … | 653:const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12); | 663:    const hash = sha1(await readFile(abs)); | 761: … (5 hits)
- grep -n "COMPUTED, never read from the file" src/memory.ts → 377:      // COMPUTED, never read from the file. The fingerprint is not a label,
- grep -n "FTS5" src/memory.ts → 1170:    // BM25 (FTS5) with synonym/identifier expansion; scoreMemory is its fallback.
- grep -n "staleGrounding" src/memory.ts → 1029, 1164, 1188 (+1; 4 hits) — stale facts are withheld from `facts` and returned separately as re-grounding hints.
- grep -c embedding src/memory.ts → 0
- wc -l src/memory.ts → 1655
- git ls-files baton/memory .baton/memory | wc -l → 0 (fact files are not tracked in git today); ls baton/memory/facts | wc -l → 21
- package.json dependencies: @modelcontextprotocol/sdk, commander, execa, gray-matter, zod

GROUNDING (external, research 2026-10-21; clones under <scratchpad>/survey2/ — lines re-checked by the orchestrator unless marked relayed):
- coldstart @b1d0412 (MIT, TS, 11 stars, v2.3.4 2026-09-29): notes committed as append-only JSONL `.coldstart/notebook/.raw/<id>.jsonl`, rendered .md gitignored [relayed]; src/kb/freshness.ts:31 "return 'sha256:' + createHash('sha256').update(buf).digest('hex').slice(0, 12);"; :51 "state = 'moved';" (states fresh/changed/missing/moved); src/kb/raw-log.ts:5 "live hash for every path the agent marked `verified` (the agent never writes"; supports "X does not exist" notes [relayed]; uses tree-sitter + ripgrep, no LLM [relayed].
- memwarden @4a12fd0 (Apache-2.0, TS, 16 stars, v0.2.0 2026-10-06): libSQL in ~/.memwarden with hash-chained op log [relayed]; src/functions/verify.ts:115 '| "cosmetic"' (states verified/cosmetic/sourced_unverified/stale/unsourced); :177 "verifyAgainstRoot?: boolean;" (checks evidence against the caller's worktree); :303 'return { status: "stale", reason: `references files that no longer match (${parts.join("; ")})` };'; local MiniLM embeddings [relayed].
- Graphicle @8a5df4a (Apache-2.0, Rust, 333 stars, repo created 2026-10-14): SQLite in app-data; memories anchored to symbols; crates/graphicle/src/invalidation.rs:108 "pub fn invalidate_source(" with :116 "let mut queue: VecDeque<(String, String)> = VecDeque::new();" (transitive BFS, no early cutoff [relayed]).
- Memorix @f9dc4b2 (Apache-2.0, TS, 853 stars, v1.9.12 2026-10-20): SQLite/Orama store, not in-repo Markdown; roadmap adds a "Context Receipt" (what was served or left out and why) and candidate→qualified→durable [relayed].
- Kage (now GPL-3.0): OKF Markdown in `.agent_memory/packets/`, citations checked at write, recall and diff, BM25 [relayed]. mcp-memory (MIT, Python): OKF v0.2 + FTS5, no code evidence [relayed]. agent-memory (Go, Apache-2.0): Markdown + FTS5, propose→review→apply [relayed].
- docrot @7a93efc (MIT, Python): src/docrot/rules/anchors.py:65 "return hashlib.sha256(ast.dump(node, include_attributes=False).encode()).hexdigest()" (structural symbol hash: formatting/comment edits do not invalidate); three-state RESOLVED/BROKEN/UNKNOWN with UNKNOWN silent; "valid when written?" history gate [relayed].
- Gerrit GitPositionTransformer (master 5d66555): line 61 "shift each encountered position by the currently tracked amount. If a position overlaps" — positions shift through diff hunks; only an overlapping hunk is a conflict; :646 "public enum BestPositionOnConflict implements PositionConflictStrategy {".
- Beads @e3a37f9: CHANGELOG.md:6613 "Dolt is the primary datastore. `.beads/issues.jsonl` is now treated as an" (JSONL-in-git demoted to optional export).
- OKF (knowledge-catalog @5d1345c): okf/SPEC.md:768 "This document specifies OKF version **0.2**. Revisions are versioned as"; open proposals #437 (`revision: "sha256:…"` on verification events), #120/#463 (relationships) [relayed]; spec tolerates unknown keys §4.1 [relayed].
- Hosted [relayed, docs opened by a research agent]: GitHub Copilot Memory — model-written facts with code citations; "checks those citations against the current branch to confirm the information is still accurate. Only validated facts are used."; unused facts deleted after 28 days; on contradiction stores a corrected memory. No other hosted tool surveyed (Cursor, Windsurf, Devin, Claude Code, Codex, Gemini Code Assist, Augment, Kiro, Cline) ties memory to code evidence; none stores machine-written memory as reviewable repo files.
- Papers [relayed]: Planfence arXiv 2609.03340 — time-based freshness caught 0/30 conflicts, input-provenance check 30/30 at ~1/10 the traffic. MemTrace arXiv 2610.04838 — memory anchored to files, symbols and tests; 57% of records had a bound file change later; "an unchanged target function alone is insufficient"; links between records 32.1→44.2, plus repo-structure layer →56.6 DeepSWE pass@1; records alone below the 35.4 baseline. STALE arXiv 2605.06527 — best model noticed silently invalidated memory 55.2% of the time.

OUT OF SCOPE: whether Baton should have memory at all; the package licence; chat/RAG support; the graph-view UI; the owner's future memory type (not yet defined).

## Seats

Tier: standard — 4 members + 3 reviewers + 1 chairman = 8 agent calls (plus 3 research agents before framing).

| # | Lens | Seat type | Model / provider | Tension with |
|---|---|---|---|---|
| 1 | Ecosystem | subagent | host | Maintainer (community leverage vs owning the code) |
| 2 | Maintainer | subagent | host | Ecosystem, User-advocate (monthly upkeep vs reuse / user value) |
| 3 | Contrarian | subagent | host | the owner's favoured option (building their own improved version) |
| 4 | User-advocate | subagent | host | Maintainer (what the agent and developer get vs code cost) |

## Answers

### Seat 1 — Ecosystem
POSITION: C. Build the proposed design, but make it conform to OKF on the wire. Map `candidate` to OKF `status: draft` and archive to `status: deprecated`. Store evidence as algorithm-prefixed `sha256:` strings, the shape used by OKF proposal #437 and coldstart. Keep `suspect` in an extension key, and offer that evidence block upstream to OKF instead of forking any candidate repo.

REASONING: The fact format will outlive any library choice, so it should follow a written standard. Most option-A bases are tiny or brand new: coldstart has 11 stars, memwarden 16, and Graphicle (Rust) is a week old. Memorix is the mature one, but it stores facts in SQLite, not in the repo. Forking any of them ties Baton to a roadmap it does not control. OKF already gives the needed hooks: it has lifecycle states and it must accept extra keys. Its only built-in staleness rule is time-based. Planfence (relayed) found time-based freshness caught 0 of 30 conflicts, so code evidence is the gap worth filling and proposing upstream. Do not invent parallel status values that other OKF readers would misread. Change Baton's 12-character, unprefixed sha1 to prefixed sha256 now, while no stored fact depends on it. Also borrow coldstart's `moved`/`missing` states and docrot's structural hash.

CLAIMS:
1. OKF accepts extra keys: knowledge-catalog/okf/SPEC.md:206 — "SHOULD preserve unknown keys when round-tripping and MUST NOT reject" (absolute path: <scratchpad>/survey2/knowledge-catalog/okf/SPEC.md)
2. OKF lifecycle states (same file):415 — "status: stable        # draft | stable | deprecated"
3. OKF staleness is time-based only (same file):427 — "stale_after: 2026-09-23T00:00:00Z   # content is stale on/after this instant"
4. <scratchpad>/survey2/coldstart/src/kb/freshness.ts:31 — "return 'sha256:' + createHash('sha256').update(buf).digest('hex').slice(0, 12);"
5. src/memory.ts:653 — "const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);"

WHAT WOULD CHANGE MY MIND: Any of these would flip me:
- OKF maintainers reject or stall #437 and the relationship proposals (#120/#463).
- OKF stops being maintained.
- Memorix adopts in-repo Markdown with code-evidence fields.

If OKF weakens, I would design a format of our own. If Memorix moves to repo files, contributing to it (option A) wins.

### Seat 2 — Maintainer
POSITION: C, built by extraction rather than from scratch. Lift Baton's existing memory core into the package and keep design B's format. Borrow only two small state rules: docrot's silent UNKNOWN verdict for unanchorable evidence and coldstart's `moved` state. Put a format-version key in every fact file from day one. Reject A.

REASONING: Each option has a monthly cost. A means owning foreign code. Three of the four candidates have 11 to 853 stars, and Graphicle is Rust, which adds a second toolchain to a strict-TS repo. Two of them keep memory in out-of-repo databases. Whoever maintains Baton would then be tracking someone else's roadmap and storage migrations. A from-scratch B rewrites about 2,200 lines that already exist in TypeScript and already run on Node built-ins (node:sqlite, node:crypto) plus gray-matter. D never puts a package boundary in place, and the owner's own linking algorithm and new memory type need that seam. The coupling to cut is small: identity.js, util/exec.js, and the 9 modules that import memory.js. Once that boundary exists, both the owner's algorithm and the new type plug in behind one interface. Keep the borrowings small, because a published format freezes whatever goes into it.

CLAIMS:
1. The ranking layer uses built-in SQLite and adds no dependency: src/memory-rank.ts:29 — "_sqlite = nodeRequire('node:sqlite') as typeof import('node:sqlite');"
2. The memory core is coupled to Baton identity: src/memory.ts:26 — "import { readAuthor, resolveAuthor, UNKNOWN_AUTHOR } from './identity.js';"
3. A staleness verdict already exists in-tree: src/memory-repair.ts:133 — "export function assessAnchor(fact: string, input: AnchorInput): AnchorVerdict {"
4. docrot treats unanchorable evidence as a quiet third state: <scratchpad>/survey2/docrot/src/docrot/rules/anchors.py:93 — "return Resolution(ref, Verdict.UNKNOWN, boundary="anchor:no-hash")"
5. coldstart distinguishes a moved file from a changed one: <scratchpad>/survey2/coldstart/src/kb/freshness.ts:51 — "state = 'moved';"

WHAT WOULD CHANGE MY MIND: A candidate with a second active maintainer and a stable on-disk format, written in TypeScript and storing in-repo text, would flip me to A. Evidence that src/memory.ts cannot be separated from Baton in about a week of work would flip me to greenfield B.

### Seat 3 — Contrarian
POSITION: C. Keep B's repo-committed fact files, but anchor evidence to a symbol or hunk instead of hashing the whole file, and hash in the writer's worktree.

REASONING: B's evidence check is a whole-file hash, which Baton already runs today. Any edit anywhere in an anchored file marks the fact suspect. On this repo that means a flood of suspect facts, not occasional staleness. I measured the 17 tracked facts that have anchors: 8 of them point at a file with at least 10 commits in the last 90 days. `src/server.ts` has 44 commits in that window, about one every two days. B's breadth-first cascade then carries that suspicion into linked facts. STALE found the best model noticed invalidated memory only 55.2% of the time [relayed], so agents will rarely re-check a suspect fact. More likely they will stop calling recall. The fact format would be published before anyone sees that happen.

There is a second, quieter failure. Baton hashes against the main checkout, not the agent's worktree. A fact saved in a worktree records main's old hash, then goes stale the moment its own branch merges.

The fix is to borrow two mechanisms. docrot's structural hash ignores formatting and comment edits. Gerrit-style hunk overlap marks a fact suspect only when an edit touches its region. Pair them with memwarden's per-worktree check (`verifyAgainstRoot`).

How we'd notice: log the suspect share of facts per week, and how often recall is called. If the suspect share keeps rising while recall calls fall, the rule is too strict.

CLAIMS:
src/memory.ts:663 — "const hash = sha1(await readFile(abs));" (the hash covers the whole file)
src/memory.ts:970 — "staleReason = now === '' ? `${a.path} no longer exists` : `${a.path} changed since this was saved`;"
src/memory.ts:968 — "const now = await fileHash(mainRoot, a.path);"
src/memory.ts:447 — "const main = await mainRepoRoot(root);"
<scratchpad>/survey2/docrot/src/docrot/rules/anchors.py:65 — "return hashlib.sha256(ast.dump(node, include_attributes=False).encode()).hexdigest()"

WHAT WOULD CHANGE MY MIND: Replay 90 days of Baton history over the existing facts. If whole-file hashing leaves under 15% of facts suspect in a typical week, or agents fix the suspect facts as fast as edits create them, then B as written is fine.

### Seat 4 (replaced in diversity re-seat) — User-advocate
POSITION: C. Keep B's reviewable in-repo OKF fact files, and change its staleness rule so that cosmetic and rename edits stop flooding agents with suspects. Borrow three tests: docrot's structural symbol hash, memwarden's "cosmetic" tier and per-worktree check, and coldstart's "moved" state. Add a receipt of what was served or withheld, and import Baton's existing facts without loss.

REASONING: The user loses most when staleness is too strict. B hashes the whole file, so any edit to a file marks every fact that cites it suspect. MemTrace found that 57% of records had their bound file change later. Under B, agents learn that memory is mostly suspect and stop calling it. Developers then pay for a memory they never get to use. Structural hashes, a cosmetic tier and rename following cut those false alarms. A plain file-hash change should stay as a low-severity "nearby code changed" flag, because MemTrace also says an unchanged target function is not enough on its own.

Option A takes away the user's trust surface. memwarden and Memorix keep facts in stores outside the repo, so nobody reviews a fact in a PR. Option D keeps Baton's users stuck with one tool. Baton already withholds stale facts and returns them as re-grounding hints, and users should keep that. A receipt also lets them see why a fact was held back. Baton runs agents in worktrees, so the check has to run against each agent's own worktree.

CLAIMS:
- <scratchpad>/survey2/docrot/src/docrot/rules/anchors.py:65 — "return hashlib.sha256(ast.dump(node, include_attributes=False).encode()).hexdigest()"
- <scratchpad>/survey2/memwarden/src/functions/verify.ts:7 — "//   cosmetic           normalized text matches capture; only line endings or"
- <scratchpad>/survey2/coldstart/src/kb/freshness.ts:51 — "state = 'moved';"
- <scratchpad>/survey2/memwarden/src/functions/verify.ts:177 — "verifyAgainstRoot?: boolean;"
- src/memory.ts:1188 — "const staleGrounding = groundStale(staleAll, opts.topic, review?.id);"

WHAT WOULD CHANGE MY MIND: Replay B's whole-file rule over Baton's real git history against the 21 existing facts. If it marks under about 10% of facts suspect per week, B as written is fine for users. If developers turn out not to review fact files in PRs, A's out-of-repo stores lose nothing that users value.

## Diversity check

All four POSITION lines chose C. Seats 1 (OKF wire conformance, upstream contribution) and 2 (extract Baton's existing core, minimal borrowing) reach it for clearly different reasons. Seats 3 and 4 are near-duplicates: same position, same reasons (whole-file hashing floods suspects; structural hash + per-worktree check) and an overlapping citation (docrot anchors.py:65). Re-seat once: keep seat 3 (Contrarian, in the library-choice default seating); replace seat 4 User-advocate with its "pulls against" partner Security (Maintainer already seated). Seat 4's answer above is kept for the record and excluded from review.

### Seat 4 (re-seat) — Security
POSITION: C. Build the proposed design, but treat every committed fact file as untrusted input. Code computes the evidence hashes (coldstart-style, at write time). Freshness is checked against the caller's own worktree (memwarden's `verifyAgainstRoot`). Evidence paths stay inside the repo. "Fresh" never means "trusted". I treat these as a veto on B as written.

REASONING: B commits facts to the repo, so a `git pull` delivers text straight into agents' prompts. A fresh hash only proves the file hasn't changed since the fact was written. It does not prove the claim is true. Anyone with commit access can write a false fact with correct current hashes, and it gets served as "fresh". Baton already found this boundary for fingerprints and slug ids. Its anchor paths still cross it: pulled paths are parsed without any filter and then hashed. So the package must:
- re-check evidence paths at parse time, not only at save time;
- recompute every hash in code and never trust a stored hash on a fact the local agent did not write;
- keep `candidate` as the default state for facts that arrived by pull.

A plain fork (A) would bring in another project's storage, embeddings and supply chain with no gain at this trust boundary. D leaves the hole where it is.

CLAIMS:
Anchor paths from a pulled file are kept with no path check: src/memory.ts:364 — "return at > 0 ? [{ path: s.slice(0, at), hash: s.slice(at + 1) }] : [];"
Those paths are then hashed against the repo root: src/memory.ts:968 — "const now = await fileHash(mainRoot, a.path);"
Baton already treats pulled fact files as hostile for grouping: src/memory.ts:382 — "// could name the group holding knowledge it has nothing to do with."
<scratchpad>/survey2/coldstart/src/kb/raw-log.ts:5 — "live hash for every path the agent marked `verified` (the agent never writes"
<scratchpad>/survey2/memwarden/src/functions/verify.ts:215 — "if (opts?.verifyAgainstRoot && cwdInRepo !== undefined) {"

WHAT WOULD CHANGE MY MIND: I would accept B as written if the owner keeps fact files out of git (local-only), so nothing crosses a pull. I would also accept it if a test shows that a fact file with traversal paths and planted hashes, arriving by pull, is held as `candidate` or refused rather than served.

Re-seat result: Security also chose C, for a different reason (pulled fact files are an untrusted input; fresh ≠ true). **Consensus on C survived a re-seat.** The seats differ on *which* changes C needs.

## Peer review

**Anonymization mapping** (shuffled; letters W–Z chosen so they do not collide with options A–D): W = seat 2 Maintainer · X = seat 4 Security · Y = seat 3 Contrarian · Z = seat 1 Ecosystem
Reviewers: fresh subagents R1..R3
**Citation slices** (disjoint): R1 = W1–W5, X1–X2 · R2 = X3–X5, Y1–Y4 · R3 = Y5, Y6 (server.ts commit count), Z1–Z5. Each reviewer asked to re-run its whole slice.

### Reviewer R1
CRITIQUE:
Response W: strongest: extracting the existing ~2,200 TS lines is cheap and verified (memory*.ts total 2192). Weakest: it calls the coupling "small" with "9 modules", but 21 non-test files import memory.js. It also inherits the whole-file sha1 staleness rule without examining it.
Response X: strongest: verified that parseFactFile keeps pulled anchor paths with no containment check, and fileHash does `join(mainRoot, relPath)`. Weakest: the threat ("anyone with commit access") is a weak adversary. Calling it a "veto" overstates a fixable bug.
Response Y: strongest: whole-file hash plus main-root hashing (save at :717 uses fileHash(mainRoot,…)) addresses the "too strict" stake directly, with a falsifiable replay test. Weakest: "17 tracked facts"/commit counts are self-measured and unverified, and the brief says 0 facts are git-tracked.
Response Z: strongest: OKF conformance for a format that is costly to change. All three OKF lines are verified. Weakest: it ties the base to unaccepted proposals (#437) and offers no mechanism against suspect-floods.

BIGGEST BLIND SPOT: W. It lifts the core as is, so it carries the whole-file hash and the main-checkout hashing straight into a published package.

ALL MISSED: merge conflicts and duplicate ids when parallel worktree agents commit fact files and the index on separate branches. This is coldstart's reason for append-only JSONL.

RE-RUN CHECK:
W1 `grep -nF "_sqlite = nodeRequire('node:sqlite') as typeof import('node:sqlite');" src/memory-rank.ts` → `29:      _sqlite = nodeRequire('node:sqlite') as typeof import('node:sqlite');` match
W2 `grep -nF "import { readAuthor, resolveAuthor, UNKNOWN_AUTHOR } from './identity.js';" src/memory.ts` → `26:import { readAuthor, resolveAuthor, UNKNOWN_AUTHOR } from './identity.js';` match
W3 `grep -nF "export function assessAnchor(fact: string, input: AnchorInput): AnchorVerdict {" src/memory-repair.ts` → `133:export function assessAnchor(fact: string, input: AnchorInput): AnchorVerdict {` match
W4 `grep -nF 'return Resolution(ref, Verdict.UNKNOWN, boundary="anchor:no-hash")' …/docrot/src/docrot/rules/anchors.py` → `93:        return Resolution(ref, Verdict.UNKNOWN, boundary="anchor:no-hash")` match
W5 `grep -nF "state = 'moved';" …/coldstart/src/kb/freshness.ts` → `51:        state = 'moved';` match
X1 `grep -nF "return at > 0 ? [{ path: s.slice(0, at), hash: s.slice(at + 1) }] : [];" src/memory.ts` → `364:          return at > 0 ? [{ path: s.slice(0, at), hash: s.slice(at + 1) }] : [];` match
X2 `grep -nF "const now = await fileHash(mainRoot, a.path);" src/memory.ts` → `968:      const now = await fileHash(mainRoot, a.path);` match

FALSE OR UNSUPPORTED CLAIMS:
- W: "the 9 modules that import memory.js" is false. `grep -rlE "from '(\./|\.\./)+memory\.js'" src` lists 21 non-test files (storage.ts, spawn.ts, mcp.ts, server.ts, handoff/*, kb/*, …).
- Y: "17 tracked facts", "8 … ≥10 commits", "src/server.ts has 44 commits" are [unverified]. "Tracked" conflicts with the brief's `git ls-files baton/memory … → 0`.
- Y/Z: STALE 55.2% and Planfence 0/30 are [relayed].

FRAMING: slight lean toward C. "building alone costs months of maintenance" counts against B/D, and the grounding lists borrowable external mechanisms at length.

FINAL RANKING:
1. Response Y
2. Response Z
3. Response X
4. Response W

### Reviewer R2
CRITIQUE:
Response W: strongest: reusing about 2,200 lines of working TypeScript is cheaper than a rewrite and still puts a package boundary in place. Weakest: the "9 modules" and "about a week" figures are unverified, and lifting the core as it is would carry its known flaws into a published format.
Response X: strongest: it finds a real trust gap that I confirmed. parseFactFile (memory.ts:360-365) keeps anchor paths without the `..`/absolute filter that save applies at :283 and :1293, and fileHash joins them blindly. Weakest: it is narrow and says nothing about how strict the staleness rule should be or about the format.
Response Y: strongest: it goes straight at the stake of a rule that is too strict, offers a measurement and a way to notice failure, and finds the main-checkout hashing problem, which I verified (resolveRoot→mainRepoRoot). Weakest: "17 tracked facts" conflicts with git ls-files = 0. Symbol and AST hashing (docrot) needs a parser for each language.
Response Z: strongest: the format outlives the code, so it aligns with OKF before anything is published. Weakest: it bets on OKF proposals that have not been accepted, and draft/deprecated may not mean the same as candidate/archive.

BIGGEST BLIND SPOT: W lifts the existing core without seeing that this freezes whole-file, main-checkout hashing and unfiltered pulled paths into the published package.

ALL MISSED: merge conflicts and id collisions when committed fact files are edited on parallel worktree branches.

RE-RUN CHECK:
X3 `grep -nF "could name the group holding knowledge it has nothing to do with." src/memory.ts` → `382:      // could name the group holding knowledge it has nothing to do with.` match
X4 `grep -nF 'live hash for every path the agent marked \`verified\` (the agent never writes' …/coldstart/src/kb/raw-log.ts` → `5: * live hash for every path the agent marked \`verified\` (the agent never writes` match
X5 `grep -nF "if (opts?.verifyAgainstRoot && cwdInRepo !== undefined) {" …/memwarden/src/functions/verify.ts` → `215:  if (opts?.verifyAgainstRoot && cwdInRepo !== undefined) {` match
Y1 `grep -nF "const hash = sha1(await readFile(abs));" src/memory.ts` → `663:    const hash = sha1(await readFile(abs));` match
Y2 `grep -nF 'staleReason = now === '' ? \`${a.path} no longer exists\` : \`${a.path} changed since this was saved\`;' src/memory.ts` → `970:        staleReason = now === '' ? \`${a.path} no longer exists\` : \`${a.path} changed since this was saved\`;` match
Y3 `grep -nF "const now = await fileHash(mainRoot, a.path);" src/memory.ts` → `968:      const now = await fileHash(mainRoot, a.path);` match
Y4 `grep -nF "const main = await mainRepoRoot(root);" src/memory.ts` → `447:  const main = await mainRepoRoot(root);` match

FALSE OR UNSUPPORTED CLAIMS: none of the citations is false. Unsupported claims:
- Y's "17 tracked facts": `git ls-files baton/memory | wc -l` prints 0.
- Y's "44 commits" for src/server.ts: `git log --since=90.days` prints 43, which is close but not exact.
- W's "~2,200 lines / 9 modules" is unverified.

FRAMING: Mostly neutral. Only B gets a full spec, and the grounding loads evidence-binding papers ("input-provenance check 30/30"), which leans toward B/C.

FINAL RANKING:
1. Response Y
2. Response X
3. Response Z
4. Response W

### Reviewer R3
CRITIQUE:
Response W: strongest: it extracts the ~2,192 lines that already exist (`wc -l src/memory*.ts` gives 2192; 9 modules import memory.js) instead of rewriting them, and it adds a format-version key. Weakest: it never says whether whole-file hashing is too strict, which is the staleness risk the brief names.
Response X: strongest: a fresh hash proves nothing about whether a pulled fact is true. Weakest: it calls the traversal gap a "veto", but `fileHash` only compares the hash (join + readFile), so the leak is a small existence/change oracle. The fix is a path check, not a redesign.
Response Y: strongest: whole-file hashing on churning files plus the BFS cascade could flood facts with suspect flags. It also spotted that hashing uses mainRoot, not the worktree. Weakest: the 44-commit figure is now 43, and its "8 of 17" measurement is [unverified].
Response Z: strongest: if the fact format must outlive the library, OKF conformance (draft/deprecated, prefixed sha256) is the low-regret choice. Weakest: it ties its verdict to upstream proposals (#437) that are only [relayed].

BIGGEST BLIND SPOT: Z. It optimises the wire format but ignores how strict staleness is and the gap between worktree and main.

ALL MISSED: merge conflicts in committed fact files when parallel worktrees edit the same fact or index.

RE-RUN CHECK:
- Y5 `grep -nF "return hashlib.sha256(ast.dump(node, include_attributes=False).encode()).hexdigest()" …/docrot/src/docrot/rules/anchors.py` → `65:            return hashlib.sha256(ast.dump(node, include_attributes=False).encode()).hexdigest()`. Match.
- Y6 `git -C … log --since="90 days ago" --oneline -- src/server.ts | wc -l` → `43`. Mismatch (claimed 44). The oldest commit in the window is 2026-07-23, so one commit probably aged out of the 90-day window.
- Z1 `grep -nF "SHOULD preserve unknown keys when round-tripping and MUST NOT reject" …/okf/SPEC.md` → `206:SHOULD preserve unknown keys when round-tripping and MUST NOT reject`. Match.
- Z2 `grep -nF "status: stable        # draft | stable | deprecated" …/okf/SPEC.md` → `415:status: stable        # draft | stable | deprecated`. Match.
- Z3 `grep -nF "stale_after: 2026-09-23T00:00:00Z   # content is stale on/after this instant" …/okf/SPEC.md` → `427:stale_after: 2026-09-23T00:00:00Z   # content is stale on/after this instant`. Match.
- Z4 `grep -nF "return 'sha256:' + createHash('sha256').update(buf).digest('hex').slice(0, 12);" …/coldstart/src/kb/freshness.ts` → `31:    return 'sha256:' + createHash('sha256').update(buf).digest('hex').slice(0, 12);`. Match.
- Z5 `grep -nF "const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);" src/memory.ts` → `653:const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);`. Match.
- Extra spot checks, all matched exactly: X/Y memory.ts:364, :968, :382, :447, :663; W memory-rank.ts:29; W memory-repair.ts:133.

FALSE OR UNSUPPORTED CLAIMS: Y says "src/server.ts has 44 commits in [the last 90 days]", but the command printed `43`. Y's "8 of 17 tracked facts … ≥10 commits" comes with no command and is [unverified]. Z's #437 shape is [relayed].

FRAMING: neutral. "Building alone costs months of maintenance" leans slightly toward A, but the next clause balances it.

FINAL RANKING:
1. Response Y
2. Response W
3. Response Z
4. Response X

Tally note: none (3 rankings parsed)
## Claim checks

Checked by the orchestrator in one batch (all `grep -nF` from the Baton repo root; external paths under the scratchpad `survey2/`), output transcribed while on screen. Re-run cells are the reviewers' independent output.

| Seat | Claim | Citation | Checked with | Line as found | Result | Re-run |
|---|---|---|---|---|---|---|
| W/2 | ranking uses built-in SQLite | src/memory-rank.ts:29 | `grep -nF "_sqlite = nodeRequire('node:sqlite') as typeof import('node:sqlite');" src/memory-rank.ts` | "29:      _sqlite = nodeRequire('node:sqlite') as typeof import('node:sqlite');" | kept | R1 · match |
| W/2 | core coupled to identity | src/memory.ts:26 | `grep -nF "import { readAuthor, resolveAuthor, UNKNOWN_AUTHOR } from './identity.js';" src/memory.ts` | "26:import { readAuthor, resolveAuthor, UNKNOWN_AUTHOR } from './identity.js';" | kept | R1 · match |
| W/2 | staleness verdict exists in-tree | src/memory-repair.ts:133 | `grep -nF "export function assessAnchor(fact: string, input: AnchorInput): AnchorVerdict {" src/memory-repair.ts` | "133:export function assessAnchor(fact: string, input: AnchorInput): AnchorVerdict {" | kept | R1 · match |
| W/2 | docrot quiet UNKNOWN | docrot/src/docrot/rules/anchors.py:93 | `grep -nF 'return Resolution(ref, Verdict.UNKNOWN, boundary="anchor:no-hash")' …/anchors.py` | "93:        return Resolution(ref, Verdict.UNKNOWN, boundary=\"anchor:no-hash\")" | kept | R1 · match |
| W/2 | coldstart moved state | coldstart/src/kb/freshness.ts:51 | `grep -nF "state = 'moved';" …/freshness.ts` | "51:        state = 'moved';" | kept | R1 · match |
| W/2 | "the 9 modules that import memory.js" (REASONING, no citation) | — | `grep -rlF "'./memory.js'" src \| grep -v "\.test\." \| wc -l` → 9; `grep -rlF "/memory.js'" src \| grep -v "\.test\." \| wc -l` → 22 | 9 sibling importers; 22 non-test importers in all (subfolders use `../memory.js`) | struck — understates the coupling: 22 non-test files import it (R1 found 21) | R1: "21 non-test files" · MISMATCH |
| X/4 | pulled anchor paths parsed unfiltered | src/memory.ts:364 | `grep -nF "return at > 0 ? [{ path: s.slice(0, at), hash: s.slice(at + 1) }] : [];" src/memory.ts` | "364:          return at > 0 ? [{ path: s.slice(0, at), hash: s.slice(at + 1) }] : [];" — `parseFactFile` (355) applies no `..`/absolute filter; `normalizeAnchorPaths` (283) does, at save | kept | R1 · match |
| X/4 + Y/3 | hashed against main root | src/memory.ts:968 | `grep -nF "const now = await fileHash(mainRoot, a.path);" src/memory.ts` | "968:      const now = await fileHash(mainRoot, a.path);" | kept | R1 · match; R2 · match |
| X/4 | Baton treats pulled facts as hostile for grouping | src/memory.ts:382 | `grep -nF "could name the group holding knowledge it has nothing to do with." src/memory.ts` | "382:      // could name the group holding knowledge it has nothing to do with." | kept | R2 · match |
| X/4 | coldstart: agent never writes a hash | coldstart/src/kb/raw-log.ts:5 | `grep -nF "the agent never writes" …/raw-log.ts` | "5: * live hash for every path the agent marked `verified` (the agent never writes" | kept | R2 · match |
| X/4 | memwarden per-worktree check | memwarden/src/functions/verify.ts:215 | `grep -nF "if (opts?.verifyAgainstRoot && cwdInRepo !== undefined) {" …/verify.ts` | "215:  if (opts?.verifyAgainstRoot && cwdInRepo !== undefined) {" | kept | R2 · match |
| Y/3 | whole-file hash | src/memory.ts:663 | `grep -nF "const hash = sha1(await readFile(abs));" src/memory.ts` | "663:    const hash = sha1(await readFile(abs));" | kept | R2 · match |
| Y/3 | stale reason on any change | src/memory.ts:970 | `grep -nF "changed since this was saved" src/memory.ts` | "970:        staleReason = now === '' ? `${a.path} no longer exists` : `${a.path} changed since this was saved`;" | kept | R2 · match |
| Y/3 | resolves to main checkout | src/memory.ts:447 | `grep -nF "const main = await mainRepoRoot(root);" src/memory.ts` | "447:  const main = await mainRepoRoot(root);" | kept | R2 · match |
| Y/3 + U/4r | docrot structural hash | docrot/src/docrot/rules/anchors.py:65 | `grep -nF "include_attributes=False" …/anchors.py` | "65:            return hashlib.sha256(ast.dump(node, include_attributes=False).encode()).hexdigest()" | kept | R3 · match |
| Y/3 | "src/server.ts has 44 commits" in 90 days (REASONING) | — | `git log --since="90 days ago" --oneline -- src/server.ts \| wc -l` | "43" | struck — 43, not 44 (point stands: ~1 commit every 2 days) | R3: "43" · MISMATCH |
| Y/3 | "17 tracked facts that have anchors; 8 point at files with ≥10 commits/90d" | — | `git ls-files baton/memory .baton/memory \| wc -l` → 0; 21 fact files in baton/memory/facts all carry anchors | — | [unverified] — no command given; facts are not git-tracked; down-weighted | R1, R2: [unverified] |
| Z/1 | OKF keeps unknown keys | knowledge-catalog/okf/SPEC.md:206 | `grep -nF "SHOULD preserve unknown keys when round-tripping and MUST NOT reject" …/SPEC.md` | "206:SHOULD preserve unknown keys when round-tripping and MUST NOT reject" | kept | R3 · match |
| Z/1 | OKF lifecycle states | SPEC.md:415 | `grep -nF "status: stable        # draft \| stable \| deprecated" …/SPEC.md` | "415:status: stable        # draft \| stable \| deprecated" | kept | R3 · match |
| Z/1 | OKF staleness is time-based only | SPEC.md:427 | `grep -nF "stale_after: 2026-09-23T00:00:00Z" …/SPEC.md` | "427:stale_after: 2026-09-23T00:00:00Z   # content is stale on/after this instant" · "626:stale_after: 2026-09-23T00:00:00Z" (2 hits) | kept (the field exists; "only" is not proven by this grep) | R3 · match |
| Z/1 | coldstart prefixed sha256 | coldstart/src/kb/freshness.ts:31 | `grep -nF "return 'sha256:' + createHash('sha256')" …/freshness.ts` | "31:    return 'sha256:' + createHash('sha256').update(buf).digest('hex').slice(0, 12);" | kept | R3 · match |
| Z/1 | Baton 12-hex unprefixed sha1 | src/memory.ts:653 | `grep -nF "const sha1 = (data: string \| Buffer) => createHash('sha1')" src/memory.ts` | "653:const sha1 = (data: string \| Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);" | kept | R3 · match |
| Z/1 | OKF proposal #437 shape | — | — | — | [unverified] — relayed from research agent | — |

## Tally

| Response | Seat | Ranks received (R1, R2, R3) | Average |
|---|---|---|---|
| Y | 3 Contrarian | 1, 1, 1 | 1.00 |
| Z | 1 Ecosystem | 2, 3, 3 | 2.67 |
| X | 4 Security | 3, 2, 4 | 3.00 |
| W | 2 Maintainer | 4, 4, 2 | 3.33 |

Excluded rankings: none · Re-requested: none
Framing: R1 "slight lean toward C"; R2 grounding "leans toward B/C"; R3 "neutral" (noted "months of maintenance" leans slightly to A) → confidence capped at medium.

## Verdict

Council · standard · 4 seats (4 subagent; seat 4 re-seated) · review 3/3 · diversity: re-seated, consensus survived · degraded: framing lean (medium cap)

### Framing
There is a slight lean. "building alone costs months of maintenance" counts against B and D. Only B gets a full spec. The grounding gives a long list of evidence-binding mechanisms that can be borrowed, such as "input-provenance check 30/30", which favours C. Reviewers flagged this, so confidence is capped at medium.

### Positions
Ecosystem: "C. Build the proposed design, but make it conform to OKF on the wire. Map `candidate` to OKF `status: draft` and archive to `status: deprecated`. Store evidence as algorithm-prefixed `sha256:` strings, the shape used by OKF proposal #437 and coldstart. Keep `suspect` in an extension key, and offer that evidence block upstream to OKF instead of forking any candidate repo."
Maintainer: "C, built by extraction rather than from scratch. Lift Baton's existing memory core into the package and keep design B's format. Borrow only two small state rules: docrot's silent UNKNOWN verdict for unanchorable evidence and coldstart's `moved` state. Put a format-version key in every fact file from day one. Reject A."
Contrarian: "C. Keep B's repo-committed fact files, but anchor evidence to a symbol or hunk instead of hashing the whole file, and hash in the writer's worktree."
Security: "C. Build the proposed design, but treat every committed fact file as untrusted input. Code computes the evidence hashes (coldstart-style, at write time). Freshness is checked against the caller's own worktree (memwarden's `verifyAgainstRoot`). Evidence paths stay inside the repo. "Fresh" never means "trusted". I treat these as a veto on B as written."

### Where the members agree
All 4 seats chose C, and the choice held after one seat was replaced. A was rejected because the bases are small or new, store facts outside the repo, or (Graphicle) are written in Rust. D was rejected because it gives no package boundary.

### Where they clash
The Maintainer wants to lift the current core as it is. The other seats show that this would build three verified flaws into the published package:
- **Whole-file hash:** any edit to an anchored file marks the fact stale (memory.ts:663, :970).
- **Main-checkout hashing:** freshness is checked against main, not the agent's worktree (:447, :968).
- **Unchecked pulled paths:** anchor paths in pulled fact files are kept with no path check (:364).

The Maintainer's coupling figure is struck: 21–22 files import memory.js, not 9. Ecosystem's OKF bet depends on proposal #437, which is unaccepted and only relayed.

### Blind spots
- All three reviewers caught a gap every seat missed: parallel worktree branches committing fact files and the index will hit merge conflicts and ID collisions. That is why coldstart uses append-only JSONL.
- Contrarian ranked first, but its suspect-flood measurement ("8 of 17") is unverified. The flood is plausible, not proven.
- The structural hash it borrows from docrot needs a parser for each language.

### Recommendation
C, built by extracting the existing core. Fix these before the format is frozen:
- hash against the worktree, not main;
- check paths when a fact file is parsed, recompute every hash in code, and hold pulled facts as `candidate`;
- prefix hashes with the algorithm and add a format-version key;
- map states to OKF `status`, with `suspect` as an extension key;
- reserve an optional symbol/range field in the anchor, and leave the matching logic to the owner's own linking algorithm.

Confidence: medium. The framing leans toward C, and the staleness-strictness evidence is unverified.

### What would overturn it
- **Replay test:** replay 90 days of Baton history over the 21 facts. If whole-file hashing leaves under 15% of facts suspect in a typical week, drop symbol/hunk anchoring.
- **Extraction cost:** if separating the core from its 22 importers takes more than about a week, build B from scratch.
- **Memorix:** if it ships in-repo Markdown with code-evidence fields, choose A.
- **Merge test:** if facts written on two branches corrupt the index when merged, switch storage to append-only JSONL.

### First step
Run the replay over baton/memory/facts as a read-only check. For each anchor path, count commits per week over 90 days from `git log`, and report the weekly suspect share.

## Degradation notes

- Reviewers R1 and R2 flagged a lean in the brief toward C / B–C → confidence capped at medium.
- External figures (papers, hosted-tool docs, OKF proposals #437/#120/#463) were read by research agents and relayed; source lines in cloned repos were re-checked.

## Memory

save_memory: mem-council-decision-existing-memory-systems-versus (advisory)
