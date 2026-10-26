import { CircleCheck, CircleHelp, FileX, NotebookPen } from "lucide-react";
import { Reveal } from "./reveal";

export function States() {
  return (
    <section id="states" className="mx-auto w-full max-w-6xl px-4 py-20 md:py-28">
      <Reveal>
        <h2 className="max-w-[20ch] text-3xl leading-tight font-semibold tracking-tighter md:text-5xl">
          Every record says how far to trust it.
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-6">
        <Reveal className="md:col-span-4">
          <div className="flex h-full min-h-64 flex-col justify-between rounded-[28px] bg-accent p-7 text-accent-foreground md:p-9">
            <CircleCheck className="size-7" strokeWidth={1.75} />
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Holds</h3>
              <p className="mt-2 max-w-[44ch] leading-relaxed opacity-80">
                Every quote is still in this worktree’s code. The fact is served, with the date its evidence was
                last confirmed.
              </p>
            </div>
          </div>
        </Reveal>
        <Reveal className="md:col-span-2" delay={0.06}>
          <div className="flex h-full min-h-64 flex-col justify-between rounded-[28px] bg-panel p-7 text-panel-foreground">
            <CircleHelp className="size-7" strokeWidth={1.75} />
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Suspect</h3>
              <p className="mt-2 leading-relaxed text-panel-muted">
                A quoted line changed or moved out of reach. Withheld from recall.
              </p>
            </div>
          </div>
        </Reveal>
        <Reveal className="md:col-span-2" delay={0.1}>
          <div className="glass flex h-full min-h-64 flex-col justify-between rounded-[28px] p-7">
            <FileX className="size-7" strokeWidth={1.75} />
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Stale</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                The quoted file was deleted. Withheld, and listed by verify.
              </p>
            </div>
          </div>
        </Reveal>
        <Reveal className="md:col-span-4" delay={0.14}>
          <div className="relative flex h-full min-h-64 flex-col justify-between overflow-hidden rounded-[28px] border border-border bg-card p-7 md:p-9">
            <div
              aria-hidden
              className="absolute inset-0 opacity-60 [background-image:radial-gradient(color-mix(in_oklab,var(--foreground)_14%,transparent)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_left,black,transparent_70%)]"
            />
            <NotebookPen className="relative size-7" strokeWidth={1.75} />
            <div className="relative">
              <h3 className="text-2xl font-semibold tracking-tight">Note</h3>
              <p className="mt-2 max-w-[44ch] leading-relaxed text-muted-foreground">
                Decisions and preferences have no code to quote. They are served, ranked below facts, and labelled
                “not code-checked”.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
