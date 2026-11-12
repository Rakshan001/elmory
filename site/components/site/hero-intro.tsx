"use client";

import { motion, type Variants } from "motion/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { CopyButton } from "./copy-button";
import { EASE, Magnetic } from "./motion";

const group: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export function HeroIntro() {
  return (
    <motion.div variants={group} initial="hidden" animate="show">
      <motion.p variants={rise} className="font-mono text-xs text-muted-foreground">
        Open source · MIT licensed · on npm
      </motion.p>

      <motion.h1
        variants={rise}
        className="mt-5 text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.05em] text-balance md:text-5xl lg:text-[3.5rem]"
      >
        Memory that checks the code first.
      </motion.h1>

      <motion.p variants={rise} className="mt-6 max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
        Every fact Elmory stores quotes the code it relies on. Change that code, and the fact stops being served.
      </motion.p>

      <motion.div variants={rise} className="mt-9 flex flex-wrap gap-3">
        <Magnetic>
          <Button asChild size="lg" className="group">
            <a href="#install">
              Get started
              <ArrowRight data-icon="inline-end" className="transition-transform group-hover:translate-x-0.5" />
            </a>
          </Button>
        </Magnetic>
        <Magnetic>
          <Button asChild size="lg" variant="outline" className="surface group">
            <a href={SITE.repo} target="_blank" rel="noreferrer">
              GitHub
              <ArrowUpRight
                data-icon="inline-end"
                className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </a>
          </Button>
        </Magnetic>
      </motion.div>

      <motion.div
        variants={rise}
        className="surface mt-6 flex w-full max-w-sm items-center justify-between gap-3 rounded-md py-1.5 pr-1.5 pl-4"
      >
        <code className="truncate font-mono text-sm">
          <span className="text-muted-foreground select-none">$ </span>npm i -g elmory
        </code>
        <CopyButton
          text="npm i -g elmory"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        />
      </motion.div>
      <motion.p variants={rise} className="mt-3 text-sm text-muted-foreground">
        Published on{" "}
        <a href={SITE.npm} target="_blank" rel="noreferrer" className="underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground">
          npm
        </a>
        . No need to clone the repository.
      </motion.p>
    </motion.div>
  );
}
