import { all, one } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { getViewer, guardSameOrigin } from "@/lib/session";
import { fail } from "@/lib/db";
import { GrievanceSchema } from "@/lib/validate";
import { appendAudit } from "@/lib/ledger";
import { notifyAdmins } from "@/lib/notify";
import { rateLimit, BUCKETS } from "@/lib/ratelimit";
import { GRIEVANCE } from "@/lib/legal";

/**
 * L-G1 / D43 — the grievance channel DPDP s.13 requires, without a mailbox:
 *   GET  → my tickets (any role)
 *   POST → open a ticket; every SUPER_ADMIN is notified; due date = +30 days (our published SLA)
 */
export const GET = handler(async () => {
  const v = await getViewer();
  if (!v) fail(401, "auth_required", "Sign in to see your grievances");
  const rows = await all<{ id: string; category: string; subject: string; status: string; resolution: string | null; createdAt: Date; dueAt: Date; resolvedAt: Date | null }>(
    `SELECT id, category, subject, status, resolution, "createdAt", "dueAt", "resolvedAt" FROM "Grievance"
      WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 50`,
    [v.uid],
  );
  return ok({ grievances: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), dueAt: r.dueAt.toISOString(), resolvedAt: r.resolvedAt?.toISOString() ?? null })), responseDays: GRIEVANCE.responseDays });
});

export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowStaleConsent: true }); // complaining must never be gated behind re-consent
  const v = await getViewer();
  if (!v) fail(401, "auth_required", "Sign in to raise a grievance");
  await rateLimit(BUCKETS.grievance, v.uid);
  const body = parseBody(GrievanceSchema, await req.json().catch(() => ({})));
  const row = await one<{ id: string; dueAt: Date }>(
    `INSERT INTO "Grievance" ("userId", category, subject, body, "dueAt")
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $5)) RETURNING id, "dueAt"`,
    [v.uid, body.category, body.subject, body.body, GRIEVANCE.responseDays],
  );
  if (!row) fail(500, "insert_failed", "could not open the grievance");
  await appendAudit(v.uid, "GRIEVANCE_OPENED", "Grievance", row.id, { meta: { category: body.category } }).catch(() => null);
  await notifyAdmins({
    title: `Grievance: ${body.subject.slice(0, 80)}`,
    body: `${body.category} · due ${row.dueAt.toISOString().slice(0, 10)} · from ${v.role.toLowerCase()} account`,
    href: "/admin/grievances",
    severity: body.category === "SECURITY" ? "CRITICAL" : "WARNING",
  }).catch(() => null);
  return ok({ id: row.id, status: "OPEN", dueAt: row.dueAt.toISOString(), responseDays: GRIEVANCE.responseDays }, 201);
});
