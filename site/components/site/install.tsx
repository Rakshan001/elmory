import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "./copy-button";
import { Reveal } from "./reveal";

// Commands match the Install and MCP sections of the README.
const OPTIONS = [
  {
    id: "source",
    label: "Install",
    code: `git clone https://github.com/Rakshan001/elmory.git && cd elmory
npm install && npm run build && npm link`,
  },
  {
    id: "claude",
    label: "Claude Code",
    code: `claude mcp add --env ELMORY_OBSERVER=agent:claude-code --transport stdio elmory -- elmory-mcp`,
  },
  {
    id: "mcp",
    label: ".mcp.json",
    code: `{
  "mcpServers": {
    "elmory": {
      "command": "elmory-mcp",
      "env": { "ELMORY_OBSERVER": "agent:claude-code" }
    }
  }
}`,
  },
];

export function Install() {
  return (
    <section id="install" className="mx-auto w-full max-w-6xl px-4 py-20 md:px-6 md:py-28">
      <div className="surface grid gap-10 rounded-xl p-6 md:p-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
        <Reveal>
          <p className="font-mono text-xs text-muted-foreground">Install</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] md:text-[2.5rem]">Get started</h2>
          <p className="mt-4 max-w-[40ch] text-lg leading-relaxed text-muted-foreground">
            Install the CLI, then connect any agent that runs MCP servers over stdio.
          </p>
          <p className="mt-6 max-w-[40ch] text-sm leading-relaxed text-muted-foreground">
            Needs Node 24 or newer and git 2.31 or newer. Elmory is not on npm yet, so install from source until the
            first release.
          </p>
          <Link
            href="/docs/quickstart"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
          >
            Read the quickstart
            <ArrowRight className="size-3.5" />
          </Link>
        </Reveal>
        <Reveal className="min-w-0">
          <Tabs defaultValue="source">
            <TabsList className="h-10 p-1">
              {OPTIONS.map((o) => (
                <TabsTrigger key={o.id} value={o.id} className="px-3 sm:px-4">
                  {o.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {OPTIONS.map((o) => (
              <TabsContent key={o.id} value={o.id} className="mt-3 min-w-0">
                <div className="relative rounded-lg bg-panel text-panel-foreground">
                  <CopyButton text={o.code} />
                  <pre className="code-wrap p-5 pt-14 font-mono text-[12.5px] leading-6 sm:pt-5 sm:pr-28">
                    <code>{o.code}</code>
                  </pre>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </Reveal>
      </div>
    </section>
  );
}
