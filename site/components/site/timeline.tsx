"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring } from "motion/react";

type Day = { day: string; text: string };

/** Three days in order; a rule draws across (down, on phones) as the section scrolls past. */
export function Timeline({ days }: { days: Day[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 55%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

  return (
    <ol ref={ref} className="relative mt-14 grid gap-10 pl-6 md:grid-cols-3 md:gap-8 md:pt-10 md:pl-0">
      {/* Track, then the part that has been read. */}
      <span aria-hidden className="absolute top-0 bottom-0 left-0 w-px bg-border md:top-0 md:right-0 md:bottom-auto md:h-px md:w-auto" />
      <motion.span
        aria-hidden
        style={{ scaleY: progress }}
        className="absolute top-0 bottom-0 left-0 w-px origin-top bg-foreground md:hidden"
      />
      <motion.span
        aria-hidden
        style={{ scaleX: progress }}
        className="absolute top-0 right-0 left-0 hidden h-px origin-left bg-foreground md:block"
      />
      {days.map((d, i) => (
        <li key={d.day} className="reveal">
          <p className="font-mono text-xs text-muted-foreground">
            0{i + 1} · {d.day}
          </p>
          <p className={`mt-2 max-w-[32ch] leading-relaxed ${i === 2 ? "font-medium" : ""}`}>{d.text}</p>
        </li>
      ))}
    </ol>
  );
}
