import { CircleCheck, CircleHelp, FileX, NotebookPen } from "lucide-react";
import { Reveal } from "./reveal";

export function States() {
  return (
    <section id="states" className="mx-auto w-full max-w-6xl px-4 py-20 md:px-6 md:py-28">
      <Reveal>
        <h2 className="max-w-[22ch] text-balance text-3xl leading-tight font-semibold tracking-[-0.04em] md:text-[2.5rem]">
          Every record says how far to trust it.
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-6">
        <Reveal className="md:col-span-4">
          <div className="flex h-full min-h-60 flex-col justify-between rounded-xl bg-primary p-7 text-primary-foreground md:p-9">
            <CircleCheck className="size-6" strokeWidth={1.75} />
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Holds</h3>
              <p className="mt-2 max-w-[44ch] leading-relaxed opacity-75">
                Every quote is still in this worktree’s code. The fact is served, with the date its evidence was last
                confirmed.
              </p>
            </div>
          </div>
        </Reveal>
        <Reveal className="md:col-span-2">
          <div className="surface flex h-full min-h-60 flex-col justify-between rounded-xl p-7 [background-image:repeating-linear-gradient(135deg,color-mix(in_oklab,var(--foreground)_4%,transparent)_0_6px,transparent_6px_12px)]">
            <CircleHelp className="size-6" strokeWidth={1.75} />
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Suspect</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                A quoted line changed or moved out of reach. Withheld from recall.
              </p>
            </div>
          </div>
        </Reveal>
        <Reveal className="md:col-span-2">
          <div className="flex h-full min-h-60 flex-col justify-between rounded-xl border border-dashed border-foreground/25 p-7">
            <FileX className="size-6" strokeWidth={1.75} />
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Stale</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                The quoted file was deleted. Withheld, and listed by verify.
              </p>
            </div>
          </div>
        </Reveal>
        <Reveal className="md:col-span-4">
          <div className="surface relative flex h-full min-h-60 flex-col justify-between overflow-hidden rounded-xl p-7 md:p-9">
            <NotebookPen className="relative size-6" strokeWidth={1.75} />
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
