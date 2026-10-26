import Link from "next/link";
import type { MDXComponents } from "mdx/types";
import { Link2 } from "lucide-react";
import { CodeBlock } from "@/components/site/code-block";

/** A heading with a link to itself that shows on hover or focus. */
function Anchor({ id, children }: { id?: string; children: React.ReactNode }) {
  if (!id) return children;
  return (
    <>
      {children}
      <a
        href={`#${id}`}
        aria-label="Link to this section"
        className="ml-2 inline-flex translate-y-[-1px] align-middle text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
      >
        <Link2 className="size-4" />
      </a>
    </>
  );
}

// Typography for docs pages. Code blocks wrap instead of scrolling, like the rest of the site.
const components: MDXComponents = {
  h2: ({ children, ...props }) => (
    <h2
      className="group mt-14 mb-4 scroll-mt-28 border-t border-border pt-10 text-2xl font-semibold tracking-[-0.03em] first:mt-0 first:border-0 first:pt-0"
      {...props}
    >
      <Anchor id={props.id}>{children}</Anchor>
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="group mt-10 mb-3 scroll-mt-28 text-lg font-semibold tracking-tight" {...props}>
      <Anchor id={props.id}>{children}</Anchor>
    </h3>
  ),
  p: (props) => <p className="my-4 leading-7 text-muted-foreground [&_strong]:text-foreground" {...props} />,
  ul: (props) => <ul className="my-4 list-disc space-y-2 pl-6 leading-7 text-muted-foreground marker:text-foreground/40" {...props} />,
  ol: (props) => <ol className="my-4 list-decimal space-y-2 pl-6 leading-7 text-muted-foreground marker:text-foreground/40" {...props} />,
  li: (props) => <li className="pl-1 [&_strong]:text-foreground" {...props} />,
  a: ({ href = "", ...props }) =>
    href.startsWith("/") || href.startsWith("#") ? (
      <Link href={href} className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground" {...props} />
    ) : (
      <a href={href} target="_blank" rel="noreferrer" className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground" {...props} />
    ),
  code: (props) => (
    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground [overflow-wrap:anywhere] [pre_&]:bg-transparent [pre_&]:p-0 [pre_&]:text-inherit" {...props} />
  ),
  pre: (props) => <CodeBlock {...props} />,
  table: (props) => (
    <div className="surface my-6 rounded-xl">
      <table className="docs-table w-full text-left text-sm [&_tr+tr]:border-t [&_tr+tr]:border-border" {...props} />
    </div>
  ),
  thead: (props) => <thead className="border-b border-border" {...props} />,
  th: (props) => <th className="px-3 py-3 align-bottom font-semibold sm:px-4" {...props} />,
  td: (props) => (
    <td
      className="px-3 py-3 align-top leading-6 text-muted-foreground sm:px-4 [overflow-wrap:anywhere]"
      {...props}
    />
  ),
  blockquote: (props) => <blockquote className="my-6 border-l-2 border-foreground/20 pl-5 italic" {...props} />,
  hr: () => <hr className="my-12 border-border" />,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
