import { FactDemo } from "./fact-demo";
import { HeroIntro } from "./hero-intro";
import { SpotlightSection, Tilt } from "./motion";

export function Hero() {
  return (
    <SpotlightSection id="top" className="relative overflow-hidden border-b border-border">
      {/* Faint grid, fading out toward the edges. The pointer lights it up locally. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent_75%)] opacity-70"
      />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-14 pb-20 md:px-6 md:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pb-24">
        <HeroIntro />
        <Tilt className="min-w-0">
          <FactDemo />
        </Tilt>
      </div>
    </SpotlightSection>
  );
}
