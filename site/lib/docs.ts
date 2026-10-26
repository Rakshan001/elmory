import { meta as agentRules } from "@/content/docs/agent-rules.mdx";
import { meta as cli } from "@/content/docs/cli.mdx";
import { meta as concepts } from "@/content/docs/concepts.mdx";
import { meta as connectAgents } from "@/content/docs/connect-agents.mdx";
import { meta as introduction } from "@/content/docs/introduction.mdx";
import { meta as limits } from "@/content/docs/limits.mdx";
import { meta as quickstart } from "@/content/docs/quickstart.mdx";
import { meta as storage } from "@/content/docs/storage.mdx";

export type Doc = { slug: string; title: string; description: string; order: number };

/** Every docs page, in reading order. Adding a page means adding its .mdx file and one line here. */
export const DOCS: Doc[] = Object.entries({
  "agent-rules": agentRules,
  cli,
  concepts,
  "connect-agents": connectAgents,
  introduction,
  limits,
  quickstart,
  storage,
})
  .map(([slug, m]) => ({ slug, ...m }))
  .sort((a, b) => a.order - b.order);

/** Sidebar sections, in order. Every slug in DOCS belongs to exactly one group. */
export const GROUPS: { title: string; slugs: string[] }[] = [
  { title: "Getting started", slugs: ["introduction", "quickstart", "connect-agents"] },
  { title: "Core concepts", slugs: ["concepts", "storage", "agent-rules"] },
  { title: "Reference", slugs: ["cli", "limits"] },
];

export function groupOf(slug: string): string | undefined {
  return GROUPS.find((g) => g.slugs.includes(slug))?.title;
}

export function neighbours(slug: string): { prev?: Doc; next?: Doc } {
  const i = DOCS.findIndex((d) => d.slug === slug);
  return { prev: DOCS[i - 1], next: DOCS[i + 1] };
}
