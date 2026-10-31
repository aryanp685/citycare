# CityCare — legal & compliance register

_Last verified 28 Sep 2026 against the code in this folder and the live deployment
(`https://citycare-xi.vercel.app`). Written by an engineer, not a lawyer: every row says what
the law asks, what the code does about it and how to prove it. Where we are **not** compliant
yet it says so. Get this reviewed by the college's legal cell before any non-demo use._

## 0. The rule for every future feature

Before a feature ships it must answer four questions, in `FEATURES.md` next to the feature:
1. **Lawful basis** — which DPDP s.6 consent or s.7 legitimate use covers the new processing?
2. **Notice** — does `DATA_INVENTORY` in `src/lib/legal.ts` (and therefore `/legal/privacy`) already list the data item and purpose? If not, add it and bump `PRIVACY_NOTICE_VERSION`.
3. **Rights** — can the user still export it (FHIR), correct it, erase it (`src/lib/erasure.ts`) without emailing anyone?
4. **Third parties** — does it send data to a new processor or load a third-party script? Then the processor table and the licence gate (`scripts/licenses.mjs`) must be updated first.

Things that will **never** ship: selling/sharing health data, third-party analytics/ads SDKs,
scraping other sites (Drugs.com/1mg/Practo — ToS + Copyright Act), unlicensed drug databases,
LLM-generated diagnoses presented as medical advice, fake "NMC verified"/"ABDM certified" badges.

## 1. Laws considered and how they apply

| Law | Applies? | What it demands of CityCare | Where handled |
|---|---|---|---|
| **DPDP Act 2023** + **DPDP Rules 2025** (notified 13/14 Nov 2025; notice/consent/security/breach rules commence **13 May 2027**, consent-manager rules 13 Nov 2026) | Yes — health data of identifiable people (a "Data Fiduciary") | Stand-alone plain-language notice (r.3), free/specific/informed consent by clear affirmative act (s.6), withdrawal as easy as giving (s.6(4)), rights: access/correction/erasure/grievance/nominate (s.11–14), children (s.9, r.10), security safeguards incl. 1-year logs (s.8(5), r.6), breach notice to principals + Board within 72 h (r.7), erase when purpose served (s.8(7)) | §2 below |
| **IT Act 2000 s.43A + SPDI Rules 2011** | Yes, until DPDP fully commences; health data = "sensitive personal data" | Reasonable security practices, privacy policy published, consent for collection of SPDI, no disclosure without consent | scrypt/RBAC/ledger/TLS; `/legal/privacy`; consent-gated access |
| **NMC / MCI Code of Medical Ethics 2002** (Reg. 1.3.1 records 3 yrs; 1.3.2 copy within 72 h) + **DGHS Hospital Manual** (case sheets 10 yrs) | Indirectly — CityCare is not the clinician's statutory record | Never destroy the clinician's ability to keep their own record; give the patient a copy instantly | Erasure keeps anonymous encounter shells; FHIR export is instant (beats 72 h) |
| **Telemedicine Practice Guidelines 2020** | **No** — CityCare does no consultations, video or chat | (Would require RMP identity display, consent, prescription rules) | Not applicable; recorded so nobody adds "video call" casually |
| **Drugs and Cosmetics Act / Pharmacy Act** | **No** — nothing is sold or dispensed | (E-pharmacy licensing) | Not applicable; medication list is record-keeping only |
| **Clinical Establishments Act 2010** | **No** — not a clinic/hospital | — | Terms §1 say so |
| **Consumer Protection Act 2019** (misleading claims) | Yes, if ever a "service" | No untrue claims: not a medical device, not ABDM-certified, not "NMC verified" | Landing "Honest limits", Terms §1, admin queue wording "checked against the register by an admin" |
| **Copyright Act 1957 / OSS licences** | Yes | Attribution + licence compliance for shipped code, fonts, images | `scripts/licenses.mjs` gate (361 prod packages, no GPL/AGPL), `/legal/licenses`; Inter (OFL 1.1) self-hosted; GSAP "No Charge" licence; **no** third-party raster images (only create-next-app SVGs) |
| **Vercel Hobby ToS** (non-commercial), **Neon** free tier | Yes | No commercial use on Hobby | Terms §1 "non-commercial"; move to Pro before any paid use |
| **ABDM / ABHA** | Voluntary; not integrated | Do not claim compliance | Only the FHIR R4 *format* is used; export says "ABDM format", not "ABDM certified" |

## 2. DPDP control matrix — what the code does

| Obligation | Implementation | Proof |
|---|---|---|
| Stand-alone, itemised notice with purposes, processors, retention, rights, complaint route (r.3) | `/legal/privacy` rendered from `DATA_INVENTORY`, `PROCESSORS`, `GRIEVANCE` in `src/lib/legal.ts`; linked in every footer, the signup form and the demo banner | e2e `L1: /legal/privacy …`, `privacy notice is itemised …` |
| Integrity + verifiability of the access log beyond the operator (s.8(5), r.6 logs) | Hash-chained ledger **plus** nightly Ed25519-signed head published at `/legal/transparency` and submitted to public OpenTimestamps calendars; anyone can recompute and verify | e2e `D13:`, live anchor #9 |
| Security safeguards for stored files (s.8(5), r.6(1)(a) encryption) | Per-file AES-256-GCM under `DOCUMENT_KEY` (env, never in the DB), magic-byte type sniffing, size + quota caps, viewer-bound expiring links, ledgered downloads | `storage.test.ts`, e2e `D4:` |
| Account recovery without weakening security (s.8(5)) | Hashed one-time recovery codes; e-mail codes 15 min / 5 attempts; reset revokes every session; no account-enumeration on forgot | e2e `D9:`/`D3:` |
| Child turns 18 — consent must become their own (s.9, r.10) | Handover withdraws the guardian's on-behalf acceptance; the adult accepts the notice personally at first action (428) | e2e `D49:` |
| Consent stays current (s.6, r.3) | `PRIVACY_NOTICE_VERSION` bump ⇒ banner on every signed-in page + **428 `consent_outdated`** on mutations until `POST /api/legal/acceptance` (reads, logout, grievances, switch-back exempt); ledger `POLICY_ACCEPTED` | e2e `L2:` (6 checks) |
| Notice in an Eighth Schedule language (s.5(3)) | `/legal/privacy?lang=hi|mr` — key-points summary in Hindi and Marathi (`lang`, `hrefLang`), English full text operative, translations flagged pending legal-cell review | e2e `L-G2:`, `legal-i18n.test.ts` |
| Consent = clear affirmative act, recorded (s.6) | Two mandatory checkboxes; **server** rejects `acceptPolicy≠true` / `adult≠true` (zod `z.literal(true)`); `PolicyAcceptance(userId, policyKey, version, acceptedAt)` written in the signup transaction; ledger `ACCOUNT_CREATED` meta carries the versions; `GET /api/legal/acceptance` shows the user their artefact | e2e `signup without accepting the notice → 400`, `consent artefact stored …`; unit tests `legal.test.ts` |
| Withdrawal as easy as giving (s.6(4)) | Per-doctor revoke = one tap on *Access & trust*; account-level = *Erase my data* | existing consent e2e + purge |
| Purpose limitation / minimisation (s.4, s.6(1)) | No IP/UA stored with acceptance; no analytics; DOB optional; a single strictly-necessary cookie | `grep` for trackers = none; `next/font/local` |
| Children (s.9, r.10) | Adult attestation + DOB gate at signup → `400 minor_needs_guardian`; **F13 dependents**: an adult guardian (DOB ≥ 18, self-declared — see L-G4) adds under-18 dependents, consents on their behalf (`PolicyAcceptance.acceptedByUserId`), switches into the profile under a new server session, every action ledgered under the guardian; no profiling/ads anywhere; the doctor screen labels dependent profiles | e2e `F13:` (13 checks: not_a_minor, guardian_not_adult, switch, no nesting, stranger 404, ledger) |
| Right to access / portability (s.11) | FHIR R4 export, ledger view | F4 e2e |
| Right to correction & erasure (s.12) | Editable profile; `src/lib/erasure.ts` (patient data deleted, doctor prose redacted, inbox + nominee deleted, user anonymised, ledger kept) | purge e2e; retention sweep test (2 accounts erased, second run no-op) |
| Grievance redressal (s.13) | **In-app grievance desk**: `/legal/grievance` form (categories incl. doctor appeal & security) → `Grievance` table with a 30-day `dueAt` → `/admin/grievances` queue (overdue first) → status/resolution → complainant notified in-app; ledger `GRIEVANCE_OPENED/UPDATED`; admins notified on filing; filing is allowed even while re-consent is pending; 10/10 min per user | e2e `L-G1:` (12 checks) |
| Nomination (s.14) | `PUT/GET/DELETE /api/patient/nominee`, form on *Access & trust*, ledger `NOMINEE_SET/CLEARED`, erased with the record | e2e `nominee saved (DPDP s.14)` |
| Reasonable security safeguards (s.8(5), r.6) | async scrypt N=2¹⁷, lockout + admin unlock, **server-side sessions** (revocable, device list, sign-out-everywhere), **rate limiting** per IP/user, signed HttpOnly cookies, Origin check, RBAC in SQL, statement timeouts, CSP `frame-ancestors`, HSTS (Vercel), hash-chained append-only ledger verified daily, **break-glass review queue with auto-suspension**, encryption at rest (Neon) | `/api/health`, `/api/cron/daily`, e2e `D2/D8/D9/D14/D41:` |
| Logs retained ≥ 1 year (r.6(1)(e)) | `AuditLog` is UPDATE/DELETE-blocked by trigger; erasure never touches it | `schema/sql/ledger.sql` |
| Erase when purpose served (s.8(7)) | Demo retention: self-registered accounts erased after `DEMO_RETENTION_DAYS` (7) by the daily cron; `@demo.in` reserved for seeded identities and refused at signup so nobody can hide under the exemption | cron response `retention{due,patients,doctors}`; e2e `reserved_domain` |
| Breach intimation (r.7) | **Tooling** (`/admin/incidents`): open an incident (72-h Board clock starts at `detectedAt`) → one-click intimation to affected users (all patients / all users / listed emails; nature, extent, timing, advice; dependents routed to guardians) → cause + remediation → `boardNotifiedAt` → downloadable r.7(2) JSON report with the intimation count; ledger `INCIDENT_OPENED/NOTIFIED/UPDATED`. Email/SMS leg still needs a provider (F9). Runbook = §4 | e2e `L-G5:` (8 checks) |
| Cross-border transfer (s.16) | Disclosed: Vercel `sin1` + Neon Singapore; no restricting notification applies as at version date; Mumbai cutover scripted (F21) | `/legal/privacy` §5 |
| Data Processor contracts (s.8(2)) | Vercel and Neon standard DPAs apply by ToS acceptance; listed in the notice | `PROCESSORS` |

## 3. Not compliant yet / honest gaps

| # | Gap | Why it matters | Plan |
|---|---|---|---|
| ~~L-G1~~ | ~~No working grievance channel~~ **Closed in code**: in-app desk with SLA, queue, ledger, notifications. **Still needs the team:** a named Grievance Officer + monitored mailbox (`NEXT_PUBLIC_GRIEVANCE_OFFICER/EMAIL`) for people who cannot sign in | r.3 wants a published contact | set the two env vars → redeploy (2 min) |
| L-G2 | Notice **summary** in Hindi/Marathi shipped (`?lang=hi|mr`); **full** notice and UI still English; translations not yet reviewed by a lawyer | s.5(3) option to access the notice in a Scheduled language | F15-b full translation + legal-cell sign-off |
| ~~L-G3~~ | ~~No re-acceptance flow~~ **Closed (L2)**: banner + 428 gate + one-click re-accept, ledgered | — | — |
| L-G4 | Guardian flow shipped (F13) but the guardian's adulthood is checked against a **self-declared DOB**, not a verifiable ID/DigiLocker token | r.10 asks for due diligence via reliable identity/age details or a virtual token | DigiLocker age token (F13-b); until then say "self-declared" everywhere (we do) |
| ~~L-G5~~ | ~~Breach runbook is a document~~ **Closed in code**: incident register, mass intimation, 72-h clock, r.7(2) report. Email/SMS leg needs a provider | — | F9 provider key from the team |
| L-G6 | Data sits in **Singapore** | Allowed today; sectoral rules for health data could tighten | F21 Supabase Mumbai (needs the account owner's session-pooler URI) |
| ~~L-G7~~ | **Closed as far as possible:** approval is a recorded attestation (register checked + "name and number matched" + admin + date) stored on the doctor row and in the ledger; the UI never says "NMC verified" | An official IMR/HPR lookup API still does not exist; scraping the registers is deliberately not done | HPR verification when ABDM credentials exist |
| ~~L-G8~~ | **Closed:** original files are stored — encrypted (AES-256-GCM, key outside the DB), quota-limited, downloadable only by the patient or under a FULL-record consent through 60-s links, every open ledgered, erased with the account; notice v2026-09-29 discloses it (inventory row + §9) | — | object storage with the same envelope when volume demands |

## 4. Breach runbook (the human steps around `/admin/incidents`)

0. Open the incident on `/admin/incidents` the moment it is detected — the 72-hour Board clock starts from `detectedAt`, and every later step is ledgered against it.
1. Contain: rotate `SESSION_SECRET` (signs everyone out), rotate DB password, disable the affected account(s) (`status='SUSPENDED'`).
2. Scope from the ledger: `SELECT * FROM "AuditLog" WHERE "createdAt" BETWEEN … AND actorId IN (…)` — the chain is the evidence; verify it first (`SELECT * FROM ledger_verify()`).
3. Tell affected users **without delay**: "Notify all patients / listed emails" on the incident (nature, extent, timing, advice land as a CRITICAL inbox notice) + registered email/phone once a provider exists.
4. Tell the Data Protection Board of India: initial intimation without delay; detailed report within **72 h** — fill cause/remediation on the incident, press "Board notified now", download the r.7(2) report and send it.
5. Write the post-mortem into `DRAWBACKS_AND_BUGFIXES.md`.

## 5. Demo-specific rules (this deployment)

- Seeded people are fictional; registration numbers like `MMC/2024/98765` are synthetic and labelled as demo data.
- Banner on every page; signup form repeats it; accounts self-registered are erased after 7 days by `/api/cron/daily` (02:30 IST) — ledger entry `DATA_ERASED reason=demo_retention`.
- `CRON_SECRET` protects the job (401 without it, 503 if unset). Vercel marks it *sensitive*, so `vercel env pull` returns a placeholder — keep the real value in the team password manager; the local `.env.local` copy is what the deploy script set.
- No real patient data may be entered — Terms §3. If someone does, the erasure path exists and the sweep is the backstop.
