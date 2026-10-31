import { all } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/session";

/** GET /api/admin/emergencies?status=pending|reviewed|all — D41: every break-glass override, with the doctor's 7-day count. */
export const GET = handler(async (req) => {
  await requireRole("SUPER_ADMIN");
  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const rows = await all<Record<string, unknown>>(
    `SELECT c.id, c."emergencyReason" AS reason, c."approvedAt", c."expiresAt", c."revokedAt", c.status, c."reviewedAt", c."reviewVerdict", c."reviewNote",
            d.id AS "doctorId", d."fullName" AS doctor, d."registrationNo", p."fullName" AS patient,
            (SELECT count(*)::int FROM "Consent" x WHERE x."doctorId" = d.id AND x."isEmergencyOverride" AND x."approvedAt" > now() - interval '7 days') AS "doctorWeekCount",
            (SELECT count(*)::int FROM "Consent" x WHERE x."doctorId" = d.id AND x."reviewVerdict" = 'UNJUSTIFIED') AS "doctorUnjustified",
            (SELECT count(*)::int FROM "AuditLog" a WHERE a."consentId" = c.id AND a.action = 'VIEW_RECORD') AS reads
       FROM "Consent" c JOIN "Doctor" d ON d.id = c."doctorId" JOIN "Patient" p ON p.id = c."patientId"
      WHERE c."isEmergencyOverride"
        AND ($1 = 'all' OR ($1 = 'pending' AND c."reviewedAt" IS NULL) OR ($1 = 'reviewed' AND c."reviewedAt" IS NOT NULL))
      ORDER BY c."approvedAt" DESC LIMIT 200`,
    [status],
  );
  return ok({ emergencies: rows });
});
