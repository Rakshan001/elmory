import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Reveal } from "./reveal";

// Transcripts are copied from a real run of the CLI; nothing here is mocked.
const STEPS = [
  {
    id: "remember",
    title: "Remember, with a quote",
    text: "The agent saves what it learned and quotes the exact line that proves it.",
    out: `$ elmory remember "Sessions expire after 15 minutes idle; the TTL lives in sessionTtl()." \\
    --title "Session TTL is 15 minutes" \\
    --quote "src/session.ts:return 15 * 60 * 1000; // sessions expire after fifteen minutes of idle time" \\
    --tag gotcha
f_wy2lnewyj4xgdx3jcnmnbx2a7x active`,
  },
  {
    id: "recall",
    title: "Recall checks the quote",
    text: "On every read, Elmory looks for the quoted line in this worktree. Found, so it serves the fact.",
    out: `$ elmory recall "session ttl"
## Session TTL is 15 minutes
id: f_wy2lnewyj4xgdx3jcnmnbx2a7x · state: active · fact · tag: gotcha
labels: evidence unchanged since 2026-10-26
quotes: src/session.ts

Sessions expire after 15 minutes idle; the TTL lives in sessionTtl().`,
  },
  {
    id: "changed",
    title: "Code changed? It abstains",
    text: "Someone sets the TTL to 30. The quote is gone, so recall answers “I don’t know” and exits 4.",
    out: `$ sed -i 's/15 \\* 60/30 * 60/' src/session.ts
$ elmory recall "session ttl"
I don't know: 1 matches but none hold: 1 suspect
  f_wy2lnewyj4xgdx3jcnmnbx2a7x is suspect (not-found)
$ echo $?
4`,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-y border-border bg-card/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-[-0.04em] md:text-[2.5rem]">How it works</h2>
          <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
            Three moments from a real terminal session. Agents do the same through nine MCP tools.
          </p>
        </Reveal>
        <Reveal className="mt-12">
          <Tabs
            defaultValue="remember"
            orientation="vertical"
            className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)] lg:gap-6"
          >
            <TabsList className="h-fit w-full gap-2 bg-transparent p-0">
              {STEPS.map((s) => (
                <TabsTrigger
                  key={s.id}
                  value={s.id}
                  className="h-auto w-full flex-col items-start gap-1 rounded-xl border border-border bg-transparent px-5 py-4 text-left whitespace-normal data-active:surface dark:data-active:bg-card"
                >
                  <span className="text-base font-semibold text-foreground">{s.title}</span>
                  <span className="text-sm leading-relaxed font-normal text-muted-foreground">{s.text}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {STEPS.map((s) => (
              <TabsContent key={s.id} value={s.id} className="min-w-0">
                <div className="h-full rounded-xl bg-panel p-2 text-panel-foreground">
                  <div className="flex gap-1.5 px-3 py-2.5" aria-hidden>
                    <span className="size-2.5 rounded-full bg-white/15" />
                    <span className="size-2.5 rounded-full bg-white/15" />
                    <span className="size-2.5 rounded-full bg-white/15" />
                  </div>
                  <pre className="code-wrap rounded-lg bg-white/[0.04] p-5 font-mono text-[12.5px] leading-6">
                    <code>{s.out}</code>
                  </pre>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </Reveal>
      </div>
    </section>
  );
}
