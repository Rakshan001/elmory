import { Reveal } from "./reveal";

const DAYS = [
  { day: "Monday", text: "Your agent learns the session TTL is 15 minutes and saves it to memory." },
  { day: "Wednesday", text: "A teammate changes it to 30 in session.ts. Nobody edits the memory." },
  { day: "Friday", text: "The agent recalls “15 minutes” and writes code against a value that is gone." },
];

export function Drift() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 md:px-6 md:py-28">
      <Reveal>
        <p className="font-mono text-xs text-muted-foreground">The problem</p>
        <h2 className="mt-3 max-w-[20ch] text-3xl leading-tight font-semibold tracking-[-0.04em] md:text-[2.5rem]">
          Agent memory goes stale without telling anyone.
        </h2>
      </Reveal>
      <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
        <span aria-hidden className="absolute top-[7px] right-0 left-0 hidden h-px bg-border md:block" />
        {DAYS.map((d, i) => (
          <li key={d.day} className="relative pl-7 md:pt-9 md:pl-0">
            <Reveal>
              <span
                aria-hidden
                className={`absolute top-1.5 left-0 size-3.5 rounded-full border-2 md:top-0 ${
                  i === 2 ? "border-foreground bg-foreground" : "border-foreground/30 bg-background"
                }`}
              />
              <p className="font-mono text-xs text-muted-foreground">{d.day}</p>
              <p className="mt-2 max-w-[32ch] leading-relaxed">{d.text}</p>
            </Reveal>
          </li>
        ))}
      </ol>
      <Reveal>
        <p className="mt-14 max-w-[62ch] rounded-xl bg-primary px-6 py-5 leading-relaxed text-primary-foreground md:px-8">
          With Elmory, Friday’s recall answers “I don’t know”, because the quoted line no longer exists. The agent
          reads the code instead of guessing.
        </p>
      </Reveal>
    </section>
  );
}
