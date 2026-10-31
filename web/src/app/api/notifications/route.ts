import { all, one } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/notifications        → latest 50 + unread count (any signed-in role)
 *  GET /api/notifications?count=1 → { unread } only (cheap; the header bell polls this) */
export const GET = handler(async (req) => {
  const v = await requireRole(["PATIENT", "DOCTOR", "SUPER_ADMIN", "HOSPITAL_ADMIN"]);
  const countOnly = new URL(req.url).searchParams.get("count") === "1";
  const unread = await one<{ n: number }>(`SELECT count(*)::int AS n FROM "Notification" WHERE "userId"=$1 AND NOT "isRead"`, [v.uid]);
  if (countOnly) return ok({ unread: unread?.n ?? 0 });
  const items = await all<{ id: string; title: string; body: string; href: string | null; severity: string; isRead: boolean; createdAt: Date }>(
    `SELECT id, title, body, href, severity, "isRead", "createdAt" FROM "Notification" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 50`,
    [v.uid],
  );
  return ok({ unread: unread?.n ?? 0, items });
});
