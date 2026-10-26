import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { Logo } from "./logo";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#states", label: "States" },
  { href: "/#compare", label: "Compare" },
  { href: "/#faq", label: "FAQ" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" aria-label="Elmory home">
          <Logo />
        </Link>
        <ul className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="rounded-full px-3 py-2 transition-colors hover:bg-muted hover:text-foreground">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1">
          <Link href="/docs" className="rounded-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground md:hidden">
            Docs
          </Link>
          <Button asChild variant="outline" className="surface h-9 px-4">
            <a href={SITE.repo} target="_blank" rel="noreferrer">
              GitHub
              <ArrowUpRight data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </nav>
    </header>
  );
}
