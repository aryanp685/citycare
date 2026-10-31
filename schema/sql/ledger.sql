-- ============================================================
--  CityCare — tamper-evident audit ledger (the SQL side)
--  port of trust/citycare_trust/ledger.py into the live database.
--
--  entry_hash = sha256(prev_hash ‖ createdAtIso ‖ actorId ‖ action ‖ entityType ‖ entityId)
--  (each field NUL-terminated, same field order as _sha() in ledger.py)
--
--  Design facts that cost a whole debugging session, recorded so nobody
--  re-learns them the hard way:
--   * Prisma maps DateTime to a NAIVE timestamp(3) column. Hashing
--     to_char(createdAt AT TIME ZONE 'UTC') re-derives the string under the
--     SESSION TimeZone — one ALTER ROLE/SET TIME ZONE later and every row
--     looks tampered. So the canonical UTC string is STORED in
--     "createdAtIso" and hashed/read verbatim: timezone-proof forever.
--   * Prisma's (3) precision rounds on store; hashing the un-rounded now()
--     gave random 1-ms phantom breaks. date_trunc to ms BEFORE hashing fixes
--     variable and stored value by construction.
--   * postgres text cannot hold chr(0); the NUL separator lives in bytea
--     land (convert_to + '\x00'::bytea) exactly like the python bytes join.
--   * plpgsql OUT columns must not collide with table columns (MAX("seq")
--     resolving to the OUT param "seq" was a real bug hit here) — hence
--     at_seq / why / expected_hash / found_hash / out_seq names, and the
--     avoided name `found` (plpgsql's reserved FOUND boolean).
--
--  Requires: pgcrypto (digest()).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "seq"          BIGINT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "prevHash"     TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "entryHash"    TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "createdAtIso" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS auditlog_seq ON "AuditLog" ("seq") WHERE "seq" IS NOT NULL;

-- ------------------------------------------------------------- append
CREATE OR REPLACE FUNCTION ledger_append(
  p_actor uuid, p_action text, p_entity_type text, p_entity_id text,
  p_consent uuid DEFAULT NULL, p_meta jsonb DEFAULT NULL
) RETURNS TABLE (out_seq bigint, out_hash text) AS $$
DECLARE
  v_seq     bigint;
  v_prev    text;
  v_created timestamptz := date_trunc('milliseconds', now());
  v_iso     text;
  v_hash    text;
BEGIN
  -- one appender at a time: MAX(seq) + prev-hash must not race across
  -- concurrent transactions
  PERFORM pg_advisory_xact_lock(740110);

  SELECT COALESCE(MAX(a."seq"), 0) + 1,
         COALESCE((array_agg(a."entryHash" ORDER BY a."seq" DESC))[1], repeat('0', 64))
    INTO v_seq, v_prev
    FROM "AuditLog" a;

  v_iso := to_char(v_created AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  -- NUL-joined byte stream, same field order/separator as python _sha().
  v_hash := encode(digest(
      convert_to(v_prev, 'UTF8')   || '\x00'::bytea ||
      convert_to(v_iso, 'UTF8')    || '\x00'::bytea ||
      convert_to(p_actor::text, 'UTF8') || '\x00'::bytea ||
      convert_to(p_action, 'UTF8')      || '\x00'::bytea ||
      convert_to(p_entity_type, 'UTF8') || '\x00'::bytea ||
      convert_to(p_entity_id, 'UTF8')   || '\x00'::bytea,
      'sha256'), 'hex');

  INSERT INTO "AuditLog" (id, "actorId", "consentId", action, "entityType", "entityId",
                          "ipAddress", "userAgent", metadata, "createdAt",
                          "seq", "prevHash", "entryHash", "createdAtIso")
  VALUES (gen_random_uuid(), p_actor, p_consent, p_action, p_entity_type, p_entity_id,
          NULL, NULL, p_meta, v_created, v_seq, v_prev, v_hash, v_iso);

  RETURN QUERY SELECT v_seq, v_hash;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------- verify
-- Walk the chain from genesis; return one row per break, zero rows if intact.
CREATE OR REPLACE FUNCTION ledger_verify()
RETURNS TABLE (at_seq bigint, why text, expected_hash text, found_hash text) AS $$
DECLARE
  r        record;
  v_prev   text := repeat('0', 64);
  v_expect text;
  v_iso    text;
BEGIN
  FOR r IN SELECT * FROM "AuditLog" ORDER BY "seq" LOOP
    IF r."prevHash" IS DISTINCT FROM v_prev THEN
      at_seq        := r."seq";
      why           := 'prev_hash does not link to the previous entry (a row was inserted, removed or reordered)';
      expected_hash := v_prev;
      found_hash    := r."prevHash";
      RETURN NEXT;
    END IF;

    v_iso := COALESCE(
      r."createdAtIso",
      -- legacy rows written before canonical-string storage existed: the
      -- column holds naive UTC-wall time (the app's pinned convention), so
      -- format it DIRECTLY — AT TIME ZONE here would re-interpret it under
      -- the session TimeZone, the exact trap this file documents.
      to_char(r."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
    v_expect := encode(digest(
        convert_to(r."prevHash", 'UTF8')       || '\x00'::bytea ||
        convert_to(v_iso, 'UTF8')              || '\x00'::bytea ||
        convert_to(r."actorId"::text, 'UTF8')  || '\x00'::bytea ||
        convert_to(r.action, 'UTF8')           || '\x00'::bytea ||
        convert_to(r."entityType", 'UTF8')     || '\x00'::bytea ||
        convert_to(r."entityId", 'UTF8')       || '\x00'::bytea, 'sha256'), 'hex');

    IF v_expect IS DISTINCT FROM r."entryHash" THEN
      at_seq        := r."seq";
      why           := 'entry_hash does not match its contents (a row was edited in place)';
      expected_hash := v_expect;
      found_hash    := r."entryHash";
      RETURN NEXT;
    END IF;

    v_prev := r."entryHash";
  END LOOP;
END;
$$ LANGUAGE plpgsql;
