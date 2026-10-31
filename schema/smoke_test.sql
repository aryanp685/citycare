-- ============================================================
--  CityCare smoke test: does the schema actually support the
--  core product story end-to-end?
--  Story: Ramesh (patient) books Dr. Kulkarni (cardiologist),
--  grants 7-day scoped consent, doctor reads record -> audit log.
-- ============================================================

BEGIN;

-- 1. Hospital + specialty + doctor
INSERT INTO "Hospital" (id, name, address, city, "isEmpanelled")
VALUES ('hosp-1', 'Sahyadri Superspeciality, Pune', 'Erandwane, Pune', 'Pune', true);

INSERT INTO "Specialty" (id, name) VALUES ('sp-1', 'Cardiology');

INSERT INTO "User" (id, email, phone, "passwordHash", role, status, "updatedAt") VALUES
  ('u-pat', 'ramesh@example.com', '+919800000001', 'argon2id$demo', 'PATIENT', 'ACTIVE', now()),
  ('u-doc', 'kulkarni@example.com', '+919800000002', 'argon2id$demo', 'DOCTOR', 'ACTIVE', now());

INSERT INTO "Doctor" (id, "userId", "fullName", qualification, "consultationFee", "hospitalId", "isVerified")
VALUES ('doc-1', 'u-doc', 'Dr. Anjali Kulkarni', 'MD (Medicine), DM (Cardiology)', 800, 'hosp-1', true);

INSERT INTO "DoctorSpecialty" ("doctorId", "specialtyId") VALUES ('doc-1', 'sp-1');

-- 2. Patient with longitudinal history
INSERT INTO "Patient" (id, "userId", "fullName", "dateOfBirth", gender, "bloodGroup", city, "updatedAt")
VALUES ('pat-1', 'u-pat', 'Ramesh Patil', '1968-04-12', 'MALE', 'B_POSITIVE', 'Pune', now());

INSERT INTO "Allergy" (id, "patientId", allergen, category, severity, "isActive", "reportedBy")
VALUES ('al-1', 'pat-1', 'Penicillin', 'DRUG', 'CRITICAL', true, 'DOCTOR');

INSERT INTO "Condition" (id, "patientId", name, icd10, status, "sinceDate")
VALUES ('co-1', 'pat-1', 'Type 2 Diabetes Mellitus', 'E11', 'ACTIVE', '2019-06-01');

INSERT INTO "Medication" (id, "patientId", name, "genericName", dosage, frequency, "isActive", "isChronic", "startDate")
VALUES ('med-1', 'pat-1', 'Metformin 500', 'metformin', '500 mg', '1-0-1', true, true, '2019-06-01');

-- 3. Doctor finds an available slot and patient books it
INSERT INTO "AvailabilitySlot" (id, "doctorId", "dayOfWeek", "startTime", "endTime")
VALUES ('slot-1', 'doc-1', 3, '09:30', '13:00');

INSERT INTO "Appointment" (id, "patientId", "doctorId", "slotId", "scheduledAt", status, reason, "updatedAt")
VALUES ('apt-1', 'pat-1', 'doc-1', 'slot-1', '2026-09-23 09:45:00', 'CONFIRMED', 'Chest discomfort since 3 days', now());

-- 4. Patient grants scoped, expiring consent
INSERT INTO "Consent" (id, "patientId", "doctorId", status, scope, purpose, "approvedAt", "expiresAt", "lastNEncounters")
VALUES ('con-1', 'pat-1', 'doc-1', 'APPROVED', 'LAST_N_ENCOUNTERS', 'TREATMENT', now(), now() + interval '7 days', 5);

UPDATE "Appointment" SET "consentId" = 'con-1', "updatedAt" = now() WHERE id = 'apt-1';

-- 5. Doctor opens the record -> every read is logged
INSERT INTO "AuditLog" (id, "actorId", "consentId", action, "entityType", "entityId", "ipAddress")
VALUES ('log-1', 'u-doc', 'con-1', 'VIEW_RECORD', 'Patient', 'pat-1', '103.21.44.7');

-- 6. Patient uploads an old lab report; OCR extracts HbA1c
INSERT INTO "Document" (id, "patientId", type, source, title, "issuedOn", "storageKey",
                        "encryptionIv", "mimeType", "sizeBytes", "checksumSha256", "ocrStatus")
VALUES ('doc-1', 'pat-1', 'LAB_REPORT', 'SCANNED_PAPER', 'HbA1c + Lipid Profile (2024)', '2024-02-10',
        'pat-1/doc-1.pdf', 'iv-base64', 'application/pdf', 482113, 'sha256demo', 'DONE');

INSERT INTO "LabResult" (id, "documentId", "testName", value, unit, "refRangeLow", "refRangeHigh", "isAbnormal", "takenOn")
VALUES ('lab-1', 'doc-1', 'HbA1c', '8.4', '%', '4.0', '5.6', true, '2024-02-10');

INSERT INTO "Observation" (id, "patientId", category, name, "valueNum", unit)
VALUES ('obs-1', 'pat-1', 'VITALS', 'systolic_bp', 152, 'mmHg');

-- 7. Rule engine fires two alerts from the above data
INSERT INTO "Alert" (id, "patientId", "doctorId", type, severity, title, message, payload, source)
VALUES
 ('alt-1', 'pat-1', NULL, 'DRUG_ALLERGY_CONFLICT', 'CRITICAL',
  'Prescription contains Penicillin-class drug',
  'Amoxicillin prescribed at Sahyadri on 2025-11-02 conflicts with recorded Penicillin allergy.',
  '{"drugA":"amoxicillin","allergen":"Penicillin"}'::jsonb, 'RULE_ENGINE'),
 ('alt-2', 'pat-1', NULL, 'ABNORMAL_LAB_VALUE', 'WARNING',
  'HbA1c 8.4% above target',
  'Last HbA1c 8.4% (Feb 2024). No repeat test in 18 months.',
  '{"test":"HbA1c","value":8.4,"target":"<7.0"}'::jsonb, 'RULE_ENGINE');

COMMIT;

-- ============================================================
--  THE QUERIES THE APP WILL ACTUALLY RUN
-- ============================================================

\echo ''
\echo '### Q1. Doctor dashboard: does this doctor have live access right now?'
SELECT c.id, c.scope, c.purpose, c."expiresAt",
       (c.status = 'APPROVED' AND c."expiresAt" > now()) AS "access_allowed"
FROM "Consent" c
WHERE c."doctorId" = 'doc-1' AND c."patientId" = 'pat-1';

\echo ''
\echo '### Q2. Longitudinal timeline (what the doctor sees on one screen)'
SELECT 'ALLERGY'    AS kind, allergen  AS detail, severity::text AS flag, "createdAt"::date AS on_date FROM "Allergy"    WHERE "patientId"='pat-1' AND "isActive"
UNION ALL
SELECT 'CONDITION',  name||' ('||COALESCE(icd10,'')||')', status, "sinceDate"::date   FROM "Condition"  WHERE "patientId"='pat-1'
UNION ALL
SELECT 'MEDICATION', name||' '||COALESCE(frequency,''), CASE WHEN "isChronic" THEN 'CHRONIC' ELSE 'ACUTE' END, "startDate"::date FROM "Medication" WHERE "patientId"='pat-1'
UNION ALL
SELECT 'LAB',        "testName"||' = '||value||COALESCE(unit,''), CASE WHEN "isAbnormal" THEN 'ABNORMAL' ELSE 'NORMAL' END, "takenOn"::date FROM "LabResult" l JOIN "Document" d ON d.id=l."documentId" WHERE d."patientId"='pat-1'
UNION ALL
SELECT 'VITAL',      name||' = '||"valueNum"::text||' '||COALESCE(unit,''), '', "takenOn"::date FROM "Observation" WHERE "patientId"='pat-1'
ORDER BY on_date DESC;

\echo ''
\echo '### Q3. Patient: who has seen my data, and when? (transparency screen)'
SELECT d."fullName" AS doctor, a.action, a."entityType", a."createdAt"
FROM "AuditLog" a JOIN "User" u ON u.id = a."actorId" JOIN "Doctor" d ON d."userId" = u.id
WHERE a."consentId" = 'con-1' ORDER BY a."createdAt" DESC;

\echo ''
\echo '### Q4. Open critical alerts blocking safe prescribing'
SELECT severity, title, message FROM "Alert"
WHERE "patientId"='pat-1' AND status='OPEN' AND severity='CRITICAL';

\echo ''
\echo '### Q5. Find cardiologists in Pune under Rs 1000 (doctor search)'
SELECT d."fullName", d."consultationFee", d.rating, h.name AS hospital
FROM "Doctor" d
JOIN "DoctorSpecialty" ds ON ds."doctorId"=d.id
JOIN "Specialty" s ON s.id=ds."specialtyId"
JOIN "Hospital" h ON h.id=d."hospitalId"
WHERE s.name='Cardiology' AND h.city='Pune' AND d."consultationFee" <= 1000 AND d."isVerified";
