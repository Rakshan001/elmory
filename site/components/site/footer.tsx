import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { Logo, Mark } from "./logo";
import { Magnetic, ScrollDrift } from "./motion";

export function Footer() {
  return (
    <footer className="px-4 pb-8 md:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-xl bg-panel px-6 pt-14 pb-8 text-panel-foreground md:px-12 md:pt-20">
        <ScrollDrift className="pointer-events-none absolute -right-10 -bottom-16">
          <Mark className="h-80 w-auto text-white/[0.05] md:h-[26rem]" />
        </ScrollDrift>
        <h2 className="relative max-w-[18ch] text-3xl leading-tight font-semibold tracking-[-0.04em] md:text-[2.5rem]">
          Give your agent a memory it can check.
        </h2>
        <div className="relative mt-9 flex flex-wrap gap-3">
          <Magnetic>
            <Button asChild size="lg" className="group bg-white text-[#171717] hover:bg-white/90">
              <Link href="/#install">
                Get started
                <ArrowRight data-icon="inline-end" className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </Magnetic>
          <Magnetic>
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
          </Magnetic>
        </div>
        <div className="relative mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-sm text-panel-muted">
          <Logo className="text-panel-foreground" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/docs" className="hover:text-panel-foreground">
              Docs
            </Link>
            <a href={SITE.repo} target="_blank" rel="noreferrer" className="hover:text-panel-foreground">
              GitHub
            </a>
            <span>MIT licensed</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
