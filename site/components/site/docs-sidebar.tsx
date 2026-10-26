"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { DOCS, GROUPS } from "@/lib/docs";
import type { SearchEntry } from "@/lib/docs-index";
import { DocsSearch } from "./docs-search";

const TITLE = Object.fromEntries(DOCS.map((d) => [d.slug, d.title]));

function DocLinks({ id }: { id: string }) {
  const path = usePathname();
  return (
    <div className="grid gap-6">
      <Link
        href="/docs"
        className={`px-3 text-sm transition-colors ${path === "/docs" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        Overview
      </Link>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-2 px-3 text-xs font-semibold text-foreground">{g.title}</p>
          <ul className="ml-3 grid gap-0.5 border-l border-border text-sm">
            {g.slugs.map((slug) => {
              const active = path === `/docs/${slug}`;
              return (
                <li key={slug} className="relative">
                  {active && (
                    <motion.span
                      layoutId={id}
                      aria-hidden
                      className="absolute inset-y-0 -left-px w-px bg-foreground"
                      transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
                    />
                  )}
                  <Link
                    href={`/docs/${slug}`}
                    aria-current={active ? "page" : undefined}
                    className={`block py-1.5 pr-3 pl-4 transition-colors ${
                      active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {TITLE[slug]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Sticky grouped nav on desktop; a bar with search and a slide-out menu on smaller screens. */
export function DocsSidebar({ index }: { index: SearchEntry[] }) {
  const path = usePathname();
  const drawer = useRef<HTMLDialogElement>(null);
  const current = DOCS.find((d) => path === `/docs/${d.slug}`);

  // Close the drawer after a navigation.
  useEffect(() => {
    drawer.current?.close();
  }, [path]);

  return (
    <>
      <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] self-start overflow-y-auto py-8 pr-2 lg:block">
        <DocsSearch index={index} className="mb-6" />
        <nav aria-label="Docs">
          <DocLinks id="docs-active" />
        </nav>
      </aside>

      <div className="sticky top-16 z-30 -mx-4 flex items-center gap-2 border-b border-border bg-background/90 px-4 py-2 backdrop-blur-md md:-mx-6 md:px-6 lg:hidden">
        <button
          type="button"
          onClick={() => drawer.current?.showModal()}
          aria-label="Open docs menu"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm"
        >
          <Menu className="size-4" />
          <span className="max-w-[9rem] truncate sm:max-w-none">{current?.title ?? "Overview"}</span>
        </button>
        <DocsSearch index={index} className="flex-1" />
      </div>

      <dialog
        ref={drawer}
        aria-label="Docs menu"
        onClick={(e) => e.target === drawer.current && drawer.current.close()}
        className="m-0 h-dvh max-h-none w-[min(20rem,85vw)] max-w-none border-r border-border bg-background p-0 text-foreground backdrop:bg-black/40 open:animate-in open:slide-in-from-left lg:hidden"
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <span className="text-sm font-semibold">Documentation</span>
          <button
            type="button"
            onClick={() => drawer.current?.close()}
            aria-label="Close docs menu"
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>
        <nav aria-label="Docs" className="overflow-y-auto p-4">
          <DocLinks id="docs-active-mobile" />
        </nav>
      </dialog>
    </>
  );
}
