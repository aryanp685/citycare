import { one, run, tx, fail } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole, requireVerifiedDoctor, guardSameOrigin } from "@/lib/session";
import { EmergencySchema } from "@/lib/validate";
import { appendAudit } from "@/lib/ledger";
import { notify } from "@/lib/notify";

const EMERGENCY_MINUTES = 60;
const MAX_PER_DOCTOR_24H = 3;

/**
 * POST /api/doctor/patients/[id]/emergency  { reason, confirm: true }
 * F2 — break-glass. Grants a 60-minute FULL_RECORD consent WITHOUT the patient, because the
 * patient cannot answer (unconscious, minor without guardian present, …). The price of that power:
 *   • verified doctors only, max 3 per doctor per 24 h (an ER shift, not a habit),
 *   • the reason goes on the consent, into the tamper-evident ledger and to the patient's inbox,
 *   • the patient can revoke it like any other consent, and sees it in "Access & trust".
 * Refused when a live consent already exists (no need) — use the normal path.
 */
export const POST = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const v = await requireRole("DOCTOR");
  await requireVerifiedDoctor(v);
  const { id: patientId } = await params;
  const body = parseBody(EmergencySchema, await req.json().catch(() => ({})));

  const p = await one<{ id: string; userId: string; fullName: string }>(`SELECT id, "userId", "fullName" FROM "Patient" WHERE id=$1`, [patientId]);
  if (!p) fail(404, "no_patient", "patient not found");
  const doc = await one<{ fullName: string }>(`SELECT "fullName" FROM "Doctor" WHERE id=$1`, [v.profileId]);

  const recent = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM "Consent" WHERE "doctorId"=$1 AND "isEmergencyOverride" AND "requestedAt" > now() - interval '24 hours'`,
    [v.profileId],
  );
  if ((recent?.n ?? 0) >= MAX_PER_DOCTOR_24H) fail(429, "emergency_quota", `Emergency access is limited to ${MAX_PER_DOCTOR_24H} patients per 24 hours per doctor`);

  const result = await tx(async (c) => {
    const live = await one<{ id: string }>(
      `SELECT id FROM "Consent" WHERE "patientId"=$1 AND "doctorId"=$2 AND status='APPROVED' AND "expiresAt" > now() LIMIT 1`,
      [p!.id, v.profileId], c,
    );
    if (live) fail(409, "consent_live", "You already have live access to this patient — no override needed");
    // a pending request from the normal flow would collide with the one-active-consent-per-pair index
    await run(
      `UPDATE "Consent" SET status='EXPIRED', "revocationReason"='superseded by emergency access'
        WHERE "patientId"=$1 AND "doctorId"=$2 AND status IN ('REQUESTED','APPROVED')`,
      [p!.id, v.profileId], c,
    );
    const consent = await one<{ id: string; expiresAt: Date }>(
      `INSERT INTO "Consent" (id, "patientId", "doctorId", status, scope, purpose, "requestedAt", "approvedAt", "expiresAt", "isEmergencyOverride", "emergencyReason")
       VALUES (gen_random_uuid(), $1, $2, 'APPROVED', 'FULL_RECORD', 'EMERGENCY', now(), now(), now() + ($3 || ' minutes')::interval, true, $4)
       RETURNING id, "expiresAt"`,
      [p!.id, v.profileId, String(EMERGENCY_MINUTES), body.reason], c,
    );
    await appendAudit(v.uid, "EMERGENCY_ACCESS", "Patient", p!.id, {
      consentId: consent!.id, meta: { reason: body.reason, minutes: EMERGENCY_MINUTES }, q: c,
    });
    await notify(p!.userId, {
      title: `Emergency access used by ${doc?.fullName ?? "a doctor"}`,
      body: `Reason given: "${body.reason}". Access to your full record for ${EMERGENCY_MINUTES} minutes. You can revoke it now under Access & trust.`,
      href: "/patient/access", severity: "CRITICAL",
    }, c);
    return consent!;
  });

  return ok({ consentId: result.id, expiresAt: result.expiresAt, minutes: EMERGENCY_MINUTES }, 201);
});
