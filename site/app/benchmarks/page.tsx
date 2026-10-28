import type { Metadata } from "next";
import { CodeBlock } from "@/components/site/code-block";
import { Footer } from "@/components/site/footer";
import { Nav } from "@/components/site/nav";
import { Reveal } from "@/components/site/reveal";
import { LIFECYCLE, MEASURED, NOT_MEASURED } from "@/lib/benchmarks";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Benchmarks",
  description: "What Elmory has measured, the command that reruns each result, and what has not been measured yet.",
  alternates: { canonical: "/benchmarks" },
};

const REPRODUCE = `git clone https://github.com/Rakshan001/elmory.git && cd elmory
npm ci && npm run build
npx vitest run test/lifecycle.test.ts   # the lifecycle table
npm test                                # the full suite
npm pack --dry-run                      # package size and files
npm run test:timing                     # speed bounds; needs a quiet machine`;

const STATS = [
  { value: `${LIFECYCLE.length} of ${LIFECYCLE.length}`, label: "code changes get the outcome they should" },
  { value: String(MEASURED.tests), label: "tests pass, every one run on each publish" },
  { value: `${MEASURED.packageKb} kB`, label: `the whole package, ${MEASURED.packageFiles} files, one runtime dependency` },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-20 scroll-mt-24">
      <Reveal>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">{title}</h2>
      </Reveal>
      <Reveal className="mt-6">{children}</Reveal>
    </section>
  );
}

export default function Benchmarks() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-16 md:px-6 md:py-24">
        <Reveal>
          <p className="font-mono text-xs text-muted-foreground">
            Measured {MEASURED.date} · version {MEASURED.version}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] md:text-5xl">Benchmarks</h1>
          <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-muted-foreground">
            What we have measured, the command that reruns it, and what we have not measured yet. Every number on this
            page comes from a test in the repository.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {STATS.map((s) => (
            <Reveal key={s.value}>
              <div className="surface h-full rounded-xl p-5">
                <p className="text-3xl font-semibold tracking-[-0.04em]">{s.value}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.label}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Section id="lifecycle" title="Fact lifecycle">
          <p className="max-w-[64ch] leading-relaxed text-muted-foreground">
            One fact quotes a line of code. The code then changes in one of the ways below, and the fact is recalled
            through the real CLI. Served means it is returned (exit 0). Suspect and stale mean it is withheld and recall
            says it does not know (exit 4).
          </p>
          <div className="surface mt-6 rounded-xl p-2">
            <ul className="divide-y divide-border">
              {LIFECYCLE.map((r) => (
                <li key={r.change} className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-6">
                  <span className="text-sm">{r.change}</span>
                  <span
                    className={`font-mono text-xs ${r.outcome === "served" ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {r.outcome}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Source:{" "}
            <a
              href={`${SITE.repo}/blob/main/test/lifecycle.test.ts`}
              target="_blank"
              rel="noreferrer"
              className="font-mono underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
            >
              test/lifecycle.test.ts
            </a>
            . Each case starts from a fresh git repository.
          </p>
        </Section>

        <Section id="what" title="What this measures">
          <ul className="max-w-[64ch] list-disc space-y-2 pl-5 leading-relaxed text-muted-foreground">
            <li>Whether a fact is served or withheld after a specific code change. It is a correctness check.</li>
            <li>
              It is not a rate from real projects, and not a retrieval score. A real codebase changes in more ways than
              sixteen cases cover.
            </li>
            <li>Results come from our own tests. Rerun them below rather than taking them on trust.</li>
          </ul>
        </Section>

        <Section id="not-measured" title="Not measured yet">
          <div className="grid gap-3">
            {NOT_MEASURED.map((n) => (
              <div key={n.title} className="rounded-xl border border-dashed border-foreground/25 p-5">
                <h3 className="font-semibold">{n.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{n.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="reproduce" title="Reproduce">
          <p className="max-w-[64ch] leading-relaxed text-muted-foreground">
            Needs Node 24 or newer and git 2.31 or newer.
          </p>
          <CodeBlock>
            <code className="language-bash">{REPRODUCE}</code>
          </CodeBlock>
        </Section>
      </main>
      <Footer />
    </>
  );
}
