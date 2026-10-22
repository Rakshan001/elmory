# Elmory

Evidence-checked memory for coding agents. A fact quotes the code it relies on and is served
only while that quote still exists in the asking worktree. Decisions and preferences are kept as
notes, labelled "not code-checked". When nothing holds up, recall answers "I don't know".

**Status:** design stage. Nothing is built yet. The spec awaits approval.

## Docs

| What | Where |
|---|---|
| Architecture and plan (current, v3.1) | [docs/specs/2026-10-21-elmory-memory-design.md](docs/specs/2026-10-21-elmory-memory-design.md) |
| Earlier five-type design (v2, history) | [docs/specs/history/](docs/specs/history/) |
| Research: memory types, libraries, papers | [docs/research/](docs/research/) |
| Design reviews (red-team, competitors, worth-it) | [docs/research/reviews/](docs/research/reviews/) |
| Council decision records | [docs/decisions/](docs/decisions/) |
| Throwaway prototypes behind the spec's measured numbers | [docs/research/prototypes/](docs/research/prototypes/) |

These docs were written while Elmory was planned inside the Baton repo. Paths such as
`src/memory.ts` in the spec's Baton integration section refer to Baton, not to this repo.
