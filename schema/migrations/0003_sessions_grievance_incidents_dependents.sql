-- 0003: gap-closing round (L2 / D41 / D37 / D21 / D9 / D14 / F13). Idempotent.
SET client_min_messages = warning;

-- D21/D8: server-side sessions. The cookie still carries a signed JWT, but it now names a row
-- here; logout revokes the row, "sign out everywhere" revokes all rows for the user, purge too.
CREATE TABLE IF NOT EXISTS "Session" (
    "id"                 UUID        NOT NULL DEFAULT gen_random_uuid(),
    "userId"             TEXT        NOT NULL,
    "role"               "Role"      NOT NULL,
    "profileId"          TEXT        NOT NULL,      -- acting profile (Patient.id | Doctor.id | admin uid)
    "actingForPatientId" TEXT,                      -- F13: set when a guardian manages a dependent
    "uaHash"             TEXT,                      -- sha256 of the User-Agent, for the "your sessions" list only
    "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    "expiresAt"          TIMESTAMPTZ NOT NULL,
    "revokedAt"          TIMESTAMPTZ,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Session_user_live_idx" ON "Session" ("userId") WHERE "revokedAt" IS NULL;

-- D37: per-IP / per-account rate limits in Postgres (no Redis on the free tier). Fixed windows.
CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key"         TEXT        NOT NULL,
    "windowStart" TIMESTAMPTZ NOT NULL,
    "count"       INTEGER     NOT NULL DEFAULT 1,
    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key", "windowStart")
);

-- L-G1 / D43: in-app grievance desk (DPDP s.13) — a working channel that needs no mailbox.
CREATE TABLE IF NOT EXISTS "Grievance" (
    "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "userId"      TEXT        NOT NULL,
    "category"    TEXT        NOT NULL,
    "subject"     TEXT        NOT NULL,
    "body"        TEXT        NOT NULL,
    "status"      TEXT        NOT NULL DEFAULT 'OPEN',
    "resolution"  TEXT,
    "handledBy"   TEXT,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    "dueAt"       TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days',
    "resolvedAt"  TIMESTAMPTZ,
    CONSTRAINT "Grievance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Grievance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Grievance_category_chk" CHECK ("category" IN ('ACCESS','CORRECTION','ERASURE','CONSENT','SECURITY','DOCTOR_APPEAL','OTHER')),
    CONSTRAINT "Grievance_status_chk" CHECK ("status" IN ('OPEN','IN_PROGRESS','RESOLVED','REJECTED'))
);
CREATE INDEX IF NOT EXISTS "Grievance_status_idx" ON "Grievance" ("status", "dueAt");
CREATE INDEX IF NOT EXISTS "Grievance_user_idx" ON "Grievance" ("userId", "createdAt" DESC);

-- L-G5: personal-data-breach register (DPDP Rules r.7) with the 72-hour clock and the intimation log.
CREATE TABLE IF NOT EXISTS "Incident" (
    "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
    "title"           TEXT        NOT NULL,
    "summary"         TEXT        NOT NULL,
    "dataInvolved"    TEXT        NOT NULL,
    "userAdvice"      TEXT        NOT NULL,
    "status"          TEXT        NOT NULL DEFAULT 'OPEN',
    "detectedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    "containedAt"     TIMESTAMPTZ,
    "rootCause"       TEXT,
    "remediation"     TEXT,
    "boardNotifiedAt" TIMESTAMPTZ,
    "notifiedCount"   INTEGER     NOT NULL DEFAULT 0,
    "notifiedAt"      TIMESTAMPTZ,
    "reportedBy"      TEXT        NOT NULL,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Incident_status_chk" CHECK ("status" IN ('OPEN','CONTAINED','CLOSED'))
);

-- D41: every break-glass override gets an admin verdict.
ALTER TABLE "Consent" ADD COLUMN IF NOT EXISTS "reviewedAt"    TIMESTAMPTZ;
ALTER TABLE "Consent" ADD COLUMN IF NOT EXISTS "reviewVerdict" TEXT;
ALTER TABLE "Consent" ADD COLUMN IF NOT EXISTS "reviewNote"    TEXT;
ALTER TABLE "Consent" ADD COLUMN IF NOT EXISTS "reviewedBy"    TEXT;
DO $$ BEGIN
  ALTER TABLE "Consent" ADD CONSTRAINT "Consent_reviewVerdict_chk" CHECK ("reviewVerdict" IS NULL OR "reviewVerdict" IN ('JUSTIFIED','UNJUSTIFIED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Consent_emergency_review_idx" ON "Consent" ("isEmergencyOverride", "reviewedAt") WHERE "isEmergencyOverride";

-- F13 / L-G4: dependents (minors) managed by an adult guardian; consent is given by the guardian
-- (DPDP s.9, Rules r.10 — verification = guardian's own recorded date of birth + attestation).
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "guardianPatientId" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "guardianRelation"  TEXT;
DO $$ BEGIN
  ALTER TABLE "Patient" ADD CONSTRAINT "Patient_guardian_fkey" FOREIGN KEY ("guardianPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Patient_guardian_idx" ON "Patient" ("guardianPatientId") WHERE "guardianPatientId" IS NOT NULL;
-- who ticked the box on behalf of a dependent
ALTER TABLE "PolicyAcceptance" ADD COLUMN IF NOT EXISTS "acceptedByUserId" TEXT;
