"use client";

import { isValidElement, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

const LANG: Record<string, string> = { bash: "Terminal", sh: "Terminal", json: "JSON", toml: "TOML", ts: "TypeScript", text: "Text" };

/** An MDX code block: a header with the language and a copy button, then wrapped code. */
export function CodeBlock(props: React.ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const cls = isValidElement<{ className?: string }>(props.children) ? (props.children.props.className ?? "") : "";
  const lang = /language-(\w+)/.exec(cls)?.[1];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.current?.textContent?.trimEnd() ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard blocked: leave the button as it was. */
    }
  };

  return (
    <div className="my-6 overflow-hidden rounded-xl border border-border bg-panel text-panel-foreground">
      <div className="flex h-10 items-center justify-between border-b border-white/10 pr-2 pl-4">
        <span className="font-mono text-xs text-panel-muted">{lang ? (LANG[lang] ?? lang) : "Code"}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="inline-flex size-8 items-center justify-center rounded-md text-panel-muted transition-colors hover:bg-white/10 hover:text-panel-foreground focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <pre ref={ref} {...props} className="code-wrap p-4 font-mono text-[13px] leading-6 sm:p-5" />
    </div>
  );
}
