"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

/**
 * Unread counter that stays fresh without a socket: polls a 1-row COUNT every 30 s while the
 * tab is visible. (SSE/WebSockets would need a long-lived function — not a fit for Vercel Hobby's
 * 30 s limit; polling a partial-index count costs ~1 ms per call.)
 */
export function NotificationBell({ initial, href }: { initial: number; href: string }) {
  const [n, setN] = useState(initial);
  const reduce = useReducedMotion();
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/notifications?count=1", { credentials: "same-origin", cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive && typeof j.unread === "number") setN(j.unread);
      } catch { /* offline: keep the last value */ }
    };
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, []);
  return (
    <Link href={href} aria-label={`Inbox, ${n} unread`} className="relative inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-wash transition-colors no-underline text-ink">
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      <AnimatePresence>
        {n > 0 && (
          <motion.span
            key={n}
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-[var(--danger)] text-white text-[10px] font-bold grid place-items-center"
          >
            {n > 99 ? "99+" : n}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}
