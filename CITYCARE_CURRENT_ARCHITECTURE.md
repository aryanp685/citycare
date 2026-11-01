# CityCare — Current Architecture (Step 1 audit deliverable)

_Audited 2026-11-01 in the Arena sandbox against `main @ 9212ee4` (PR #5 merged: F5 + F18 + A76).
Every claim below was verified by reading the code, running the test suites, or probing the live
local server — nothing is assumed. Items that could not be verified are marked **NOT VERIFIED**
or **BLOCKED**._

> Environment note: this sandbox's git checkout is a **single-commit snapshot** of the current
> `main` (full history lives on `github.com/aryanp685/citycare`, created 2026-10-31, last push
> 2026-11-01). The production stack (Vercel `citycare-z95n.vercel.app` + Neon) is **NOT reachable
> from this sandbox** — production-specific claims are marked accordingly.

---

## 1. Stack — verified versions (package.json + installed lockfile, 2026-11-01)

| Layer | Actual version | Note |
|---|---|---|
| Next.js | **16.3.6** (Turbopack build) | App Router, RSC, `next/font/local` (Inter self-hosted) |
| React / react-dom | **19.3.0** | Server Components; `"use client"` only where needed |
| TypeScript | **7.0.2 native `tsc`** via `@typescript/native` + **6.0.2** API alias (`npm:@typescript/typescript6`) | official side-by-side recipe; `strict: true` |
| Tailwind CSS | **4.3.3** | CSS-first config; design tokens in `globals.css` |
| PostgreSQL | **18.6** (sandbox embedded) · Neon (prod) · 17 Supabase (scripted, not used) | raw `pg` **8.23** — no ORM at runtime |
| Zod | **4.6.5** | every API body schema-validated |
| jose | **6.2.12** | HS256 session JWTs |
| Vitest | **4.1.11** | (V5 blocked by npm 10.8 resolver crash — documented in FEATURES.md) |
| ESLint | **9.39.5** | (v10 blocked by eslint-plugin-react 7.x — documented) |
| GSAP | **3.15.0** | landing page only (hero, ScrollTrigger, MotionPath) |
| Motion (Framer) | **13.4.4** | UI reveals, page transitions, `layoutId` tab underline |
| Lenis | **1.3.26** | landing page only |
| @opennextjs/cloudflare / wrangler | 1.20.6 / 4.141.0 | second deploy target (Workers), prepared but not live |
| Node | sandbox 22.22.3 · `engines.node >=20.9` | Vercel 22/24 |

**Dependency hygiene**: 11 production deps, all loaded on purpose. `ai_layer/` is standalone
Python (unittest, no site imports) — a benchmark harness for the rule engine, **not wired into
the web app by design**.

## 2. Repository map (verified counts, 2026-11-01)

| Artifact | Count | Verified by |
|---|---|---|
| `web/src` TS/TSX files | **179** | `find` |
| Pages (`app/**/page.tsx`) | **27** | `find` |
| API route handlers (`route.ts`) | **54** | `find` |
| Components (`src/components/**`) | **40 files** (incl. `landing/`, `motion/`) | `ls` |
| Library modules (`src/lib/**`) | **33** | `ls` |
| LOC (`web/src`, ts+tsx) | **12,048** | `wc -l` |
| Unit test files / tests | **18 files / 162 tests** — **run: 162/162 pass** | `npx vitest run` |
| E2E HTTP checks | **241** — **run: 241/241 pass** (fresh seed, Node prod server) | `node scripts/e2e.mjs` |
| DB tables | **35** | `information_schema` |
| DB foreign keys / unique+PK constraints / indexes | **45 / 35 / 96** | `information_schema` / `pg_indexes` |
| Custom trigger / ledger functions | 1 (`audit_no_update` + `reject_audit_tampering`) / 2 (`ledger_append`, `ledger_verify`) | `pg_trigger` / `pg_proc` |
| Schema SQL | `citycare_init.sql` + `constraints.sql` + `ledger.sql` + 5 migrations = **1,142 lines** | `wc -l` |

Historical figures quoted in the brief (52 routes / 27 pages / 32 components / ~10,800 LOC /
131 unit / 217 e2e) were from October 2026. **Current verified**: 54 routes / 27 pages / 40
component files / 12,048 LOC / 162 unit / 241 e2e.

## 3. Route inventory (all 54 API routes, grouped)

**Auth (11)**: `login`, `logout`, `me`, `signup`, `forgot`, `reset`, `recover`,
`recovery-codes`, `sessions`, `verify-email/{request,confirm}` — scrypt N=2¹⁷ async, HS256
JWT + server-side `Session` row (`sid`), sliding 7-day / hard 30-day expiry, per-IP +
per-account rate limits, 15-min sliding lockout, per-request CSRF gate (Sec-Fetch-Site +
Origin + JSON-only).

**Patient (17)**: `profile`, `appointments`, `doctors/[id]/slots`, `consents` (GET/POST/PATCH),
`dependents` (+`[id]/handover`, `[id]/switch`, `switch-back`), `documents` (multipart upload,
AES-256-GCM), `fhir` (FHIR R4 bundle export), `ledger` (keyset-paged transparency),
`medications/[id]/confirm` (DRAFT→active), `nominee`, `observations` (F5), `photo` (paste-OCR
text → DRAFT meds), `print-summary` (F18), `purge` (real erasure).

**Doctor (4)**: `appointments/[id]/status` (check-in/out, no-show),
`patients/[id]/record` (consent-gated read — the trust core),
`patients/[id]/emergency` (break-glass: 60 min, 3/24h, ledgered, reviewable),
`patients/[id]/encounter` (visit + rules engine → `Alert` rows).

**Documents (2)**: `documents/[id]` (60-s HMAC signed link, viewer-bound), `documents/[id]/link` (issuance, FULL_RECORD only, ledgered).

**Admin (12)**: doctor verification (attested), emergency review queue (auto-suspend at 2
unjustified), grievances (30-day SLA), incidents/breach register (72-h Board clock, r.7(2)
report), locked accounts, unlock, system monitor.

**Shared (9)**: `notifications` (+read), `grievances`, `legal/acceptance`, `ledger/anchors`
(+`[seq]/ots`), `health` (public), `cron/daily` (bearer secret; retention sweep, ledger verify,
session/rate-limit prune, OTS anchor), `patient/photo`.

## 4. Page inventory (27)

- **Public**: `/` (landing — GSAP/Motion/Lenis), `/login`, `/signup`, `/recover`,
  `/legal/{,privacy,terms,grievance,licenses,transparency}` (6)
- **Patient (8)**: home, `onboard`, `records` (longitudinal timeline — the hero screen),
  `access` (consent + transparency + purge + nominee), `doctors` (search),
  `doctors/[id]` (profile + slot picker), `notifications`
- **Doctor (4)**: dashboard, `patients`, `patients/[id]` (workspace: record, encounter form,
  alerts, break-glass), `notifications`
- **Admin (6)**: doctors (verify), `emergencies` (review), `grievances`, `incidents`,
  `system` (health monitor), `notifications`

Role guards: RSC `viewerForPage()` redirects (no server errors for anonymous); API `requireRole`
+ `requireVerifiedDoctor`. No `middleware.ts` — guards live in route handlers (deliberate:
A17).

## 5. Database architecture (35 tables)

**Identity & auth**: `User` (4 roles; HOSPITAL_ADMIN typed but unreachable — no creation path),
`Session`, `PolicyAcceptance`, `RecoveryCode`, `Otp` (dead), `EmailCode`, `Outbox`.
**Patient record**: `Patient`, `Allergy`, `Condition`, `Medication`, `LabResult`,
`Observation` (F5), `Encounter`, `Prescription`, `Document` + `DocumentBlob` (encrypted bytea),
`AiExtraction`/`AiSummary` (dead — no writers), `Alert` (rules engine output).
**Flow**: `Doctor`, `DoctorSpecialty`, `Specialty`, `Hospital` (display only),
`AvailabilitySlot`, `Appointment`, `Consent` (5 scopes, DB-clock expiry),
`Notification`, `RateLimit`, `JobQueue` (dead).
**Trust & governance**: `AuditLog` (hash-chained, append-only by trigger), `LedgerAnchor`
(Ed25519-signed heads + OpenTimestamps receipts), `Grievance`, `Incident`, `HospitalAdmin` (dead).

Guardrails in SQL (not app code): partial unique indexes `one_live_appt_per_doctor_per_instant`
(+seat), `one_token_per_doctor_per_day`, `one_active_consent_per_pair`; trigger
`audit_no_update`/`reject_audit_tampering` blocks UPDATE/DELETE on `AuditLog`; plpgsql
`ledger_append` (millisecond-truncated, timezone-proof canonical UTC string stored & hashed) and
`ledger_verify` (full-chain recompute).

Migrations: 5 idempotent files, applied by bootstrap — and **since A76 (2026-11-01)
automatically on every Vercel build** via the `prebuild` hook (schema ⇄ code drift closed).

## 6. Trust core — the execution path (verified by reading + e2e)

```
Doctor GET /api/doctor/patients/[id]/record
  → requireRole(DOCTOR) → requireVerifiedDoctor
  → liveConsent(patientId, doctorId): SELECT … ORDER BY requestedAt DESC LIMIT 1 + now() (DB clock)
  → evaluateConsent (REVOKED / DENIED / expired / not-APPROVED → deny + reason)
  → scopedRecord(record, scope) — pure applyScope() (unit-tested, found a real leak: A58)
  → rules engine runAllRules (deterministic; DRAFT meds never fire alerts)
  → appendAudit(VIEW_RECORD, consentId) — ledger row in same/next statement
Revoke → UPDATE Consent → doctor's NEXT request re-checks DB → 403 (e2e proves instant)
```

No cache anywhere on the consent path; the clock is `now()` in Postgres, never the browser.

## 7. Deployment topology

| Path | Status | Notes |
|---|---|---|
| **Vercel (live)** | **LIVE** — `citycare-z95n.vercel.app`, git-linked `main`, region `sin1`, Neon Singapore | `npm run build` → `prebuild` schema sync → Next build; functions `maxDuration 30`; daily cron `0 21 * * *` UTC = 02:30 IST |
| Cloudflare Workers | Prepared, **not deployed** (no owner credentials in sandbox — BLOCKED) | OpenNext, Hyperdrive, scrypt N=4096 (free 10 ms CPU), per-query connections (D24) |
| Supabase (Mumbai) | Scripted (`supabase-cutover.sh`), **not deployed** — data-residency path (L-G6) | needs owner's session-pooler URI |

Secrets: `SESSION_SECRET`, `CRON_SECRET`, `DOCUMENT_KEY`, `ANCHOR_SIGNING_KEY`,
optional `RESEND_API_KEY`/`EMAIL_FROM` — on the Vercel project only; **never in the repo**
(`web/.env.local` is sandbox-only and git-ignored). Note: `web/.env.example` referenced by
START_HERE/README **does not exist in the repo** (finding NG-G01).

## 8. Dead / unreachable code (verified by grep against all of `web/src`)

| Item | Status | Evidence |
|---|---|---|
| `JobQueue` table | dead — 0 references | grep |
| `Otp` table | dead — no app references (OTP login was descoped, R6) | grep |
| `AiExtraction`, `AiSummary` | **no writers** (only erasure cleanup reads them) — OCR/LLM deliberately not wired (D5, AI_ACCURACY doc) | grep |
| `HospitalAdmin` table / `HOSPITAL_ADMIN` role | role accepted by guards but **no account can hold it** (signup only PATIENT/DOCTOR; seed only SUPER_ADMIN) | grep |
| `NSAID_CLASS` in `rules.ts` | exported, **never used** (only penicillin class is wired) | grep |
| `DRUG_DRUG_INTERACTION` alert type | declared, **no rule ever emits it** | grep |
| `schema/prisma/schema.prisma` + `schema/package.json` | Prisma 6.19.3 pinned **only** for `validate`/`migrate diff` in `run_tests.sh` — runtime never imports it (D1) | read |
| `ai_layer/` | standalone Python benchmark — not imported by web (by design) | read |

## 9. Background jobs

One cron: `POST /api/cron/daily` (Vercel schedule 02:30 IST, bearer `CRON_SECRET`, 503 if
unset, 401 on mismatch — verified by probe). It: erases self-registered demo accounts past
7 days (budgeted 20 s, `deferred` reported), prunes expired sessions + stale rate-limit
windows, runs `ledger_verify()`, signs the ledger head (Ed25519) and submits to
OpenTimestamps (best-effort 5 s; skipped locally with `ANCHOR_OTS=0`). No queue, no worker —
there is nothing slow enough to justify one (documented decision).

## 10. What this architecture is / is not

**Is**: a modular monolith (one deployable, one Postgres, SQL as source of truth) with the
security-critical invariants (double-booking, consent-per-pair, ledger append-only) enforced in
the database, not the app; a deterministic, 0-LLM clinical path; patient-first data ownership
(erasure really erases; consent really revokes; ledger really verifies).

**Is not**: multi-tenant (no clinic/org model — see `CITYCARE_DATABASE_AUDIT.md` §5),
push-based (polling inbox), integrated with any external system (ABDM, RxNorm, SMS, payment),
or monitored by any third party (no uptime provider, no alerting).

**Assessment**: for the stated scale (college demo → controlled pilot of a few clinics), the
monolith is the right choice. Microservices would add failure modes without removing any.
The real scaling levers are already identified in the docs (object storage for blobs,
edge WAF for rate limits, PgBouncer/replica for reads, paid Neon compute).
