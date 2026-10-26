"use client";

import { useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";

/** Shared easing: fast out, long settle. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** A hairline at the bottom of the nav that fills as the page scrolls. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 40, restDelta: 0.001 });
  return (
    <motion.span
      aria-hidden
      style={{ scaleX }}
      className="absolute inset-x-0 -bottom-px h-px origin-left bg-foreground"
    />
  );
}

/** Pulls its child a few pixels toward the pointer. Mouse only; touch and reduced motion get a plain wrapper. */
export function Magnetic({ children, strength = 0.25 }: { children: React.ReactNode; strength?: number }) {
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 260, damping: 18, mass: 0.4 });
  const y = useSpring(0, { stiffness: 260, damping: 18, mass: 0.4 });

  return (
    <motion.div
      className="inline-flex"
      style={{ x, y }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * strength);
        y.set((e.clientY - r.top - r.height / 2) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** Tilts toward the pointer in 3D. Mouse only. */
export function Tilt({ children, max = 3, className = "" }: { children: React.ReactNode; max?: number; className?: string }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 150, damping: 20 });
  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 150, damping: 20 });

  return (
    <div className={`[perspective:1200px] ${className}`}>
      <motion.div
        style={reduce ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse") return;
          const r = e.currentTarget.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width);
          py.set((e.clientY - r.top) / r.height);
        }}
        onPointerLeave={() => {
          px.set(0.5);
          py.set(0.5);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * A section whose grid lights up around the pointer. The light is a mask over a stronger copy
 * of the background grid, so nothing re-renders while the pointer moves.
 */
export function SpotlightSection({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);
  const mask = useMotionTemplate`radial-gradient(260px circle at ${x}px ${y}px, black, transparent)`;
  const glow = useMotionTemplate`radial-gradient(520px circle at ${x}px ${y}px, color-mix(in oklab, var(--foreground) 6%, transparent), transparent 70%)`;

  return (
    <section
      ref={ref}
      id={id}
      className={className}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set(e.clientX - r.left);
        y.set(e.clientY - r.top);
      }}
      onPointerLeave={() => {
        x.set(-1000);
        y.set(-1000);
      }}
    >
      <motion.div aria-hidden style={{ background: glow }} className="pointer-events-none absolute inset-0" />
      <motion.div
        aria-hidden
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,color-mix(in_oklab,var(--foreground)_22%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--foreground)_22%,transparent)_1px,transparent_1px)] [background-size:56px_56px]"
      />
      {children}
    </section>
  );
}
