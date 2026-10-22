# Elmory release 1 — build plan (phases, constraints, rulings)

> **For agentic workers:** each phase has its own plan file in this directory. Implement a phase
> with `superpowers:subagent-driven-development` (parallel implementers only where the phase plan
> marks tasks as disjoint). Every phase ends in its own PR to `main`.

**Goal:** build the release-1 core of Elmory as specified in
[`docs/specs/2026-10-21-elmory-memory-design.md`](../specs/2026-10-21-elmory-memory-design.md)
(v3.1): records, quotes, store, cache, derivation, gates, flows, forget, CLI and MCP.

**Spec:** `docs/specs/2026-10-21-elmory-memory-design.md`. The spec is the binding authority; a
phase plan is its argument. Section numbers below (§n) refer to the spec.

## Phase map

| Phase | Spec milestone | Branch | Plan |
|---|---|---|---|
| 1 | R1-M1 records + store, R1-M2 quote engine | `phase/1-records-quotes` | [phase-1](2026-10-22-phase-1-records-store-quotes.md) |
| 2 | R1-M3 cache + git | `phase/2-cache-git` | [phase-2](2026-10-22-phase-2-cache-git.md) |
| 3 | R1-M4 derive + chains | `phase/3-derive` | [phase-3](2026-10-22-phase-3-derive.md) |
| 4 | R1-M5 gates + flows | `phase/4-gates-flows` | [phase-4](2026-10-22-phase-4-gates-flows.md) |
| 5 | R1-M6 forget, R1-M7 CLI + MCP | `phase/5-forget-frontends` | [phase-5](2026-10-22-phase-5-forget-frontends.md) |

Out of this plan, by ruling (see below): Phase 0 (A/B harness and 90-day replay) and R1-M8
(Baton integration).

## Global constraints (bind every task in every phase)

- **Runtime:** TypeScript, strict, ESM, Node ≥ 24. `node:sqlite` is loaded through
  `createRequire` (as Baton's `memory-rank.ts` does) so the import survives bundlers.
- **Dependencies:** the core (`src/*.ts` except `src/mcp.ts`) has **zero runtime dependencies**:
  only `node:*` modules. `src/mcp.ts` may import `@modelcontextprotocol/sdk`.
- **Git access:** only through the injectable `Exec` type in `src/exec.ts` (shell-free
  `execFile`). Never `exec` with a shell string.
- **Immutability:** a record file is never rewritten. Writes are temp → fsync → rename.
- **Id:** `f_` + first 26 chars of lowercase base32 (alphabet `abcdefghijklmnopqrstuvwxyz234567`)
  of sha256 of the canonical record (§4.1). Canonical = sorted frontmatter keys, LF line endings,
  no trailing whitespace.
- **Code is never copied into memory**, only hashes (§4.1).
- **Time never orders anything** (§6.3). Timestamps are shown, never compared.
- **State is derived, never stored as truth** (§3, §4.4). Cache rows are a rebuildable
  convenience; deleting the cache must not change any answer.
- **Trust lives in layer 5** (`<common-dir>/elmory/trust`), never in the cache (V1).
- **Tests:** vitest, `test/**/*.test.ts`, `npm test` must be green at the end of every task.
  Every test uses its own temp directory (`fs.mkdtempSync` under `os.tmpdir()`), never the repo.
- **Commits:** plain conventional messages, title + body. No AI co-author trailers. The user's
  git identity only. Branch per phase; PR to `main`; never push to `main`.

## Review focus (whole release)

1. A record file edited by hand (any byte change) must become `candidate: edited`, never served.
2. A quote that appears twice in a file must be refused at write, and a quote that appears
   twice after a later edit must be `suspect`, not `active`.
3. A pulled record from an unsigned commit must never be served until approved, even when it
   supersedes a local record; the local record stays served with the "unreviewed newer value"
   label.
4. `forget` on a chain member must leave the chain intact; forgetting the head must abstain.
5. Two worktrees over one cache must get different answers when their file bytes differ.

## Rulings made while planning (owner can overturn)

- **Phase 0 skipped for now.** It needs the owner's task set and paired agent runs. The skeptic
  review (2026-10-22) also found it underpowered. The code phases do not depend on it; the
  release gate (§14) still requires it before 0.1.0.
- **R1-M8 (Baton integration) is not in this plan.** It lives in the Baton repo, whose working
  tree has unrelated uncommitted work. It gets its own plan after the core ships.
- **Licence: MIT.** The spec left MIT or Apache-2.0 open (§15.3). MIT is the simpler one for a
  library Baton (AGPL) imports. Change `LICENSE` and `package.json` if the owner prefers Apache.
- **MCP SDK is a normal dependency**, imported only from `src/mcp.ts` (§1.2 V30 allows it).
- **The CLI uses `node:util.parseArgs`**, not commander, to keep the core zero-dependency.
- **Prototype numbers are targets, not tests.** Timing tests assert loose bounds (e.g. < 2 s for
  5,000 quotes over 200 files) so CI noise does not fail them.
