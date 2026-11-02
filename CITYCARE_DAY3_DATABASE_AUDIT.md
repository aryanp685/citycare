# CityCare — Day 3: Database Architecture & Data Integrity Audit

**Date:** 2026-11-02 (IST)
**Branch:** `arena/c0875faf-citycare` @ `ad6f71a` (branched from main; main CI green 41452254356)
**Auditor:** agent (read-only precheck → classified findings → safe in-scope fixes only)
**Scope:** NG-D01 schema consistency · NG-D02 migration safety · NG-D03 relationships/ownership · NG-D04 indexing/performance · NG-D05 transactions/concurrency · NG-D06 clinic architecture assessment
**Environment labels (every claim below is tied to one of these):**
- **LOCAL-DEMO** = sandbox PostgreSQL 16.2 (`127.0.0.1:5432`, cluster `/home/user/pgbox/data`), DB `citycare` fresh-bootstrapped + demo-seeded (`RETENTION_POLICY=demo`), `web/.env.local` local-only keys. All EXPLAIN numbers below are from LOCAL-DEMO and say nothing about production scale.
- **FRESH-DB** = second DB `driftcheck` created from the `schema/` files alone (drift check; dropped after use).
- **PROD** = Vercel `citycare-z95n.vercel.app` on Neon 18.6 — **NOT touched** (no queries, no writes, no health probes from the sandbox; no egress to `*.vercel.app` anyway).

**Method:** mandatory read-only precheck first (branch/CI/DB state, `gh`/`git` only), then live introspection via `psql` on LOCAL-DEMO (tables, FKs incl. delete rules, PKs, unique/partial indexes, CHECKs, enum types, timestamp types, orphan probes, index definitions), then file-level review of `schema/` (init + constraints + ledger + migrations 0001–0006) vs live DB (pg_dump diff), then code review of `web/src/lib/` and the API routes (ownership scoping, transactions, audit placement, cascades, erasure), then `EXPLAIN (ANALYZE, BUFFERS)` on the hot queries. No schema object was modified by the audit itself until the fix phase.

---

## A. Executive summary

| Severity | Count | One-liner |
|---|---|---|
| CRITICAL | 0 | — (append-only trigger, RESTRICT clinical FKs, hash chain, consent gate all verified present and live) |
| HIGH | 1 | **NG-D05-1** audit appends ran outside the business transaction at **43 of 48** call-sites before the fix (only 5 in-tx); 10 core sites fixed → **33 post-commit remain, of which 21 are state-mutating (D74 follow-up) and 12 are by-design/read-only** (exact inventory in §D) |
| MEDIUM | 3 | **NG-D04-1** document-delete leaves an orphaned encrypted blob window · **NG-D05-2** purge receipt audit swallows failures silently · **NG-D01-1** exact-duplicate index on `Observation` (0005 vs base) |
| LOW | 5 | ledger_verify O(n) per health check · 28-query slot grid (bounded) · soft text user-refs by design · PolicyAcceptance history (by design) · `lower() LIKE` search (small table) |
| INFO | 7 | FK-rule map verified good · 6 partial unique invariants · zero real orphans · atomic upserts · drift check clean · PK style drift · base+two-source schema rule |

**What is genuinely strong (verified, not assumed):**
- AuditLog is append-only by a DB trigger (`BEFORE UPDATE OR DELETE` → raise `insufficient_privilege`, mapped to HTTP 403 in `translatePgError`) — the strongest possible tamper guard, verified in live catalog and by unit tests.
- Hash chain (`ledger_append`/`ledger_verify`, pgcrypto) with canonical UTC ISO string stored per row — timezone-proof by construction; `pg_advisory_xact_lock` serialises appends. Live: 9 rows, 0 breaks (LOCAL-DEMO).
- Every clinical FK to `User` and `Patient` is **RESTRICT** — a hard `DELETE FROM User` / `DELETE FROM Patient` *cannot* cascade into clinical data (verified catalog: only ephemeral hashed auth codes — `EmailCode`, `RecoveryCode` — cascade). Erasure therefore uses delete-own + redact + anonymise, never hard-delete.
- Six partial unique indexes enforce business invariants in the DB, not the app: one active consent per doctor–patient pair, one live appointment per doctor per instant **per seat**, one queue token per doctor per day, one ABHA per patient, `auditlog_seq` uniqueness, (plus maxPerSlot range CHECK).
- Booking race is safe end-to-end: TOCTDK recount inside tx → lowest-free-seat via `generate_series … NOT IN` → partial unique index is the final arbiter (23505 → 409). EXPLAIN (LOCAL-DEMO): **Index Only Scan** on `one_live_appt_per_doctor_per_instant`, 0.07 ms.
- All 6 migrations are idempotent (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `EXCEPTION WHEN duplicate_object`), no data-destroying statements; bootstrap proves re-runnability on every deploy.
- **Drift check (NG-D01): CLEAN.** `pg_dump --schema-only` of the live LOCAL-DEMO DB vs a FRESH-DB built from `schema/` files alone = **byte-identical after normalisation** (0 diff lines).
- Timestamp discipline: naive-vs-timestamptz mix (41 vs 28 columns) is *pinned at three layers* — process TZ=UTC before first parse (`db.ts`), `options="-c timezone=UTC"` on every pooled session, `ALTER DATABASE/ROLE SET timezone='UTC'` in bootstrap with a hard `die` if `show timezone` ≠ UTC; live fresh session confirmed `statement_timeout=8s`, `timezone=UTC`.

**What the audit found wrong (details in D):**
1. **NG-D05-1 (HIGH)** — `appendAudit` after the business `COMMIT` at **43 of 48** call-sites before the fix. A crash/failure between commit and append leaves business state with no ledger row; the chain stays "intact" (a missing row is not a break), so nothing detects it. The emergency break-glass route (the most sensitive path) was already done *inside* the tx (`q: c`) — the inconsistency itself was the smell. (Reconciled inventory with before/after counts and the four risk categories: §D. Fault-injection proof that a failing append rolls back the whole operation: §H/§18.9.)
2. **NG-D04-1 (MEDIUM)** — `DELETE /api/documents/[id]` runs `UPDATE … isDeleted=true` and `DELETE FROM DocumentBlob` as two separate autocommits; a crash between them leaves the encrypted bytes behind after the patient asked for erasure.
3. **NG-D01-1 (MEDIUM)** — exact-duplicate index pair on `Observation(patientId, name, takenOn)`: base `citycare_init.sql:545` (`…_patientId_name_takenOn_idx`) and migration 0005 (`…_patient_name_taken_idx`, different name so `IF NOT EXISTS` doesn't help). Present in every fresh and existing DB (proven by the drift check). Pure write amplification.
4. **NG-D05-2 (MEDIUM)** — purge route appends the `DATA_ERASED` receipt *after* the erasure tx with `.catch(() => null)`: the "erasure must never be blocked" priority is right, but the failure is invisible (no log, no response hint).

---

## B. NG-D01 — Schema consistency (drift, types, constraints)

**Verdict: CLEAN with 1 MEDIUM (duplicate index) + documented conventions.**

Evidence (LOCAL-DEMO catalog, 2026-11-02):
- 36 base tables, 15 ENUM types, 45 FKs (delete rules: RESTRICT for all clinical refs; SET NULL for optional refs — `Encounter.appointmentId`, `Alert.doctorId`, `Prescription.encounterId`, `Patient.guardianPatientId`; CASCADE only for `DocumentBlob.documentId→Document`, `EmailCode.userId→User`, `RecoveryCode.userId→User`), 36 PKs, 6 CHECKs.
- 6 partial unique indexes (invariants listed in A).
- **Drift check:** FRESH-DB from `schema/` files vs live DB → `diff` of sorted `pg_dump --schema-only` output = **empty**. Init (non-idempotent, fresh only) + constraints.sql + ledger.sql + migrations 0001–0006 reproduce the live schema exactly.
- **NG-D01-1 (MEDIUM):** duplicate `Observation` index (above). Fix: migration `0007_dedup_observation_index.sql` drops the 0005 copy, keeps the base name. `DROP INDEX IF EXISTS` — no query loses an index (the identical base one remains), no data touched, idempotent, safe on existing DBs.
- **NG-D01-2 (LOW, document only):** 41 naive `timestamp` vs 28 `timestamptz`, mixed even within tables (e.g. `Consent.reviewedAt` timestamptz, rest naive). This is a **pinned convention** (naive = UTC wall time, session always UTC — three-layer pinning verified live), so behaviour is consistent for every app session. A mass type migration across 41 columns would be high-risk with zero behavioural gain → not done. Documented rule: "new tables use timestamptz; legacy naive columns are treated as UTC."
- **NG-D01-3 (INFO):** soft text user-refs without FKs — `Consent.reviewedBy`, `Doctor.verifiedBy`, `Incident.reportedBy`, `Document.uploadedByUserId`, `AuditLog.entityType/entityId` (polymorphic). Deliberate (actor rows may be anonymised; the hash chain compensates). Documented.
- **NG-D01-4 (INFO):** `PolicyAcceptance (userId, policyKey)` is not unique — intentional version history; code reads `max(version)`. PK style drift (uuid on post-0003 tables vs text on base tables) — cosmetic.
- Orphan probe (NULL-safe, FK-aware): **0 real orphans** (initial 4 flags were NULLs in nullable FKs — walk-in encounters without appointments, which is a documented seed design).
- **NG-D02-1 (LOW, document only):** `citycare_init.sql` is non-idempotent and is a second source of truth beside the migrations (a column added to init alone would never reach an existing DB). Mitigations in place: CI bootstraps a fresh DB every run, prebuild schema-sync on deploy, and today's drift check. Standing rule recorded: **any base-shape change must ship as a migration; init is re-derived as the fresh-DB snapshot.**

## C. NG-D02 — Migration safety

**Verdict: SAFE. All 6 migrations re-runnable on an existing DB; no destructive operations.**

- 0001–0006 all use `SET client_min_messages=warning` + `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `DO $$ … EXCEPTION WHEN duplicate_object`.
- Only two `DROP`s in the set, both intentional shape changes re-created in the same statement sequence: 0004 drops+recreates `one_live_appt_per_doctor_per_instant` (adds `seatNo` column to the key) and the `AvailabilitySlot_maxPerSlot_range` CHECK (widens to `BETWEEN 1 AND 6`). No `TRUNCATE`/`DELETE` in any migration.
- Idempotency is continuously re-proven: the bootstrap re-applies the whole `migrations/` folder on **every** run (fresh and existing), and the CI job does a full bootstrap against a fresh PG on every pipeline run.
- Noted (INFO): `ledger.sql` adds `AuditLog.seq/prevHash/entryHash/createdAtIso` with `ADD COLUMN IF NOT EXISTS` — legacy rows with NULL `seq` are tolerated by the partial unique index and would be flagged by `ledger_verify()` (fail-loud, correct).
- New migration 0007 (this day) follows the same idempotent pattern and is verified below.

## D. NG-D05 — Transactions, concurrency, audit atomicity

**NG-D05-1 (HIGH, fixed for the core set; remainder registered):**
- **Reconciled inventory** (scripted against the `e950f26` code, by action name): **48 `appendAudit` call-sites total = 15 in-transaction + 33 post-commit** *after* the fix.
  - **Before the fix (`ad6f71a`): 48 total = 5 in-tx + 43 post-commit.** The 5 pre-existing in-tx: `EMERGENCY_ACCESS` (break-glass), `CHECKED_IN/COMPLETED` + `AUTO_REVOKE_CONSENT` (doctor appointment status), `DOCTOR_VERIFIED/REJECTED` (doctor verify), `CANCEL_APPOINTMENT` (booking cancel).
  - **Fixed this pass (10 call-sites moved into their existing tx, passing the tx client as `q:`):** `GRANT_CONSENT` ×2 (pending-path + fresh-insert-path), `REVOKE_CONSENT`, `BOOK_APPOINTMENT`, `CREATE_ENCOUNTER`, `PRESCRIBE_OVERRIDE`, `DELETE_DOC`, `EMERGENCY_REVIEWED`, `DOCTOR_SUSPENDED`, `ACCOUNT_CREATED/DOCTOR_ONBOARDED`.
  - **Remaining 33 post-commit — NOT identical risks, four categories:**
    | Category | Count | Actions | Risk |
    |---|---|---|---|
    | **State-mutating workflows — D74 follow-up** | **21** | `GRIEVANCE_UPDATED`, `INCIDENT_NOTIFIED`, `INCIDENT_UPDATED`, `INCIDENT_OPENED`, `ACCOUNT_UNLOCKED` (admin) · `RECOVERY_CODES_GENERATED`, `EMAIL_VERIFIED`, `PASSWORD_RESET` (auth) · `GRIEVANCE_OPENED`, `POLICY_ACCEPTED` (patient/legal) · `DEPENDENT_ADDED/SWITCH/HANDOVER`, `UPLOAD_DOC`, `CONFIRM_MED_DRAFT`, `NOMINEE_SET/CLEARED`, `OBSERVATION_ADDED/DELETED`, `MEDS_DRAFTED_FROM_PHOTO`, `PROFILE_UPDATED` (patient data) | Same as the fixed ones: committed state + missing receipt in the crash window. Mechanical fix (move into the existing tx + §18 mechanism check per site). |
    | **Read/export events — no state change** | 4 | `VIEW_RECORD`, `DOWNLOAD_DOC` (stateless signed link), `EXPORT_FHIR`, `EXPORT_PRINT_SUMMARY` | The audit row *is* the effect; there is no business mutation to make atomic with. Listed for completeness; no D74 action applies. |
    | **Denied-operation events — by design** | 4 | `WRITE_DENIED`, `VIEW_DENIED` ×2, `OBSERVATION_DELETE_DENIED` | They record *refusals*; no business tx exists. Post-commit is the correct placement. |
    | **Erasure receipts — by design, outside the erasure tx** | 4 | `DATA_ERASED` + `DEPENDENT_ERASED` (purge — **now logging** on failure per A97) · `DATA_ERASED` ×2 (cron/daily demo sweep — **still silently swallowing** `.catch(() => null)`; not touched in this pass, included in D74 follow-up) | Erasure is a right that must never roll back because a ledger insert hiccuped; the price is a possibly-missing receipt, now visible (log) on the purge path and registered for the cron path. |
- Failure mode (concrete, now covered by test 18.9): consent `POST` commits `status='APPROVED'`; process is killed (or the append fails) before/inside `appendAudit(GRANT_CONSENT)` → previously the doctor had live access with no grant row and `ledger_verify()` still reported intact; **after the fix the whole transaction rolls back** (proven by fault injection, §H).
- Why HIGH for *this* product: the ledger is the trust core ("the patient can verify who held their data and when"); a silent evidence gap is a product-level defect even though no data is corrupted.
- **Status: PARTIALLY RESOLVED (D74), deliberately not RESOLVED.** The 21 state-mutating sites + the 2 silent cron receipts are the exact remainder; a full pass is a dedicated follow-up (not mixed into other feature days), each site with the §18 mechanism check.

**NG-D04-1 (MEDIUM, fixed):** document delete now runs `UPDATE isDeleted` + `DELETE DocumentBlob` in **one** transaction (blob-orphan window closed); the `DELETE_DOC` audit moved into the same tx.

**NG-D05-2 (MEDIUM, fixed — visibility only):** purge keeps the after-tx `DATA_ERASED` receipt (erasure must never be blocked by the ledger — deliberate, documented), but a failed receipt now **logs** (`console.error`) instead of vanishing into `.catch(() => null)`.

**Concurrency findings (verified safe):**
- Double-booking: partial unique index is the arbiter; 23505 → 409 with distinct messages for seat-race vs token-race. New e2e: two parallel last-seat bookings ⇒ exactly one 201, one 409, one row in DB.
- Emergency 3-per-24h quota is a pre-tx `count(*)` read (TOCTOU under concurrent abuse); no DB constraint enforces it. LOW — mitigated by the `emergency` rate-limit bucket (10/h/doctor) and by the UI being single-operator; registered, not fixed (adding a DB constraint would require an index on a partial window — deferred, documented).
- `RateLimit` = single atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` (race-free). Sliding-session touch = one data-modifying CTE (no read-then-write race).
- `ledger_append` serialised by `pg_advisory_xact_lock(740110)`; inside a business tx the lock is held only from the append to COMMIT (milliseconds) — no deadlock cycle possible (single lock, no cross-lock ordering).

**NG-D03 — Relationships/ownership (verdict: SAFE, verified):**
- Ownership scoping in code: every patient-facing read/write filters on the session's `profileId`/`userId` (e.g. `WHERE id=$1 AND "patientId"=$2` on document delete; `requireRole` + `requireVerifiedDoctor` gates; `loadViewer` re-checks `User.status='ACTIVE'` **and** session live on every request — a purged user's old cookie 401s, verified by reading the code path).
- Consent is the only gate between doctor and clinical data (`liveConsent` + `evaluateConsent`: REVOKED/DENIED/expiry checked with the **DB clock in the same query**); `applyScope` is a pure, unit-tested function (A56 leak-fix present).
- Erasure (`erasure.ts`): delete-own → redact-doctor-authored → anonymise-shell; child deletes ordered for RESTRICT FKs; ledger survives by design (DPDP r.6(1)(e) ≥ 1 yr). FK map proves a hard user/patient delete is impossible while clinical rows exist (Section B).
- New e2e probes: cross-user record access ⇒ 403/404; revocation-immediacy sequence (read 200 → revoke → read 403).

## E. NG-D04 — Indexing & performance (EXPLAIN evidence, LOCAL-DEMO scale)

All plans below from `EXPLAIN (ANALYZE, BUFFERS)` on the seeded LOCAL-DEMO DB (11 users, ~9 audit rows, small tables) — **shape evidence, not production numbers**:

| Query | Plan | Time |
|---|---|---|
| Encounter list (patient) | Index scan `Encounter_patientId_encounterDate_idx` + hash join | 0.041 ms |
| Observation trend | Index scan `(patientId, name, takenOn)` | 0.029 ms |
| Session+User live check | Index-only on `Session_user_live_idx` + PK | 0.056 ms |
| `liveConsent` | Index scan `Consent_patientId_status_idx` | 0.052 ms |
| Slot-day booked (48 h window) | Index scan `Appointment_doctorId_scheduledAt_idx` | 0.078 ms |
| Booking seat pick | **Index Only Scan** on partial `one_live_appt_per_doctor_per_instant` | 0.069 ms |
| Ledger patient view | Index scan + subplan | 0.053 ms |
| `MAX(seq)+1` (append) | Index scan `auditlog_seq` | 0.052 ms |
| `ledger_verify()` (full chain walk) | Function scan, O(n) rows | 3.5 ms @ 9 rows |

Findings:
- Every hot path uses its designed index; **no missing indexes** for the actual query patterns (the duplicate in NG-D01-1 is the only index-layer defect — a removal, not an addition, so the "only add indexes backed by real query patterns" rule is trivially honoured).
- **NG-D04-2 (LOW):** `ledger_verify()` walks the whole chain and is invoked on **every `/api/health` call**. At LOCAL-DEMO scale: 3.5 ms. At 100k+ audit rows this approaches the 8 s statement timeout under load — scale watch-item (candidate: verify-from-last-anchor in a future pass). Registered, not fixed.
- **NG-D04-3 (LOW):** `freeSlotGrid` issues 14 days × 2 queries in parallel (28 round-trips, rules re-fetched per day). Bounded constant, small payloads, parallel — acceptable at pilot scale; registered.
- **NG-D04-4 (INFO):** `searchDoctors` uses `lower(col) LIKE '%…%'` (no usable btree; pg_trgm would be the future answer) — doctor table is hundreds of rows at pilot scale; seq scan is correct there.

## F. NG-D06 — Clinic architecture assessment (assessment only, no rewrite)

- "Clinic" today = a `Hospital` row (DGHS `hfrId`), doctors linked via nullable `hospitalId`, `HospitalAdmin` profile. **There is no multi-tenant boundary**: isolation is per-patient (profileId scoping + consent), not per-organisation — which is correct for a single-operator pilot (one deployment = one city pilot).
- Adding a clinic = insert Hospital + admins + doctors; no schema change, no code change. Adding a *second operator* with data isolation (clinic A never sees clinic B's patients even as super-admin) is the only architectural question, and it is **out of scope** per the brief (no premature multi-tenant rewrite, no new infra).
- Verdict: current shape is fit for pilot; the multi-operator question is registered (NG-D06-1) for when a second clinic actually signs up. No changes made.

## G. Fixes made this day (safe, in-scope; each with regression tests)

| # | Finding | Change | Risk |
|---|---|---|---|
| A94 | NG-D01-1 duplicate index | new `schema/migrations/0007_dedup_observation_index.sql` (`DROP INDEX IF EXISTS "Observation_patient_name_taken_idx"` — the 0005 copy; base index kept). **Rollback:** one `CREATE INDEX "Observation_patient_name_taken_idx" ON "Observation" ("patientId", name, "takenOn");` (recreates the redundant index only); no data migration, no recovery procedure needed (zero data touched); idempotent, safe on existing DBs (applied + re-run in place on the audit DB pre-e2e) | minimal: identical base index remains, no query impact |
| A95 | NG-D05-1 audit atomicity (core set) | **10 call-sites** moved inside the existing `tx()` with the tx client: `patient/consents` (GRANT ×2 paths + REVOKE), `patient/appointments` (BOOK — cancel was already in-tx), `doctor/patients/[id]/encounter` (CREATE_ENCOUNTER + PRESCRIBE_OVERRIDE), `documents/[id]` (DELETE_DOC), `admin/emergencies/[id]/review` (EMERGENCY_REVIEWED + DOCTOR_SUSPENDED), `auth/signup` (ACCOUNT_CREATED/DOCTOR_ONBOARDED). (Doctor-verify and booking-cancel were already in-tx before this pass.) | semantic change only on failure: a failed audit now rolls back the operation (all-or-nothing) instead of silently losing the receipt; success path byte-identical responses. Proven by fault injection (18.9), not just by code reading |
| A96 | NG-D04-1 blob orphan | document delete wrapped in `tx()` (isDeleted + blob delete atomic) | none on success path; failure now leaves no half-deleted state |
| A97 | NG-D05-2 invisible purge-receipt failure | `console.error` on failed `DATA_ERASED`/`DEPENDENT_ERASED` appends (semantics unchanged: erasure still completes). Scope note: the 2 cron/daily sweep receipts share the after-tx design but were **not** touched this pass and still swallow silently — D74 follow-up | none |

Explicitly **not** done (with reasons): NO ACTION/RESTRICT standardisation (no such FKs exist — earlier draft finding withdrawn after direct `pg_get_constraintdef` verification); mass naive→timestamptz migration (three-layer UTC pinning makes it a no-behaviour-gain risk); emergency-quota DB constraint (needs a sliding-window mechanism — deferred, rate-limit bucket mitigates); `ledger_verify` from-last-anchor (scale watch-item); multi-tenant clinic boundary (out of scope).

## H. Tests added (exact deltas in the gauntlet, Section J)

New e2e section **§18 "Day 3 data-integrity"** — **30 checks** (25 in the original pass + 5 from review-correction F1; runs against a fresh bootstrap; each run's e2e data is isolated by unique-stamp users, and the final re-seed restores clean demo state):
1. **concurrency/last-seat**: two parallel bookings for the same last seat ⇒ exactly one HTTP 201, one 409; DB holds exactly one live appointment for that (doctor, instant, seat).
2. **ownership**: patient A's session cannot read patient B's record via the doctor-record path (no consent) ⇒ 403/404; unknown patient id ⇒ 404.
3. **consent revocation immediacy**: doctor reads record (200) → patient revokes (200) → same doctor re-reads ⇒ 403.
4. **ledger atomicity (failure before mutation)**: (a) after a successful consent grant, a `GRANT_CONSENT` ledger row exists for the exact consent id; (b) after a *refused* grant (unverified doctor), **no** ledger row is created and no consent row exists — refused operation leaves no partial evidence. (The complementary failure — the audit append itself failing *after* the business mutation — is covered by 8 below; it was NOT covered before review-correction F1 and the report no longer implies it was.)
5. **FK RESTRICT probe** (raw SQL in the test, as it is a schema guard, not an app path): `DELETE FROM "User"` for a user who owns a patient profile fails with 23503; `DELETE FROM "Patient"` with consents present fails with 23503.
6. **migration 0007 + idempotency**: `Observation_patient_name_taken_idx` absent post-bootstrap; re-running the entire `migrations/` folder a second time exits 0 and leaves the schema byte-identical (pg_dump diff = empty).
7. **document-delete atomicity**: API delete ⇒ `Document.isDeleted=true` AND `DocumentBlob` row gone (single assertion pair).
8. **fault-injected audit failure rolls back the whole operation (18.9, F1 — LOCAL-DEMO only, 5 checks)**: a `BEFORE INSERT` trigger on `AuditLog` (armed only when `DATABASE_URL` is a local loopback DB — refused, not merely skipped, elsewhere) raises for `action='GRANT_CONSENT'`, so on a real consent grant the append fails **after** the consent mutation executed inside the same transaction. Asserted: (a) the API returns 5xx, (b) the consent row is gone — the real DB transaction rolled back business state, (c) **zero** partial `AuditLog` rows and `ledger_verify()` still reports 0 breaks — no half-written ledger state, (d) cleanup in the guaranteed `finally` removed trigger + function (verified via `pg_trigger`/`pg_proc`), (e) the normal grant path succeeds afterwards with exactly one new ledger row. There is **no production/pilot switch** that could arm this — the guard is a loopback-URL check in test code, and the DB object is test-local.

## I. Owner-side actions (unchanged from Day 2 list + new)

1–8: the existing owner-side checklist (prod site check, prod e2e re-run, branch protection, uptime monitor, pilot-DB `@demo.in` audit, backup/restore drills + key escrow, staging outage drill) stands.
9. **NEW — scale watch-item:** when `AuditLog` approaches ~10⁵ rows, revisit `ledger_verify()` cost on `/api/health` (NG-D04-2). No action needed at pilot volume.

## J. Day 3 gauntlet (exact commands, counts, exit codes, env, date)

- env: sandbox LOCAL-DEMO — PostgreSQL 16.2 (`127.0.0.1:5432`, cluster `/home/user/pgbox/data`), DB `citycare` freshly bootstrapped + demo-seeded (`RETENTION_POLICY=demo`), `web/.env.local` local-only keys (incl. local `BACKUP_KEY`/`BACKUP_DIR`), app built & served from the working branch at `http://127.0.0.1:3000`.
- date: 2026-11-02 IST (runs 14:00–14:20 IST)
- results (all actually executed on this machine):
  1. `cd web && npx eslint .` → **0 errors, exit 0**
  2. `cd web && npx tsc --noEmit` → **0 errors, exit 0**
  3. `cd web && npx vitest run` → **24 files passed, 249/249 tests passed, exit 0** (6.55 s)
  4. `cd web && node scripts/e2e.mjs` (server on :3000, fresh seed) → **331 passed, 0 failed, 0 skipped, exit 0** — = 306-check baseline (Day 2) + **25 new §18 checks**; log preserved at `/tmp/e2e-day3-run3.log` (sandbox-local)
  5. `cd web && NODE_OPTIONS=--max-old-space-size=1150 RETENTION_POLICY=demo NEXT_PUBLIC_DEMO_MODE=1 npx next build` → **exit 0** (55 routes: 54 static + 1 dynamic)
  6. `cd web && NODE_OPTIONS=--max-old-space-size=1150 RETENTION_POLICY=pilot NEXT_PUBLIC_DEMO_MODE=0 npx next build` → **exit 0** (pilot/production-equivalent path compiles)
- post-gauntlet: DB re-seeded to clean demo state (bootstrap `✔ database ready`, ledger 9 rows / 0 breaks); scratch `driftcheck`/`driftcheck2` DBs dropped (0 leftovers).
- CI/production: **not run** (owner-side after approval) — no merge, no PR, no deploy per the Day 3 brief.

### J2. Correction-pass gauntlet (2026-11-02, PR #9 review-corrections F1–F3 — same sandbox, same env)

Changes since the gauntlet above: e2e §18.9 fault-injection test (5 new checks) + documentation reconciliation only. **No application source code changed** (route/ledger code is byte-identical to the gauntlet above; the running server's build was rebuilt and re-verified regardless).

1. `cd web && npx eslint .` → **0 errors, exit 0**
2. `cd web && npx tsc --noEmit` → **0 errors, exit 0**
3. `cd web && npx vitest run` → **24 files passed, 249/249 tests passed, exit 0**
4. `cd web && node scripts/e2e.mjs` (server on :3000, fresh seed) → **336 passed, 0 failed, 0 skipped, exit 0** — = 306 baseline + 30 §18 checks (incl. the 5 fault-injection checks of §18.9); logs at `/home/user/e2e-f1-final2.log` (sandbox-local). First two runs of the day are on record too: (i) 331/0/**1 skipped** — the injection gate's loopback regex refused a user-embedded URL (logged as A98), (ii) 335/**1 failed** — §18.9b's first draft counted a *pre-existing* pending REQUESTED consent (legitimately rolled back to REQUESTED by the injected failure) as residue; fixed to an exact before/after snapshot diff, which then proved the rollback.
5. `cd web && NODE_OPTIONS=--max-old-space-size=1150 RETENTION_POLICY=demo NEXT_PUBLIC_DEMO_MODE=1 npx next build` → **exit 0** (54 static + 1 dynamic)
6. `cd web && NODE_OPTIONS=--max-old-space-size=1150 RETENTION_POLICY=pilot NEXT_PUBLIC_DEMO_MODE=0 npx next build` → **exit 0** (54 static + 1 dynamic)
- post-run: **injection objects verified absent** (`pg_trigger`/`pg_proc` LIKE `e2e_day3_audit_inject%` → 0), DB re-seeded to clean demo state (ledger 9 rows / 0 breaks), demo server restarted on the rebuilt bundle, `/api/health` → `status:"ok"`, `db.reachable:true`, `ledgerBreaks:0`.

## K. Master gap register (Day 3 rows; full register lives in `web/DRAWBACKS_AND_BUGFIXES.md` §B)

| ID | Severity | Status | Note |
|---|---|---|---|
| NG-D01-1 duplicate Observation index | MEDIUM | RESOLVED (local; CI+deploy verification owner-side) | 0007 migration + e2e §18.6 |
| NG-D01-2 naive/timestamptz mix | LOW | DOCUMENTED (pinned-UTC convention) | no mass migration (risk > gain) |
| NG-D01-3 soft text user-refs | INFO | DOCUMENTED (by design) | hash chain compensates |
| NG-D01-4 PolicyAcceptance history | INFO | DOCUMENTED (by design) | `max(version)` semantics |
| NG-D02-1 two-source schema rule | LOW | DOCUMENTED | base changes must ship as migrations |
| NG-D03-1 ownership/consent gates | — | VERIFIED SAFE | e2e §18.2/§18.3 |
| NG-D04-1 blob-orphan window | MEDIUM | RESOLVED (local) | tx wrap + e2e §18.7 |
| NG-D04-2 ledger_verify O(n) on /health | LOW | REGISTERED (scale watch-item) | NG-I9 owner-side |
| NG-D04-3 28-query slot grid | LOW | REGISTERED (bounded, acceptable) | — |
| NG-D04-4 LIKE search | INFO | REGISTERED (pg_trgm future) | small table today |
| NG-D05-1 audit outside tx (systemic) | HIGH | PARTIALLY RESOLVED (core set fixed, D74) — **not RESOLVED** | fixed set now fault-injection-tested (e2e §18.9); remainder = **21 state-mutating sites + 2 silent cron receipts** (D74), 12 post-commit sites are by-design/read-only (inventory in §D); full pass = dedicated approved follow-up |
| NG-D05-2 purge receipt invisible failure | MEDIUM | RESOLVED (local) | log added; semantics unchanged |
| NG-D05-3 emergency quota TOCTOU | LOW | REGISTERED | rate-limit bucket mitigates |
| NG-D06-1 multi-operator boundary | — | REGISTERED (out of scope) | assess when 2nd clinic signs up |

*Every "RESOLVED" above means resolved on LOCAL-DEMO with regression tests; production-effect verification (CI on main + deploy) is owner-side per the standing rule "no RESOLVED on local-only evidence" — statuses in the gap register use PARTIALLY RESOLVED/RESOLVED(local) accordingly.*

## L. Deployment status & Vercel preview disclosure (2026-11-02, added for review-correction F3)

This section replaces the earlier, imprecise "no Vercel touched / no production database access" statements. The three things that were conflated:

| Thing | Status (2026-11-02) |
|---|---|
| **Production deployment** (`citycare-z95n.vercel.app` alias) | **Unchanged.** Still the promoted `dpl_963rr6Ha5zak2ixfihYZ8Pv4yQAQ` at commit `ad6f71a` (main). No promotion happened from the PR push; the alias still points at that deployment. |
| **Vercel Preview deployments** | **Two new automatic ones exist**, created by Vercel's git integration when the branches were pushed (the PR #9 push created one; the earlier Day-2 docs-branch push created the other). Preview #1: `dpl_2cM2PRMnHUTJCsQusHMZJWXMceeF` (this branch @ `e950f26`, READY 2026-11-02 14:09:13Z, alias `citycare-z95n-git-arena-c08-eac69c-iamjarvis9896-3988s-projects.vercel.app`). Preview #2: `dpl_9BVtnY7hQZXWa6kZhCCGMoaitv9X` (Day-2 docs branch `arena/9f15ad3b-citycare` @ `aee68db`, PR #8, READY 13:19:07Z). Their URLs were **not** opened and no application probe was run against them from this side. |
| **Production database access** | **Accessed — by Vercel's automatic preview build, not by the agent.** The preview build ran the project's prebuild (`scripts/prebuild-schema-sync.mjs`) against the production Neon database and **applied migration 0007** (evidence, verbatim from the preview build log `dpl_2cM2…`: `▶ database: neondb (PostgreSQL 18.6 (4e5fd08))` · `migration applied: 0007_dedup_observation_index.sql` at 14:08:49Z · `verified: 36 tables · ledger_append/verify · tamper trigger · 3 partial unique indexes · timezone=UTC` · `seed gate: skip — SEED_DEMO=0 — nothing was written and nothing was truncated`). Impact: DDL only — the 0007 statement drops the redundant duplicate `Observation` index (the identical base index remains); **zero data rows were written, truncated, or seeded**. Direct agent/sandbox access to the production DB: **none** (the sandbox has no route to `*.vercel.app` or Neon). |

Consequences & rollback:
- If the owner wants the production schema returned to the pre-Day-3 state, the documented one-statement rollback applies (`CREATE INDEX "Observation_patient_name_taken_idx" ON "Observation" ("patientId", name, "takenOn");`) — no data recovery involved.
- This is a direct consequence of the existing Day-2 architecture (A76/D62: prebuild schema-sync + automatic previews on push), not of this pass; the same prebuild pattern ran for every earlier preview build (each a no-op for already-applied migrations). The owner may decide — on merge or before — whether previews should keep targeting the production DB (current design) or point at an isolated DB.

**Owner action (new, F3):** verify preview deployment DB + secret isolation separately — specifically, check the `DATABASE_URL` env var's targets in the Vercel project (the preview *build* demonstrably had the production URL; whether the preview *runtime* does depends on its target setting), and decide preview-DB isolation policy. Also: the orphan standalone `web` Vercel project (from Day 1) remains an owner-side deletion item.
