import { requireRole } from "@/lib/session";
import { handler, ok, parseBody } from "@/lib/api";
import { ProfileSchema } from "@/lib/validate";
import { guardSameOrigin } from "@/lib/session";
import { all, run, tx } from "@/lib/db";
import { minimumViableProfile, profileTimeSeconds, CRITICAL_FACTS } from "@/lib/onboard";
import { appendAudit } from "@/lib/ledger";
import { patientById, ageFrom } from "@/lib/repo";

export const GET = handler(async () => {
  const v = await requireRole("PATIENT");
  const p = await patientById(v.profileId);
  if (!p) return ok({ error: "profile missing", code: "no_profile" }, 404);

  const [allergies, conditions, meds] = await Promise.all([
    all<{ allergen: string }>(`SELECT allergen FROM "Allergy" WHERE "patientId"=$1 AND "isActive"`, [p.id]),
    all<{ name: string }>(`SELECT name FROM "Condition" WHERE "patientId"=$1 AND status='ACTIVE'`, [p.id]),
    all<{ name: string }>(`SELECT name FROM "Medication" WHERE "patientId"=$1 AND "isActive" AND notes NOT LIKE 'DRAFT:%'`, [p.id]),
  ]);

  const answers = {
    allergies: allergies.map((x) => x.allergen),
    chronic_conditions: conditions.map((x) => x.name),
    current_medications: meds.map((x) => x.name),
    blood_group: p.bloodGroup === "UNKNOWN" ? null : p.bloodGroup,
  };
  const mvp = minimumViableProfile(answers);
  return ok({
    id: p.id,
    fullName: p.fullName,
    age: ageFrom(p.dateOfBirth),
    gender: p.gender,
    city: p.city,
    abhaId: p.abhaId,
    answers,
    completenessPct: mvp.completenessPct,
    missing: mvp.missing,
    profileSeconds: profileTimeSeconds(),
    criticalFacts: CRITICAL_FACTS.length,
  });
});

export const POST = handler(async (req) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  const body = parseBody(ProfileSchema, await req.json().catch(() => ({})));
  const p = await patientById(v.profileId);
  if (!p) return ok({ error: "profile missing", code: "no_profile" }, 404);

  await tx(async (c) => {
    // Replace-on-save semantics: patient-reported facts can be corrected any
    // time; re-running onboarding must NOT duplicate rows.
    await run(`DELETE FROM "Allergy"    WHERE "patientId"=$1 AND "reportedBy"='PATIENT'`, [p.id], c);
    await run(`DELETE FROM "Condition"  WHERE "patientId"=$1 AND notes LIKE 'PATIENT_ONBOARD%'`, [p.id], c);
    await run(`DELETE FROM "Medication" WHERE "patientId"=$1 AND notes LIKE 'PATIENT_ONBOARD%'`, [p.id], c);

    for (const a of body.allergies) {
      await run(
        `INSERT INTO "Allergy" (id, "patientId", allergen, category, severity, "isActive", "reportedBy", "createdAt")
         VALUES (gen_random_uuid(), $1, $2, 'DRUG', 'WARNING', true, 'PATIENT', now())`,
        [p.id, a], c,
      );
    }
    for (const cnd of body.chronicConditions) {
      await run(
        `INSERT INTO "Condition" (id, "patientId", name, status, notes)
         VALUES (gen_random_uuid(), $1, $2, 'ACTIVE', 'PATIENT_ONBOARD')`,
        [p.id, cnd], c,
      );
    }
    for (const m of body.currentMedications) {
      await run(
        `INSERT INTO "Medication" (id, "patientId", name, "isActive", notes)
         VALUES (gen_random_uuid(), $1, $2, true, 'PATIENT_ONBOARD')`,
        [p.id, m], c,
      );
    }
    await run(`UPDATE "Patient" SET "bloodGroup" = $2, "updatedAt" = now() WHERE id = $1`, [p.id, body.bloodGroup], c);
  });

  await appendAudit(v.uid, "PROFILE_UPDATED", "Patient", p.id, { meta: { completeness: minimumViableProfile({ allergies: body.allergies, chronic_conditions: body.chronicConditions, current_medications: body.currentMedications, blood_group: body.bloodGroup }).completenessPct } });

  return ok({ saved: true });
});
