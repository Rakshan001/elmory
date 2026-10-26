import type { MetadataRoute } from "next";
import { DOCS } from "@/lib/docs";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE.url, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE.url}/docs`, changeFrequency: "weekly", priority: 0.8 },
    ...DOCS.map((d) => ({ url: `${SITE.url}/docs/${d.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
