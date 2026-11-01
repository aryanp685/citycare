# CityCare — Step 2 Implementation Plan (ordered)

_Plan only — **nothing in this document has been implemented** (Step 1 was audit-only, as
instructed). Each workstream is one focused session under the project's standing rule:
**code + tests + docs (FEATURES/DRAWBACKS/README) + deploy before the next.** IDs reference
`CITYCARE_MASTER_GAP_REGISTER.md`._

Sequencing logic: (1) data-safety and clinical-governance first — they gate *any* real patient
data; (2) the operational P1s that make a pilot trustworthy; (3) the market-facing features;
(4) scale items; (5) enhancements that can wait for product-market validation.

---

## Phase 0 — Hygiene (before anything else, ≤ half a day)

### W0 · Docs + onboarding fix — `NG-G01`
- Create `web/.env.example` (template with generation commands, **no real values**) — START_HERE
  and README already reference it.
- Sync stale docs to 2026-11-01 state: START_HERE (live URL, counts 162/241, migrations
  0001–0005, prebuild note), root README (test counts, "file storage is real (F12)", URL),
  `ci.yml` comment (241 checks).
- **Done when**: `cp .env.example .env.local` is a working onboarding step; no doc cites a
  number the test suites contradict.

## Phase 1 — P0 gates (must close before any real patient data)

### W1 · Backup & disaster recovery — `NG-S09`
- Scheduled `pg_dump` (daily cron job under `CRON_SECRET`, or Vercel schedule → export route)
  to a private object store; retention 30 days; **restore runbook**: dump → scratch DB →
  `ledger_verify()` = 0 breaks → documented RPO (24 h) / RTO (≤ 1 h).
- **Done when**: a restore **drill** is executed and its output logged in the README
  "Verified" block. No backup claim without a tested restore.

### W2 · Clinical review of the safety engine — `NG-C06` (external, starts in parallel)
- ≥2 practising physicians review: all 4 rule types, severity mapping, the penicillin class
  table, alert copy, disclaimer wording. Sign-off artefact committed to the repo
  (`docs/clinical-review-YYYY-MM-DD.md` — names, registrations, scope, date).
- **Done when**: signed artefact in repo + any copy changes shipped with the L1 notice-bump
  discipline (428 re-acceptance).

## Phase 2 — P1 pilot trust (each one session)

### W3 · Monitoring & alerting — `NG-S10`
- Free uptime probe on `/api/health` (BetterStack/UptimeRobot); alert to owner's phone.
- Neon: usage/alerts available on the paid plan — pair with W11's hosting decision.
- **Done when**: an induced 5-minute outage is caught and notified in < 10 min.

### W4 · CI green — `NG-S11` (owner action + verification)
- Owner: repo Settings → Actions → enable. Push → first green run of the existing
  `ci.yml` (lint, tsc, vitest, licences, bootstrap, build, 241-check e2e on a Postgres
  service). **Note for the workflow**: it runs `db-bootstrap.sh` directly, so the prebuild
  hook (A76) is not needed there — keep it as is.
- **Done when**: a green Actions badge on `main`; D59/NG-S11 closed in the log.

### W5 · Production verification re-run — `NG-G04` (owner, ~10 min)
- `BASE=https://citycare-z95n.vercel.app node scripts/e2e.mjs` → expect 190+/9-skip
  (production skips the X-Forwarded-* simulations). Also `curl -sI` for the HSTS header value
  (feeds W6/NG-S01) and timing samples (feeds NG-P06). Numbers into README.
- **Done when**: prod numbers in the README "Verified" block with the date.

### W6 · Security hardening batch (small, all test-pinned)
- `NG-S01` HSTS header in `next.config.ts` (build-time) — value informed by W5's curl.
- `NG-S03` `DOCUMENT_KEY` mandatory at boot (env schema), derive-for-local with loud log.
- `NG-S05` `liveConsent` explicit preference (latest APPROVED-unexpired, else latest row for
  status) + new e2e: "pending request coexists with live consent → access stays up".
- `NG-S04` ledger-critical writes fail the request (not `.catch(()=>null)`) on the document
  link path.
- `NG-S02`/`NG-S08`/`NG-S12`: document XFP trust assumption; per-job cron secret + rotation
  note; entropy hint in deploy script.
- **Done when**: 162+/241+ suites green with the new checks; headers probe-verified.

### W7 · Communications + governance contacts — `NG-F01`, `NG-F02`
- Owner supplies Resend key + verified domain (or SES); e-mail leg live (Outbox drain,
  verification/forgot/reset/consent/breach notices); UI copy updates (no more "unavailable").
- Appoint + set `NEXT_PUBLIC_GRIEVANCE_OFFICER` / `NEXT_PUBLIC_GRIEVANCE_EMAIL`.
- **Done when**: a real e-mail lands from a prod incident notification; grievance contact
  rendered on `/legal/privacy`.
- **Class**: CREDS + owner decision. SMS stays blocked on DLT registration (LG-25).

### W8 · Two-factor — `NG-S13` (F6)
- Passkeys (WebAuthn) alongside password: platform authenticators first, `@simplewebauthn`,
  per-user credential list in the security panel; TOTP for doctors/admins as the fallback if
  passkey coverage is weak in the pilot population.
- **Done when**: passkey-only login e2e; recovery-codes path still works; security panel
  lists passkey devices.

## Phase 3 — Market-facing (Nagpur pilot)

### W9 · Language — `NG-F03` (F15-b)
- `next-intl` dictionaries, **Marathi-first** + Hindi: all patient-facing screens + full legal
  notice translations; legal-cell review before ship (LG-02); unit-test parity with code
  numbers (existing pattern in `legal-i18n.test.ts`).
- **Done when**: MR pass on 5 key screens (login, records, access, booking, grievance) +
  reviewed translations committed.

### W10 · Clinical engine expansion — `NG-C01, NG-C02, NG-F11, NG-C04, NG-C05`
- (In one or two sessions, all clinically reviewed per W2's sign-off process:)
  - ICD-10 code field on encounters (WHO public list, searchable) → FHIR bundle carries codes.
  - Controlled allergy vocabulary + class-based matching (β-lactams, NSAIDs, sulfonamides,
    ACE-i via RxClass-derived tables) + **first DDI rule set** (curated pairs, evidence per
    alert, severity mapped).
  - Retroactive alerts: profile/med mutation re-runs rules → `Alert` rows.
  - Kill or wire the dead `NSAID_CLASS` / `DRUG_DRUG_INTERACTION` dead ends (no dead types left).
- **Done when**: FP/FN test matrix reviewed by the physicians; e2e: add allergy → alert;
  DDI alert fires on encounter write; FHIR export contains ICD-10.

### W11 · Pilot environment separation — `NG-S14`, LG-24, LG-14
- Pilot instance: **no seeded demo users** (bootstrap flag), real grievance officer, prod
  e-mail (W7). Hosting: move off Hobby — Vercel Pro (fast) **or** Supabase Mumbai cutover
  (F21, data-residency answer to LG-14 before 13 May 2027). Decision with owner on residency
  preference.
- **Done when**: pilot URL with 0 seeded users; old demo creds fail; hosting ToS permits the
  pilot's commercial status.

### W12 · Object storage for documents — `NG-D05`
- R2/S3/Supabase Storage + same AES-256-GCM envelope (key outside store), `keyVersion` used,
  backfill script for existing blobs, download path unchanged (60-s links).
- **Done when**: 50+ patients' worth of synthetic uploads without DB growth; `/api/health`
  reports storage mode.

## Phase 4 — Scale & design (after pilot starts generating signal)

### W13 · Design elevation — `NG-U06, NG-U01, NG-U02, NG-U03, NG-U07`
- Tokens v2 (spacing/type/z-index scales) + shared `EmptyState`/`ErrorState`/`SectionHeader`;
  field-level form errors; `error.tsx` segment boundaries; axe-core in CI (W4's CI);
  Playwright screenshot suite at 320/375/768 (closes the "NOT VERIFIED" mobile gap).
- **Done when**: 3 dense pages re-scored in a visual pass; 0 critical axe findings.

### W14 · Load & concurrency proof — `NG-P03, NG-D04, NG-P02`
- k6/autocannon scenarios (50 concurrent bookings on one doctor-day; parallel ledger appends)
  → published p95/5xx; validate the pooled Neon endpoint (or paid tier) under the same load;
  autosuspend off on the pilot DB.
- **Done when**: numbers in README; 0 5xx at target concurrency; conflicts surface as 409s.

### W15 · Organization model (only if clinics join the pilot) — `NG-D03`
- Design doc first (tables: `Organization`, `DoctorMembership`, org-scoped reads over the
  existing ledger; **patient ownership untouched**), then migration + e2e for org isolation +
  two-person rule for suspensions (D50).
- **Done when**: two-doctor clinic can share a patient's consented record via the org, and a
  patient's erasure still erases across it.

### W16 · ABHA identifier path (phase 1) — `NG-F05`
- ABHA as default patient identifier (verify against the ABDM sandbox; schema field exists),
  doctor-side ABHA lookup to remove first-visit manual entry (the #1 adoption friction,
  market doc §3.6). Full M1–M3 certification remains a separate commercial decision.
- **Done when**: sandbox lookup e2e; a patient can be registered with ABHA + phone.

## Phase 5 — Post-validation (only with product-market signal)

- PWA + install + Web Push (NG-U05, NG-F08) · dark mode (NG-U04) · doctor subscription +
  Razorpay (NG-F06, COMMERCIAL) · key rotation via KMS (NG-G07) · ledger archival policy
  (NG-D06) · OTS receipt upgrade job (D55) · ADR set from the bug log (NG-G03).

---

## Pilot gate (the 12 items that must be green before a controlled pilot)

1. W1 restore drill green (NG-S09) 2. W2 clinical sign-off in repo (NG-C06) 3. W3 monitoring
   live (NG-S10) 4. W4 CI green (NG-S11) 5. W5 prod e2e numbers (NG-G04) 6. W6 hardening
   batch (NG-S01/S03/S04/S05) 7. W7 e-mail + grievance officer (NG-F01/F02) 8. W8 2FA
   (NG-S13) 9. W9 Marathi/Hindi patient screens (NG-F03) 10. W10 ICD-10 + reviewed rule pack
   (NG-C01–C05, NG-F11) 11. W11 pilot env without demo data on permitted hosting (NG-S14,
   LG-24/21) 12. Pilot governance pack: ethics clearance, informed-consent form, incident
   contacts, counsel sign-off on LG-08/LG-21/LG-22 (LEGAL).

**Explicitly NOT in Step 2**: any LLM clinical path, blockchain, ABDM certification, payment
processing before W15, microservices, and any visual *redesign* (only the token/elevation
pass). These remain deliberate non-goals, documented as such.
