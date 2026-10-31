import { all, one } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { fail } from "@/lib/db";
import { IncidentSchema } from "@/lib/validate";
import { appendAudit } from "@/lib/ledger";

/**
 * L-G5 — personal-data-breach register (DPDP Rules r.7).
 *   GET  → all incidents with the 72-hour Board deadline computed from detectedAt
 *   POST → open one (status OPEN); the admin then notifies users and files the report
 */
export const GET = handler(async () => {
  await requireRole("SUPER_ADMIN");
  const rows = await all<Record<string, unknown> & { detectedAt: Date }>(
    `SELECT id, title, summary, "dataInvolved", "userAdvice", status, "detectedAt", "containedAt", "rootCause", "remediation",
            "boardNotifiedAt", "notifiedCount", "notifiedAt", "createdAt",
            ("detectedAt" + interval '72 hours') AS "boardDeadline",
            ("boardNotifiedAt" IS NULL AND now() > "detectedAt" + interval '72 hours') AS "boardOverdue"
       FROM "Incident" ORDER BY "createdAt" DESC LIMIT 100`,
  );
  return ok({ incidents: rows });
});

export const POST = handler(async (req) => {
  await guardSameOrigin(req);
  const admin = await requireRole("SUPER_ADMIN");
  const body = parseBody(IncidentSchema, await req.json().catch(() => ({})));
  const row = await one<{ id: string; detectedAt: Date }>(
    `INSERT INTO "Incident" (title, summary, "dataInvolved", "userAdvice", "detectedAt", "reportedBy")
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), $6) RETURNING id, "detectedAt"`,
    [body.title, body.summary, body.dataInvolved, body.userAdvice, body.detectedAt ?? null, admin.uid],
  );
  if (!row) fail(500, "insert_failed", "could not open incident");
  await appendAudit(admin.uid, "INCIDENT_OPENED", "Incident", row.id, { meta: { title: body.title } }).catch(() => null);
  return ok({ id: row.id, detectedAt: row.detectedAt.toISOString(), boardDeadline: new Date(row.detectedAt.getTime() + 72 * 3600e3).toISOString() }, 201);
});
