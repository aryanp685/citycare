import { one, run, type Q } from "./db";

/**
 * Erasure primitives shared by the patient's own "Erase my data" button and the demo
 * retention sweep (L1). One implementation → one behaviour → one thing to audit.
 *
 * Principle (DPDP s.12 right to erasure, honestly applied to a platform that is NOT the
 * treating hospital):
 *   - everything the PATIENT contributed to CityCare is deleted,
 *   - clinical prose the DOCTOR wrote on CityCare is redacted to an anonymous shell —
 *     the clinician's own statutory record-keeping duty (NMC/MCI Code of Medical Ethics 2002
 *     Reg. 1.3.1: 3 years; DGHS Hospital Manual: up to 10 years) is theirs, not the patient's,
 *   - inbox notifications are deleted (they may quote names and clinical facts),
 *   - the AUDIT LEDGER SURVIVES: it is the patient's own proof of who held their data and
 *     when it was destroyed (and DPDP Rules r.6(1)(e) requires access logs to be kept ≥ 1 year).
 */
export type ErasureReport = Record<string, number>;

export async function erasePatientData(c: Q, pid: string, uid: string): Promise<ErasureReport> {
  const counts: ErasureReport = {};
  const del = async (label: string, sql: string, params: unknown[] = [pid]) => {
    counts[label] = await run(sql, params, c);
  };

  counts["consentsClosed"] = await run(
    `UPDATE "Consent" SET status='REVOKED', "revokedAt"=now(), "revocationReason"='account erased'
      WHERE "patientId"=$1 AND status IN ('REQUESTED','APPROVED')`,
    [pid], c,
  );

  await del("allergies", `DELETE FROM "Allergy" WHERE "patientId"=$1`);
  await del("conditions", `DELETE FROM "Condition" WHERE "patientId"=$1`);
  await del("medications", `DELETE FROM "Medication" WHERE "patientId"=$1`);
  await del("observations", `DELETE FROM "Observation" WHERE "patientId"=$1`);
  await del("alerts", `DELETE FROM "Alert" WHERE "patientId"=$1`);
  await del("aiSummaries", `DELETE FROM "AiSummary" WHERE "patientId"=$1`);

  // labs hang off documents; delete children first (FK is RESTRICT on purpose)
  const labDocs = await one<{ ids: string[] }>(
    `SELECT COALESCE(array_agg(id), '{}') AS ids FROM "Document" WHERE "patientId"=$1`,
    [pid], c,
  );
  if (labDocs && labDocs.ids.length > 0) {
    counts["labResults"] = await run(`DELETE FROM "LabResult" WHERE "documentId" = ANY($1::uuid[])`, [labDocs.ids], c);
    await run(`DELETE FROM "AiExtraction" WHERE "documentId" = ANY($1::uuid[])`, [labDocs.ids], c);
  }
  await del("documents", `DELETE FROM "Document" WHERE "patientId"=$1`);

  // doctor-authored clinical text: redact, keep anonymous shells for the clinician's statutory record
  await run(
    `UPDATE "Encounter" SET "chiefComplaint"=NULL, "diagnosisText"='[REDACTED — record erased by patient]',
            "diagnosisCode"=NULL, advice=NULL, "followUpOn"=NULL
      WHERE "patientId"=$1`,
    [pid], c,
  );
  await run(`UPDATE "Prescription" SET items='[]'::jsonb, notes='[REDACTED]'
              WHERE "encounterId" IN (SELECT id FROM "Encounter" WHERE "patientId"=$1)`, [pid], c);
  await run(
    `UPDATE "Appointment" SET status='CANCELLED_BY_PATIENT', "notesForDoctor"=NULL, reason='[REDACTED]', "updatedAt"=now()
      WHERE "patientId"=$1 AND "scheduledAt" > now()`,
    [pid], c,
  );

  // A52: inbox items quote names and clinical facts — they go too
  await del("notifications", `DELETE FROM "Notification" WHERE "userId"=$1`, [uid]);

  // anonymise the profiles themselves (nominee included — it is someone else's personal data)
  await run(
    `UPDATE "Patient" SET "fullName"='[REDACTED]', "dateOfBirth"=NULL, "ageAtEntry"=NULL,
            "bloodGroup"='UNKNOWN', "addressLine"=NULL, pincode=NULL, "emergencyName"=NULL,
            "emergencyPhone"=NULL, "abhaId"=NULL, "abhaAddress"=NULL,
            "nomineeName"=NULL, "nomineeRelation"=NULL, "nomineePhone"=NULL, "updatedAt"=now()
      WHERE id=$1`,
    [pid], c,
  );
  await anonymiseUser(c, uid);
  return counts;
}

/**
 * Doctors created on the public demo: the profile is anonymised rather than deleted because
 * Appointment/Consent/Prescription rows reference it (RESTRICT) and other people's records
 * must keep a stable author id. The doctor becomes invisible (unverified, no active slots).
 */
export async function anonymiseDoctor(c: Q, did: string, uid: string): Promise<ErasureReport> {
  const counts: ErasureReport = {};
  counts["slotsClosed"] = await run(`UPDATE "AvailabilitySlot" SET "isActive"=false WHERE "doctorId"=$1`, [did], c);
  counts["consentsClosed"] = await run(
    `UPDATE "Consent" SET status='REVOKED', "revokedAt"=now(), "revocationReason"='doctor account erased'
      WHERE "doctorId"=$1 AND status IN ('REQUESTED','APPROVED')`,
    [did], c,
  );
  counts["appointmentsCancelled"] = await run(
    `UPDATE "Appointment" SET status='CANCELLED_BY_DOCTOR', "updatedAt"=now()
      WHERE "doctorId"=$1 AND "scheduledAt" > now() AND status IN ('PENDING','CONFIRMED','RESCHEDULED')`,
    [did], c,
  );
  counts["notifications"] = await run(`DELETE FROM "Notification" WHERE "userId"=$1`, [uid], c);
  await run(
    `UPDATE "Doctor" SET "fullName"='[REDACTED]', "registrationNo"=NULL, "hprId"=NULL, bio=NULL, "photoUrl"=NULL,
            "isVerified"=false, "verificationNote"='erased by retention sweep'
      WHERE id=$1`,
    [did], c,
  );
  await anonymiseUser(c, uid);
  return counts;
}

async function anonymiseUser(c: Q, uid: string) {
  await run(
    `UPDATE "User" SET email = 'erased-' || substr(md5(random()::text),1,10) || '@deleted.invalid',
            phone = '000' || substr(md5(random()::text),1,7),
            "passwordHash" = '!', status='DELETED', "updatedAt"=now()
      WHERE id=$1`,
    [uid], c,
  );
}
