-- ============================================================
--  CityCare guardrail tests.
--  Each block SHOULD fail. If any block succeeds, a guardrail
--  is missing and the app has a real-world bug.
--  Run after smoke_test.sql.
-- ============================================================

\set ON_ERROR_STOP off

\echo ''
\echo '############ TEST 1: double-booking the same slot ############'
INSERT INTO "User" (id,email,phone,"passwordHash",role,status,"updatedAt")
VALUES ('u-pat2','sunita@example.com','+919800000009','argon2id$demo','PATIENT','ACTIVE',now());
INSERT INTO "Patient" (id,"userId","fullName",city,"updatedAt")
VALUES ('pat-2','u-pat2','Sunita Deshpande','Pune',now());

INSERT INTO "Appointment" (id,"patientId","doctorId","slotId","scheduledAt",status,"updatedAt")
VALUES ('apt-2','pat-2','doc-1','slot-1','2026-09-23 09:45:00','CONFIRMED',now());
\echo 'EXPECTED: ERROR unique violation on one_live_appt_per_doctor_per_instant'

\echo ''
\echo '--- but the SAME instant is bookable once cancelled (slot freed) ---'
UPDATE "Appointment" SET status='CANCELLED_BY_PATIENT', "updatedAt"=now() WHERE id='apt-1';
INSERT INTO "Appointment" (id,"patientId","doctorId","slotId","scheduledAt",status,"updatedAt")
VALUES ('apt-3','pat-2','doc-1','slot-1','2026-09-23 09:45:00','CONFIRMED',now());
\echo 'EXPECTED: INSERT 0 1 (guard correctly ignores cancelled rows)'

\echo ''
\echo '############ TEST 2: doctor stacking two active consents ############'
INSERT INTO "Consent" (id,"patientId","doctorId",status,scope,purpose,"approvedAt","expiresAt")
VALUES ('con-2','pat-1','doc-1','APPROVED','FULL_RECORD','TREATMENT',now(),now()+interval '30 days');
\echo 'EXPECTED: ERROR unique violation on one_active_consent_per_pair'

\echo ''
\echo '############ TEST 3: tampering with the audit log ############'
UPDATE "AuditLog" SET action='NOTHING_HAPPENED' WHERE id='log-1';
\echo 'EXPECTED: ERROR "AuditLog is append-only"'

DELETE FROM "AuditLog" WHERE id='log-1';
\echo 'EXPECTED: ERROR "AuditLog is append-only"'

\echo ''
\echo '############ TEST 4: duplicate ABHA number ############'
UPDATE "Patient" SET "abhaId"='12-3456-7890-1234' WHERE id='pat-1';
INSERT INTO "Patient" (id,"userId","fullName",city,"abhaId","updatedAt")
VALUES ('pat-3','u-doc','Duplicate ABHA Test','Pune','12-3456-7890-1234',now());
\echo 'EXPECTED: ERROR unique violation on one_abha_per_patient'

\echo ''
\echo '############ FINAL STATE ############'
SELECT id,"patientId",status FROM "Appointment"
WHERE "doctorId"='doc-1' AND "scheduledAt"='2026-09-23 09:45:00' ORDER BY id;

SELECT action, "entityType" FROM "AuditLog";
