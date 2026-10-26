import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { Logo } from "./logo";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#states", label: "States" },
  { href: "#compare", label: "Compare" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 px-4 pt-4">
      <nav className="glass mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full pr-2 pl-5">
        <a href="#top" aria-label="Elmory home">
          <Logo />
        </a>
        <ul className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="transition-colors hover:text-foreground">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <Button asChild size="lg" variant="outline" className="h-10 bg-transparent">
          <a href={SITE.repo} target="_blank" rel="noreferrer">
            GitHub
            <ArrowUpRight data-icon="inline-end" />
          </a>
        </Button>
      </nav>
    </header>
  );
}
