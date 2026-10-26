import { readFileSync } from "node:fs";
import path from "node:path";
import GithubSlugger from "github-slugger";
import { DOCS, groupOf } from "./docs";

export type SearchEntry = {
  slug: string;
  title: string;
  description: string;
  group: string;
  headings: { id: string; text: string }[];
};

/**
 * Pages and their ## / ### headings, for search. Ids come from the same slugger rehype-slug uses,
 * so a result links straight to the heading on the page.
 */
export function searchIndex(): SearchEntry[] {
  return DOCS.map((d) => {
    const src = readFileSync(path.join(process.cwd(), "content/docs", `${d.slug}.mdx`), "utf8");
    const slugger = new GithubSlugger();
    const headings: SearchEntry["headings"] = [];
    let inCode = false;
    for (const line of src.split("\n")) {
      if (line.startsWith("```")) inCode = !inCode;
      const m = !inCode && /^#{2,3} (.+)$/.exec(line);
      if (!m) continue;
      const text = m[1].replace(/`/g, "").trim();
      headings.push({ id: slugger.slug(text), text });
    }
    return { slug: d.slug, title: d.title, description: d.description, group: groupOf(d.slug) ?? "", headings };
  });
}
