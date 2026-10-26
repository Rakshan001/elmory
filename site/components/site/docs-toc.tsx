"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { ArrowUp, ChevronDown, SquarePen } from "lucide-react";

type Heading = { id: string; text: string };

/** Tracks which heading is being read, and how far through the article the reader is. */
function useReading(headings: Heading[]) {
  const [active, setActive] = useState(headings[0]?.id);
  const progress = useMotionValue(0);

  useEffect(() => {
    const onScroll = () => {
      const article = document.getElementById("doc-content");
      if (article) {
        const r = article.getBoundingClientRect();
        const read = (window.innerHeight * 0.35 - r.top) / r.height;
        progress.set(Math.min(1, Math.max(0, read)));
      }
      // The last heading above the top quarter of the screen is the one being read.
      let current = headings[0]?.id;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.25) current = h.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [headings, progress]);

  return { active, progress };
}

/** Right-hand "On this page" column, with a reading-progress track beside the links. */
export function DocsToc({ headings, editUrl }: { headings: Heading[]; editUrl: string }) {
  const { active, progress } = useReading(headings);
  const scaleY = useSpring(progress, { stiffness: 200, damping: 40, restDelta: 0.001 });

  return (
    <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] self-start overflow-y-auto py-8 xl:block">
      {headings.length > 0 && (
        <>
          <p className="mb-3 text-xs font-semibold">On this page</p>
          <div className="relative">
            <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-border" />
            <motion.span aria-hidden style={{ scaleY }} className="absolute inset-y-0 left-0 w-px origin-top bg-foreground" />
            <ul className="grid gap-0.5 text-[13px]">
              {headings.map((h) => (
                <li key={h.id}>
                  <a
                    href={`#${h.id}`}
                    aria-current={active === h.id ? "location" : undefined}
                    className={`block py-1 pl-4 leading-snug transition-colors ${
                      active === h.id ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <div className="mt-6 grid gap-2 border-t border-border pt-5 text-[13px] text-muted-foreground">
        <a href={editUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-foreground">
          <SquarePen className="size-3.5" /> Edit this page on GitHub
        </a>
        <a href="#" className="inline-flex items-center gap-2 hover:text-foreground">
          <ArrowUp className="size-3.5" /> Back to top
        </a>
      </div>
    </aside>
  );
}

/** The same links, folded into the top of the article below the xl breakpoint. */
export function DocsTocInline({ headings }: { headings: Heading[] }) {
  if (headings.length === 0) return null;
  return (
    <details className="group mt-8 rounded-lg border border-border xl:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
        On this page
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="grid gap-0.5 border-t border-border px-4 py-3 text-sm">
        {headings.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} className="block py-1 text-muted-foreground hover:text-foreground">
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
