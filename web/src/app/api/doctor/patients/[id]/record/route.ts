import { requireRole, requireVerifiedDoctor, guardSameOrigin } from "@/lib/session";
import { handler, ok } from "@/lib/api";
import { fail } from "@/lib/db";
import { liveConsentFor, scopedRecord, patientById, ageFrom, toRuleRecord } from "@/lib/repo";
import { appendAudit } from "@/lib/ledger";
import { runAllRules, listAbnormalLabs } from "@/lib/rules";
import { buildDigest } from "@/lib/digest";

/**
 * The ONLY path from a doctor's browser to clinical data.
 * Consent is re-evaluated server-side against the DB clock on EVERY call —
 * a revoked consent fails here, not "eventually".
 */
export const GET = handler(async (_req, { params }) => {
  await guardSameOrigin(_req);
  const v = await requireRole("DOCTOR");
  await requireVerifiedDoctor(v);
  const { id: patientId } = await params;

  const patient = await patientById(patientId);
  if (!patient) fail(404, "no_patient", "patient not found");

  const { verdict, now } = await liveConsentFor(patient!.id, v.profileId);
  if (!verdict.allowed) {
    // denied attempts are ALSO written to the patient-visible ledger
    await appendAudit(v.uid, "VIEW_DENIED", "Patient", patient!.id, { meta: { reason: verdict.reason } });
    fail(403, "no_consent", `Access refused: ${verdict.reason}`);
  }

  const { sections, scopeNote } = await scopedRecord(patient!.id, verdict);
  const ruleRecord = toRuleRecord(sections);
  const alerts = runAllRules(ruleRecord, now.toISOString().slice(0, 10)).map((a) => ({ type: a.type, severity: a.severity, title: a.title, message: a.message }));

  const digest = buildDigest({
    fullName: patient!.fullName,
    age: ageFrom(patient!.dateOfBirth),
    gender: patient!.gender,
    bloodGroup: patient!.bloodGroup,
    allergies: sections.allergies,
    conditions: sections.conditions.map((x) => x.name),
    medications: sections.medications.map((m) => ({ name: m.name, dosage: m.dosage, frequency: m.frequency, isDraft: (m.notes ?? "").startsWith("DRAFT:") })),
    lastEncounter: sections.encounters[0]
      ? {
          date: sections.encounters[0].encounterDate.toISOString().slice(0, 10),
          diagnosis: sections.encounters[0].diagnosisText,
          doctor: sections.encounters[0].doctor,
        }
      : null,
    abnormalLabs: listAbnormalLabs(ruleRecord),
    followUpDue: sections.encounters.find((e) => e.followUpOn && new Date(e.followUpOn) <= now)?.followUpOn?.toISOString().slice(0, 10) ?? null,
  });

  await appendAudit(v.uid, "VIEW_RECORD", "Patient", patient!.id, {
    consentId: verdict.consent.id,
    meta: { scope: verdict.consent.scope },
  });

  return ok({
    consentId: verdict.consent.id,
    scope: verdict.consent.scope,
    scopeNote,
    expiresAt: verdict.consent.expiresAt,
    isEmergency: !!verdict.consent.isEmergencyOverride,
    emergencyReason: verdict.consent.emergencyReason ?? null,
    record: {
      ...sections,
      encounters: sections.encounters.map((e) => ({ ...e, encounterDate: e.encounterDate.toISOString(), followUpOn: e.followUpOn?.toISOString() ?? null })),
      prescriptions: sections.prescriptions.map((p) => ({ ...p, issuedOn: p.issuedOn.toISOString() })),
      documents: sections.documents.map((d) => ({ ...d, issuedOn: d.issuedOn?.toISOString() ?? null })),
      labs: sections.labs.map((l) => ({ ...l, takenOn: l.takenOn?.toISOString() ?? null })),
    },
    alerts,
    digest,
  });
});
