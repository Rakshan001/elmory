import { Reveal } from "./reveal";
import { Timeline } from "./timeline";

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
      <Timeline days={DAYS} />
      <Reveal>
        <p className="mt-14 max-w-[62ch] rounded-xl bg-primary px-6 py-5 leading-relaxed text-primary-foreground md:px-8">
          With Elmory, Friday’s recall answers “I don’t know”, because the quoted line no longer exists. The agent
          reads the code instead of guessing.
        </p>
      </Reveal>
    </section>
  );
}
