"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RotateCcw, SquarePen } from "lucide-react";

// Text from a real run of the Elmory CLI (remember, edit the quoted line, recall again).
const ID = "f_wy2lnewyj4xgdx3jcnmnbx2a7x";

const swap = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
};

export function FactDemo() {
  const reduce = useReducedMotion();
  const [edited, setEdited] = useState(false);
  const [touched, setTouched] = useState(false);

  // Play the edit once on load so the point lands without a click.
  useEffect(() => {
    if (reduce || touched) return;
    const t = setTimeout(() => setEdited(true), 2600);
    return () => clearTimeout(t);
  }, [reduce, touched]);

  const toggle = () => {
    setTouched(true);
    setEdited((e) => !e);
  };

  return (
    <div className="rounded-xl bg-panel p-3 text-panel-foreground shadow-[0_0_0_1px_rgb(255_255_255/0.06),0_24px_48px_-24px_rgb(0_0_0/0.45)] sm:p-4">
      <div className="flex items-center justify-between gap-3 px-1 pb-3 font-mono text-xs text-panel-muted">
        <span className="rounded-full bg-white/8 px-2.5 py-1">src/session.ts</span>
        <span>{edited ? "edited just now" : "committed"}</span>
      </div>

      <pre className="code-wrap rounded-lg bg-white/[0.04] p-4 font-mono text-[12.5px] leading-6 ring-1 ring-white/[0.06] ring-inset">
        <code>
          <span className="text-panel-muted">export function </span>sessionTtl(): number {"{"}
          {"\n"}
          <span className={`-mx-4 block px-4 transition-colors duration-500 ${edited ? "bg-white/10" : ""}`}>
            {"  return "}
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={edited ? "30" : "15"} className="inline-block font-semibold text-white" {...swap}>
                {edited ? "30" : "15"}
              </motion.span>
            </AnimatePresence>
            {" * 60 * 1000; "}
            <span className="text-panel-muted">
              {"// sessions expire after "}
              {edited ? "thirty" : "fifteen"}
              {" minutes of idle time"}
            </span>
          </span>
          {"}"}
        </code>
      </pre>

      <article
        className={`mt-3 rounded-lg p-5 transition-colors duration-500 ${
          edited
            ? "bg-transparent text-panel-foreground ring-1 ring-white/20 ring-inset [background-image:repeating-linear-gradient(135deg,rgb(255_255_255/0.035)_0_6px,transparent_6px_12px)]"
            : "bg-white text-[#171717]"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={edited ? "suspect" : "holds"}
              {...swap}
              className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] ${
                edited ? "bg-white/12 text-white" : "bg-[#171717] text-white"
              }`}
            >
              {edited ? "suspect, withheld" : "holds, served"}
            </motion.span>
          </AnimatePresence>
          <span className="font-mono text-[11px] opacity-60">fact · gotcha</span>
        </div>
        <h3 className="mt-4 text-lg font-semibold tracking-tight">Session TTL is 15 minutes</h3>
        <p className="mt-1 text-sm opacity-75">Sessions expire after 15 minutes idle; the TTL lives in sessionTtl().</p>
        <p className="mt-4 font-mono text-[11px] opacity-60">
          {edited ? "quoted line not found in this worktree" : "evidence unchanged since 2026-10-26"}
        </p>
      </article>

      <div className="mt-3 rounded-lg bg-white/[0.04] p-4 font-mono text-[12px] leading-5 ring-1 ring-white/[0.06] ring-inset">
        <p className="text-panel-muted">$ elmory recall &quot;session ttl&quot;</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={edited ? "abstain" : "hit"} {...swap} className="[overflow-wrap:anywhere]">
            {edited ? (
              <p className="mt-1">
                I don&apos;t know: 1 matches but none hold: 1 suspect
                <br />
                <span className="text-panel-muted">
                  {ID} is suspect (not-found)
                </span>
              </p>
            ) : (
              <p className="mt-1">
                ## Session TTL is 15 minutes
                <br />
                <span className="text-panel-muted">labels: evidence unchanged since 2026-10-26</span>
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-panel-muted" aria-live="polite">
          {edited ? "The code changed, so recall says it doesn’t know." : "The quote is still in the code."}
        </p>
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-xs font-medium text-[#171717] transition hover:bg-white/90 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-white/40 focus-visible:outline-none"
        >
          {edited ? <RotateCcw className="size-3.5" /> : <SquarePen className="size-3.5" />}
          {edited ? "Undo the edit" : "Edit the code"}
        </button>
      </div>
    </div>
  );
}
