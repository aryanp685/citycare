# CityCare — Feature Completeness Matrix (Step 1)

_Audited 2026-11-01. "Works" = verified by code read **and** the e2e suite re-run today
(241/241 on a fresh seed). "NOT VERIFIED" = could not be exercised from this sandbox.
Legend: ✅ implemented+tested · 🔶 implemented, partial · ❌ missing · 🚫 blocked (needs
owner/external)._

## 1. Patient features

| # | Module | Status | Implementation & proof | Edge cases / gaps |
|---|---|---|---|---|
| P1 | Registration | ✅ | `POST /api/auth/signup` — role, policy-acceptance artefact (z.literal(true), `PolicyAcceptance` row in-tx), adult attestation, minor refusal (s.9), `@demo.in` reserved, 20/h IP limit, dup-email 409, weak-pw 400 | e2e L1/F13; phone not verified (D3 — no DLT-registered SMS provider; e-mail path exists but no live provider: NG-F01) |
| P2 | Login | ✅ | scrypt 2¹⁷, sliding lockout 15 min + admin unlock, per-IP limit, server-side session, device list, sign-out-everywhere, CHIPS cookie for iframe case (A20) | no 2FA/passkeys (NG-S13/F6) |
| P3 | Profile & onboarding | ✅ | name, DOB (calendar-correct age), blood group, allergies (with reaction text — A45), chronic conditions, current meds, share-default-expiry | e2e §2; allergy vocabulary is free text (NG-C02 context) |
| P4 | Medical history (longitudinal timeline) | ✅ | `/patient/records` — encounters, allergies, conditions, meds, labs (with ref ranges), documents, **F5 trends (SVG sparkline + band)**, print summary (F18) | the hero screen; read-only for the patient's own record |
| P5 | Allergies | ✅ | CRUD via profile + doctor encounter adds; reaction text; severity | free-text allergen (no controlled vocabulary) — feeds rules engine substring matching (NG-C02) |
| P6 | Conditions | ✅ | ACTIVE/RESOLVED, linked to encounters (scope filter uses it — A58) | no ICD-10 coding (NG-C05) |
| P7 | Medications | ✅ | self-reported + doctor prescriptions + **DRAFT paste-OCR pipeline** (`/api/patient/photo` → `parsePrescriptionPhoto` → DRAFT rows → patient `confirm`); DRAFT rows never drive alerts or printouts (F18) | OCR is simulated text-paste (D5/NG-F04); no lab integration |
| P8 | Lab observations | ✅ | `LabResult` with numeric value + ref range; abnormal-flag via rules engine; F5 `Observation` (self-reported readings with bands) | no clinician-authored observations (NG-D07); no lab system integration; reference ranges static per row (NG-C03) |
| P9 | Encounters | ✅ | doctor-created (complaint, diagnosis prose, advice, follow-up date, structured vitals); immutable | no ICD-10; encounter-linked observations missing (NG-D07) |
| P10 | Prescriptions | ✅ | doctor creates per encounter; patient sees; **safety engine runs at write** (allergy conflict CRITICAL, abnormal labs, follow-up due, stale HbA1c) | no drug-drug interaction rule (NG-C01); no e-prescription format (PDF print is F18) |
| P11 | Documents | ✅ | multipart upload (PDF/JPEG/PNG magic-byte), 3 MB/30 MB caps, AES-256-GCM, 60-s viewer-bound links, ledgered, cascade-erase (F12) | bytea storage ceiling (NG-D05); no OCR on uploads yet (F11) |
| P12 | Doctor search | ✅ | specialty/city/fee/rating filters, verified-doctors only (F1) | no clinic filtering (NG-D03) |
| P13 | Appointment booking | ✅ | 14-day slot grid, re-validation, tx + partial index (double-booking impossible), multi-seat capacity, token queue with distinct races (token_race vs slot_full), cancel frees slot (A11), auto consent-REQUEST on booking, live 45-s refetch | mislabelled consent race (NG-S06); no reminder delivery (NG-F01) |
| P14 | Consent management | ✅ | request → approve/deny, 5 scopes, 1–90 day expiry, **instant revoke (next request 403s)**, DB-clock verdict, stale-consent 428 re-acceptance (L2), emergency override bounded (F2) | "newest row wins" read semantics (NG-S05); no consent manager integration (DPDP r.4 framework from Nov 2026 — strategic) |
| P15 | Access history (transparency) | ✅ | patient-verifiable ledger: keyset-paged, chain verdict, account-level events visible (A57), anchors + OTS receipts at `/legal/transparency` | — |
| P16 | Data export | ✅ | FHIR R4 bundle (Patient, AllergyIntolerance, Condition, MedicationStatement, Encounter, Observation w/ ranges; drafts excluded; `EXPORT_FHIR` ledgered) + print summary (F18) | FHIR mapping minimal (no ICD-10 codes → coding gaps, NG-C05) |
| P17 | Data deletion | ✅ | real erasure (delete patient data, redact doctor prose, keep ledger, revoke sessions, drop blobs, inbox+nominee deleted — A52), confirm-phrase, demo retention sweep (7-day cron) | ledger retention is deliberate (DPDP vs NMC tension, D15 documented) |
| P18 | Dependents (minors) | ✅ | guardian adds ≤6 under-18, login-less child users, guardian switch (new server session `actingFor`), no nesting, notifications routed to guardian, handover at 18 (credentials + withdrawn on-behalf acceptance — A70) | guardian adulthood = self-declared DOB (D48/L-G4 — DigiLocker token blocked on credentials) |
| P19 | Notifications | ✅ | in-app inbox all roles, 30-s poll (pauses in hidden tabs), severity, deep links, mark-all-read | polling not push (D42); no e-mail/SMS leg (NG-F01) |
| P20 | Recovery | ✅ | 8 one-time codes + e-mail verify/forgot/reset (Outbox; UI honest when no provider) | live delivery needs owner's Resend key (NG-F01, 🚫 owner) |

## 2. Doctor features

| # | Module | Status | Implementation & proof | Edge cases / gaps |
|---|---|---|---|---|
| D1 | Registration | ✅ | registration number (regex) + optional HPR; **pending until admin verifies**; invisible to patients meanwhile | attestation, not registry lookup (D57) |
| D2 | Verification (admin) | ✅ | NMC IMR / state council / HPR selection + "name & number matched" attestation, stored + ledgered (A68) | manual (no API exists — honest) |
| D3 | Patient access (workspace) | ✅ | consent-gated record (scope-filtered, DB-clock), trends read-only, documents (FULL_RECORD only), denial is logged and patient-visible | NG-S05 read semantics; no org context (NG-D03) |
| D4 | Consent verification UX | ✅ | "current consent verdict computed in SQL on the DB clock" on Patients page + workspace banner | — |
| D5 | Encounter creation | ✅ | structured form, vitals, diagnosis, advice, follow-up; **rules engine at write** → `Alert` rows (deduped, CRITICAL first); clinical disclaimer rendered | no ICD-10; no retroactive alerts on later profile edits (NG-C04) |
| D6 | Prescription creation | ✅ | per-encounter med list; safety check; DRAFT pipeline for photos | no DDI rules (NG-C01) |
| D7 | Safety engine | 🔶 | deterministic 0-LLM rules (4 alert types actually emitted; DRAFT-safe; evidence per alert; logged) | declared-but-unimplemented `DRUG_DRUG_INTERACTION`; dead `NSAID_CLASS`; 1 real drug class (NG-C01/C02); **requires clinical review before any real use (NG-C06)** |
| D8 | Emergency access (break-glass) | ✅ | 60 min FULL, ≥20-char reason, 3/24h, refused if consent live, patient CRITICAL notification + red badge, instant revoke possible | post-hoc control by design (D41) |
| D9 | Emergency review (admin) | ✅ | queue with read counts + 7-day tally, JUSTIFIED/UNJUSTIFIED (note required), ledgered, **2 unjustified → auto-suspend**, >3/7d flagged | single SUPER_ADMIN (D50) |
| D10 | Access history | ✅ | doctor sees own VIEW/EMERGENCY ledger entries; patient sees them too | — |
| D11 | Account security | ✅ | same auth stack as patient (sessions, devices, lockout, recovery) | no 2FA (NG-S13) |

## 3. Admin features

| # | Module | Status | Implementation & proof | Edge cases / gaps |
|---|---|---|---|---|
| A1 | Doctor verification queue | ✅ | pending/rejected with reason, attestation (A68) | — |
| A2 | Grievances (DPDP s.13) | ✅ | form → queue, 30-day SLA + overdue flag, categories, status + resolution, complainant notified, ledgered, admin notified | officer name/mailbox envs unset (NG-F02, 🚫 owner) |
| A3 | Breach/incident register (r.7) | ✅ | 72-h Board clock from `detectedAt`, one-click intimation (all patients/all users/listed; dependents→guardians), cause + remediation, r.7(2) JSON report | e-mail/SMS leg needs provider (NG-F01) |
| A4 | Emergency review | ✅ | (see D9) | two-person rule absent (D50) |
| A5 | Account management | ✅ | locked-accounts card + unlock (A63), suspend (auto from D9) | no self-service admin provisioning beyond seed |
| A6 | System monitor | ✅ | DB version/TZ/timeout, ledger rows + breaks, live consents, emergency counts, runtime, env facts | no external alerting (NG-S10) |

## 4. Cross-cutting

| # | Module | Status | Notes |
|---|---|---|---|
| X1 | Audit ledger | ✅ | hash-chained, DB append-only, verified daily + on-demand, Ed25519 anchors, OTS receipts (pending-confirm, honestly labelled — D55) |
| X2 | Legal pack | 🔶 | privacy (itemised, from code data), terms, grievance, licenses, transparency; notice versioning + 428 re-acceptance; **hi/mr key-points only, legal-unreviewed (L-G2)**; full i18n of UI missing (D17) |
| X3 | FHIR R4 export | 🔶 | works (F4); mapping minimal — no ICD-10 coding, no ABDM profiles (D10) |
| X4 | Cron housekeeping | ✅ | retention sweep, ledger verify, session/rate-limit prune, OTS anchor (NG-S08 secret hygiene) |
| X5 | CI | 🚫 | workflow written, never ran (D59/NG-S11) — owner must enable Actions |
| X6 | ABDM/ABHA | ❌ (planned) | schema fields exist (abhaNumber etc.); zero integration; **strategically important now** (ABHA ≈ 93.95 crore, Jul 2026 — see market doc) |
| X7 | Multi-clinic/org | ❌ (planned) | NG-D03 |
| X8 | Payments | ❌ (out of scope by design) | commercial gap, not a bug (business model: market doc §8) |
| X9 | Dark mode / PWA | ❌ (planned, F16/F10) | tokens are CSS vars (dark mode cheap); no manifest |
| X10 | Real OCR | ❌ (planned, F11) | tesseract.js client-side design already drafted (plan §3 C4) |
| X11 | LLM summaries | ❌ (deliberately) | `ai_layer` benchmark exists; wiring gated behind provenance/approval design (AI_ACCURACY doc) — **correct refusal, documented** |

## 5. Duplicate functionality & dead code sweep (audit A requirement)

- **No duplicate feature logic found** in `web/src` (the one historical duplicate,
  `AppNav.tsx`, was deleted in A43; `liveConsentFor` is a 1-line alias, acceptable).
- Dead tables/codes: NG-D01 (tables), NG-C01 (NSAID_CLASS, DRUG_DRUG_INTERACTION).
- Unused dependencies: **none** — all 11 prod deps load; `@opennextjs/cloudflare` +
  `wrangler` are the prepared second deploy path (not unused: they gate the CF build).
- `schema/prisma/*`: tooling duplicate, see NG-D02.

## 6. What the brief asked vs what exists (honest delta)

| Brief module list | Verdict |
|---|---|
| Patient: registration…recovery (20 items) | **19 ✅, 1 🔶 (notifications: no push/e-mail leg)** |
| Doctor: registration…account security (11 items) | **10 ✅, 1 🔶 (safety engine — see NG-C01/C06)** |
| Admin: verification…monitoring (6 items) | **6 ✅** (grievance officer identity + breach comms legs need owner inputs, not code) |

**Nothing on the list is silently missing.** The partials are all documented in-repo
(DRAWBACKS/FEATURES/LEGAL) and are now also in the master register with owners.
