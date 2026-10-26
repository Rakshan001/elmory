import { Reveal } from "./reveal";

const COLUMNS = ["Instruction files", "Embedding memory stores", "Elmory"] as const;

const ROWS: { label: string; cells: [string, string, string] }[] = [
  {
    label: "When the code changes",
    cells: ["Stays wrong until someone edits it", "Keeps serving the old fact", "Withheld; recall says “I don’t know”"],
  },
  { label: "Checks facts against code", cells: ["No", "Usually not", "On every read, per worktree"] },
  { label: "Where memory lives", cells: ["In the repo", "Usually a separate database", "In the repo, as Markdown in .elmory/"] },
  { label: "Finds by", cells: ["Loading everything", "Meaning (embeddings)", "Keywords (SQLite full-text)"] },
  { label: "Needs", cells: ["Nothing", "A model, often a service", "Node 24 and git. Runs offline"] },
];

export function Compare() {
  return (
    <section id="compare" className="border-y border-border bg-card/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-[-0.04em] md:text-[2.5rem]">Where Elmory fits</h2>
          <p className="mt-4 max-w-[56ch] text-lg leading-relaxed text-muted-foreground">
            Files like CLAUDE.md and AGENTS.md are great for rules. Elmory is for facts that can go out of date.
          </p>
        </Reveal>

        {/* Desktop: a table with the Elmory column polarity-flipped. */}
        <Reveal className="mt-12 hidden md:block">
          <div className="surface rounded-xl p-2">
            <table className="w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr>
                  <th className="w-[22%] p-5" />
                  {COLUMNS.map((c, i) => (
                    <th
                      key={c}
                      scope="col"
                      className={`p-5 align-bottom font-semibold ${
                        i === 2 ? "rounded-t-lg bg-primary text-primary-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r, ri) => (
                  <tr key={r.label} className="transition-colors hover:[&>td:not(:last-child)]:bg-muted/60 hover:[&>th]:bg-muted/60">
                    <th scope="row" className="border-t border-border p-5 align-top font-medium">
                      {r.label}
                    </th>
                    {r.cells.map((c, i) => (
                      <td
                        key={i}
                        className={`p-5 align-top leading-relaxed ${
                          i === 2
                            ? `bg-primary text-primary-foreground ${ri === ROWS.length - 1 ? "rounded-b-lg" : ""}`
                            : "border-t border-border text-muted-foreground"
                        }`}
                      >
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        {/* Mobile: one card per approach, so nothing scrolls sideways. */}
        <div className="mt-10 grid gap-3 md:hidden">
          {COLUMNS.map((c, ci) => (
            <Reveal key={c}>
              <div className={`rounded-xl p-5 ${ci === 2 ? "bg-primary text-primary-foreground" : "surface"}`}>
                <h3 className="font-semibold">{c}</h3>
                <dl className="mt-3 grid gap-3 text-sm">
                  {ROWS.map((r) => (
                    <div key={r.label}>
                      <dt className={ci === 2 ? "opacity-60" : "text-muted-foreground"}>{r.label}</dt>
                      <dd className="mt-0.5 leading-relaxed">{r.cells[ci]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
