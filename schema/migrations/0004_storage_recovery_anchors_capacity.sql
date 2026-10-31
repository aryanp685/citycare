-- 0004 — encrypted document storage in Postgres (D4/L-G8), recovery codes + email outbox (D3/D9),
--        sliding sessions (D52), ledger anchors (D13), slot capacity (D6), email verification (D3).
-- Idempotent: safe to re-run.
SET client_min_messages = warning;

-- ---------------------------------------------------------------------------------------------
-- D4 / L-G8: the bytes of an uploaded report, AES-256-GCM encrypted by the app (iv on Document,
-- 16-byte tag appended to the ciphertext). Kept in its own table so record queries never drag
-- megabytes through the pool. ON DELETE CASCADE: erasing the Document row erases the bytes.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "DocumentBlob" (
    "documentId" TEXT        NOT NULL,
    "data"       BYTEA       NOT NULL,
    "keyVersion" INTEGER     NOT NULL DEFAULT 1,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "DocumentBlob_pkey" PRIMARY KEY ("documentId"),
    CONSTRAINT "DocumentBlob_document_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "uploadedByUserId" TEXT;   -- F13: guardian uploads on a dependent's behalf

-- ---------------------------------------------------------------------------------------------
-- D9 / D3: self-service recovery without an SMS/email provider. Codes are random, shown once,
-- stored hashed; each is single-use. Regenerating deletes the previous set.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "RecoveryCode" (
    "id"        UUID        NOT NULL DEFAULT gen_random_uuid(),
    "userId"    TEXT        NOT NULL,
    "codeHash"  TEXT        NOT NULL,
    "usedAt"    TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RecoveryCode_user_idx" ON "RecoveryCode" ("userId") WHERE "usedAt" IS NULL;

-- Email codes (reset / verify). Separate from the phone "Otp" table on purpose: different key.
CREATE TABLE IF NOT EXISTS "EmailCode" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "userId"     TEXT        NOT NULL,
    "purpose"    TEXT        NOT NULL,             -- RESET | VERIFY
    "codeHash"   TEXT        NOT NULL,
    "expiresAt"  TIMESTAMPTZ NOT NULL,
    "attempts"   INTEGER     NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMPTZ,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmailCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "EmailCode_user_purpose_idx" ON "EmailCode" ("userId", "purpose") WHERE "consumedAt" IS NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMPTZ;

-- Every outbound email is a row first (audit + local testing); the provider adapter marks it sent.
CREATE TABLE IF NOT EXISTS "Outbox" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "toEmail"    TEXT        NOT NULL,
    "subject"    TEXT        NOT NULL,
    "body"       TEXT        NOT NULL,
    "kind"       TEXT        NOT NULL,             -- RESET | VERIFY | BREACH | ANCHOR | OTHER
    "status"     TEXT        NOT NULL DEFAULT 'UNSENT', -- UNSENT | SENT | FAILED
    "provider"   TEXT,
    "providerId" TEXT,
    "error"      TEXT,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    "sentAt"     TIMESTAMPTZ,
    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Outbox_status_idx" ON "Outbox" ("status", "createdAt");

-- ---------------------------------------------------------------------------------------------
-- D52: sliding sessions — idle 7 days ⇒ dead; activity extends up to an absolute 30-day cap.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------------------------
-- D13: daily chain-head anchors. Signed with an Ed25519 key whose PUBLIC half is published, and
-- (best-effort) submitted to an OpenTimestamps calendar so a witness outside this database exists.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "LedgerAnchor" (
    "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "seq"         BIGINT      NOT NULL,
    "headHash"    TEXT        NOT NULL,
    "digest"      TEXT        NOT NULL,            -- sha256(seq || ':' || headHash), what is signed / timestamped
    "signature"   TEXT,                            -- base64 Ed25519 over digest bytes
    "publicKey"   TEXT,                            -- base64 SPKI of the signing key (so old anchors stay verifiable after rotation)
    "otsCalendar" TEXT,
    "otsProof"    BYTEA,                           -- pending .ots receipt from the calendar
    "anchoredAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "LedgerAnchor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerAnchor_seq_key" ON "LedgerAnchor" ("seq");

-- ---------------------------------------------------------------------------------------------
-- D6: real capacity. A rule's maxPerSlot N means N seats per instant; the seat is part of the
-- uniqueness guard, so the database — not the app — still decides who gets the last one.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "seatNo" INTEGER NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS one_live_appt_per_doctor_per_instant;
CREATE UNIQUE INDEX IF NOT EXISTS one_live_appt_per_doctor_per_instant
  ON "Appointment" ("doctorId", "scheduledAt", "seatNo")
  WHERE status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'RESCHEDULED');
ALTER TABLE "AvailabilitySlot" DROP CONSTRAINT IF EXISTS "AvailabilitySlot_maxPerSlot_range";
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_maxPerSlot_range" CHECK ("maxPerSlot" BETWEEN 1 AND 6);
