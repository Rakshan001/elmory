"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "./copy-button";
import { EASE } from "./motion";

type Option = { id: string; label: string; code: string };

/** Underlined tabs; the underline slides to the picked option. */
export function InstallTabs({ options }: { options: Option[] }) {
  const [active, setActive] = useState(options[0].id);
  return (
    <Tabs value={active} onValueChange={setActive}>
      <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
        {options.map((o) => (
          <TabsTrigger
            key={o.id}
            value={o.id}
            className="relative h-10 flex-none rounded-none border-0 bg-transparent px-3 shadow-none data-active:bg-transparent data-active:shadow-none sm:px-4 dark:data-active:bg-transparent"
          >
            {o.label}
            {active === o.id && (
              <motion.span
                layoutId="install-tab"
                aria-hidden
                className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground"
                transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
              />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {options.map((o) => (
        <TabsContent key={o.id} value={o.id} className="mt-4 min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="relative rounded-lg bg-panel text-panel-foreground"
          >
            <CopyButton text={o.code} />
            <pre className="code-wrap p-5 pt-14 font-mono text-[12.5px] leading-6 sm:pt-5 sm:pr-28">
              <code>{o.code}</code>
            </pre>
          </motion.div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
