import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { FactDemo } from "./fact-demo";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden border-b border-border">
      {/* Faint grid, fading out toward the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent_75%)] opacity-70"
      />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-14 pb-20 md:px-6 md:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pb-24">
        <div>
          <p className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground">
            Open source, MIT licensed
          </p>
          <h1 className="mt-6 text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.05em] md:text-5xl lg:text-[3.5rem]">
            Memory that checks the code first.
          </h1>
          <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
            Every fact Elmory stores quotes the code it relies on. Change that code, and the fact stops being
            served.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="#install">
                Get started
                <ArrowRight data-icon="inline-end" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="surface">
              <a href={SITE.repo} target="_blank" rel="noreferrer">
                GitHub
                <ArrowUpRight data-icon="inline-end" />
              </a>
            </Button>
          </div>
        </div>
        <div className="min-w-0">
          <FactDemo />
        </div>
      </div>
    </section>
  );
}
