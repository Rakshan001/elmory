import { Reveal } from "./reveal";

const COLUMNS = ["Instruction files", "Embedding memory stores", "Elmory"];

const ROWS: { label: string; cells: [string, string, string] }[] = [
  {
    label: "When the code changes",
    cells: ["Stays wrong until someone edits it", "Keeps serving the old fact", "Withheld; recall says “I don’t know”"],
  },
  {
    label: "Checks facts against code",
    cells: ["No", "Usually not", "On every read, per worktree"],
  },
  {
    label: "Where memory lives",
    cells: ["In the repo", "Usually a separate database", "In the repo, as Markdown in .elmory/"],
  },
  {
    label: "Finds by",
    cells: ["Loading everything", "Meaning (embeddings)", "Keywords (SQLite full-text)"],
  },
  {
    label: "Needs",
    cells: ["Nothing", "A model, often a service", "Node 24 and git. Runs offline"],
  },
];

export function Compare() {
  return (
    <section id="compare" className="mx-auto w-full max-w-6xl px-4 py-20 md:py-28">
      <Reveal>
        <h2 className="text-3xl font-semibold tracking-tighter md:text-5xl">Where Elmory fits</h2>
        <p className="mt-4 max-w-[56ch] text-lg leading-relaxed text-muted-foreground">
          Files like CLAUDE.md and AGENTS.md are great for rules. Elmory is for facts that can go out of date.
        </p>
      </Reveal>
      <Reveal className="mt-12">
        <div className="glass overflow-x-auto rounded-[28px] p-2">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th className="w-[22%] p-5" />
                {COLUMNS.map((c, i) => (
                  <th
                    key={c}
                    scope="col"
                    className={`p-5 align-bottom font-semibold ${
                      i === 2 ? "rounded-t-2xl bg-accent text-accent-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, ri) => (
                <tr key={r.label}>
                  <th scope="row" className="border-t border-border p-5 align-top font-medium">
                    {r.label}
                  </th>
                  {r.cells.map((c, i) => (
                    <td
                      key={i}
                      className={`p-5 align-top leading-relaxed ${
                        i === 2
                          ? `bg-accent font-medium text-accent-foreground ${ri === ROWS.length - 1 ? "rounded-b-2xl" : ""}`
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
    </section>
  );
}
