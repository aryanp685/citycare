"use client";
import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";

/**
 * Scroll-reveal primitives. One rule: motion never gates content — everything is in the
 * DOM and readable without JS (SSR renders the final markup; e2e scrapes it), the
 * animation only *adds* the entrance. Reduced-motion users get an instant fade.
 */
const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({
  children, delay = 0, y = 18, className = "", once = true, as = "div",
}: { children: ReactNode; delay?: number; y?: number; className?: string; once?: boolean; as?: "div" | "section" | "li" | "article" }) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "0px 0px -10% 0px" }}
      transition={{ duration: reduce ? 0.2 : 0.7, delay, ease: EASE }}
    >
      {children}
    </Comp>
  );
}

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

/** Staggers its direct <StaggerItem> children when the group scrolls into view. */
export function Stagger({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "0px 0px -10% 0px" }}>
      {children}
    </motion.div>
  );
}
export function StaggerItem({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} variants={reduce ? undefined : item}>
      {children}
    </motion.div>
  );
}
