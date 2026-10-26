"use client";

import { useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EASE } from "./motion";

type Step = { id: string; title: string; text: string; out: string };

const STEP_MS = 7000;

/**
 * Steps play through on their own while in view, each with a thin progress line. Picking a
 * step stops the autoplay. The terminal prints its lines one after another.
 */
export function Steps({ steps }: { steps: Step[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [active, setActive] = useState(steps[0].id);
  const [auto, setAuto] = useState(true);
  const playing = auto && inView && !reduce;

  const next = () => {
    const i = steps.findIndex((s) => s.id === active);
    setActive(steps[(i + 1) % steps.length].id);
  };

  return (
    <div ref={ref}>
      <Tabs
        value={active}
        onValueChange={(v) => {
          setAuto(false);
          setActive(v);
        }}
        orientation="vertical"
        className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)] lg:gap-6"
      >
        <TabsList className="h-fit w-full gap-2 bg-transparent p-0">
          {steps.map((s, i) => (
            <TabsTrigger
              key={s.id}
              value={s.id}
              className="relative h-auto w-full flex-col items-start gap-1 overflow-hidden rounded-xl border border-border bg-transparent px-5 py-4 text-left whitespace-normal transition-colors hover:bg-card/80 data-active:surface dark:data-active:bg-card"
            >
              <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              <span className="text-base font-semibold text-foreground">{s.title}</span>
              <span className="text-sm leading-relaxed font-normal text-muted-foreground">{s.text}</span>
              {active === s.id && playing && (
                <motion.span
                  key={`${s.id}-progress`}
                  aria-hidden
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: STEP_MS / 1000, ease: "linear" }}
                  onAnimationComplete={next}
                  className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-foreground"
                />
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {steps.map((s) => (
          <TabsContent key={s.id} value={s.id} className="min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="h-full rounded-xl bg-panel p-2 text-panel-foreground"
            >
              <p className="px-3 py-2.5 font-mono text-xs text-panel-muted">terminal</p>
              <pre className="code-wrap min-h-64 rounded-lg bg-white/[0.04] p-5 font-mono text-[12.5px] leading-6">
                <code>
                  {s.out.split("\n").map((line, i) => (
                    <motion.span
                      key={i}
                      className="block"
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.07, duration: 0.3, ease: EASE }}
                    >
                      {line.startsWith("$") ? (
                        <>
                          <span className="text-panel-muted">$</span>
                          {line.slice(1)}
                        </>
                      ) : (
                        line || " "
                      )}
                    </motion.span>
                  ))}
                </code>
              </pre>
            </motion.div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
