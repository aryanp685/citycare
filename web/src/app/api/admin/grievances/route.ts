import { all } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/session";

/** GET /api/admin/grievances?status=open|all — the desk queue, overdue first. */
export const GET = handler(async (req) => {
  await requireRole("SUPER_ADMIN");
  const status = new URL(req.url).searchParams.get("status") ?? "open";
  const rows = await all<{
    id: string; category: string; subject: string; body: string; status: string; resolution: string | null;
    createdAt: Date; dueAt: Date; resolvedAt: Date | null; email: string; role: string; overdue: boolean;
  }>(
    `SELECT g.id, g.category, g.subject, g.body, g.status, g.resolution, g."createdAt", g."dueAt", g."resolvedAt",
            u.email, u.role::text AS role, (g."dueAt" < now() AND g.status IN ('OPEN','IN_PROGRESS')) AS overdue
       FROM "Grievance" g JOIN "User" u ON u.id = g."userId"
      WHERE ($1 = 'all' OR g.status IN ('OPEN','IN_PROGRESS'))
      ORDER BY overdue DESC, g."dueAt" ASC LIMIT 200`,
    [status],
  );
  return ok({ grievances: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), dueAt: r.dueAt.toISOString(), resolvedAt: r.resolvedAt?.toISOString() ?? null })) });
});
