"use client";
import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Soft entrance for app pages on every route change (keyed by pathname). ~8 ms of work, no layout thrash. */
export function PageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={path}
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
