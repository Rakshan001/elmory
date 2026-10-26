import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DOCS } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Install Elmory, connect your coding agent, and learn how evidence-checked memory works.",
  alternates: { canonical: "/docs" },
};

export default function DocsIndex() {
  return (
    <div>
      <h1 className="text-4xl font-semibold tracking-[-0.045em] md:text-5xl">Documentation</h1>
      <p className="mt-4 max-w-[56ch] text-lg leading-relaxed text-muted-foreground">
        Install Elmory, connect your coding agent, and learn how evidence-checked memory decides what to serve.
      </p>
      <ul className="mt-12 grid gap-3 sm:grid-cols-2">
        {DOCS.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/docs/${d.slug}`}
              className="surface group flex h-full flex-col justify-between gap-6 rounded-xl p-5 transition-colors hover:bg-muted"
            >
              <span>
                <span className="block font-semibold">{d.title}</span>
                <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">{d.description}</span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
