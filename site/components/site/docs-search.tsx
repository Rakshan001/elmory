"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileText, Hash, Search } from "lucide-react";
import type { SearchEntry } from "@/lib/docs-index";

type Hit = { href: string; title: string; context: string; heading: boolean };

function hits(index: SearchEntry[], q: string): Hit[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const all: Hit[] = index.flatMap((p) => [
    { href: `/docs/${p.slug}`, title: p.title, context: p.description, heading: false },
    ...p.headings.map((h) => ({ href: `/docs/${p.slug}#${h.id}`, title: h.text, context: p.title, heading: true })),
  ]);
  if (!terms.length) return all.filter((h) => !h.heading);
  return all
    .filter((h) => terms.every((t) => `${h.title} ${h.context}`.toLowerCase().includes(t)))
    .sort((a, b) => Number(b.title.toLowerCase().includes(terms[0])) - Number(a.title.toLowerCase().includes(terms[0])))
    .slice(0, 12);
}

/** A search box that opens a dialog over the docs. ⌘K or Ctrl+K opens it from anywhere. */
export function DocsSearch({ index, className = "" }: { index: SearchEntry[]; className?: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const results = useMemo(() => hits(index, q), [index, q]);

  const open = () => {
    setQ("");
    setSel(0);
    dialog.current?.showModal();
  };
  const go = (h?: Hit) => {
    if (!h) return;
    dialog.current?.close();
    router.push(h.href);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The desktop and phone layouts each render a search box; only the visible one answers.
      if (!trigger.current?.offsetParent) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={open}
        className={`flex h-9 w-full items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground ${className}`}
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search docs</span>
        <kbd className="hidden font-mono text-[11px] sm:inline">⌘K</kbd>
      </button>

      <dialog
        ref={dialog}
        aria-label="Search documentation"
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        className="m-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                go(results[sel]);
              }
            }}
            placeholder="Search pages and sections"
            aria-label="Search pages and sections"
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <kbd className="font-mono text-[11px] text-muted-foreground">Esc</kbd>
        </div>
        <ul role="listbox" aria-label="Results" className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">No results for “{q}”</li>}
          {results.map((h, i) => (
            <li key={h.href} role="option" aria-selected={i === sel}>
              <button
                type="button"
                onClick={() => go(h)}
                onMouseMove={() => setSel(i)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${i === sel ? "bg-muted" : ""}`}
              >
                {h.heading ? (
                  <Hash className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{h.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{h.context}</span>
                </span>
                {i === sel && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />}
              </button>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
