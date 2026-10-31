import { one, run, tx } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { fail } from "@/lib/db";
import { IncidentNotifySchema } from "@/lib/validate";
import { appendAudit } from "@/lib/ledger";

/**
 * POST /api/admin/incidents/[id]/notify {scope, emails?} — r.7(1): tell affected Data Principals
 * "without delay": nature, extent, timing, consequences, mitigation, what they should do.
 * One INSERT…SELECT so a thousand users cost one statement; the count is stored on the incident.
 */
export const POST = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const admin = await requireRole("SUPER_ADMIN");
  const { id } = await params;
  const b = parseBody(IncidentNotifySchema, await req.json().catch(() => ({})));
  if (b.scope === "EMAILS" && !(b.emails && b.emails.length)) fail(400, "emails_required", "list the affected accounts");
  const inc = await one<{ title: string; summary: string; dataInvolved: string; userAdvice: string; detectedAt: Date }>(
    `SELECT title, summary, "dataInvolved", "userAdvice", "detectedAt" FROM "Incident" WHERE id = $1::uuid`, [id],
  );
  if (!inc) fail(404, "not_found", "no such incident");
  const title = `Security notice: ${inc.title}`.slice(0, 140);
  const body = `What happened: ${inc.summary}\nData involved: ${inc.dataInvolved}\nWhen: ${inc.detectedAt.toISOString().slice(0, 16).replace("T", " ")} UTC\nWhat you should do: ${inc.userAdvice}\nQuestions: use Grievance & rights.`.slice(0, 1000);
  const where = b.scope === "ALL_PATIENTS" ? `u.role = 'PATIENT'` : b.scope === "ALL_USERS" ? `u.role IN ('PATIENT','DOCTOR')` : `lower(u.email) = ANY($3::text[])`;
  const n = await tx(async (c) => {
    // F13: dependents have no inbox — route to the guardian's user id
    const count = await run(
      `INSERT INTO "Notification" (id, "userId", channel, title, body, href, severity, "isRead", "createdAt")
       SELECT gen_random_uuid(), COALESCE(gu.id, u.id), 'IN_APP', $1, $2, '/legal/grievance', 'CRITICAL', false, now()
         FROM "User" u
         LEFT JOIN "Patient" p  ON p."userId" = u.id
         LEFT JOIN "Patient" gp ON gp.id = p."guardianPatientId"
         LEFT JOIN "User" gu    ON gu.id = gp."userId"
        WHERE u.status = 'ACTIVE' AND ${where}`,
      b.scope === "EMAILS" ? [title, body, b.emails] : [title, body],
      c,
    );
    await run(`UPDATE "Incident" SET "notifiedCount" = "notifiedCount" + $2, "notifiedAt" = now(), "updatedAt" = now() WHERE id = $1::uuid`, [id, count], c);
    return count;
  });
  await appendAudit(admin.uid, "INCIDENT_NOTIFIED", "Incident", id, { meta: { scope: b.scope, count: n } }).catch(() => null);
  return ok({ id, notified: n });
});
