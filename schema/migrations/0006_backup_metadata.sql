-- 0006 — NG-S09: encrypted daily backup / disaster recovery.
--        Metadata for every backup attempt (success AND failure) so the health endpoint and
--        operators can see "last good backup" and "why the last one failed" without secrets.
--        Deliberately holds NO patient data: identifiers are a db fingerprint hash + object
--        name + size + checksum. A lost DB cannot learn from these rows what it contained.
-- Idempotent: safe to re-run.
SET client_min_messages = warning;

CREATE TABLE IF NOT EXISTS "Backup" (
    "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "formatVersion" INTEGER      NOT NULL DEFAULT 1,
    "dbFingerprint" TEXT         NOT NULL,
    "schemaVersion" TEXT,
    "pgVersion"     TEXT,
    "fileSize"      BIGINT       NOT NULL DEFAULT 0,
    "sha256"        TEXT         NOT NULL DEFAULT '',
    "storeKind"     TEXT         NOT NULL,
    "objectName"    TEXT         NOT NULL DEFAULT '',
    "status"        TEXT         NOT NULL,              -- 'ok' | 'failed' | 'partial'
    "durationMs"    INTEGER      NOT NULL,
    "errorClass"    TEXT,
    "rowCounts"     JSONB,
    "tableCount"    INTEGER
);

-- "when was the last good backup" is the hottest query (health endpoint, runbook).
CREATE INDEX IF NOT EXISTS "Backup_status_created_idx" ON "Backup" ("status", "createdAt" DESC);
