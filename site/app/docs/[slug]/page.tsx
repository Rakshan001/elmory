import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, SquarePen } from "lucide-react";
import { DocsToc, DocsTocInline } from "@/components/site/docs-toc";
import { DOCS, groupOf, neighbours } from "@/lib/docs";
import { searchIndex } from "@/lib/docs-index";
import { SITE } from "@/lib/site";

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
  const headings = searchIndex().find((e) => e.slug === slug)?.headings ?? [];
  const editUrl = `${SITE.repo}/blob/main/site/content/docs/${slug}.mdx`;

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_220px] xl:gap-12">
      <article className="min-w-0 max-w-3xl">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/docs" className="hover:text-foreground">
            Docs
          </Link>
          <ChevronRight className="size-3.5" />
          <span>{groupOf(slug)}</span>
          <ChevronRight className="size-3.5" />
          <span aria-current="page" className="text-foreground">
            {doc.title}
          </span>
        </nav>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] md:text-5xl">{doc.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{doc.description}</p>
        <DocsTocInline headings={headings} />
        <div id="doc-content" className="mt-10 border-t border-border pt-10">
          <Content />
        </div>
        <a
          href={editUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-12 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground xl:hidden"
        >
          <SquarePen className="size-3.5" /> Edit this page on GitHub
        </a>
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
      <DocsToc headings={headings} editUrl={editUrl} />
    </div>
  );
}
