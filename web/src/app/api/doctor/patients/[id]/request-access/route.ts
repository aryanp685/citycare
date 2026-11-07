import { z } from "zod";
import { requireRole, requireVerifiedDoctor, guardSameOrigin } from "@/lib/session";
import { handler, ok, parseBody } from "@/lib/api";
import { one, run, tx, fail, pgErrorCode } from "@/lib/db";
import { appendAudit } from "@/lib/ledger";
import { notify } from "@/lib/notify";
import { rateLimit, BUCKETS } from "@/lib/ratelimit";

const RequestSchema = z.object({
  scope: z.enum(["SUMMARY_ONLY", "LAST_N_ENCOUNTERS", "FULL_RECORD"]),
  purpose: z.enum(["TREATMENT", "SECOND_OPINION"]),
}).strict();

/** Only patients with an existing appointment with this doctor can be invited here.
 * A request is never access: only the patient/guardian can approve it. */
export const POST = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const v = await requireRole("DOCTOR");
  await requireVerifiedDoctor(v);
  await rateLimit(BUCKETS.write, v.uid);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) fail(400, "invalid_patient", "Invalid patient identifier.");
  const body = parseBody(RequestSchema, await req.json().catch(() => ({})));
  try {
    const result = await tx(async (c) => {
      // Serialize requests for the same patient/doctor (including the no-consent case).
      // The partial unique index remains the final authority against other writers.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`access-request:${v.profileId}:${id}`]);
      const patient = await one<{ userId: string }>(
        `SELECT p."userId" FROM "Patient" p WHERE p.id=$1 AND EXISTS
          (SELECT 1 FROM "Appointment" a WHERE a."patientId"=p.id AND a."doctorId"=$2)`, [id, v.profileId], c);
      if (!patient) fail(404, "not_found", "Patient not found in your appointments.");
      await run(`UPDATE "Consent" SET status='EXPIRED' WHERE "patientId"=$1 AND "doctorId"=$2
                  AND status IN ('REQUESTED','APPROVED') AND "expiresAt" <= now()`, [id, v.profileId], c);
      const active = await one<{ id: string }>(`SELECT id FROM "Consent" WHERE "patientId"=$1 AND "doctorId"=$2
                     AND status IN ('REQUESTED','APPROVED') LIMIT 1`, [id, v.profileId], c);
      if (active) fail(409, "active_consent", "A request or active consent already exists for this patient.");
      const row = await one<{ id: string }>(`INSERT INTO "Consent" (id,"patientId","doctorId",status,scope,purpose,"lastNEncounters","requestedAt","expiresAt")
                    VALUES (gen_random_uuid(),$1,$2,'REQUESTED',$3,$4,$5,now(),now()+interval '7 days') RETURNING id`,
                    [id, v.profileId, body.scope, body.purpose, body.scope === "LAST_N_ENCOUNTERS" ? 3 : null], c);
      await appendAudit(v.uid, "REQUEST_CONSENT", "Patient", id, { consentId: row!.id, meta: { scope: body.scope, purpose: body.purpose }, q: c });
      await notify(patient!.userId, { title: "A doctor requested record access", body: "Review the doctor, purpose and scope before deciding. You do not have to approve.", href: "/patient/access" }, c);
      return row!.id;
    });
    return ok({ requested: true, consentId: result }, 201);
  } catch (e) {
    if (pgErrorCode(e) === "23505") fail(409, "active_consent", "A request or active consent already exists for this patient.");
    throw e;
  }
});
