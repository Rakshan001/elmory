import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { FactDemo } from "./fact-demo";

export function Hero() {
  return (
    <section id="top" className="relative mx-auto w-full max-w-6xl px-4 pt-14 pb-20 md:pt-20 lg:pb-28">
      <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Open-source memory for coding agents</p>
          <h1 className="mt-5 text-4xl leading-[1.05] font-semibold tracking-tighter md:text-5xl">
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
            <Button asChild size="lg" variant="outline" className="bg-transparent">
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
