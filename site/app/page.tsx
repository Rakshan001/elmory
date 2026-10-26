import { Compare } from "@/components/site/compare";
import { Drift } from "@/components/site/drift";
import { Faq } from "@/components/site/faq";
import { Footer } from "@/components/site/footer";
import { Hero } from "@/components/site/hero";
import { HowItWorks } from "@/components/site/how-it-works";
import { Install } from "@/components/site/install";
import { Nav } from "@/components/site/nav";
import { States } from "@/components/site/states";

export default function Home() {
  return (
    <>
      {/* Soft sage light behind the glass surfaces. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60%_50%_at_85%_0%,color-mix(in_oklab,var(--accent)_35%,transparent),transparent_70%),radial-gradient(50%_40%_at_0%_30%,color-mix(in_oklab,var(--panel)_18%,transparent),transparent_70%)]"
      />
      <Nav />
      <main className="flex-1">
        <Hero />
        <Drift />
        <HowItWorks />
        <States />
        <Compare />
        <Install />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
