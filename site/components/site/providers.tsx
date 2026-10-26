"use client";

import { MotionConfig } from "motion/react";

/** "user" follows prefers-reduced-motion: transforms are skipped, opacity still fades. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
