import { requireRole, requireVerifiedDoctor, guardSameOrigin } from "@/lib/session";
import { handler, ok, parseBody } from "@/lib/api";
import { EncounterSchema } from "@/lib/validate";
import { one, run, tx, fail } from "@/lib/db";
import { patientById, recordSections, toRuleRecord } from "@/lib/repo";
import { liveConsentFor } from "@/lib/repo";
import { runAllRules } from "@/lib/rules";
import { appendAudit } from "@/lib/ledger";

/**
 * Consultation note + prescription.
 * Before anything is written, the rule engine checks the PROPOSED drugs
 * against the patient's allergies and current meds. A CRITICAL conflict is
 * refused unless the doctor supplies an override reason — the reason then
 * becomes part of the record and of the audit ledger. AI never silently
 * blocks care; it warns, and overrides are visible.
 */
export const POST = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const v = await requireRole("DOCTOR");
  await requireVerifiedDoctor(v);
  const { id: patientId } = await params;
  const body = parseBody(EncounterSchema, await req.json().catch(() => ({})));

  const patient = await patientById(patientId);
  if (!patient) fail(404, "no_patient", "patient not found");

  const { verdict, now } = await liveConsentFor(patient!.id, v.profileId);
  if (!verdict.allowed) {
    await appendAudit(v.uid, "WRITE_DENIED", "Patient", patient!.id, { meta: { reason: verdict.reason } });
    fail(403, "no_consent", `Cannot write to this record: ${verdict.reason}. Ask the patient to approve sharing on their dashboard.`);
  }

  const sections = await recordSections(patient!.id);
  const proposed = body.items.map((i) => ({ name: i.name, genericName: null as string | null }));
  const alerts = runAllRules(toRuleRecord(sections, proposed), now.toISOString().slice(0, 10));
  const critical = alerts.filter((a) => a.severity === "CRITICAL");
  if (critical.length > 0 && !body.overrideReason) {
    return ok(
      { error: "Safety conflict with the patient's record", code: "safety_block", alerts: critical },
      422,
    );
  }

  const written = await tx(async (c) => {
    const enc = await one<{ id: string }>(
      `INSERT INTO "Encounter" (id, "patientId", "doctorId", "encounterDate", type, "chiefComplaint",
                                "diagnosisText", "diagnosisCode", advice, "followUpOn", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, now(), 'OUTPATIENT', $3, $4, $5, $6,
               CASE WHEN $7::int IS NULL THEN NULL ELSE now() + ($7 || ' days')::interval END, now())
       RETURNING id`,
      [patient!.id, v.profileId, body.chiefComplaint, body.diagnosisText, body.diagnosisCode ?? null,
       body.advice ?? null, body.followUpDays ?? null],
      c,
    );

    for (const it of body.items) {
      await run(
        `INSERT INTO "Medication" (id, "patientId", "encounterId", name, dosage, frequency,
                                   "startDate", "isActive", "isChronic", notes)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now(), true, false, $6)`,
        [patient!.id, enc!.id, it.name, it.dosage ?? null, it.frequency ?? null,
         it.durationDays ? `for ${it.durationDays} days${it.instructions ? "; " + it.instructions : ""}` : (it.instructions ?? null)],
        c,
      );
    }
    await run(
      `INSERT INTO "Prescription" (id, "doctorId", "encounterId", items, notes, "issuedOn")
       VALUES (gen_random_uuid(), $1, $2, $3::jsonb, $4, now())`,
      [v.profileId, enc!.id, JSON.stringify(body.items), body.advice ?? null],
      c,
    );

    for (const a of alerts) {
      await run(
        `INSERT INTO "Alert" (id, "patientId", "doctorId", type, severity, status, title, "message", payload, source, "createdAt")
         SELECT gen_random_uuid(), $1, $2, $3, $4, 'OPEN', $5, $6, $7::jsonb, 'RULE_ENGINE', now()
          WHERE NOT EXISTS (
            SELECT 1 FROM "Alert" x WHERE x."patientId"=$1 AND x.status='OPEN' AND x.type=$3 AND x.title=$5)`,
        [patient!.id, v.profileId, a.type, a.severity, a.title, a.message, JSON.stringify(a.evidence)],
        c,
      );
    }

    // notify the patient (in-app; SMS/email are modelled but not wired — see DRAWBACKS)
    await run(
      `INSERT INTO "Notification" (id, "userId", channel, title, body, "isRead", "createdAt")
       SELECT gen_random_uuid(), u.id, 'IN_APP', 'New prescription uploaded',
              'Consultation notes and medicines were added to your CityCare record.', false, now()
         FROM "User" u WHERE u.id = (SELECT "userId" FROM "Patient" WHERE id = $1)`,
      [patient!.id],
      c,
    );
    return enc!.id;
  });

  await appendAudit(v.uid, "CREATE_ENCOUNTER", "Patient", patient!.id, {
    consentId: verdict.consent.id,
    meta: { encounterId: written, drugs: body.items.map((i) => i.name), ...(critical.length ? { override: body.overrideReason } : {}) },
  });
  if (critical.length > 0) {
    await appendAudit(v.uid, "PRESCRIBE_OVERRIDE", "Patient", patient!.id, {
      consentId: verdict.consent.id,
      meta: { reason: body.overrideReason, conflicts: critical.map((a) => a.title) },
    });
  }

  return ok({ encounterId: written, alertsRaised: alerts.length, criticalOverridden: critical.length }, 201);
});
