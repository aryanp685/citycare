import { requireRole, guardSameOrigin } from "@/lib/session";
import { handler, ok, parseBody } from "@/lib/api";
import { GrantSchema, RevokeSchema } from "@/lib/validate";
import { all, one, run, tx, fail } from "@/lib/db";
import { appendAudit } from "@/lib/ledger";
import { evaluateConsent } from "@/lib/consent";

/** All consents the patient has ever given, with live verdicts (DB clock). */
export const GET = handler(async () => {
  const v = await requireRole("PATIENT");
  const rows = await all<Record<string, unknown>>(
    `SELECT c.id, c."doctorId", c.status, c.scope, c.purpose, c."lastNEncounters", c."conditionName",
            c."requestedAt", c."approvedAt", c."expiresAt", c."revokedAt", c."revocationReason",
            d."fullName" AS "doctorName", d.qualification,
            now() AS "dbNow",
            (SELECT count(*)::int FROM "AuditLog" a WHERE a."consentId" = c.id) AS "accessCount"
       FROM "Consent" c
       JOIN "Doctor" d ON d.id = c."doctorId"
      WHERE c."patientId" = $1
      ORDER BY c."requestedAt" DESC
      LIMIT 100`,
    [v.profileId],
  );
  const out = rows.map((r) => {
    const consent = {
      id: r.id, patientId: v.profileId, doctorId: r.doctorId, status: r.status, scope: r.scope,
      purpose: r.purpose, lastNEncounters: r.lastNEncounters, conditionName: r.conditionName,
      expiresAt: r.expiresAt, approvedAt: r.approvedAt, revokedAt: r.revokedAt,
    } as never as import("@/lib/consent").ConsentRow;
    const verdict = evaluateConsent(consent, r.dbNow as Date);
    return { ...r, shareState: verdict.allowed ? "LIVE" : verdict.reason };
  });
  return ok({ consents: out });
});

/** Patient grants (or approves a pending request). Nothing is shared until this fires. */
export const POST = handler(async (req) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  const body = parseBody(GrantSchema, await req.json().catch(() => ({})));

  const doctor = await one<{ id: string; fullName: string; isVerified: boolean }>(`SELECT id, "fullName", "isVerified" FROM "Doctor" WHERE id=$1`, [body.doctorId]);
  if (!doctor) fail(404, "no_doctor", "doctor not found");
  if (!doctor.isVerified) fail(403, "doctor_unverified", "This doctor's registration has not been verified yet");

  const consentId = await tx(async (c) => {
    // The partial index `one_active_consent_per_pair` counts rows whose
    // status is REQUESTED/APPROVED regardless of expiry — so lapse stale
    // rows FIRST or the insert would (correctly) be refused.
    await run(
      `UPDATE "Consent" SET status='EXPIRED'
        WHERE "patientId"=$1 AND "doctorId"=$2 AND status IN ('REQUESTED','APPROVED')
          AND "expiresAt" <= now()`,
      [v.profileId, body.doctorId], c,
    );

    const pending = await one<{ id: string }>(
      `SELECT id FROM "Consent"
        WHERE "patientId"=$1 AND "doctorId"=$2 AND status='REQUESTED'
        ORDER BY "requestedAt" DESC LIMIT 1 FOR UPDATE`,
      [v.profileId, body.doctorId], c,
    );
    if (pending) {
      await run(
        `UPDATE "Consent" SET status='APPROVED', "approvedAt"=now(), scope=$2,
                purpose='TREATMENT', "lastNEncounters"=$3, "conditionName"=$4,
                "expiresAt" = now() + ($5 || ' days')::interval
          WHERE id=$1`,
        [pending.id, body.scope, body.lastNEncounters ?? (body.scope === "LAST_N_ENCOUNTERS" ? 3 : null),
         body.conditionName ?? null, String(Math.max(1, Math.min(90, body.expiryDays)))], c,
      );
      return pending.id;
    }

    const live = await one<{ id: string }>(
      `SELECT id FROM "Consent" WHERE "patientId"=$1 AND "doctorId"=$2 AND status='APPROVED'`,
      [v.profileId, body.doctorId], c,
    );
    if (live) fail(409, "already_shared", "You already share with this doctor — revoke first to change scope.");

    const ins = await one<{ id: string }>(
      `INSERT INTO "Consent" (id, "patientId", "doctorId", status, scope, purpose, "lastNEncounters", "conditionName",
                              "requestedAt", "approvedAt", "expiresAt")
       VALUES (gen_random_uuid(), $1, $2, 'APPROVED', $3, 'TREATMENT', $4, $5, now(), now(), now() + ($6 || ' days')::interval)
       RETURNING id`,
      [v.profileId, body.doctorId, body.scope,
       body.lastNEncounters ?? (body.scope === "LAST_N_ENCOUNTERS" ? 3 : null),
       body.conditionName ?? null,
       String(Math.max(1, Math.min(90, body.expiryDays)))], c,
    );
    return ins!.id;
  });

  await appendAudit(v.uid, "GRANT_CONSENT", "Consent", consentId, {
    consentId, meta: { scope: body.scope, doctor: doctor!.fullName },
  });
  await run(
    `INSERT INTO "Notification" (id, "userId", channel, title, body, "isRead", "createdAt")
     SELECT gen_random_uuid(), u.id, 'IN_APP', 'Access granted',
            'A CityCare patient approved your record access for this visit.', false, now()
       FROM "User" u JOIN "Doctor" d ON d."userId" = u.id WHERE d.id = $1`,
    [body.doctorId],
  );
  return ok({ granted: true, consentId }, 201);
});

/** Revoke is INSTANT: the doctor's very next request re-checks the DB and 403s. */
export const PATCH = handler(async (req) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  const body = parseBody(RevokeSchema, await req.json().catch(() => ({})));
  const consentId = new URL(req.url).searchParams.get("id") ?? "";
  if (!consentId) fail(400, "missing_id", "pass ?id=<consentId>");

  const n = await tx(async (c) => {
    return run(
      `UPDATE "Consent" SET status='REVOKED', "revokedAt"=now(), "revocationReason"=$2
        WHERE id=$1 AND "patientId"=$3 AND status IN ('REQUESTED','APPROVED')`,
      [consentId, body.reason ?? "revoked by patient", v.profileId], c,
    );
  });
  if (n === 0) fail(409, "nothing_to_revoke", "This consent is already closed (revoked, denied or expired).");

  await appendAudit(v.uid, "REVOKE_CONSENT", "Consent", consentId, {
    consentId, meta: { reason: body.reason ?? "revoked by patient" },
  });
  return ok({ revoked: true });
});
