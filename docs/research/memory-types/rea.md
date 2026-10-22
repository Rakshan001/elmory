# morluto/rea — research + security review (2026-10-21)

Everything here comes from files I opened in a `git clone --depth 1` at
`scratchpad/memtypes/sandbox-b/rea` (HEAD 25bea07, commit date Wed Oct 21 05:59:18 2026 +0000),
plus `gh api repos/morluto/rea`. I ran nothing from the repo: no install, no build, no scripts, and the clone used `core.hooksPath=/dev/null`.
Anything not opened is marked [unverified].

## 1. What it is

- **REA, "Reverse Engineer Anything"**: an MCP server and CLI (`rea-agents` on npm, v6.7.0) that lets coding agents reverse engineer *software artifacts*. It covers native binaries through Hopper, Ghidra, IDA or Kuna, plus JS/Electron/ASAR, .NET, APK, IL2CPP, WASM, EVM bytecode, firmware, pcap/HAR captures, SQLite, GGUF/safetensors headers and browser runtime capture.
- **It is not a tool for reverse engineering "any concept".** The README tagline is "See a feature you like. Understand how it works, down to the binary level." The shipped skill says "Skip REA for ordinary source-repository architecture analysis."
- **Language:** TypeScript (3,766 .ts files). There is also Python, Java and Swift bridge code for the RE engines, and a C++ Windows native addon in source form only. No compiled `.node` file is in the repo.
- **Licence:** MIT (LICENSE; the API reports MIT). Third-party material is under its own licences (THIRD_PARTY_NOTICES.md).
- **Size:** 4,991 files and 88 MB in the shallow working tree. The API reports size 92,587 KB.
- **GitHub API:** 350,461 stars, 88,093 forks, created 2026-04-14, pushed 2026-10-21. These numbers are extremely unusual for a six-month-old repo. Treat them as a trust signal to discount, not as an endorsement. Why they are so high is [unverified]. The README itself warns that look-alike repos and copied READMEs exist (README "IMPORTANT" box, lines 29-33).
- **Engineering quality:** strict zod schemas, a tagged `Result` error algebra, mutation testing (Stryker), 32 CI workflows, and an AGENTS.md centred on tokens and evidence provenance.

## 2. Security review (read-only, high-confidence items only)

**Bottom line**
- **Safe to read:** yes.
- **Safe to run:** only if you knowingly want a powerful local RE tool, and then use the npm package at a pinned version. Do not run `install.sh` blindly, and do not let agents run `npx -y rea-agents@latest`.

I found no malware indicators. Specifically, I found none of the following:
- credential or browser-profile harvesting
- telemetry
- obfuscated payloads or committed binaries
- hidden prompt-injection text

| # | Finding | Evidence (`grep -n`) | Severity | Why |
|---|---|---|---|---|
| 1 | Agent skill tells agents to execute unpinned latest npm code with auto-yes | `.agents/skills/reverse-engineer-anything/SKILL.md:38: npx -y rea-agents@latest doctor ...`; `:57: npx -y rea-agents@latest setup --client codex --yes` | Medium (supply chain) | Any compromise of the npm package or the maintainer account would be executed by agents. Setup writes MCP and skill config into the agent clients (Claude Code, Codex, Cursor and others). If adopted, pin the version. |
| 2 | Skill nudges agents to run tools without asking | `SKILL.md:334: directly. REA does not require permission grants or per-call approval flags.` | Low | This is agent-steering text. It does defer to client approval (lines 335-337), so it is not an injection. Still, it pushes agents toward autonomy for runtime execution of targets. |
| 3 | Curl-to-bash installer resolves "latest" from GitHub, then installs globally | `install.sh:129: release_json="$(curl -fsSL --proto '=https' ... api.github.com/repos/$REPOSITORY/releases/latest")"` | Low | The script is well hardened: a truncation guard on line 2, an `https`-only proto, a semver regex, a post-install version check, and setup only on a TTY. It is still "run whatever is latest". |
| 4 | `prepare` lifecycle installs git hooks in a source checkout; the pre-push hook runs an npm script | `scripts/prepare.mjs:26: const message = installHusky();`; `.husky/pre-push:1: npm run check:fast` | Low | This only matters if you `npm install` inside the clone, which we did not. There is no `postinstall` script, and `prepack` only builds and checks. |
| 5 | Test harness evals a base64 string | `scripts/verify-qwen-client.mjs:291: command: \`node -e "eval(Buffer.from('${encodedScript}','base64')..."\`` | Info | The encoded script is plaintext two lines above (line 287). It reads a saved Evidence JSON. This is a client-compatibility test, not a hidden payload. |
| 6 | Runtime-capture features are intrusive by design | `src/browser/CdpCaptureStorageFingerprints.ts:122: "Network.getCookies",`; `package.json:407: "frida": "17.23.2"` (optional dependency); `scripts/electron-active-hook.cjs` (1,329 lines, preloaded into target Electron apps) | Medium if run | Cookies are scoped to the analysed page URL and stored as SHA-256 fingerprints. The Electron hook contains no `net`/`http`/`fs`/`child_process` requires, URLs or env reads (grep empty). This is still a tool that executes and instruments other programs with your user permissions. |
| 7 | Downloads Hopper from the vendor, with an OpenPGP key | `src/application/HopperReleaseFeed.ts:10: "https://www.hopperapp.com/hopper-public-key.asc";` | Info | Only after setup approval (`--install-hopper`). This is a legitimate vendor host. |
| 8 | Turborepo-injected agent block in AGENTS.md | `AGENTS.md:122: This block is written and re-added by \`turbo\` ... when an AI agent is detected.` | Info | This is turbo's own guidance block and it is benign. Worth knowing: build tools now auto-write agent instructions into repos. |
| 9 | Submodules point at third-party GitHub repos (jadx-headless-mcp, binwalk, unblob, ghidra-nativeaot, wakaru) | `.gitmodules` | Info | These were not fetched by the shallow clone, so their contents are [unverified]. |

**Checks that came back clean**
- **Network hosts in runtime code:** placeholder/test domains, 127.0.0.1, github.com references, hopperapp.com, rea.tools and spec URLs. No unknown exfiltration host.
- **Telemetry:** the only grep hits were internal "lifecycle telemetry" comments.
- **Sensitive paths:** no `.ssh`/`.aws`/`id_rsa`/keychain/`Login Data` access in src, scripts or bridge. The one `.npmrc` hit is a path classifier list.
- **Long lines:** the only lines over 2,000 characters are zod description strings.
- **Binaries:** `file --mime` found nothing except a TS test file with embedded bytes.
- **Hidden characters:** the only zero-width characters are U+200C (ZWNJ) in the Persian and Malayalam READMEs, which is normal orthography. There are no tag or bidi-override characters.

## 3. Concepts relevant to a memory system

REA has no memory system in the working/episodic/semantic/procedural sense. Its **Evidence ledger** is still a very good model of *anti-hallucination provenance* and *token-budgeted recall*. The mechanisms below are quoted from source.

**3.1 Content-addressed, self-authenticating evidence record** (`src/domain/evidence.ts`)

```ts
confidence: z.enum(["observed", "derived", "inferred"]),
authority: evidenceAuthoritySchema,   // "shipped-artifact" | "controlled-replay" | "historical-reference" | "external-service" | "analyst-inference"
limitations: z.array(z.string()),
relationship_coverage: relationshipCoverageSchema.nullable(),
locations: z.array(evidenceLocationSchema),   // address / artifact-path / file-offset(-range)
evidence_links: z.array(prefixedDigestSchema("ev")),
...
const computeEvidenceId = (evidence) => `ev_${digestCanonicalValue(semanticProjection(evidence), "Evidence")}`;
// parse rejects "a syntactically valid but tampered semantic ID"
```

- The ID is a SHA-256 hash of RFC 8785 canonical JSON (`src/domain/canonicalDigest.ts`).
- The `subject` carries `digest.sha256` of the artifact the fact was observed on.
- **Borrow:** give every memory fact (a) a two-axis trust label, *confidence* (observed / derived / inferred) crossed with *authority* (source class); (b) a mandatory `limitations[]`; (c) source locations; (d) `evidence_links` forming a provenance DAG; (e) a content-hash ID, so duplicates collapse and tampering is detectable.

**3.2 Idempotent ledger with conflict detection** (`src/application/investigation/EvidenceLedger.ts`)

```ts
/** Record evidence idempotently; conflicting content is rejected. */
record(input) { ... if (existing !== undefined) return recordsAgree(existing, evidence) ? ok("duplicate") : err(new EvidenceIntegrityError("Conflicting evidence record")); ... }
/** Validate an entire bundle before atomically merging its records. */
import(input) { ... }
```

- **Borrow:** use an append-only, content-addressed fact store where writes are idempotent. Bundle import/export (`export_evidence_bundle` / `import`) should be atomic, which suits handoff between agents.

**3.3 Explicit coverage, so "absent" differs from "not looked"** (`src/domain/relationshipCoverage.ts`)

```ts
status: "complete" | "partial" (limitations[], limited_directions) | "unknown" (reason)
// relationshipCoverageLimitations(undefined) -> ["Provider did not report relationship coverage."]
```

AGENTS.md line 21 adds: "Unresolved identity or applicability must remain unknown rather than be treated as absent".

- **Borrow:** graph edges and recall results should carry a coverage state. A negative recall is then reported as "not found within scope X", never as "does not exist".

**3.4 First-class "unknowns" register with revisions and a dependency graph** (`src/domain/residualUnknown.ts`, `reconstructionUnknowns.ts`)

```ts
unknown_id: unk_<sha256(domain, normalized question, scope_digest)>,
revision, previous_revision_digest, revision_digest,          // hash-chained revisions
status: "open" | "investigating" | "blocked" | "contradicted" | "resolved",
supporting_evidence_ids, contradicting_evidence_ids,
required_authority, required_confidence, recommended_probes[{operation, rationale}],
relationships: [{type: "depends-on" | "related-to" | "contradicts", unknown_id}],
resolution: {disposition: "verified", evidence_ids (min 1)} | {disposition: "withdrawn"|"out-of-scope", ...}
```

- `reconstructionUnknownHeads` keeps the latest revision. `reconstructionClaimUnknowns` walks `depends-on` and `contradicts` edges to find every open unknown that affects a claim.
- **Borrow:** a durable *open-questions memory* with these properties:
  - stable IDs derived from the question text
  - supporting and contradicting evidence lists
  - a "what evidence would settle this" requirement
  - resolution allowed only with evidence
  - hash-chained edit history

  This maps directly to anti-hallucination ("don't answer, it's open") and to episodic handoff.

**3.5 Claim-completion ledger** (`src/domain/evidenceCompletionLedger.ts`)

```ts
status: "pass" | "fail" | "unsupported" | "truncated" | "unknown"; evidence_ids: min(1)
summary.complete = counts.pass === records.length
```

- **Borrow:** for "done?" checks, every claim needs at least one evidence ID, and "truncated" or "unsupported" are distinct outcomes, never silently treated as pass.

**3.6 Artifact graph with digest IDs and contradictions** (`src/domain/artifactGraph.ts`)

- IDs are prefixed digests: `art_`, `occ_` (occurrence), `edge_`, `agm_` (manifest), `ic_` (integrity contradiction).
- An *artifact* (content) is separated from its *occurrence* (where it appears, `parent_occurrence_id`).
- `integrity_contradictions[]` and traversal `omissions` (`directory-descendants`, `unsupported` and others) are explicit.
- **Borrow** for the graph view:
  - separate node identity (content hash) from occurrences (location or session)
  - make contradictions first-class graph objects
  - record what traversal skipped

**3.7 Token saving: summary first, then retained-evidence paging** (SKILL.md "Work summary-first", `src/application/analysisView/AnalysisViewService.ts`, AGENTS.md "Performance")

- Tools return `detail: "summary"` plus a `parent_evidence_id`. The agent then calls `inspect_analysis_view` for one section or page of *already completed* Evidence ("without repeating analysis").
- AGENTS.md sets the optimisation order: "1. Agent tokens and context. Return the smallest sufficient answer with necessary provenance ... 2. ... Cache keys must cover result-affecting inputs; define invalidation and lifetime. Validate freshness before reporting cached live state as current."
- The tool measures real token counts with `tokenx` (`src/cli/cliResultOutput.ts:5`) and has an `experiments/analysis-efficiency/` harness (not opened in depth).
- **Borrow:** recall returns compact summaries plus handles, and the agent pages into a handle. Cache keys cover every input, and freshness is checked before anything is presented as current.

**3.8 Procedural memory: the investigation workflow** (SKILL.md lines 339-372, "Plan broader investigations")

The workflow runs in this order:
1. Checklist of questions.
2. Reuse prior session evidence before re-analysing.
3. Smallest overview first.
4. Corroborate with the required evidence type.
5. Keep "a concise finding ledger linking each conclusion to Evidence IDs, confidence/evidence type, search boundary, and remaining unknowns".
6. Before finishing, mark each question answered, partial or unresolved.

This is a good template for a procedural-memory skill or the end-of-session episodic write.

## 4. Verdict: borrow the ideas, ignore the tool, avoid running it unpinned

- **Borrow (patterns, rewritten in your own code; MIT allows copying with attribution):**
  - the evidence-record shape: confidence × authority, `limitations`, locations, `evidence_links`, and a content-hash ID with tamper check
  - the idempotent conflict-rejecting ledger and atomic bundle import/export
  - the coverage tri-state (complete / partial / unknown)
  - the residual-unknowns register (revisions, supporting/contradicting evidence, `depends-on`/`contradicts`, evidence-gated resolution)
  - the claim-completion ledger
  - artifact-vs-occurrence graph nodes with first-class contradictions
  - summary-first plus `parent_evidence_id` paging for token budgets
- **Ignore:** the RE tooling itself (Ghidra/Hopper/IDA bridges, capture pipelines). It does not address working, semantic or episodic memory, consolidation, retrieval ranking or embeddings.
- **Avoid:** running `install.sh`, `npx -y rea-agents@latest ...`, or `rea setup` on the dev machine just to study it. Setup rewrites agent MCP and skill config, and runtime features execute and instrument other apps. The 350k-star / 88k-fork metrics are anomalous and should not raise trust.
