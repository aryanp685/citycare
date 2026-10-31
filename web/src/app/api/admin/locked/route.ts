import { all } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/session";

/** GET /api/admin/locked — D9: accounts currently inside a lockout window (5 failures / 15 min). */
export const GET = handler(async () => {
  await requireRole("SUPER_ADMIN");
  const rows = await all<{ id: string; email: string; role: string; failedAttempts: number; lockedSince: Date; minutesLeft: number }>(
    `SELECT id, email, role::text AS role, "failedAttempts", "updatedAt" AS "lockedSince",
            GREATEST(0, 15 - FLOOR(EXTRACT(EPOCH FROM (now() - "updatedAt")) / 60))::int AS "minutesLeft"
       FROM "User" WHERE "failedAttempts" >= 5 AND status = 'ACTIVE' ORDER BY "updatedAt" DESC LIMIT 100`,
  );
  return ok({ locked: rows.map((r) => ({ ...r, lockedSince: r.lockedSince.toISOString() })) });
});
