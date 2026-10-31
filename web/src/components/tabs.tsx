"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

export type TabDef = { href: string; label: string; badge?: number };

/**
 * Bug A40: the old test `path.startsWith(href + "/")` made the root tab ("/patient") light
 * up on every sub-route, so two tabs were active at once. Rule now: the tab with the LONGEST
 * matching prefix wins, and only that one.
 */
export function activeTab(path: string, tabs: TabDef[]): string | null {
  let best: TabDef | null = null;
  for (const t of tabs) {
    const hit = path === t.href || path.startsWith(t.href.endsWith("/") ? t.href : t.href + "/");
    if (hit && (!best || t.href.length > best.href.length)) best = t;
  }
  return best?.href ?? null;
}

export function Tabs({ tabs }: { tabs: TabDef[] }) {
  const path = usePathname();
  const reduce = useReducedMotion();
  const active = activeTab(path, tabs);
  return (
    <nav className="flex gap-1 -mb-px overflow-x-auto" aria-label="Sections">
      {tabs.map((t) => {
        const isActive = active === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={`relative px-3 py-2 text-sm font-semibold whitespace-nowrap no-underline transition-colors ${
              isActive ? "text-brand" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {!!t.badge && <span className="ml-1.5 badge badge-warn">{t.badge}</span>}
            {isActive && (
              <motion.span
                layoutId="tab-underline"
                className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-brand"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
