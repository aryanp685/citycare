# CityCare — Restore Runbook (NG-S09)

**Audience:** the on-call operator (a human). Restore is deliberately **not** an API endpoint
and **not** a cron job: it is a scripted, human-confirmed operation that can only ever target
an **isolated scratch database** — never the live one. The script `web/scripts/restore-drill.mjs`
is the executable form of this runbook, so the two cannot drift: every step below is a gate in
the script, and the script refuses to run outside its safety invariants.

> **Read `BACKUP_AND_DISASTER_RECOVERY.md` first.** This runbook assumes you hold: a backup
> file (`.ccbk`), its `BACKUP_KEY`, a checkout of the repo at a **same-or-newer** schema
> version than the backup, and database-host access.

---

## 0. Safety invariants (do not weaken, do not "just this once")

1. The scratch database name **must** match `^citycare_drill_\d{8}_\d{6}$`. The script
   refuses anything else — restore can never be pointed at the production database by name.
2. The scratch database **must not already exist** — the script refuses to clobber a previous
   drill.
3. Writes go **only** to the scratch database. The only operations against the real database
   are `CREATE DATABASE` / `DROP DATABASE` for that exact scratch name.
4. Verification is **all-or-nothing before you trust anything**: file checksum → schema apply
   → FK-ordered COPY in ONE transaction → `ledger_verify() = 0` → row counts match the
   manifest → **table content matches the manifest row-for-row** (re-COPY compare,
   order-independent — A88) → login/record check → *then*
   the scratch is dropped (unless `--keep`).
5. **Never** restore into the live database. **Never** drop the live database before the
   restored one is verified and promoted (see §6). **Never** skip a gate to save time.

## 1. Select the backup file

```bash
# recent attempts (metadata: status, store, objectName, fileSize, sha256, errorClass)
DATABASE_URL=… BACKUP_KEY=… node scripts/backup.mjs list
```

Pick the newest row with `status='ok'` and check:

- `dbFingerprint` matches the database you think you're restoring (it is `sha256(host:port/dbname)`
  — if it doesn't match the target's identity, stop and re-check which database this file came from);
- `schemaVersion` ≤ the schema version of your current checkout (the script re-checks this and
  refuses to restore a backup *newer* than the checkout);
- `rowCounts` look sane (table count, row counts) for the time of day you're restoring.

## 2. Verify the file WITHOUT restoring

```bash
node scripts/backup.mjs verify <file.ccbk>
```

This decrypts (AES-256-GCM under `BACKUP_KEY`), re-hashes the payload, and re-walks the
section manifest (exact marker bytes + byte lengths). It prints `createdAt`, `pgVersion`,
`schemaVersion`, `tables`, `rows`, `fileSha256`. A tampered or bit-rotted file fails here —
stop and use an older file.

## 3. Run the drill (restore + verify into the scratch DB)

```bash
DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/<db>   # the REAL db (only used for CREATE/DROP of the scratch)
BACKUP_KEY=<32-byte-base64>
node scripts/restore-drill.mjs <file.ccbk> \
  --scratch citycare_drill_YYYYMMDD_HHMMSS \
  --verify-email ramesh@demo.in --verify-password city1234
```

(Use a demo-account verify pair only in demo environments; in a real environment choose a
known account and its known password, or omit the pair to skip the login gate — you lose one
verification, so prefer keeping it.)

The script prints a JSON report. **Expected on success:**

```json
{
  "status": "success",
  "checks": {
    "fileIntegrity": {"ok": true, "...": "..."},
    "schema":        {"ok": true, "files": 9},
    "dataCopied":    {"ok": true, "sections": 36},
    "ledgerVerify":  {"ok": true, "breaks": 0},
    "rowCounts":     {"ok": true, "mismatches": []},
    "contentMatch":  {"ok": true, "mismatches": []},
    "login":         {"ok": true, "...": "..."}
  },
  "measurements": { "restoreMs": 609, "...": "..." },
  "scratchDropped": true
}
```

Exit code `0` = success; `1` = a gate failed (the report says which); `2` = usage/safety
refusal. A gate failure means **stop and investigate** — do not promote, do not delete the
backup.

### What each gate proves

| Gate | Proves |
|---|---|
| `fileIntegrity` | the file is genuine (GCM tag), the manifest is intact, and the repo schema is not older than the backup |
| `schema` | the scratch DB has the exact base + migration schema (9 SQL files at time of writing) |
| `dataCopied` | all 36 tables' COPY sections were applied in ONE transaction (atomic: all or nothing) |
| `ledgerVerify` | the consent/audit **ledger hashes chain-verify with 0 breaks** on the restored data — the integrity-critical table is byte-faithful |
| `rowCounts` | nothing lost, nothing extra (per-table counts match the manifest) |
| `contentMatch` | **every table's content is the exact byte-identical row multiset** of the manifest (re-COPY each table from the scratch and compare, order-independent — PostgreSQL does not guarantee COPY row order, A88) — catches corrupted cell data, NUL bytes, and missing/extra rows that row counts would miss |
| `login` | a real account verifies (scrypt) against the restored hashes and its records (patient/encounters/consents) are present — the app is actually usable, not just populated |

## 4. Reading a failure

- `failure: "restore failed: …"` → the exception is in the report; the scratch DB was still
  dropped (unless `--keep`). Fix the cause and re-run with a fresh scratch name.
- `ledgerVerify.breaks > 0` → **treat as a security incident**: the restored ledger does not
  chain. Do not promote. Preserve the file and the report.
- `contentMatch.mismatches` non-empty → the backup or restore corrupted data silently (the
  2026-11-01 bug class). Do not promote; escalate with the report.
- `login.ok: false` but all data gates green → account-level issue (wrong verify pair, or the
  hash is genuinely different). Re-check the pair before drawing conclusions.

## 5. Re-running

The scratch name must be unique (the script refuses an existing name). Use the current
UTC date/time in `citycare_drill_YYYYMMDD_HHMMSS`. A leftover scratch from a crashed run can
be dropped by hand **only after confirming its name matches the pattern**:

```sql
DROP DATABASE IF EXISTS "citycare_drill_YYYYMMDD_HHMMSS" WITH (FORCE);
```

## 6. Promotion (only for a real incident, only after `status: "success"`)

The drill drops its scratch DB by default — for a real recovery, pass `--keep` so the
verified scratch survives promotion:

1. **Do not** drop or alter the live database. It is your fallback.
2. Point the application at the restored database (change `DATABASE_URL` in the environment,
   or — on Neon — make the scratch the serving branch). Keep the old endpoint reachable until
   step 4 is done.
3. Smoke-test the live app: health endpoint (`/api/health` — db reachable, ledger breaks 0),
   log in with the verification account, open one record end-to-end.
4. Only once the restored database is serving correctly, retire the old one (keep its data
   offline per legal retention: NMC 3 yr / DGHS 10 yr for clinical records; ledger ≥ 1 yr
   post-erasure — see `LEGAL_COMPLIANCE.md`; this is a legal-hold decision, not a technical
   one).
5. If any patient data may have been affected or lost, follow the incident/breach process
   (Board intimation within 72 h; patient communication per policy).

## 7. Post-incident hygiene

- Record the incident (admin incident log) with: which backup was used (objectName + sha256),
  the drill report JSON, the promotion time, and data loss window (backup `createdAt` →
  incident time).
- Re-run `backup.mjs create` immediately after promotion to establish a fresh recovery point.
- Re-run the drill (this runbook) as a monthly discipline — it is cheap (under a second on the
  demo dataset) and it is the only thing that *proves* RTO.

## 8. Production re-verification (owner-side)

Before relying on this in production: run §3 once against the **production** Neon database's
newest backup (into a scratch on the same host), with a production-appropriate verify pair,
and record the `restoreMs` at production data size in `RESTORE_DRILL_REPORT.md`. The ≤ 1 h RTO
target must be *demonstrated on the real database*, not inherited from the sandbox.
