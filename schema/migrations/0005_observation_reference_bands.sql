-- 0005 — F5: longitudinal trends over patient-logged readings.
--        The Observation table existed but was completely unwired (dead table — no writer,
--        no reader, no UI). This migration completes its shape so a self-reported reading can
--        carry its own reference band (the sparkline draws the normal range behind the points),
--        and adds the index the per-patient, per-name trend query needs.
-- Idempotent: safe to re-run.
SET client_min_messages = warning;

-- Reference band for the reading's series. Numeric (not TEXT like LabResult): trend math and
-- the sparkline need to compare values, and the API route validates low < high on write.
ALTER TABLE "Observation" ADD COLUMN IF NOT EXISTS "refLow"  DOUBLE PRECISION;
ALTER TABLE "Observation" ADD COLUMN IF NOT EXISTS "refHigh" DOUBLE PRECISION;

-- Trend query: one patient's readings, grouped by measurement name, ordered over time.
CREATE INDEX IF NOT EXISTS "Observation_patient_name_taken_idx" ON "Observation" ("patientId", name, "takenOn");
