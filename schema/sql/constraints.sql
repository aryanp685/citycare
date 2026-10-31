-- ============================================================
--  CityCare — hand-written DB guardrails
--  Apply AFTER the Prisma-generated migration.
--  These cannot be expressed with Prisma's @@unique because they
--  need partial / expression indexes (PostgreSQL specific).
-- ============================================================

-- ------------------------------------------------------------
-- GUARD 1: no double-booking.
-- A doctor may hold only ONE live appointment per instant PER SEAT.
-- Partial index excludes terminal states, so when a patient
-- cancels, that seat becomes bookable again with zero app logic.
-- D6: AvailabilitySlot.maxPerSlot (1..6) is the number of seats;
-- the app picks the lowest free seatNo and the index decides races.
-- (kept in sync with migrations/0004, which upgrades older DBs)
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS one_live_appt_per_doctor_per_instant
  ON "Appointment" ("doctorId", "scheduledAt", "seatNo")
  WHERE status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'RESCHEDULED');

-- ------------------------------------------------------------
-- GUARD 2: queue token unique per doctor per calendar day.
-- Expression index on the date part, so tokens restart at 1
-- every morning instead of climbing forever.
-- NULL tokenNo (not yet issued) is allowed to repeat.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS one_token_per_doctor_per_day
  ON "Appointment" ("doctorId", ("scheduledAt"::date), "tokenNo")
  WHERE "tokenNo" IS NOT NULL;

-- ------------------------------------------------------------
-- GUARD 3: one consent per doctor-patient pair at a time.
-- Stops a doctor stacking overlapping access grants.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS one_active_consent_per_pair
  ON "Consent" ("doctorId", "patientId")
  WHERE status IN ('REQUESTED', 'APPROVED');

-- ------------------------------------------------------------
-- GUARD 4: no duplicate ABHA / mobile-number typos.
-- Enforced only when a value is present.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS one_abha_per_patient
  ON "Patient" ("abhaId")
  WHERE "abhaId" IS NOT NULL;

-- ------------------------------------------------------------
-- GUARD 5: AuditLog is append-only.
-- A DB-level trigger that refuses UPDATE and DELETE on the audit
-- trail. This is the single strongest thing you can do to prove
-- "the patient can trust the log" during your viva.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_audit_tampering()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: % is not permitted on %',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_no_update ON "AuditLog";
CREATE TRIGGER audit_no_update
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION reject_audit_tampering();
