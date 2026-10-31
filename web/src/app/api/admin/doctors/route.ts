import { all } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/session";

/** GET /api/admin/doctors?status=pending|verified|rejected — the verification queue. */
export const GET = handler(async (req) => {
  await requireRole("SUPER_ADMIN");
  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const where =
    status === "verified" ? `d."isVerified"` :
    status === "rejected" ? `NOT d."isVerified" AND d."rejectedAt" IS NOT NULL` :
    `NOT d."isVerified" AND d."rejectedAt" IS NULL`;
  const rows = await all<{
    id: string; fullName: string; email: string; phone: string; qualification: string; registrationNo: string | null;
    hprId: string | null; specialties: string[]; createdAt: Date; verifiedAt: Date | null; rejectedAt: Date | null; verificationNote: string | null;
  }>(
    `SELECT d.id, d."fullName", u.email, u.phone, d.qualification, d."registrationNo", d."hprId",
            COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE s.id IS NOT NULL), '{}') AS specialties,
            d."createdAt", d."verifiedAt", d."rejectedAt", d."verificationNote"
       FROM "Doctor" d
       JOIN "User" u ON u.id = d."userId"
       LEFT JOIN "DoctorSpecialty" ds ON ds."doctorId" = d.id
       LEFT JOIN "Specialty" s ON s.id = ds."specialtyId"
      WHERE ${where}
      GROUP BY d.id, u.email, u.phone
      ORDER BY d."createdAt" DESC
      LIMIT 100`,
  );
  return ok({ status, doctors: rows });
});
