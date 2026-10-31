-- 0002: Legal & compliance pack (L1). Idempotent — safe to re-run on every deploy.
SET client_min_messages = warning;

-- DPDP Act 2023 s.6 / Rules 2025 r.3: consent must be a clear affirmative act given
-- after a stand-alone notice. We keep the artefact: WHO accepted WHICH version WHEN.
-- (No IP address is stored — data minimisation; the ledger already proves the event.)
CREATE TABLE IF NOT EXISTS "PolicyAcceptance" (
    "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "userId"      TEXT        NOT NULL,
    "policyKey"   TEXT        NOT NULL,            -- 'privacy-notice' | 'terms'
    "version"     TEXT        NOT NULL,            -- e.g. '2026-09-28'
    "acceptedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    "withdrawnAt" TIMESTAMPTZ,
    CONSTRAINT "PolicyAcceptance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PolicyAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PolicyAcceptance_key_chk" CHECK ("policyKey" IN ('privacy-notice', 'terms'))
);
CREATE INDEX IF NOT EXISTS "PolicyAcceptance_user_idx" ON "PolicyAcceptance" ("userId", "policyKey", "acceptedAt" DESC);

-- DPDP Act 2023 s.14: right to nominate a person who may exercise the Data Principal's
-- rights in the event of death or incapacity. Optional; patient-editable; erased with the record.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "nomineeName"     TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "nomineeRelation" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "nomineePhone"    TEXT;
