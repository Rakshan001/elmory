import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="relative mt-10 overflow-hidden px-4 pb-10">
      <div className="mx-auto max-w-6xl rounded-[28px] bg-panel px-6 pt-14 pb-8 text-panel-foreground md:px-12 md:pt-20">
        <h2 className="max-w-[18ch] text-3xl leading-tight font-semibold tracking-tighter md:text-5xl">
          Give your agent a memory it can check.
        </h2>
        <div className="mt-9 flex flex-wrap gap-3">
          <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/85">
            <a href="#install">
              Get started
              <ArrowRight data-icon="inline-end" />
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white/20 bg-transparent text-panel-foreground hover:bg-white/10 hover:text-panel-foreground dark:border-white/20 dark:bg-transparent"
          >
            <a href={SITE.repo} target="_blank" rel="noreferrer">
              GitHub
              <ArrowUpRight data-icon="inline-end" />
            </a>
          </Button>
        </div>
        <p
          aria-hidden
          className="mt-16 text-[22vw] leading-[0.8] font-semibold tracking-tighter text-white/[0.06] select-none md:text-[180px]"
        >
          elmory
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-sm text-panel-muted">
          <Logo className="text-panel-foreground" />
          <p>MIT licensed. Built in the open.</p>
        </div>
      </div>
    </footer>
  );
}
