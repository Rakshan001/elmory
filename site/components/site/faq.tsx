import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Reveal } from "./reveal";

const FAQ = [
  {
    q: "Does it cost more tokens than a memory file?",
    a: "In our test store, the tool list added about 1,600 tokens per session and a recall returned about 440. Pasting every memory into the prompt is cheaper for a few dozen facts; past roughly 100, Elmory is cheaper, because recall returns only what matches.",
  },
  {
    q: "Why no vector search?",
    a: "Recall runs on SQLite full-text search: offline, fast, and with no model to download. Code questions are mostly names, paths and identifiers, which keyword search handles well. Embeddings may come later as an optional add-on, if tests show plain-English questions miss too often.",
  },
  {
    q: "If a quote still matches, is the fact true?",
    a: "Not necessarily. It means the evidence has not changed. The label says how far the evidence goes, and agents are told to open the quoted file before acting on a fact.",
  },
  {
    q: "Which agents does it work with?",
    a: "Any agent that runs MCP servers over stdio, including Claude Code. There is also a CLI for scripts and for people.",
  },
  {
    q: "What about secrets and deleting things?",
    a: "Writes that look like secrets are refused. Forget deletes a record and the records that cite it, and reports any copies it could not reach, such as git history.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto w-full max-w-6xl px-4 py-20 md:px-6 md:py-28">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-[-0.04em] md:text-[2.5rem]">Questions</h2>
        </Reveal>
        <Reveal>
          <Accordion type="single" collapsible defaultValue="item-0">
            {FAQ.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`} className="border-border">
                <AccordionTrigger className="py-5 text-base font-medium hover:no-underline">{f.q}</AccordionTrigger>
                <AccordionContent className="pb-5 text-base leading-relaxed text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
