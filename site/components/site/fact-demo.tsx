"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RotateCcw, SquarePen } from "lucide-react";

// Text from a real run of the Elmory CLI (remember, edit the quoted line, recall again).
const ID = "f_wy2lnewyj4xgdx3jcnmnbx2a7x";

const swap = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
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
  const s = swap;

  return (
    <div className="relative">
      {/* A second card peeking out behind, like a stack of records. */}
      <div
        aria-hidden
        className="absolute inset-x-6 -bottom-3 h-full rounded-[28px] bg-panel/50 dark:bg-panel/70"
      />
      <div className="relative rounded-[28px] bg-panel p-4 text-panel-foreground shadow-[0_40px_80px_-40px_rgb(20_28_16/0.7)] sm:p-5">
        <div className="flex items-center justify-between px-1 pb-3 font-mono text-xs text-panel-muted">
          <span className="rounded-full bg-white/8 px-3 py-1">src/session.ts</span>
          <span>{edited ? "edited just now" : "committed"}</span>
        </div>

        <pre className="rounded-2xl bg-black/20 p-4 font-mono text-[12.5px] leading-6 break-words whitespace-pre-wrap text-panel-foreground/90">
          <code>
            <span className="text-panel-muted">export function </span>sessionTtl(): number {"{"}
            {"\n"}
            <span
              className={`-mx-4 block px-4 transition-colors duration-500 ${edited ? "bg-accent/15" : ""}`}
            >
              {"  return "}
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={edited ? "30" : "15"} className="inline-block font-semibold text-accent" {...s}>
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
          className={`mt-4 rounded-2xl p-5 transition-colors duration-500 ${
            edited
              ? "bg-white/6 text-panel-foreground ring-1 ring-accent/30 ring-inset"
              : "bg-accent text-accent-foreground"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={edited ? "suspect" : "holds"}
                {...s}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  edited ? "bg-accent text-accent-foreground" : "bg-accent-foreground/10"
                }`}
              >
                {edited ? "Suspect, withheld" : "Holds, served"}
              </motion.span>
            </AnimatePresence>
            <span className="font-mono text-xs opacity-70">fact · gotcha</span>
          </div>
          <h3 className="mt-4 text-lg font-semibold tracking-tight">Session TTL is 15 minutes</h3>
          <p className="mt-1 text-sm opacity-80">
            Sessions expire after 15 minutes idle; the TTL lives in sessionTtl().
          </p>
          <p className="mt-4 font-mono text-xs opacity-70">
            {edited ? "quoted line not found in this worktree" : "evidence unchanged since 2026-10-26"}
          </p>
        </article>

        <div className="mt-4 rounded-2xl bg-black/20 p-4 font-mono text-[12px] leading-5">
          <p className="text-panel-muted">$ elmory recall &quot;session ttl&quot;</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={edited ? "abstain" : "hit"} {...s}>
              {edited ? (
                <p className="mt-1">
                  I don&apos;t know: 1 matches but none hold: 1 suspect
                  <br />
                  <span className="text-panel-muted">
                    {"  "}
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

        <div className="mt-4 flex items-center justify-between gap-3 px-1">
          <p className="text-xs text-panel-muted" aria-live="polite">
            {edited ? "The code changed, so recall says it doesn’t know." : "The quote is still in the code."}
          </p>
          <button
            type="button"
            onClick={toggle}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-white/10 px-4 text-xs font-medium transition hover:bg-white/15 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-accent/50 focus-visible:outline-none"
          >
            {edited ? <RotateCcw className="size-3.5" /> : <SquarePen className="size-3.5" />}
            {edited ? "Undo the edit" : "Edit the code"}
          </button>
        </div>
      </div>
    </div>
  );
}
