"use client";

import { motion } from "motion/react";
import { EASE } from "@/components/site/motion";

/** Re-mounts on every docs navigation, so each page settles in. */
export default function DocsTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
      {children}
    </motion.div>
  );
}
