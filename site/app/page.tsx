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
