import { one } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { fail } from "@/lib/db";
import { IncidentUpdateSchema } from "@/lib/validate";
import { appendAudit } from "@/lib/ledger";

/** PATCH /api/admin/incidents/[id] — status, root cause, remediation, containment/Board timestamps. */
export const PATCH = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const admin = await requireRole("SUPER_ADMIN");
  const { id } = await params;
  const b = parseBody(IncidentUpdateSchema, await req.json().catch(() => ({})));
  const row = await one<{ id: string }>(
    `UPDATE "Incident" SET status = COALESCE($2, status), "rootCause" = COALESCE($3, "rootCause"), remediation = COALESCE($4, remediation),
            "containedAt" = COALESCE($5::timestamptz, "containedAt"), "boardNotifiedAt" = COALESCE($6::timestamptz, "boardNotifiedAt"), "updatedAt" = now()
      WHERE id = $1::uuid RETURNING id`,
    [id, b.status ?? null, b.rootCause ?? null, b.remediation ?? null, b.containedAt ?? null, b.boardNotifiedAt ?? null],
  );
  if (!row) fail(404, "not_found", "no such incident");
  await appendAudit(admin.uid, "INCIDENT_UPDATED", "Incident", id, { meta: { status: b.status ?? null, boardNotified: !!b.boardNotifiedAt } }).catch(() => null);
  return ok({ id, updated: true });
});
