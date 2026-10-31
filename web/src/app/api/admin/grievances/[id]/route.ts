import { one } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { fail } from "@/lib/db";
import { GrievanceUpdateSchema } from "@/lib/validate";
import { appendAudit } from "@/lib/ledger";
import { notify } from "@/lib/notify";

/** PATCH /api/admin/grievances/[id] {status, resolution?} — the complainant is told in their inbox; ledgered. */
export const PATCH = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const admin = await requireRole("SUPER_ADMIN");
  const { id } = await params;
  const body = parseBody(GrievanceUpdateSchema, await req.json().catch(() => ({})));
  const closed = body.status === "RESOLVED" || body.status === "REJECTED";
  const row = await one<{ userId: string; subject: string }>(
    `UPDATE "Grievance" SET status=$2, resolution=COALESCE($3, resolution), "handledBy"=$4, "updatedAt"=now(),
            "resolvedAt" = CASE WHEN $5 THEN now() ELSE NULL END
      WHERE id=$1::uuid RETURNING "userId", subject`,
    [id, body.status, body.resolution ?? null, admin.uid, closed],
  );
  if (!row) fail(404, "not_found", "no such grievance");
  await appendAudit(admin.uid, "GRIEVANCE_UPDATED", "Grievance", id, { meta: { status: body.status } }).catch(() => null);
  await notify(row.userId, {
    title: `Grievance ${body.status.toLowerCase().replace("_", " ")}: ${row.subject.slice(0, 80)}`,
    body: body.resolution ?? "An administrator is working on your grievance.",
    href: "/legal/grievance",
    severity: body.status === "REJECTED" ? "WARNING" : "INFO",
  }).catch(() => null);
  return ok({ id, status: body.status });
});
