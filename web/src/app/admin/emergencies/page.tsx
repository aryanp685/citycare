import { viewerForPage } from "@/lib/session";
import { all } from "@/lib/db";
import { SectionTitle } from "@/components/ui";
import { EmergencyReview, type EmergencyRow } from "@/components/emergency-review";

const SQL = `SELECT c.id, c."emergencyReason" AS reason, c."approvedAt", c."expiresAt", c."revokedAt", c.status::text AS status, c."reviewedAt", c."reviewVerdict", c."reviewNote",
       d.id AS "doctorId", d."fullName" AS doctor, d."registrationNo", p."fullName" AS patient,
       (SELECT count(*)::int FROM "Consent" x WHERE x."doctorId" = d.id AND x."isEmergencyOverride" AND x."approvedAt" > now() - interval '7 days') AS "doctorWeekCount",
       (SELECT count(*)::int FROM "Consent" x WHERE x."doctorId" = d.id AND x."reviewVerdict" = 'UNJUSTIFIED') AS "doctorUnjustified",
       (SELECT count(*)::int FROM "AuditLog" a WHERE a."consentId" = c.id AND a.action = 'VIEW_RECORD') AS reads
  FROM "Consent" c JOIN "Doctor" d ON d.id = c."doctorId" JOIN "Patient" p ON p.id = c."patientId"
 WHERE c."isEmergencyOverride" AND ($1::boolean = (c."reviewedAt" IS NULL))
 ORDER BY c."approvedAt" DESC LIMIT 100`;

type Raw = Omit<EmergencyRow, "approvedAt" | "expiresAt" | "revokedAt" | "reviewedAt"> & { approvedAt: Date; expiresAt: Date; revokedAt: Date | null; reviewedAt: Date | null };
const ser = (r: Raw): EmergencyRow => ({ ...r, approvedAt: r.approvedAt.toISOString(), expiresAt: r.expiresAt.toISOString(), revokedAt: r.revokedAt?.toISOString() ?? null, reviewedAt: r.reviewedAt?.toISOString() ?? null });

export default async function AdminEmergencies() {
  await viewerForPage("SUPER_ADMIN");
  const [pending, reviewed] = await Promise.all([all<Raw>(SQL, [true]), all<Raw>(SQL, [false])]);
  return (
    <div className="grid gap-6">
      <div>
        <SectionTitle>Break-glass review queue</SectionTitle>
        <p className="text-sm text-muted mb-3">Every emergency override needs a verdict (D41). Two <em>unjustified</em> verdicts suspend the doctor&apos;s clinical access automatically; more than 3 overrides in 7 days is flagged. Both parties are notified; verdicts are ledgered.</p>
        <EmergencyReview rows={pending.map(ser)} />
      </div>
      <div>
        <SectionTitle>Reviewed</SectionTitle>
        <EmergencyReview rows={reviewed.map(ser)} />
      </div>
    </div>
  );
}
