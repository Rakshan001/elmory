"use client";

import { motion, type Variants } from "motion/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
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
        Open source · MIT licensed
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
    </motion.div>
  );
}
