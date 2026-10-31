import { requireRole, guardSameOrigin } from "@/lib/session";
import { handler, ok, err, parseBody, readJson } from "@/lib/api";
import { ObservationSchema, ObservationDeleteSchema } from "@/lib/validate";
import { one, run } from "@/lib/db";
import { appendAudit } from "@/lib/ledger";

/**
 * F5 — self-reported readings (the Observation table, wired for the first time).
 *
 * The patient logs what their home device reports: fasting sugar, blood pressure, peak flow,
 * weight. These rows are the longitudinal series behind the trends view. They are explicitly
 * SELF-REPORTED — the UI and the FHIR notes say so; a reading here is a data point, never a
 * diagnosis, and it is visible to doctors only under the same consent scopes as labs
 * (SUMMARY_ONLY hides it, LAST_N keeps unlinked + in-window ones, SPECIFIC_CONDITION only
 * in-window ones — see applyScope in repo.ts).
 *
 *   POST   → log one reading (validated, audited)
 *   DELETE → remove one's own reading (DPDP correction/erasure), audited
 */

export const POST = handler(async (req) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  const body = parseBody(ObservationSchema, await readJson(req));
  // Observation.id is plain TEXT with no default (schema predates the app) — we mint the UUID.
  const row = await one<{ id: string; valueNum: number; takenOn: Date }>(
    `INSERT INTO "Observation" (id, "patientId", "encounterId", category, name, "valueNum", unit, "refLow", "refHigh", "takenOn")
     VALUES (gen_random_uuid()::text, $1, NULL, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, "valueNum", "takenOn"`,
    [
      v.profileId,
      body.category,
      body.name,
      body.valueNum,
      body.unit ?? null,
      body.refLow ?? null,
      body.refHigh ?? null,
      new Date(body.takenOn),
    ],
  );
  await appendAudit(v.uid, "OBSERVATION_ADDED", "Observation", row!.id, {
    meta: { name: body.name, value: body.valueNum, unit: body.unit ?? null },
  }).catch(() => null);
  return ok({ observation: { id: row!.id, valueNum: row!.valueNum, takenOn: row!.takenOn.toISOString() } }, 201);
});

export const DELETE = handler(async (req) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  const body = parseBody(ObservationDeleteSchema, await readJson(req));
  // WHERE patientId = self: a patient can never delete another patient's row by guessing a UUID.
  const n = await run(`DELETE FROM "Observation" WHERE id=$1 AND "patientId"=$2`, [body.id, v.profileId]);
  if (n === 0) {
    await appendAudit(v.uid, "OBSERVATION_DELETE_DENIED", "Observation", body.id, { meta: { reason: "not found or not yours" } }).catch(() => null);
    return err(404, "not_found", "That reading is not in your record.");
  }
  await appendAudit(v.uid, "OBSERVATION_DELETED", "Observation", body.id).catch(() => null);
  return ok({ deleted: true });
});
