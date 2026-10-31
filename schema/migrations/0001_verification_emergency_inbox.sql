-- 0001 · F1 doctor verification · F2 break-glass · F3 notifications inbox
SET client_min_messages = warning;  -- idempotent re-runs must not spam NOTICEs
-- Every statement is idempotent: bootstrap re-runs the whole folder on every deploy.

-- F1: who verified a doctor, when, or why they were rejected. `isVerified` stays the single gate.
ALTER TABLE "Doctor" ADD COLUMN IF NOT EXISTS "verifiedAt"       TIMESTAMP(3);
ALTER TABLE "Doctor" ADD COLUMN IF NOT EXISTS "verifiedBy"       TEXT;
ALTER TABLE "Doctor" ADD COLUMN IF NOT EXISTS "rejectedAt"       TIMESTAMP(3);
ALTER TABLE "Doctor" ADD COLUMN IF NOT EXISTS "verificationNote" TEXT;
CREATE INDEX IF NOT EXISTS "Doctor_pending_idx" ON "Doctor" ("createdAt") WHERE NOT "isVerified" AND "rejectedAt" IS NULL;

-- F2: the stated reason for an emergency override lives on the consent itself (the ledger also has it).
ALTER TABLE "Consent" ADD COLUMN IF NOT EXISTS "emergencyReason" TEXT;
CREATE INDEX IF NOT EXISTS "Consent_emergency_by_doctor_idx" ON "Consent" ("doctorId", "requestedAt") WHERE "isEmergencyOverride";

-- F3: deep link + severity so the inbox can render and route; unread lookups by user.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "href"     TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "severity" TEXT NOT NULL DEFAULT 'INFO';
CREATE INDEX IF NOT EXISTS "Notification_unread_idx" ON "Notification" ("userId", "createdAt" DESC) WHERE NOT "isRead";
