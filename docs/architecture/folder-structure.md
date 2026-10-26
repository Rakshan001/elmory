# Folder structure

```
elmory/
├── README.md                 what it is, install, the three agent rules, doc index
├── LICENSE                   MIT
├── package.json              zero runtime deps in the core; @modelcontextprotocol/sdk for the MCP front end only
├── tsconfig.json             strict, NodeNext ESM, declarations into dist/
├── vitest.config.ts          test/**/*.test.ts
├── .gitignore                node_modules, dist, *.db*, .superpowers (agent scratch)
│
├── src/                      the library — one file per responsibility (spec §3 module map)
│   ├── index.ts              public exports
│   ├── base32.ts             lowercase RFC 4648 base32 for ids
│   ├── record.ts             frontmatter subset ↔ ElmoryRecord, canonical text, id, lint
│   ├── quote.ts              tokeniser, quote/anchor hashes, write rules, secret rule, locate
│   ├── exec.ts               injectable shell-free process runner, gitCommonDir
│   ├── git.ts                HEAD, tracked files, rename lookup, batched signature lookup
│   ├── store.ts              storage areas, atomic writes, trust ledger, tombstones, publish, archive
│   ├── cache.ts              lock.db + cache-<n>.db, write lock, schema, FTS, derived rows, compaction
│   ├── evidence.ts           per-worktree "does this source hold?"
│   ├── derive.ts             trust, chains, heads, per-worktree member, the state table
│   ├── gate.ts               index-time checks, injection check, write gate with CAS
│   ├── recall.ts             escaped FTS, paging, budget, labels, abstain
│   ├── forget.ts             ordered delete, cascade, compaction retry, report
│   ├── api.ts                the Elmory object: wires everything, emits events
│   ├── cli.ts                `elmory <verb>` (node:util.parseArgs)
│   └── mcp.ts                stdio MCP server (the only file that imports the MCP SDK)
│
├── test/                     vitest; every test uses its own mkdtemp dir, never the repo
│   ├── helpers/              child-process scripts and builders shared by tests
│   └── <module>.test.ts      one file per src module, plus integration files (worktrees, crash, forget-audit)
│
└── docs/
    ├── architecture/         HLD and this file
    │   ├── 2026-10-22-hld.md
    │   └── folder-structure.md
    ├── specs/                the binding design (v3.1) and its history
    │   ├── 2026-10-21-elmory-memory-design.md
    │   └── history/
    ├── plans/                build plan + one plan per phase (tasks, interfaces, tests)
    ├── decisions/            council decision records (dated)
    └── research/             memory-types research, competitor/red-team/worth-it reviews, prototypes
        ├── memory-types/
        ├── reviews/
        └── prototypes/       throwaway .mjs scripts behind the spec's measured numbers
```

**Rules**

- `src/` stays flat: fourteen files with one job each is easier to hold in context than a tree of
  folders with one file in each. Add a folder only when a module needs more than one file
  (the MCP server is the likely first case: `src/mcp/`).
- Nothing in `src/` imports from `test/`, `docs/` or `dist/`.
- `plans/` (private `elmory-internal` repo, see `docs/INTERNAL.md`) is append-only history: a plan is dated and is not rewritten after its phase
  merges; a change gets a new dated plan.
- `docs/architecture/` is kept current: when the spec changes, the HLD changes in the same PR.
