-- 0007 — NG-D01-1 (Day 3 database audit, 2026-11-02): drop the duplicate Observation index.
--
-- `citycare_init.sql` (line 545) already creates
--     "Observation_patientId_name_takenOn_idx" ON "Observation" ("patientId", name, "takenOn")
-- and migrations/0005_observation_reference_bands.sql later created an index with the
-- IDENTICAL column list under a different name:
--     "Observation_patient_name_taken_idx" ON "Observation" ("patientId", name, "takenOn")
-- because the different name defeats IF NOT EXISTS. Every database (fresh or existing)
-- therefore carries two exact-duplicate indexes: double write amplification on every
-- Observation insert/update, double storage, no query benefit (the planner can use either).
--
-- This migration removes the 0005 copy and keeps the base name (which is the one the
-- fresh-DB snapshot in citycare_init.sql documents). DROP INDEX IF EXISTS is idempotent,
-- touches no data, and no query loses an index (the identical base index remains).
SET client_min_messages = warning;

DROP INDEX IF EXISTS "Observation_patient_name_taken_idx";
