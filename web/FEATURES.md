# CityCare — Feature programme (what a professional version needs, in the order it pays off)

Status legend: ✅ live & tested · 🔧 in progress · ⏭ next · 💡 later. Each shipped feature has unit tests
(`npx vitest run`) and end-to-end checks (`node scripts/e2e.mjs`), and is logged in `DRAWBACKS_AND_BUGFIXES.md`.

## Stack (latest, verified 28 Sep 2026)

| Layer | Version | Note |
|---|---|---|
| Next.js | **16.3.6** (Turbopack) | App Router, RSC, `next/font/local` |
| React | **19.3.0** | Server Components + `react-hooks` purity lint |
| TypeScript | **7.0.2 native `tsc`** (1.5 s full check) + **6.0.2 API** | Official side-by-side recipe: `typescript` → `@typescript/typescript6`, `@typescript/native` → `typescript@7`. TS 7 has no programmatic API yet, so typescript-eslint and Next's checker use TS 6 |
| Tailwind CSS | **4.3.3** | CSS-first config, design tokens in `globals.css` |
| Motion (Framer) / GSAP / Lenis | 13.4.4 / 3.15.0 / 1.3.26 | Motion for UI, GSAP+ScrollTrigger+MotionPath for the landing, Lenis on the landing only |
| PostgreSQL | 17 local · 18.6 Neon · 17 Supabase | raw `pg` 8.23, hash-chained ledger in plpgsql |
| Zod / jose | 4.6.5 / 6.2.12 | validation / HS256 sessions |
| Vitest | 4.1.11 | **Vitest 5.0.2 is blocked**: npm 10.8's resolver crashes (`edgesOut` of null) on its optional-peer graph in this tree; retry when npm ≥ 11 is available in the sandbox |
| ESLint | 9.39.5 | **ESLint 10.11 is blocked**: `eslint-plugin-react` 7.37.5 (pulled in by `eslint-config-next`) still calls the removed `context.getFilename()`; upgrade when eslint-plugin-react ≥ 8 ships |
| Node | 20 sandbox · 22/24 on Vercel (`engines.node >=20.9`) | `/admin/system` shows the live runtime |

## Shipped this round

| # | Feature | What it does | Proof |
|---|---|---|---|
| F1 | **Doctor verification workflow** | Doctor signup requires a medical-council registration number (+ optional 14-digit HPR ID). New doctors are *invisible to patients, unbookable and cannot open any record* until an admin (`admin@demo.in`) approves in `/admin`. Every decision → ledger `DOCTOR_VERIFIED/REJECTED` + inbox notice; rejection needs a reason; doctor sees a banner | 9 e2e checks (`F1:`), 6 unit tests |
| F2 | **Break-glass emergency access** | Verified doctor with no consent can open the full record for **60 min** with a mandatory ≥20-char reason + explicit confirmation; max 3/doctor/24 h; refused if a consent is already live. Reason lands on the consent, in the tamper-evident ledger (`EMERGENCY_ACCESS`) and as a CRITICAL inbox alert; patient sees a red badge in *Access & trust* and can revoke instantly | 9 e2e checks (`F2:`), 4 unit tests |
| F3 | **Notifications inbox + live bell** | `/patient|doctor|admin/notifications`, unread badge in tabs, header bell polling a partial-index count every 30 s (pauses in hidden tabs), mark-all-read, deep links, severity | 5 e2e checks (`F3:`) |
| F4 | **FHIR R4 export** | `GET /api/patient/fhir` → `application/fhir+json` collection Bundle (Patient, AllergyIntolerance, Condition, MedicationStatement, Encounter, Observation with reference ranges). Drafts excluded, no nulls, export logged (`EXPORT_FHIR`). Button on *Records* | 4 e2e checks, 3 unit tests |
| — | **Doctor "Patients" page** (R16) | Every patient who booked or shared, with the *current* consent verdict computed in SQL on the DB clock, next appointment, last visit, read count, search | page render check |
| — | **Admin "System" page** | DB version/timezone/statement_timeout, ledger rows + chain breaks, live consents, emergency count, runtime | page render check |
| — | **Migrations folder** | `schema/migrations/*.sql`, idempotent, applied by `db-bootstrap.sh` on every deploy | bootstrap output |
| **L1** | **Legal & compliance pack** (DPDP Act 2023 / Rules 2025, IT Act SPDI, NMC ethics, Copyright) | Stand-alone itemised **privacy notice**, **terms**, **grievance & rights** and **open-source licences** pages (`/legal/*`, linked from every footer); signup now needs a **recorded consent artefact** (`PolicyAcceptance` table, version-stamped, server-enforced) + **adult attestation** and refuses **under-18 DOB** (s.9); **nominee** (s.14) API + form; **demo banner** + **7-day retention sweep** for self-registered accounts (`/api/cron/daily`, `CRON_SECRET`, ledger `DATA_ERASED reason=demo_retention`); `@demo.in` reserved; **licence gate** in the deploy script (361 prod packages, no copyleft); clinical **disclaimers** on doctor/patient record views; erasure now also deletes inbox + nominee and shares one implementation (`src/lib/erasure.ts`); false "7-year retention" copy fixed. Register: `LEGAL_COMPLIANCE.md` | 20 e2e checks (`L1:`), 8 unit tests, live cron verified |

| **L2** ⚖ | **Re-acceptance on notice change** | Bump `PRIVACY_NOTICE_VERSION` → every signed-in page shows a banner with the diff link and a one-click accept; **mutations return 428 `consent_outdated`** until accepted (reads, logout, grievances and dependent switch-back stay open); `GET/POST /api/legal/acceptance`; ledger `POLICY_ACCEPTED` | 6 e2e checks (`L2:`) |
| **F7** | **Server-side sessions** | `Session` table; every JWT carries `sid`; `getViewer` joins the live row; `POST /api/auth/logout {everywhere:true}`; `GET /api/auth/sessions` (device list, current flag); purge/erasure revokes every session; async scrypt (event loop free); old `sid`-less cookies are treated as anonymous | 7 e2e checks (`D2/D14:`), 3 unit tests |
| **F8** | **Rate limiting** (Postgres fixed window, no new service) | login 60/10 min/IP, signup 20/h/IP, emergency 10/h, grievance 10/10 min/user, acceptance 30/h, dependents 20/h → 429 `rate_limited {retryAfterSec}`; windows pruned daily | 2 e2e checks (`D8:`), 3 unit tests |
| **L3** ⚖ | **Grievance desk** (DPDP s.13) | `/legal/grievance` form → `/admin/grievances` queue, 30-day SLA with overdue flag, categories (access/correction/erasure/consent/security/doctor appeal), status + resolution, complainant notified, everything ledgered (`GRIEVANCE_OPENED/UPDATED`), admins notified on filing; works while the notice is outdated | 12 e2e checks (`L-G1:`) |
| **L4** ⚖ | **Breach register** (DPDP Rules r.7) | `/admin/incidents`: open → one-click notification of affected users (all patients / all users / listed emails; one `INSERT…SELECT`, dependents routed to guardians) → cause & remediation → Board-notified timestamp with a **72-hour deadline** and overdue flag → downloadable structured r.7(2) report | 8 e2e checks (`L-G5:`) |
| **F7-b** | **Break-glass review queue** | `/admin/emergencies`: every override with read count and the doctor's 7-day tally; JUSTIFIED/UNJUSTIFIED verdict (note required for unjustified), ledgered `EMERGENCY_REVIEWED`, both parties notified; **2 unjustified → auto-suspend** (`DOCTOR_SUSPENDED`); >3/7 d flagged | 7 e2e checks (`D41:`) |
| **F13** ⚖ | **Dependents (minors & guardians)** (DPDP s.9, Rules r.10) | Adult guardian (DOB-checked, self-declared — stated honestly) adds up to 6 under-18 dependents; login-less child user (`'!'` password), guardian **switches** into the profile (new server session, `actingFor`), header badge + switch-back, every action ledgered under the guardian (`DEPENDENT_ADDED/SWITCH`), notifications routed to the guardian, doctor sees a "dependent — guardian consents" note, policy acceptance recorded with `acceptedByUserId`; no nesting; purge of the guardian erases dependents (`DEPENDENT_ERASED`) | 13 e2e checks (`F13:`) |
| **F5** | **Longitudinal trends — self-reported readings** (the `Observation` table, dead since the baseline, is wired for the first time) | Patient logs glucose / BP / peak flow / weight (`POST /api/patient/observations` — Zod: finite values, plausible magnitude, no date >2 days ahead, `refLow < refHigh`; `OBSERVATION_ADDED/DELETED` on the patient's ledger; DPDP correction via delete, other patients' UUIDs → 404). *Records* gains a Trends card: hand-rolled **SVG sparkline with the reference band shaded** (zero libraries), per-series direction + Δ + rate/month, "Log a reading" form (known-measurement presets with sensible default bands), recent-readings list with remove. Doctor workspace shows the same sparklines **read-only and consent-scoped exactly like labs** (`applyScope`: SUMMARY_ONLY hides, LAST_N keeps unlinked + in-window, SPECIFIC_CONDITION in-window only). Direction is decided in one pure deterministic module (`src/lib/trends.ts`): <2 points → "insufficient"; no band → neutral rising/falling (never a clinical claim); ≤5% relative → stable; out-of-band → in-band → improving; mixed units dropped and counted; inconsistent stored bands discarded, never "corrected". Seed: 21 rows over 4 realistic series (ramesh HbA1c 9.4→7.9 vs target ≤7%, fasting glucose 212→149, BP 162→141; anita peak flow 300→358 into band) | 21 unit tests (`trends.test.ts`, `scope.test.ts` extended), 15 e2e checks (`F5:`), migration `0005` |
| **F15** ⚖ | **Hindi / Marathi legal summary** (DPDP s.5(3)) | `/legal/privacy?lang=hi|mr`: key points in Devanagari with `lang`/`hrefLang`, English full text operative, "pending legal-cell review" flag; unit test keeps numbers (30 days, 7 days, 60 min) in sync with code | 3 e2e checks, 5 unit tests |
| — | **Admin unlock** | `/admin/system` lists locked accounts with minutes left; `POST /api/admin/users/[id]/unlock` (ledgered `ACCOUNT_UNLOCKED`, user notified) | 5 e2e checks (`D9:`) |
| — | **Ledger pagination** | `GET /api/patient/ledger?before=<seq>&limit=` keyset paging + "Load older entries"; chain verdict computed once; account-level events (policy, unlock, grievances) now visible to the patient (A57) | 3 e2e checks (`D37:`) |
| — | **Cron housekeeping** | daily job also prunes expired sessions + stale rate-limit windows and stops erasures after a 20 s budget (`deferred` reported) |
| **F12** ⚖ | **Documents — real files** (D4/L-G8) | `POST /api/patient/documents` multipart (PDF/JPEG/PNG by magic bytes, 3 MB/file, 30 MB/patient); AES-256-GCM per file under `DOCUMENT_KEY` (outside the DB); 60-s viewer-bound HMAC links; downloads only under `FULL_RECORD`; `UPLOAD_DOC`/`DOWNLOAD_DOC`/`DELETE_DOC` in the patient's ledger; blobs cascade on erasure; Files card on Records + doctor workspace | e2e `D4:` (12 checks), `storage.test.ts` |
| **F9** | **Account recovery** (D3/D9) | 8 one-time recovery codes (hashed per user, shown once), `/recover`, `POST /api/auth/recover`; e-mail verification + forgot/reset by 6-digit code through `Outbox` → Resend when `RESEND_API_KEY`/`EMAIL_FROM` exist (UI states when e-mail is unavailable); every reset clears lockout + revokes all sessions; Security card on patient Access and doctor dashboard | e2e `D9:`/`D3:`, `recovery.test.ts` |
| **F13-b** ⚖ | **Handover at 18** (D49) | `POST /api/patient/dependents/[id]/handover` re-credentials the same User row, unlinks the guardian, revokes acting sessions, withdraws the on-behalf acceptance (adult accepts personally → 428 first), cron reminder to guardians; "Hand over (18+)" button | e2e `D49:` (9 checks) |
| — | **Ledger anchoring** (D13) | nightly Ed25519 signature of the chain head + OpenTimestamps submission; `/legal/transparency`, `GET /api/ledger/anchors`, `/api/ledger/anchors/[seq]/ots` | e2e `D13:` (independent signature recompute), `anchors.test.ts`; live anchor #9 accepted by `a.pool.opentimestamps.org` |
| — | **Slot capacity + live grid** (D6/D7) | `maxPerSlot` 1–6 is real capacity with per-seat unique index; picker re-fetches every 45 s / on focus / after `slot_full` | e2e `D6:`, `slots.test.ts` |
| — | **Verification attestation** (D12/L-G7) | approve = register checked (NMC IMR / state council / HPR) + "name and number matched" checkbox, stored + ledgered | e2e `D12:` |
| — | **Sliding sessions** (D52), **multipart CSRF** (D22), **cold-start warm-up** (D31), `/api/health` config facts, CI workflow file (F19, unrun), **psql-free DB bootstrap** (`scripts/db-bootstrap-node.mjs` — same steps/asserts as the shell script, for machines without psql) | — | e2e `D31:`; node script run on a fresh DB (35 tables + seed + 0 breaks, idempotent re-run, exit 0) | live cron output |

## Next (in order — each is one focused session)

Every row must pass the four legal questions in `LEGAL_COMPLIANCE.md` §0 before it ships
(lawful basis · notice/inventory updated · rights still work · new processor/script audited).
Legal-driven items are marked ⚖.

| # | Feature | Why it matters | Effort |
|---|---|---|---|
| F6 | **Passkeys (WebAuthn)** login alongside password | phishing-resistant, passwordless — the strongest "advanced security" story for a health app; `@simplewebauthn` | 1 day |

| F10 | **PWA**: manifest, icons, offline shell, install prompt | "app-like" on phones without a store | ½ day |
| F11 | **Client-side OCR** with `tesseract.js` (WASM in the browser; image never uploaded) → existing DRAFT pipeline | the plan's OCR promise, privacy-preserving | 1 day |

| F13-b ⚖ | ~~Dependent claims own account at 18~~ **shipped** · DigiLocker age token for the guardian still open (needs DigiLocker partner credentials) | closes r.10 due diligence | ½ day once credentials exist |
| F15-b ⚖ | **Full Marathi/Hindi translation** of the notice + patient screens (`next-intl`), reviewed by the legal cell | completes s.5(3) | 1 day |
| F14 | **Drug-class expansion** (RxClass export: β-lactams, NSAIDs, sulfonamides, ACE-i) + curated interaction pairs | fewer false negatives in the safety engine | 1 day |
| F16 | **Dark mode** (tokens already CSS variables) | polish | 2 h |
| F17 | **QR consent at the clinic**: patient shows a QR, doctor scans → scoped consent request | walk-in flow without typing | ½ day |
| F18 | **Print / PDF visit summary** (print stylesheet + `window.print`) | what patients actually ask for | 2 h |
| ~~F19~~ | **CI** (GitHub Actions: vitest + build + e2e against a Postgres service) + 5 Playwright smoke flows | stops regressions | ½ day | **Workflow file written (`.github/workflows/ci.yml`); repo remote created 2026-10-31, but the 2026-10-31 push produced a 0-second failure with no log → GitHub Actions is disabled for this repo (see D59). The identical local sequence was re-run green in the sandbox the same day. Owner: enable Actions in repo settings, then re-push. Playwright flows still open.**
| F20 | **Ledger root-hash anchoring** (daily hash to an external place) + least-privilege DB role | tamper-*proof*, not just tamper-evident | ½ day |
| F21 ⚖ | **Supabase Mumbai cutover** (`scripts/supabase-cutover.sh`) | data residency (L-G6); needs the session-pooler URI from the account owner | 10 min |

Deliberately **not** on the list: LLM-generated clinical summaries (see `../AI_ACCURACY_AND_HALLUCINATION.md` — only as suggestions with provenance, after F12), blockchain (the hash-chained ledger already gives tamper evidence without a network), ABDM certification (sandbox demo only).
