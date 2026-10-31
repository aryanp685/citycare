import { one, run, tx } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { fail } from "@/lib/db";
import { EmergencyReviewSchema } from "@/lib/validate";
import { appendAudit } from "@/lib/ledger";
import { notify } from "@/lib/notify";

/** After this many UNJUSTIFIED verdicts the doctor loses clinical access until an admin re-verifies. */
const UNJUSTIFIED_SUSPEND_AT = 2;

/**
 * POST /api/admin/emergencies/[id]/review {verdict, note?} — D41: the human check on break-glass.
 * Both parties are told; the verdict is ledgered; repeat offenders are auto-suspended (isVerified=false).
 */
export const POST = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const admin = await requireRole("SUPER_ADMIN");
  const { id } = await params;
  const b = parseBody(EmergencyReviewSchema, await req.json().catch(() => ({})));
  const c = await one<{ doctorId: string; patientId: string; doctorUid: string; patientUid: string; reviewedAt: Date | null; doctor: string }>(
    `SELECT c."doctorId", c."patientId", du.id AS "doctorUid", pu.id AS "patientUid", c."reviewedAt", d."fullName" AS doctor
       FROM "Consent" c JOIN "Doctor" d ON d.id = c."doctorId" JOIN "User" du ON du.id = d."userId"
       JOIN "Patient" p ON p.id = c."patientId" JOIN "User" pu ON pu.id = p."userId"
      WHERE c.id = $1 AND c."isEmergencyOverride"`,
    [id],
  );
  if (!c) fail(404, "not_found", "no such emergency access");
  if (c.reviewedAt) fail(409, "already_reviewed", "this override already has a verdict");

  const suspended = await tx(async (t) => {
    await run(`UPDATE "Consent" SET "reviewedAt"=now(), "reviewVerdict"=$2, "reviewNote"=$3, "reviewedBy"=$4 WHERE id=$1`, [id, b.verdict, b.note ?? null, admin.uid], t);
    if (b.verdict !== "UNJUSTIFIED") return false;
    const n = await one<{ n: number }>(`SELECT count(*)::int AS n FROM "Consent" WHERE "doctorId"=$1 AND "reviewVerdict"='UNJUSTIFIED'`, [c.doctorId], t);
    if ((n?.n ?? 0) < UNJUSTIFIED_SUSPEND_AT) return false;
    await run(`UPDATE "Doctor" SET "isVerified"=false, "verificationNote"=$2 WHERE id=$1`, [c.doctorId, `auto-suspended: ${n!.n} unjustified emergency accesses`], t);
    return true;
  });

  await appendAudit(admin.uid, "EMERGENCY_REVIEWED", "Consent", id, { consentId: id, meta: { verdict: b.verdict, suspended } }).catch(() => null);
  if (suspended) await appendAudit(admin.uid, "DOCTOR_SUSPENDED", "Doctor", c.doctorId, { meta: { reason: "repeated unjustified emergency access" } }).catch(() => null);
  await notify(c.doctorUid, {
    title: b.verdict === "JUSTIFIED" ? "Emergency access reviewed: justified" : suspended ? "Emergency access unjustified — clinical access suspended" : "Emergency access reviewed: unjustified",
    body: b.note ?? "An administrator reviewed your break-glass access.",
    href: "/doctor",
    severity: b.verdict === "JUSTIFIED" ? "INFO" : "CRITICAL",
  }).catch(() => null);
  await notify(c.patientUid, {
    title: `Emergency access by Dr ${c.doctor} was reviewed: ${b.verdict.toLowerCase()}`,
    body: b.verdict === "JUSTIFIED" ? "An administrator found the emergency access appropriate." : "An administrator found it unjustified. Action has been taken against the doctor; you may raise a grievance for more.",
    href: "/patient/access",
    severity: b.verdict === "JUSTIFIED" ? "INFO" : "WARNING",
  }).catch(() => null);
  return ok({ id, verdict: b.verdict, doctorSuspended: suspended });
});
