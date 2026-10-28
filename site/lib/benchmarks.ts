// What the benchmarks page shows. Every number here was produced by a command in the repo; update
// it from a fresh run, never by hand. The lifecycle rows mirror test/lifecycle.test.ts case for case.

export const MEASURED = {
  date: "2026-10-28",
  version: "0.1.0",
  tests: 381,
  packageKb: 103.1,
  packageFiles: 41,
};

export type Outcome = "served" | "suspect (not-found)" | "suspect (not-unique)" | "stale (deleted)";

export const LIFECYCLE: { change: string; outcome: Outcome }[] = [
  { change: "Unchanged", outcome: "served" },
  { change: "Extra spaces inside the quote", outcome: "served" },
  { change: "The quote reflowed across lines", outcome: "served" },
  { change: "An edit elsewhere in the file", outcome: "served" },
  { change: "A type changed inside the quote", outcome: "suspect (not-found)" },
  { change: "An identifier renamed inside the quote", outcome: "suspect (not-found)" },
  { change: "The quote now appears twice", outcome: "suspect (not-unique)" },
  { change: "A committed move", outcome: "served" },
  { change: "A committed move and edit that keeps the quote", outcome: "served" },
  { change: "A move, not committed", outcome: "served" },
  { change: "A move, staged with git mv", outcome: "served" },
  { change: "A move and edit, staged with git add -A", outcome: "served" },
  { change: "A move, not committed, that changed the quote", outcome: "suspect (not-found)" },
  { change: "The file deleted, not committed", outcome: "stale (deleted)" },
  { change: "The file deleted and committed", outcome: "stale (deleted)" },
  { change: "The file deleted, then restored", outcome: "served" },
];

export const NOT_MEASURED: { title: string; body: string }[] = [
  {
    title: "Speed at 5,000 records",
    body: "Bounds exist and run with npm run test:timing: listing all records under 60 ms (median), recall under 150 ms (p95). Those are targets, not results. Numbers go here after a run on a quiet machine.",
  },
  {
    title: "How often facts go stale in real repositories",
    body: "Replaying the history of real projects and counting facts that were served after their code changed. Planned, not run.",
  },
  {
    title: "Retrieval scores such as LongMemEval",
    body: "Not run. Elmory finds records by keywords and its claim is about what it refuses to serve, not recall@K. We will not quote a score we have not measured.",
  },
];
