import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DOCS, neighbours } from "@/lib/docs";

// Every slug is prerendered by generateStaticParams, so skip the instant-shell check on params.
export const instant = false;

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const doc = DOCS.find((d) => d.slug === slug);
  if (!doc) return {};
  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: `/docs/${slug}` },
    openGraph: { title: `${doc.title} | Elmory`, description: doc.description, url: `/docs/${slug}` },
  };
}

export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const { slug } = await params;
  const doc = DOCS.find((d) => d.slug === slug);
  if (!doc) notFound();
  const { default: Content } = await import(`@/content/docs/${slug}.mdx`);
  const { prev, next } = neighbours(slug);

  return (
    <article className="max-w-3xl">
      <h1 className="text-4xl font-semibold tracking-[-0.045em] md:text-5xl">{doc.title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{doc.description}</p>
      <div className="mt-10 border-t border-border pt-2">
        <Content />
      </div>
      <nav aria-label="Pagination" className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
        {prev ? (
          <Link href={`/docs/${prev.slug}`} className="surface group rounded-xl p-4 transition-colors hover:bg-muted">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowLeft className="size-3.5" /> Previous
            </span>
            <span className="mt-1 block font-medium">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={`/docs/${next.slug}`}
            className="surface group rounded-xl p-4 text-right transition-colors hover:bg-muted"
          >
            <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
              Next <ArrowRight className="size-3.5" />
            </span>
            <span className="mt-1 block font-medium">{next.title}</span>
          </Link>
        )}
      </nav>
    </article>
  );
}
