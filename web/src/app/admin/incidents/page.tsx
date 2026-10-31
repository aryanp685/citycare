import { viewerForPage } from "@/lib/session";
import { all } from "@/lib/db";
import { SectionTitle } from "@/components/ui";
import { IncidentAdmin, type IncidentRow } from "@/components/incident-admin";

type Raw = Omit<IncidentRow, "detectedAt" | "containedAt" | "boardNotifiedAt" | "notifiedAt" | "boardDeadline"> & { detectedAt: Date; containedAt: Date | null; boardNotifiedAt: Date | null; notifiedAt: Date | null; boardDeadline: Date };

export default async function AdminIncidents() {
  await viewerForPage("SUPER_ADMIN");
  const rows = await all<Raw>(
    `SELECT id, title, summary, "dataInvolved", "userAdvice", status, "detectedAt", "containedAt", "rootCause", "remediation", "boardNotifiedAt", "notifiedCount", "notifiedAt",
            ("detectedAt" + interval '72 hours') AS "boardDeadline",
            ("boardNotifiedAt" IS NULL AND now() > "detectedAt" + interval '72 hours') AS "boardOverdue"
       FROM "Incident" ORDER BY (status = 'CLOSED'), "createdAt" DESC LIMIT 100`,
  );
  const ser = (r: Raw): IncidentRow => ({ ...r, detectedAt: r.detectedAt.toISOString(), containedAt: r.containedAt?.toISOString() ?? null, boardNotifiedAt: r.boardNotifiedAt?.toISOString() ?? null, notifiedAt: r.notifiedAt?.toISOString() ?? null, boardDeadline: r.boardDeadline.toISOString() });
  return (
    <div>
      <SectionTitle>Breach register (DPDP Rules r.7)</SectionTitle>
      <p className="text-sm text-muted mb-3">Runbook in code: open → notify affected users <em>without delay</em> (one click, lands as CRITICAL in their inbox) → record cause and remediation → notify the Data Protection Board within 72 hours → download the structured report. Everything is ledgered.</p>
      <IncidentAdmin rows={rows.map(ser)} />
    </div>
  );
}
