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
    "elmory": { "command": "elmory-mcp", "env": { "ELMORY_OBSERVER": "agent:claude-code" } }
  }
}`,
  },
];

export function Install() {
  return (
    <section id="install" className="mx-auto w-full max-w-6xl px-4 py-20 md:py-28">
      <div className="grid gap-10 rounded-[28px] bg-card p-6 ring-1 ring-border md:p-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tighter md:text-5xl">Get started</h2>
          <p className="mt-4 max-w-[40ch] text-lg leading-relaxed text-muted-foreground">
            Install the CLI, then connect any agent that runs MCP servers over stdio.
          </p>
          <p className="mt-6 max-w-[40ch] text-sm leading-relaxed text-muted-foreground">
            Needs Node 24 or newer and git 2.31 or newer. Elmory is not on npm yet, so install from source until
            the first release.
          </p>
        </Reveal>
        <Reveal delay={0.06} className="min-w-0">
          <Tabs defaultValue="source">
            <TabsList className="h-10 rounded-full p-1">
              {OPTIONS.map((o) => (
                <TabsTrigger key={o.id} value={o.id} className="rounded-full px-4">
                  {o.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {OPTIONS.map((o) => (
              <TabsContent key={o.id} value={o.id} className="mt-3 min-w-0">
                <div className="relative rounded-2xl bg-panel text-panel-foreground">
                  <CopyButton text={o.code} />
                  <pre className="overflow-x-auto p-5 pr-24 font-mono text-[12.5px] leading-6">
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
