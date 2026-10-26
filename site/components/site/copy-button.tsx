"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1800);
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy to clipboard"
      className="absolute top-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs text-panel-foreground transition hover:bg-white/15 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-white/40 focus-visible:outline-none"
    >
      {state === "copied" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}</span>
    </button>
  );
}
