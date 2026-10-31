"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, EmptyNote } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion/reveal";

export type InboxItem = { id: string; title: string; body: string; href: string | null; severity: string; isRead: boolean; createdAt: string };

export function Inbox({ items }: { items: InboxItem[] }) {
  const [list, setList] = useState(items);
  const unread = list.filter((i) => !i.isRead).length;

  async function markAll() {
    const r = await fetch("/api/notifications/read", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) });
    if (r.ok) setList((l) => l.map((i) => ({ ...i, isRead: true })));
  }
  // Seen = read. Marking happens after paint so the unread styling is visible for a beat.
  useEffect(() => { if (items.some((i) => !i.isRead)) { const t = setTimeout(markAll, 1500); return () => clearTimeout(t); } }, [items]);

  if (!list.length) return <EmptyNote>Nothing yet. Consent decisions, emergency access and verification updates land here.</EmptyNote>;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted">{unread ? `${unread} unread` : "all read"}</span>
        {unread > 0 && <button className="btn btn-ghost" onClick={markAll}>Mark all read</button>}
      </div>
      <Stagger className="grid gap-2">
        {list.map((n) => (
          <StaggerItem key={n.id} className={`card ${n.isRead ? "" : "border-l-4 border-l-brand"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{n.title}</span>
                  {n.severity === "CRITICAL" && <Badge tone="crit">critical</Badge>}
                  {n.severity === "WARNING" && <Badge tone="warn">attention</Badge>}
                </div>
                <p className="text-sm text-muted mt-1 leading-relaxed">{n.body}</p>
                {n.href && <Link href={n.href} className="text-sm font-semibold text-brand mt-1 inline-block">Open →</Link>}
              </div>
              <time className="text-xs text-muted whitespace-nowrap" dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</time>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
