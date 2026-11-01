# CityCare — Database & Architecture Audit (Step 1)

_Audited 2026-11-01 against the live schema (PostgreSQL 18.6, all 5 migrations applied) via
live catalog queries + full read of `schema/*.sql` and `web/src/lib/{db,repo,slots}.ts`.
Row counts below are from the local sandbox after one fresh e2e run (demo-scale)._

## 1. Verified inventory

- **35 tables** · **45 FKs** · **35 unique/PK constraints** · **96 indexes** (incl. PK)
- **1 custom trigger**: `audit_no_update` (function `reject_audit_tampering`) — refuses
  UPDATE/DELETE on `AuditLog` (negative-tested: A30, e2e)
- **2 ledger functions**: `ledger_append` (millisecond-truncated `now()`, canonical UTC ISO
  string stored AND hashed — timezone-proof, proven under `+14` session TZ: A7), `ledger_verify`
  (full recompute; live check today: **0 breaks**)
- **3 load-bearing partial unique indexes**: `one_live_appt_per_doctor_per_instant`
  (`+ seatNo`, active appointments only), `one_token_per_doctor_per_day`,
  `one_active_consent_per_pair` (`WHERE status IN (REQUESTED, APPROVED)` — expiry deliberately
  out of the predicate; the app lapses stale rows in-tx before insert: A14)
- **Migrations**: 5 idempotent files (0001–0005), applied by bootstrap; **since A76 (2026-11-01)
  automatically on every Vercel build** via `prebuild` (idempotent; fresh-DB detection; seed
  only when 0 users) — the schema⇄code drift class is closed (repro-tested 2026-11-01)

## 2. Design strengths (what the viva should lean on)

1. **Invariants in SQL, not JS**: double-booking, token uniqueness, consent-per-pair,
   ledger append-only — all enforced by the DB engine; app bugs cannot corrupt them.
2. **Naive-timestamp discipline**: the whole system pins "naive == UTC" at three layers
   (pool startup option, role/db `ALTER … SET timezone`, `process.env.TZ`) and the ledger
   removes the last re-derivation by storing the canonical string (A7). Health endpoint
   proves the live values (`timezone=UTC`, `statement_timeout=8s` — verified today).
3. **Serverless-DB-aware pool**: `error` listener, 20 s idle timeout, 10 s connect (Neon
   0.5–3 s wake), exactly one transparent retry on server-went-away codes only —
   `isTransientConnError` unit-pinned to never retry real SQL errors (A29).
4. **Transactions where it counts**: booking (slot re-check + seat pick + token in one tx),
   consent grant (lapse → upgrade/insert in one tx), emergency (expire-pending → insert →
   ledger → notify in one tx), erasure (one implementation, `src/lib/erasure.ts`).
5. **Keyset pagination** on the one unbounded list (ledger, `?before=&limit=` — D14).

## 3. Findings

| ID | Sev | Finding | Evidence | Fix path |
|---|---|---|---|---|
| NG-D01 | **Medium (P2)** | **Dead tables**: `JobQueue`, `Otp` (no references anywhere in `web/src`); `AiExtraction`, `AiSummary` (no writers — only erasure cleanup); `HospitalAdmin` (no account can hold the role). They are honest placeholders from the plan, but in an audit they read as scope debt and they dilute the schema story. | grep (0/0/1/1/0 files) | Two options: (a) keep + document "reserved for F11/OTP/org" in schema README (cheap, honest); (b) drop in a new idempotent migration when the owning feature ships. Either way, the schema README must state which tables have no writer yet | schema README table-status column; no behaviour change |
| NG-D02 | **Low (P3)** | **Dual schema source**: `prisma/schema.prisma` (25 models) duplicates the SQL DDL. It is pinned to Prisma 6.19.3 **only** for `prisma validate` / `migrate diff` in `schema/run_tests.sh` — runtime never imports it (D1). Drift between the two is possible and untested. | `schema/package.json`; `run_tests.sh`; D1 | Run `prisma migrate diff` in CI (already in `run_tests.sh` locally) to detect drift; or delete the prisma file and keep SQL as the only truth (D1 already says SQL is truth) | CI drift check green |
| NG-D03 | **Medium (P1 for pilot/commercial)** | **No multi-clinic / organization model.** One `Hospital` row per doctor (display only); no org membership, no staff roles, no org-scoped audit, no patient↔clinic relationship. `HOSPITAL_ADMIN` is typed but unreachable. The brief's future users (clinics, labs) need this. | `citycare_init.sql` (Hospital, HospitalAdmin); grep for HOSPITAL_ADMIN (guards only, no creation path) | **Proposed additions (separate schema — not implemented, not part of this audit's changes):** `Organization` (clinic/lab), `DoctorMembership` (doctor ↔ org, with role: OWNER/STAFF, effective window), `PatientLink` (optional patient↔org "usual facility"), org-scoped notifications/grievances, org-level audit view over the existing ledger (the ledger is already actor+consent keyed, so this is mostly read modelling + FKs). **Patient record ownership stays with the patient** (portability principle) — the org model must be join tables, never ownership | design doc + migration draft + e2e for org isolation |
| NG-D04 | **Medium (P2)** | **Connection ceiling**: pool(max 10) per serverless instance × Neon Free ~100 direct connections → a burst of concurrent Vercel instances can exhaust direct connections. (D18/D32; the pooled endpoint is untested — startup params vs transaction pooler.) | `db.ts makePool`; D18/D32 | Validate the `-pooler` URL end-to-end (drop the two startup params, rely on role/db-level pins which already exist) or move to Neon pay-as-you-go with autosuspend off (removes wake + raises ceiling) | load test at ~50 concurrent users (see NG-P04) |
| NG-D05 | **Medium (P1 for pilot)** | **Storage ceiling**: files are `DocumentBlob` bytea in Neon Free (0.5 GB total DB). 30 MB/patient quota ⇒ **~15 patients at full quota fill the DB** (D53). The quota caps the rate, not the total. | `storage.ts`; D53; Neon Free tier facts | Object storage (R2/S3/Supabase Storage) with the same AES-GCM envelope (`keyVersion` column already exists); move a backfill script | new patient upload works with 50+ patients; DB size flat |
| NG-D06 | **Low (P3)** | **Unbounded ledger growth, no archival plan.** `AuditLog` is append-only forever (by design — DPDP r.6 wants ≥1 yr; NMC/GDHS retention argues for longer). Fine for years at demo scale; at clinic scale it needs a plan. | `ledger.sql`; erasure keeps ledger | Documented archival policy: verify → export to cold object storage → truncate with a retained chain-head proof (the anchor makes cold copies verifiable). Not urgent | archival runbook + test |
| NG-D07 | **Medium (P2, clinical)** | **No clinician-authored observation path.** F5 wrote `Observation` for patient self-report; the doctor workspace is read-only, and encounter-level vitals still live in `Encounter` prose/`LabResult`. A complete longitudinal record needs clinician-entered vitals/obs linked to encounters. | `recordSections` (repo.ts); D60 note; F5 e2e | Doctor encounter form: structured vitals block → `Observation` with `encounterId` set (column exists) + provenance flag (PATIENT vs CLINICIAN); scope/ledger already handle it | e2e: doctor-entered obs appear in trends with provenance |
| NG-D08 | **Low (P3)** | **No load/concurrency testing.** e2e is functional single-user (plus targeted races: token_race, slot_full). The concurrency-correct claims (booking tx, ledger 4-way race) rest on the unit/SQL negative tests, not a load harness. | e2e.mjs; gap_test.sql (4-way race in SQL tests) | k6/autocannon scenario in CI or locally: 50 concurrent bookings on one doctor-day + parallel ledger appends; assert 0 5xx, index violations surface as 409s | green run + published numbers |

## 4. Data consistency & retention

- **Cascades**: erasure is a single tested implementation (`src/lib/erasure.ts`) — deletes
  patient-side data, redacts doctor prose, drops blobs, keeps the ledger (D15). Purge e2e
  proves it; retention sweep (daily cron) shares the same function (L1).
- **Retention policy**: no single statutory "7 years" exists (NMC Reg 1.3.1 indoor 3 yr;
  DGHS manual case sheets up to 10 yr; OPD 5 yr) — the app never claims one (A51 fixed the
  false copy); demo accounts sweep after 7 days (self-registered only; `@demo.in` reserved — A55).
- **Consistency risks found**: none active. The two latent ones are NG-S05 (consent read
  semantics) and NG-D02 (dual schema source) — both have cheap guards.

## 5. Growth assessment (modular monolith verdict)

The monolith is correct for the next 2–3 orders of magnitude of this product. Concrete
sequence, no premature overengineering:

1. **Pilot scale (≤ a few clinics, ≤ 10k patients, ≤ 100 MB blobs)**: current stack works;
   fix NG-S09/S10 (backup/monitoring), NG-D05 (object storage), NG-D03 (org model), NG-D04
   (pooler or paid Neon).
2. **Scale (hundreds of clinics)**: read replica for records GETs, edge WAF for rate
   limiting (DB limiter retired), ledger archival (NG-D06), PgBouncer if direct connections
   grow. Still one codebase — no service extraction.
3. **Never (at this scale)**: microservices, Kubernetes, GraphQL, a second DB. Each adds a
   failure mode the product does not need; the SQL-enforced invariants would be diluted.

**Portability principle (from the brief)**: the patient's record must never be owned by a
clinic. The current schema already satisfies this (record hangs off `Patient`, consents are
pair-level and revocable, erasure is patient-driven). The NG-D03 org model must preserve it:
orgs get *membership* and *views*, never ownership or deletion rights over patient data.
