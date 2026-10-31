import { one } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { handler, err } from "@/lib/api";
import { PROCESSORS } from "@/lib/legal";

/**
 * GET /api/admin/incidents/[id]/report — the r.7(2) Board report as a downloadable JSON document:
 * facts, nature/extent/timing, consequences, mitigation, findings on cause, remedial measures,
 * and the report on intimations sent to Data Principals. Fill the blanks in the admin UI first.
 */
export const GET = handler(async (_req, { params }) => {
  await requireRole("SUPER_ADMIN");
  const { id } = await params;
  const i = await one<{
    title: string; summary: string; dataInvolved: string; userAdvice: string; status: string; detectedAt: Date; containedAt: Date | null;
    rootCause: string | null; remediation: string | null; boardNotifiedAt: Date | null; notifiedCount: number; notifiedAt: Date | null; createdAt: Date;
  }>(`SELECT * FROM "Incident" WHERE id = $1::uuid`, [id]);
  if (!i) return err(404, "not_found", "no such incident");
  const report = {
    reportType: "Personal data breach — detailed report (DPDP Rules 2025, r.7(2))",
    generatedAt: new Date().toISOString(),
    dataFiduciary: { name: "CityCare (academic project, G H Raisoni College, Pune)", processors: PROCESSORS },
    incident: {
      id, title: i.title, status: i.status,
      broadFacts: i.summary,
      natureAndExtent: i.dataInvolved,
      timing: { detectedAt: i.detectedAt.toISOString(), containedAt: i.containedAt?.toISOString() ?? null, boardDeadline: new Date(i.detectedAt.getTime() + 72 * 3600e3).toISOString() },
      likelyConsequences: "See broadFacts; assessed per data category involved.",
      findingsOnCause: i.rootCause ?? "(pending)",
      measuresTaken: i.remediation ?? "(pending)",
      preventiveMeasures: i.remediation ?? "(pending)",
    },
    intimationToDataPrincipals: { channel: "CityCare in-app inbox (CRITICAL) + registered email/mobile where available", count: i.notifiedCount, sentAt: i.notifiedAt?.toISOString() ?? null, adviceGiven: i.userAdvice },
    intimationToBoard: { sentAt: i.boardNotifiedAt?.toISOString() ?? null },
  };
  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="citycare-breach-report-${id.slice(0, 8)}.json"`, "cache-control": "no-store" },
  });
});
