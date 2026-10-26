"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { DOCS } from "@/lib/docs";

function DocLinks({ onPick }: { onPick?: () => void }) {
  const path = usePathname();
  return (
    <ul className="grid gap-0.5 text-sm">
      {DOCS.map((d) => {
        const active = path === `/docs/${d.slug}`;
        return (
          <li key={d.slug}>
            <Link
              href={`/docs/${d.slug}`}
              onClick={onPick}
              aria-current={active ? "page" : undefined}
              className={`block rounded-lg px-3 py-2 transition-colors ${
                active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d.title}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** A sticky list on desktop; a collapsible menu on phones. */
export function DocsSidebar() {
  const path = usePathname();
  const current = DOCS.find((d) => path === `/docs/${d.slug}`);
  return (
    <>
      <nav aria-label="Docs" className="sticky top-24 hidden self-start lg:block">
        <p className="mb-3 px-3 font-mono text-xs text-muted-foreground">Documentation</p>
        <DocLinks />
      </nav>
      <details className="group surface rounded-xl lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
          {current?.title ?? "Documentation"}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border p-2">
          <DocLinks />
        </div>
      </details>
    </>
  );
}
