# CityCare implementation ledger

Created 2026-11-04: the tracker and `CITYCARE_PHASE0_PRODUCT_DISCOVERY.md` named in the
owner's instructions were absent from this checkout at HEAD `357440e146a82654b61a643f7eb064f5dd905b4f`.
No previous tracker entries were available to copy. The owner-provided A-1 report is not
independently verified here: no TOTP code or uncommitted A-1 changes were found. A-1 was
not changed. This ledger does not replace the missing discovery document.

## A-2 — Grievance Officer Identity (NG-F02)

- **Priority:** High / P1. **Status:** ACCEPTED by owner on 2026-11-04, with documented limitations.
- **User problem:** Patients and independent doctors need a transparent, reachable contact
  for grievances; absent configuration must not be presented as an appointed officer.
- **Workflow:** Anyone can view the privacy and grievance notices. A valid configured name
  and mailbox are displayed together; otherwise both are withheld with an explicit notice.
  Signed-in users retain the existing grievance desk. Existing admin queue and reviews are
  unchanged; there is no in-app officer-configuration UI or write API.
- **Risk / limitations:** Syntactic validation does not verify appointment, deliverability,
  monitoring or legal compliance; an external route for users unable to sign in remains
  unpublished without owner-provided values. Mailbox syntax is deliberately conservative.
  Hindi/Marathi full translations and human legal review remain separate work. No clinical
  decision making or clinical data processing is added. Environment values are public.
- **Dependencies:** Owner must appoint a person and supply a public name plus monitored
  mailbox in `NEXT_PUBLIC_GRIEVANCE_OFFICER` and `NEXT_PUBLIC_GRIEVANCE_EMAIL`. Existing
  grievance queue and permissions remain in place. No external mail delivery is implemented.
- **Files:** `web/.env.example`, `web/src/lib/legal.ts`,
  `web/src/lib/grievance-contact.ts`, `web/src/components/grievance-contact.tsx`,
  `web/src/app/legal/grievance/page.tsx`, `web/src/app/legal/privacy/page.tsx`,
  `web/src/lib/__tests__/grievance-contact.test.ts`, `web/scripts/e2e-grievance-contact.mjs`,
  `web/scripts/e2e-grievance-authorization.mjs`,
  `web/FEATURES.md`, `web/DRAWBACKS_AND_BUGFIXES.md`, `CITYCARE_IMPLEMENTATION_LEDGER.md`.
- **Database:** No schema change or migration. No production access or deployment.
- **Authorization/security:** Configuration is deployment environment only; no user-facing
  write endpoint. React escapes display text; email is validated and encoded in the link.
  Synthetic HTTP POST attempts to both notice pages do not alter contact details. The
  database-backed patient, doctor, anonymous and admin checks below passed.
- **Evidence:** In `web/`: `npm test` — 341 passed, 0 skipped (26 files);
  `npx tsc --noEmit -p .` — passed; `npm run lint` — passed;
  `VERCEL_ENV=development DATABASE_URL='' NODE_OPTIONS=--max-old-space-size=1150 npm run build`
  — passed, prebuild explicitly performed no DB work. With three separately started local
  built servers on ports 3101/3102/3103, respectively configured with synthetic valid,
  missing, and invalid values, `CASE=configured BASE=http://127.0.0.1:3101 node scripts/e2e-grievance-contact.mjs`,
  `CASE=missing BASE=http://127.0.0.1:3102 node scripts/e2e-grievance-contact.mjs`, and
  `CASE=invalid BASE=http://127.0.0.1:3103 node scripts/e2e-grievance-contact.mjs` — each
  12 passed, 0 skipped. Initially the notice POST test expected 405; Next.js returned 200
  without performing a mutation. The test was corrected to verify the observable unchanged
  configuration and then passed. No sensitive values logged.
- **Historical status:** At the first implementation report the full DB-backed suite had
  not run because PostgreSQL was not installed; the follow-up verification below supersedes
  that limitation without erasing the original evidence.
- **Acceptance:** configured/missing/invalid contact, local unauthorized mutation and
  existing database-backed workflow checks pass. Owner-provided real contact NOT PROVIDED.
  Owner accepted with documented limitations on 2026-11-04.
- **Next feature:** A-3 NG-F03 / D17 Hindi and Marathi journeys, only after A-2 completion
  and explicit owner review. Requires human review of legal translations.

### 2026-11-04 — final verification follow-up

- **Environment:** downloaded PostgreSQL 17.11 binaries into a separate temporary workspace,
  initialized a fresh local cluster bound to 127.0.0.1:5432, and created `citycare_e2e` solely
  for synthetic fixtures. The existing node bootstrap applied the repository schema, ledger,
  constraints and migrations 0001–0007 locally; it verified 36 tables and seeded 11 demo
  users. Temporary keys and local backups were held outside the repository. No remote DB or
  production migration was used.
- **Bootstrap:** after sourcing the private test environment, `FORCE_SEED=1 node
  scripts/db-bootstrap-node.mjs` — passed. `VERCEL_ENV=development RETENTION_POLICY=demo
  DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150 npm run
  build` — passed; prebuild reported no DB work.
- **Full E2E:** after sourcing the private test environment and unsetting `VERCEL_ENV`,
  `BASE=http://127.0.0.1:3101 node scripts/e2e.mjs` — 396 passed, 0 failed, 0 skipped.
  The built server used a configured synthetic contact and the local test database. The
  suite covered submission, validation, admin queue/review, patient notification,
  patient denial of admin queue access, and GRIEVANCE_OPENED/UPDATED ledger visibility.
- **Additional role and integrity verification:** after sourcing the private test
  environment, `CITYCARE_SYNTHETIC_TEST=1 node scripts/e2e-grievance-authorization.mjs`
  — 26 passed, 0 failed, 0 skipped. Anon requests were denied; a patient and doctor were
  denied queue/update access; each patient/doctor saw only their own grievances; the admin
  resolved the complaint; one open and one update event existed and ledger_verify was clean.
  The script is restricted to the explicit synthetic local database and uses seeded demo
  identities. It creates synthetic test grievances and must never run against shared data.
- **Contact regression:** `CASE=configured BASE=http://127.0.0.1:3101 node
  scripts/e2e-grievance-contact.mjs`, `CASE=missing BASE=http://127.0.0.1:3102 node
  scripts/e2e-grievance-contact.mjs`, and `CASE=invalid BASE=http://127.0.0.1:3103 node
  scripts/e2e-grievance-contact.mjs` — each 12 passed, 0 failed, 0 skipped.
- **Other checks:** `npm run lint` and `npx tsc --noEmit -p .` passed; `npm test` —
  341 passed, 0 skipped.
- **First full-suite attempt:** 390 passed, 6 failed on local PostgreSQL 18 / port 55477.
  PostgreSQL 18 returned 23001 instead of the suite's 23503 expectation (2); two tests
  assumed port 5432; inherited VERCEL_ENV caused one false expectation; and a build without
  demo retention produced a static terms mismatch. The suite passed unchanged after using
  PostgreSQL 17 / port 5432, the CI-compatible build policy, and removing VERCEL_ENV from
  the suite environment. No A-2 application defect or code change was required.
- **Remaining limitations:** Actual officer appointment and monitored mailbox are owner
  responsibilities; deliverability, legal review and production configuration were not
  verified. Audit existence and chain consistency were tested, not crash atomicity; existing
  grievance audit appends remain outside the business transaction (documented D74).
  Production deployment and real-patient behavior were NOT TESTED.

## A-3 — Hindi and Marathi Patient + Doctor Journeys (NG-F03 / D17)

- **Priority:** Approved A-3. **Status:** IN PROGRESS — not implemented or accepted.
- **Problem:** Patients and independent doctors need understandable healthcare and
  consent workflows in Hindi and Marathi. Existing translations cover only the
  privacy-notice summary; most workflows and the operative notice remain English.
- **Workflows covered so far:** The existing public privacy-summary language links
  continue to work. The retention statement now reflects the configured sweep and
  days in English, Hindi and Marathi instead of showing a fixed seven-day claim in
  Hindi and Marathi. At that point no preference switch was enabled; see A-3.1 below.
- **Remaining workflows:** Full registration, authentication, patient and doctor
  dashboards, records, consent, appointments, notifications, grievance and error
  journeys; appropriate admin workflows; consistent switching and preference.
- **Files (A-3 only):** `web/src/lib/legal-i18n.ts`,
  `web/src/app/legal/privacy/page.tsx`, `web/src/lib/__tests__/legal-i18n.test.ts`,
  `web/scripts/e2e-privacy-locales.mjs`, `CITYCARE_IMPLEMENTATION_LEDGER.md`.
- **Database:** None; no schema or migration. **Authorization:** Existing auth,
  role and consent logic unchanged; DB-backed security regression NOT RUN this turn.
- **Tests (from `web/`):** `npm test` — 345 passed, 0 skipped;
  `npx tsc --noEmit -p .` and `npm run lint` — passed;
  `VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1
  NODE_OPTIONS=--max-old-space-size=1150 npm run build` — passed, no DB work.
  `CASE=enabled BASE=http://127.0.0.1:3111 node scripts/e2e-privacy-locales.mjs`
  and `CASE=disabled BASE=http://127.0.0.1:3112 node scripts/e2e-privacy-locales.mjs`
  — 11 passed, 0 failed, 0 skipped each, against separately configured local servers.
  Initial `npm test` before dependency install failed because vitest was absent;
  `npm ci --no-audit --no-fund` installed dependencies and the rerun passed.
- **Accessibility:** Existing summary marks its language with `lang`, and the HTTP
  check verifies it; no comprehensive keyboard, screen-reader, contrast, long-text or
  responsive accessibility audit was run. Root document remains English.
- **Limitations:** Legal/clinical translations and the new translated retention text
  need qualified human review. The English notice is the operative text. No full
  translation completeness checks or language preferences existed in that initial slice.
  Full DB-backed E2E, patient/doctor authorization and browser accessibility tests were
  NOT RUN in that initial slice; see A-3.1 for subsequent verification.
- **Next:** Complete A-3 only; A-4 is not started. Owner review after A-3 completion.

### A-3.1 — Localization foundation (2026-11-04)

- **Status:** ACCEPTED by owner, as stated in the A-3.2 authorization; A-3 overall
  remains IN PROGRESS and NOT ACCEPTED. **Priority:** A-3 foundation.
- **User problem / workflow:** A shared locale selector allows a user to choose English,
  Hindi or Marathi for future translated controls. It explicitly says most pages remain
  English. It does not yet translate patient/doctor journeys. Native select, associated
  label and `aria-describedby` provide a basic keyboard/screen-reader structure.
- **Architecture:** `src/lib/i18n.ts` is the shared locale registry and typed,
  namespace/key catalog; `useLocale` exposes the selected locale and typed `t` function.
  English is the default and fallback. Missing locale entries are listed by
  `missingMessages` and warned about in non-production; unknown keys throw. Coverage
  status explicitly marks `common` foundation-only and `auth`, `patient`, `doctor`,
  `records`, `consent`, `appointments`, `notifications`, `privacyGrievance`,
  `validation`, `errors` not-started. The keys are starter labels, not a complete
  inventory of all text. Existing legal-summary text retains its own structured data
  but shares locale definitions and retains the existing query-string selector.
- **Persistence:** `citycare.locale` in localStorage, per browser/origin, not per user or
  device; invalid values default to English. Blocked storage falls back to in-memory
  preference for the current page. Same-tab and other-tab change notifications supported.
  Server rendering initially uses English and hydrates to the saved locale. No session
  cookie, request header, patient data or server-side permission is changed.
- **Files (A-3.1):** `web/src/lib/i18n.ts`, `web/src/lib/locale-preference.ts`,
  `web/src/components/use-locale.ts`, `web/src/components/language-switcher.tsx`,
  `web/src/app/layout.tsx`, `web/src/lib/legal-i18n.ts`,
  `web/src/lib/__tests__/i18n.test.ts`, `CITYCARE_IMPLEMENTATION_LEDGER.md`.
  The prior A-3 retention function and tests were retained; legal-i18n now imports the
  shared locale definitions. No database changes or migrations.
- **Tests, from `web/`:** `npm test` — 361 passed, 0 failed, 0 skipped (27 files);
  `npx tsc --noEmit -p .` — passed; `npm run lint` — passed;
  `VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1
  NODE_OPTIONS=--max-old-space-size=1150 npm run build` — passed, no database work.
  Tests cover English default, hi/mr, invalid values, storage, missing keys and warning,
  unknown keys, switch event behavior, no fetch from switching, markup and retention.
  The first unit run had 360 pass / 1 fail because a test invoked a hook component as a
  plain function; rendering it as a React element fixed the test; final run passed.
- **Synthetic integration:** `FORCE_SEED=1 node scripts/db-bootstrap-node.mjs` against a
  fresh loopback PostgreSQL 17.11 cluster and synthetic `citycare_e2e` DB — passed; after
  sourcing a private local test env and unsetting VERCEL_ENV,
  `BASE=http://127.0.0.1:3111 node scripts/e2e.mjs` — 396 passed, 0 failed, 0 skipped.
  This covers existing auth/role/consent checks in the default presentation; it does not
  exercise locale switching in a real browser. Separately on local test servers,
  `CASE=enabled BASE=http://127.0.0.1:3112 node scripts/e2e-privacy-locales.mjs` and
  `CASE=disabled BASE=http://127.0.0.1:3113 node scripts/e2e-privacy-locales.mjs` —
  each 11 passed, 0 failed, 0 skipped. No production DB or real data used.
- **Limitations:** Full translations, date/number formatting, complete catalog coverage,
  legal/clinical human review, screen-reader and responsive browser checks remain open.
  The preference does not change the existing legal-summary query parameter; users select
  that summary independently. `html` remains English because the journeys are English;
  the preference control marks its own language. Real-browser persistence and auth/role
  behavior while switching were NOT TESTED.
- **Next exact milestone:** A-3.2 patient journey, only after owner approval. A-4 not started.

### A-3.2 — Patient journey (NG-F03 / D17), work in progress

- **Status:** IN PROGRESS, not implemented or accepted. Owner authorized A-3.2 and
  accepted A-3.1. Do not start A-3.3 until A-3.2 is complete and approved.
- **User problem:** Patients need understandable, end-to-end access to their records,
  consents, appointments and grievances in Hindi or Marathi without changing their
  permissions. Current patient screens and notification/clinical text remain English.
- **Scope actually delivered:** The existing privacy-summary component now reads the
  A-3.1 preference when no `lang` query is present. Explicit query links (including
  `?lang=en`) override the preference; invalid explicit values resolve to English.
  It retains the original server-derived retention policy and days, English operative
  notice, and pending-legal-review warning. Global preference switching does not override
  an explicit language link. With JavaScript unavailable the default summary is English.
  This is only a partial privacy workflow, not a translated privacy notice or patient journey.
- **Files (this work):** `web/src/app/legal/privacy/page.tsx`,
  `web/src/components/privacy-summary.tsx`, `web/src/lib/__tests__/privacy-summary.test.ts`,
  `CITYCARE_IMPLEMENTATION_LEDGER.md`. Previous A-2 and A-3.1 changes preserved.
- **Database:** no changes, migrations, or production access. **Security:** server
  auth/consent/record/audit logic unchanged; patient isolation and role/consent
  E2E regressions NOT RUN in this work; no claim that language switching has been
  integration-tested against protected medical records.
- **Tests (from `web/`):** `npm test` — 367 passed, 0 failed, 0 skipped;
  `npx tsc --noEmit -p .` and `npm run lint` — passed;
  `VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1
  NODE_OPTIONS=--max-old-space-size=1150 npm run build` — passed, no database work.
  `CASE=enabled BASE=http://127.0.0.1:3112 node scripts/e2e-privacy-locales.mjs` and
  `CASE=disabled BASE=http://127.0.0.1:3113 node scripts/e2e-privacy-locales.mjs` —
  11 passed each, 0 failed, 0 skipped, synthetic local servers; these are HTTP/SSR tests,
  not browser preference tests. New unit tests check query priority, invalid fallback,
  language tags, explicit link and retention wording.
- **Browser attempt:** `node /home/user/a32-browser/privacy-test.cjs` was attempted with
  isolated npm-installed Puppeteer and Chromium. It did not run: Chromium failed to
  start because system libraries libnspr4.so, libnss3.so and libnssutil3.so are absent.
  Browser persistence, keyboard, screen-reader, contrast and responsive rendering
  therefore remain NOT TESTED. No production data was involved.
- **Unimplemented / remaining:** Complete patient registration, login, dashboard, profile,
  medical records/timeline, document, consent/access, appointment, notifications,
  privacy/grievance, security and all errors/loading states in all three languages;
  locale-aware date and number formatting, translation completeness and actual browser,
  accessibility, security and synthetic DB E2E tests. A-1 TOTP code is not in this
  checkout, so no 2FA translation or 2FA verification is claimed. Clinical and legal
  translations require qualified human review.
- **Next milestone:** finish A-3.2 before A-3.3 Doctor Journey; A-4 not started.

### A-3.2 patient-workflow inventory and document-manager slice

**Status:** IN PROGRESS; neither the document section nor A-3.2 is accepted. The
translated document controls are implemented, but real-browser interaction and
accessibility verification have not run; the containing records page and patient shell
remain English. Do not treat the section or the patient journey as complete.

#### Implementation checklist (inventory from current checkout)

- [ ] **Shared entry/authentication:** `/signup`, `/login`, `/recover`; `warmup`,
  `demo-banner`, `legal-footer`, `reaccept-banner`, `logout-button`, `tabs`,
  `notification-bell`; `/api/auth/*`, `/api/legal/acceptance`, `/api/health`.
- [ ] **Patient shell/dashboard:** `patient/layout.tsx`, `patient/loading.tsx`,
  `patient/page.tsx`; `dependents-panel`, `consent-actions`, shared UI and rule
  warnings (`rules.ts`, `onboard.ts`); `/api/patient/dependents/*`, consents,
  `/api/notifications`, `/api/auth/logout`.
- [ ] **Profile:** `/patient/onboard`, `wizard`, `/api/patient/profile`; validation,
  success, loading and failure messages.
- [ ] **Records/timeline:** `/patient/records`, `photo-paste`, `confirm-draft`,
  `trends`, `print-summary`, `print-button`, `clinical-disclaimer`; `/api/patient/photo`,
  `/api/patient/medications/[id]/confirm`, observations, FHIR and print-summary.
  Clinical alerts and user-entered content are not translated.
- [ ] **Documents:** `document-manager`, `/api/patient/documents`,
  `/api/documents/[id]`, `/api/documents/[id]/link`. This slice implements catalog
  labels, control/error/status text and locale formatting, but is not yet browser-verified.
- [ ] **Consent/access/history/security:** `/patient/access`, `consent-actions`,
  `ledger-panel`, `nominee-form`, `purge-panel`, `security-panel`; consent, ledger,
  nominee, purge, `/api/auth/sessions`, recovery-codes, verify-email and logout APIs.
  This checkout has no A-1 TOTP implementation to translate or test.
- [ ] **Doctors/appointments:** `/patient/doctors`, `/patient/doctors/[id]`,
  `slot-picker`, `DoctorCardMini`, dashboard appointment cards;
  `/api/patient/doctors/[id]/slots`, `/api/patient/appointments`.
- [ ] **Notifications:** `/patient/notifications`, `inbox-page`, `inbox`,
  `notification-bell`; `/api/notifications`, `/api/notifications/read`. Stored
  notifications are generated as English title/body strings in server handlers and
  `notify.ts`; these are not covered by translating display labels alone. Do not
  conflate this with A-4 delivery-provider work.
- [ ] **Privacy/grievance:** `/legal/privacy`, `/legal/grievance`, `privacy-summary`,
  `grievance-contact`, `grievance-desk`; `/api/grievances` and legal acceptance.
  The privacy summary only is partly translated and requires qualified legal review.
- [ ] **Cross-cutting:** API `code`/`error` values from `api.ts`, `session.ts`,
  `validate.ts`, rate-limit and individual route failures; form native validation,
  dates/numbers, errors, loading/empty states, long text, screen-reader and keyboard
  checks. Clinical and legal text require qualified human review.

#### Document slice — implementation and evidence

- **Files:** `web/src/components/document-manager.tsx`, `web/src/lib/i18n.ts`,
  `web/src/lib/document-i18n.ts`, `web/src/lib/__tests__/document-i18n.test.ts`,
  `web/src/app/patient/records/page.tsx`, `CITYCARE_IMPLEMENTATION_LEDGER.md`.
- **Implemented:** English/Hindi/Marathi labels for upload, list, types, actions,
  empty/loading, safe API-code errors, network failure, deletion confirmation and
  result. Dates and sizes use locale formatting. Accessible labels/status roles added;
  load failures have retry, delete failures are no longer silently treated as success.
  User-supplied titles and source file contents are not machine-translated. A doctor
  uses the existing `openDocument` helper unchanged. No schema changes.
- **Authorization:** No server permission/consent code changed. Existing E2E against a
  fresh loopback PostgreSQL 17.11 synthetic DB covers another patient being denied link
  minting (404) and replay (403), doctor scope denial, valid/forged links, upload/download,
  deletion and audit, plus consent revocation followed by immediate 403. It does not
  exercise changing locale in a real browser.
- **Tests from `web/`:** `npm test` — 375 passed, 0 failed, 0 skipped (29 files);
  `npx tsc --noEmit -p .` — passed; `npm run lint` — passed;
  `VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1
  NODE_OPTIONS=--max-old-space-size=1150 npm run build` — passed, prebuild no DB work.
  Document catalog key and placeholder parity, labels, language tags, error mapping,
  date and size formatting were unit-tested in all three locales.
  `FORCE_SEED=1 node scripts/db-bootstrap-node.mjs` after loading a private local test
  environment — passed on synthetic loopback DB; with the same env and VERCEL_ENV unset,
  `BASE=http://127.0.0.1:3111 node scripts/e2e.mjs` — 396 passed, 0 failed, 0 skipped.
  The E2E is HTTP/API-based, not browser UI testing in all locales.
- **Browser/accessibility:** No system Chromium found and the previously investigated
  portable Chromium cannot start without `libnspr4.so`, `libnss3.so`, `libnssutil3.so`;
  no approved alternate browser environment was available. Browser, keyboard,
  screen-reader, contrast, rendering and responsive tests NOT RUN. Native HTML
  labels/status markup is unit-tested, not a substitute for a browser audit.
- **Remaining risks:** English surrounds the document component; legal/clinical
  translations remain unreviewed; author-generated titles and files remain as entered.
  Existing document upload/link audit appends can fail open; this work does not fix or
  claim atomicity. Locale-specific patient isolation and browser interactions not verified.
- **Next:** owner review of this document slice, then continue A-3.2; no A-3.3/A-4 work.

#### Records timeline continuation — in progress, not accepted

- **User problem and scope:** patients need a consistent records journey in English,
  Hindi and Marathi while retaining their saved language preference. This continuation
  covers the encounter/lab timeline only, not the complete records journey.
- **Changes:** `web/src/components/records-timeline.tsx` uses the A-3.1 locale
  preference and `records` catalog in `web/src/lib/i18n.ts` for timeline labels,
  encounter types, dates and empty state. `web/src/app/patient/records/page.tsx`
  passes authorized timeline data to it and limits lab serialization to the six
  displayed items. Clinical content and document contents remain as entered. The
  timeline empty state now correctly appears when only medication drafts exist.
  `web/src/lib/__tests__/records-timeline.test.ts` adds eight tests. No server
  authorization, consent or audit code was changed.
- **Verification from `web/`:** `npm test` — 383 passed, 0 failed, 0 skipped (30
  files); `npx tsc --noEmit -p .` and `npm run lint` passed. After limiting lab
  serialization, `VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL=''
  NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150 npm run build`
  passed; prebuild skipped schema sync. `git diff --check` passed.
  With the private synthetic test env, `FORCE_SEED=1 node scripts/db-bootstrap-node.mjs`
  passed against the existing isolated loopback PostgreSQL 17.11 database (not a fresh
  database; schema was already present), and `BASE=http://127.0.0.1:3111 node
  scripts/e2e.mjs` with VERCEL_ENV unset passed 396, failed 0. The HTTP suite covers
  document upload/download, cross-patient denial, doctor scope and immediate denial
  after revocation; it does not verify translated records UI in a browser. Test server
  and database were stopped.
- **Remaining:** export, clinical disclaimer, prescription backfill, trends,
  medications, allergies/conditions, print, navigation and other patient records
  states remain English; translation completeness and locale-specific E2E have not
  been established. Browser, responsive, keyboard and screen-reader testing not run:
  no system Chromium and portable `/tmp/chromium` lacks `libnspr4.so`, `libnss3.so`
  and `libnssutil3.so`. Qualified clinical/legal review remains required. The patient
  records milestone and A-3.2 remain **in progress, not complete or accepted**.

#### A-3.2 remaining-records continuation — partial, not accepted

- **Completed in this continuation:** prescription backfill panel's headings,
  instructions, textarea accessible name, preview labels, processing, result and
  network/generic error messages use the accepted locale preference and English,
  Hindi and Marathi catalog. Result state changes language when preference changes.
  Parser inputs, sample prescription, parsed medication values, prescription logic
  and backend are unchanged; errors no longer expose untranslated server text.
- **Changed files:** `web/src/lib/i18n.ts`, `web/src/components/photo-paste.tsx`,
  `web/src/app/patient/records/page.tsx`, `web/src/lib/__tests__/photo-paste-i18n.test.ts`,
  and this ledger. No application database schema or production infrastructure changes.
- **Verification from `web/`:** `npm test` — 386 passed, 0 failed, 0 skipped (31
  files), including three new static-render backfill locale/placeholder tests and
  existing document/timeline/parser/trends/print tests; `npx tsc --noEmit -p .`
  and `npm run lint` passed. `VERCEL_ENV=development RETENTION_POLICY=demo
  DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150
  npm run build` passed; prebuild skipped schema sync. `git diff --check` passed.
- **Fresh isolated synthetic DB:** local PostgreSQL 17.11 on loopback using the
  existing isolated cluster; created a new `citycare_records_fresh` database via the
  Node `pg` client, set `DATABASE_URL` to that database and ran
  `FORCE_SEED=1 node scripts/db-bootstrap-node.mjs`. Schema and migrations applied
  to that fresh test database, with synthetic seed only. On the production build,
  `BASE=http://127.0.0.1:3111 node scripts/e2e.mjs` with that test environment and
  VERCEL_ENV unset: 396 passed, 0 failed. Includes photo draft behavior, FHIR export,
  document upload/download, cross-patient denial, doctor scope, consent revocation,
  print export audit and scoped print access. These HTTP tests are not multilingual
  browser interaction tests. Test server and local database server stopped. An initial
  attempt to create the test database via the bundled `psql` failed because that
  executable is absent; using the installed Node PostgreSQL client succeeded.
- **Browser/accessibility:** `command -v` found no Chromium, Chrome or Firefox;
  `ldd /tmp/chromium` still reports missing `libnspr4.so`, `libnss3.so`, and
  `libnssutil3.so`. No supported working browser found. Browser persistence, preview
  and submit interaction, responsive Devanagari, keyboard, screen reader, chart and
  print-layout checks were not run. Translation wording needs qualified clinical review.
- **Remaining untranslated/incomplete:** trends/chart labels and controls;
  medication cards and confirmation; FHIR export copy/status; print button and
  summary content; clinical disclaimer; allergies/conditions and surrounding records
  headings/help; other loading, validation, success and error paths. Backfill still
  lacks interactive browser and locale-specific HTTP tests. The complete records
  journey and A-3.2 remain **in progress, not complete and not accepted**; catalog
  key parity alone does not establish whole-page translation completeness.

#### A-3.2 records continuation — medication and introductory cards (partial)

- **Changes:** `web/src/components/patient-records-cards.tsx` renders localized
  patient disclaimer, export/link and print-button labels, medicines, draft counts,
  confirmation controls, allergies/conditions, empty state and rule-flag message.
  `web/src/components/confirm-draft.tsx` now localizes the action and shows a safe
  error on confirmation failure instead of silently refreshing; it still calls the
  same patient-owned endpoint. `web/src/app/patient/records/page.tsx` passes only
  the necessary existing authorized fields to these cards. Catalog strings are in
  `web/src/lib/i18n.ts`; new static tests are in
  `web/src/lib/__tests__/patient-records-cards.test.ts`. Clinical names, values and
  draft source remain as entered. No changes to prescription parsing, calculations,
  consent, export endpoint, document access or application schema. Removed an
  overbroad FHIR compatibility claim from the patient description.
- **Tests from `web/`:** `npm test` — 392 passed, 0 failed, 0 skipped (32 files);
  six added static-render locale/card tests include clinical source preservation,
  empty states and link checks. Existing trends, print, timeline and document tests
  also ran. `npx tsc --noEmit -p .`, `npm run lint`, `git diff --check`, and
  `VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL=''
  NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150 npm run build`
  passed; build preflight skipped schema sync.
- **Synthetic E2E:** created fresh `citycare_records_locales_2` inside the isolated
  loopback PostgreSQL 17.11 cluster using Node `pg`; bootstrapped with
  `FORCE_SEED=1 node scripts/db-bootstrap-node.mjs` and synthetic data. With
  `DATABASE_URL` pointed at that DB and VERCEL_ENV unset,
  `BASE=http://127.0.0.1:3111 node scripts/e2e.mjs` passed 396, failed 0; covers
  FHIR success, photo drafts, print log and consent-scoped print access, document
  upload/download, cross-patient document denial and immediate consent revocation.
  It does not establish a new negative FHIR authorization test, localized UI
  interaction or clinical translation correctness. Isolated server and DB stopped.
- **Browser/accessibility:** `command -v` found no system Chromium, Chrome or Firefox;
  `ldd /tmp/chromium` reports missing `libnspr4.so`, `libnss3.so`, `libnssutil3.so`.
  No browser, Devanagari layout, keyboard, screen-reader, chart or print-layout
  verification was executed. Clinical wording requires qualified review.
- **Still incomplete:** trends/chart labels, legends, tooltips, form and status;
  full FHIR progress/error handling; print summary headings and generated content;
  locale-specific interactive/security regression and whole-page completeness.
  The existing print action continues even when audit logging fails; this was not
  modified or verified as a security guarantee. The records milestone and A-3.2
  remain **in progress, not complete and not accepted**.

#### A-3.2 records continuation — export and chart presentation (partial)

- **Implemented:** patient FHIR download now shows localized preparation, download
  initiated, retry and safe authentication/network/response errors. It fetches the
  unchanged same-origin patient endpoint, checks HTTP status/content type, and saves
  the response blob without parsing, translating or rewriting FHIR bytes. "Download
  started" does not claim the user saved the file. Patient chart heading, self-report
  description, direction/range labels, chart accessible name and tooltip are localized;
  chart tooltip dates use the selected locale in IST. Calculations, series and values
  are unchanged. The shared doctor chart retains its original English labels.
- **Files:** `web/src/lib/i18n.ts`, `web/src/components/fhir-download.tsx`,
  `web/src/lib/fhir-download.ts`, `web/src/components/patient-records-cards.tsx`,
  `web/src/components/trends.tsx`, `web/src/lib/__tests__/fhir-download.test.ts`,
  `web/src/lib/__tests__/patient-trend-i18n.test.ts`,
  `web/src/lib/__tests__/patient-records-cards.test.ts`, and this ledger. No app
  schema, endpoint authorization, consent, FHIR serialization or doctor logic changes.
- **Tests from `web/`:** `npm test` 398 passed, 0 failed, 0 skipped (34 files);
  new response validation, safe filename, localized static SVG/name/value, catalog
  parity and doctor-English checks. `npx tsc --noEmit -p .`, `npm run lint`,
  `git diff --check`, and `VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL=''
  NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150 npm run build`
  passed; prebuild skipped database sync.
- **Fresh synthetic E2E:** created `citycare_records_locales_3` in isolated local
  PostgreSQL 17.11; `FORCE_SEED=1 node scripts/db-bootstrap-node.mjs` applied schema
  and migrations to the new DB and seeded synthetic data. With its loopback URL and
  VERCEL_ENV unset, `BASE=http://127.0.0.1:3111 node scripts/e2e.mjs` passed 396,
  failed 0. Includes FHIR success and unauthenticated denial, document cross-patient
  isolation, doctor scope, revocation and print-scope regressions. A separate Node
  fetch confirmed unauthenticated FHIR status 401. The HTTP suite does not execute the
  browser download UI or prove downloaded bytes match the endpoint through that UI.
  Test server and DB stopped; no production DB or infrastructure changed.
- **Browser/accessibility:** no system Chromium, Chrome or Firefox found; `ldd
  /tmp/chromium` reports missing `libnspr4.so`, `libnss3.so`, `libnssutil3.so`.
  Browser download, object URL handling, persistence, chart readability, keyboard,
  screen reader, print and responsive Devanagari checks remain unexecuted.
- **Remaining untranslated:** trend stats (latest/change/rate/count), logger form,
  known reading options, validation/error/success and delete controls; print summary
  title, metadata, section headings and generated lines; other navigation and page
  states may still contain English. The export fetch buffers the bundle in browser
  memory; large-record behavior is untested. Clinical translations need qualified
  review. Print audit failure behavior remains unchanged. No claim of whole-records
  translation completeness or A-3.2 acceptance is made.

**A-3.2 records acceptance checklist:**
- [x] Previously implemented document, timeline, backfill and medication sections preserved.
- [ ] All trends UI and print-only text localized; whole-route inventory completed.
- [ ] Locale-specific export/download, print, chart and patient isolation interaction tested.
- [ ] Browser/accessibility and Devanagari print layout actually verified.
- [ ] Qualified clinical/legal translation review and owner acceptance.

#### A-3.2 remaining-records continuation — trends form and audit (partial)

- **Implemented:** `web/src/components/trends.tsx` now localizes patient trend
  statistics, date display, form labels, known-reading option labels, empty state,
  save and remove errors, recent-reading actions and accessible labels in en/hi/mr.
  Known option values, existing stored names and patient-entered data are unchanged;
  trend calculations and doctor English presentation remain unchanged. Failed delete
  now reports an error instead of silently refreshing. `web/src/lib/i18n.ts` contains
  the corresponding keys. Existing date input and chart do not have date range or
  filter controls; no new clinical functionality was invented.
- **Files changed this continuation:** `web/src/components/trends.tsx`,
  `web/src/lib/i18n.ts`, `web/src/lib/__tests__/patient-trend-i18n.test.ts`,
  `web/src/lib/__tests__/records-coverage-audit.test.ts`, this ledger. No schema,
  authorization, consent, FHIR endpoint or doctor-record logic changed.
- **Catalog audit:** `records` and `documents` namespaces together contain 145
  English keys; English 145/145, Hindi 145/145, Marathi 145/145 nonempty;
  missing keys: none, from `npm test` / `records-coverage-audit.test.ts`. This is
  catalog parity, NOT complete route translation coverage: it does not detect hardcoded
  strings or assess meaning. Audit of the route and shared rendered components finds
  **print summary entirely incomplete**: `print-summary.tsx` section headings and
  `lib/print-summary.ts` title, metadata, labels, empty text, draft note, observation
  directions, dates, reference/advice/follow-up labels and footer are English. The
  shared print button's busy state is an ellipsis. User-entered clinical values and
  established source names must remain unchanged. Navigation and native browser/UI
  validation language have not been comprehensively verified; this audit is not a
  claim that no other hardcoded English remains.
- **Tests from `web/`:** after `npm ci --no-audit --no-fund` restored missing local
  dependencies, `npm test` passed 405 tests in 35 files (0 failed, 0 skipped),
  including three locale form, three locale statistics and existing chart, print,
  FHIR, document and timeline tests; `npx tsc --noEmit -p .`, `npm run lint`,
  `git diff --check`, and `VERCEL_ENV=development RETENTION_POLICY=demo
  DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150
  npm run build` passed. Build preflight skipped schema sync. Before `npm ci`,
  `npx tsc` failed because repository-local node_modules was absent; it succeeded
  after dependency installation.
- **Fresh isolated synthetic E2E:** npm-installed PostgreSQL 17.11 binary in
  `/home/user/synthetic-pg`, initialized a new loopback cluster and seeded new
  `citycare_trends_test` with `FORCE_SEED=1 node scripts/db-bootstrap-node.mjs`.
  First `BASE=http://127.0.0.1:3111 node scripts/e2e.mjs` yielded 376 passed,
  4 failed, 3 skipped because synthetic BACKUP_KEY was incorrectly formatted and
  anchor signing was absent. Corrected the test-only env, created and seeded a second
  fresh isolated database `citycare_trends_test2`, restarted the test server, and ran
  the same E2E command: **396 passed, 0 failed**. Tests include document isolation,
  scoped doctor access, immediate revocation denial, FHIR and print regressions.
  No remote DB used; isolated test services stopped.
- **Browser/accessibility NOT RUN:** no Chromium, Chrome or Firefox found. The prior
  `/tmp/chromium` and prior cluster are no longer present in this runtime. Current
  `/sbin/ldconfig -p` and library search find no `libnspr4.so`, `libnss3.so`, or
  `libnssutil3.so`; no supported browser available. The earlier portable Chromium
  launch had failed on those same libraries. Interactive trend save/delete, download,
  screen reader, keyboard, responsive charts and Devanagari print remain unverified.
- **Status:** patient records journey is **not complete**, A-3.2 remains **in progress
  and not accepted**. Print localization, complete route audit, interactive/security
  locale verification and qualified clinical/legal translation review remain required.

#### A-3.2 patient print and records audit — in progress, not accepted

- **Implementation:** patient-only `web/src/components/patient-print-summary.tsx`
  uses saved A-3.1 locale to render `web/src/lib/patient-print-summary.ts` and
  localized section headings. Generated title, patient labels, metadata, empty states,
  draft note, observation direction/band, dates, lab reference, visit labels and
  footer use the shared `records` catalog. Source names, units, results, clinical text
  and identifiers are not translated. The same age calculation and draft exclusions
  are used; only a draft marker rather than its source text is serialized to the
  patient print component. English uses the existing builder unchanged. Shared
  `web/src/components/print-summary.tsx` accepts optional headings/language; doctor
  callers retain default English behavior. `web/src/lib/print-summary.ts` only
  exports the existing age helper. Patient-scoped print CSS in
  `web/src/app/globals.css` adds Devanagari font fallback, wrapping and pagination
  hints; doctor CSS remains unchanged. Fonts/printing not browser verified.
- **Changed files this continuation:** `web/src/lib/i18n.ts`,
  `web/src/lib/patient-print-summary.ts`, `web/src/lib/print-summary.ts`,
  `web/src/components/patient-print-summary.tsx`,
  `web/src/components/print-summary.tsx`, `web/src/app/patient/records/page.tsx`,
  `web/src/app/globals.css`, `web/src/lib/__tests__/patient-print-summary.test.ts`,
  this ledger. No application schema, consent, auth, FHIR endpoint, document access
  or clinical calculation changes.
- **Records route audit:** inspected `/patient/records` and its print, intro/export,
  FHIR download, prescription backfill, document manager, trends, timeline, medicine,
  allergy, draft confirmation and print button components, plus patient layout and
  shared navigation. `records` has 120 keys and `documents` 43: audit test reports
  en 163/163, hi 163/163, mr 163/163 nonempty, zero missing. Keys include print,
  timeline, trend, backfill, medicine, export and document labels. Catalog key parity
  does not establish wording accuracy or identify every hardcoded string.
  **Known remaining English on the records screen:** patient-layout tabs Dashboard,
  Find doctors, Records, Access & trust, Inbox; conditional erased account/patient
  and dependent badges; shared notification, logout, switch-back, legal footer and
  conditional privacy reaccept banner. Native file/date controls and browser print
  dialogs use browser locale, not necessarily preference. Prescription placeholder
  and sample are source-language examples. Clinical names, diagnoses, advice,
  units, values, user titles and document contents intentionally stay as entered;
  source gender/severity and unknown direction/band values are not translated.
  Full dynamic interaction and every conditional shell state were not browser audited.
- **Tests from `web/`:** `npm test` 412 passed, 0 failed, 0 skipped (36 files);
  seven added print tests cover en/hi/mr static headings, empty states, source text,
  draft exclusion and unchanged English/doctor builder. `npx tsc --noEmit -p .`,
  `npm run lint`, `git diff --check`, and `VERCEL_ENV=development RETENTION_POLICY=demo
  DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150
  npm run build` passed. Build was rerun after patient-only CSS scoping and passed;
  prebuild skipped schema sync. No real print-layout rendering executed.
- **Fresh synthetic E2E:** created `citycare_print_fresh` in the isolated loopback
  PostgreSQL 17.11 cluster; `FORCE_SEED=1 node scripts/db-bootstrap-node.mjs`
  applied schema and migrations and synthetic seed. With its local DATABASE_URL and
  VERCEL_ENV unset, `BASE=http://127.0.0.1:3111 node scripts/e2e.mjs` passed 396,
  failed 0, including document upload/download and isolation, doctor scope, instant
  revoke denial, FHIR success/anonymous denial and doctor/patient print authorization.
  E2E ran before the final patient-only CSS scoping edit; final build passed afterward.
  Test server and database server stopped. No remote database or infrastructure used.
- **Browser/accessibility NOT RUN:** system browser lookup found no Chromium, Chrome
  or Firefox; `/sbin/ldconfig -p` and `/lib`/`/usr/lib` search found no `libnspr4.so`,
  `libnss3.so`, `libnssutil3.so`. Prior portable Chromium launch failed on these
  libraries and is no longer present. Locale persistence, dynamic print rendering,
  Devanagari font availability, pagination, screen reader, keyboard and responsive
  checks remain unverified. Clinical/legal translations require qualified review.
  Existing print action still proceeds if logging fails; not modified or represented
  as a guarantee. Browser locale may differ from saved locale for native controls.
- **Status:** A-3.2 remains **in progress and not accepted**; shared patient shell
  remains English and browser/print accessibility, full conditional route audit,
  qualified translation review and owner acceptance remain outstanding.

#### A-3.2 patient shell continuation — not accepted

- **Changes:** `/patient` shared layout uses `patient-shell.tsx` for localized tabs,
  account fallback/redacted and dependent badges, notification accessible name,
  sign-out, switch-back, legal footer and conditional privacy reaccept banner in
  en/hi/mr. Routes, counts, role/session checks and legal acceptance endpoint remain
  unchanged; user names are not translated. Shared `tabs.tsx`, `logout-button.tsx`,
  `notification-bell.tsx`, `dependents-panel.tsx` accept optional display labels and
  default to their prior English strings for doctor callers. `reaccept-banner.tsx`
  accepts optional labels; doctor default text and endpoint are unchanged, and a
  network failure now displays an error instead of leaving the button busy for both
  audiences. Patient footer uses same links/version as prior server footer. Responsive
  header uses flex wrapping but has not been tested in a browser.
- **Files this continuation:** `web/src/app/patient/layout.tsx`,
  `web/src/components/patient-shell.tsx`, `tabs.tsx`, `logout-button.tsx`,
  `notification-bell.tsx`, `dependents-panel.tsx`, `reaccept-banner.tsx`,
  `web/src/lib/i18n.ts`, `web/src/lib/__tests__/patient-shell-i18n.test.ts`, this
  ledger. No application schema, authorization, consent enforcement, document,
  FHIR or doctor clinical logic changes.
- **Audit and coverage:** records route and dependencies were inspected as recorded
  in preceding print/audit entry; shared patient shell components above and
  `legal-footer.tsx`, `privacy-summary.tsx`, doctor layout/defaults were inspected.
  Route inventory comprises `/patient`, `/patient/records`, `/patient/access`,
  `/patient/doctors`, `/patient/doctors/[id]`, `/patient/notifications`,
  `/patient/onboard`; previous ledger inventory also lists their components/APIs.
  Current shell labels and records/document catalog strings have parity; `npm test`
  reports **190/190 en, 190/190 hi, 190/190 mr**, missing 0 each for records plus
  documents. This is not route-by-route completeness or a full dynamic audit.
  Other route bodies remain predominantly English: dashboard (e.g. Finish profile,
  No upcoming appointments), access (Doctor, Status, Scope), doctor search (Search),
  doctor profile (Next 14 days), onboarding and stored notification bodies. Those
  modules are not claimed translated; notification/consent/appointment workflows
  were not reimplemented. Shared privacy footer/banner translations require qualified
  legal review. Native browser dialogs, file/date widgets and source prescription
  examples remain in browser/source language; clinical and document content stays
  as entered. Complete patient-route hardcoded text inventory has **not** been done.
- **Testing from `web/`:** `npm test` 416 passed, 0 failed, 0 skipped (37 files);
  new tests render shell in all three locales, conditional dependent and reaccept
  states, route links, unchanged names and English defaults of shared doctor controls.
  Existing locale-preference/persistence unit tests and doctor print tests passed.
  First run failed one English test due to HTML `&amp;` escaping; assertion fixed,
  rerun passed. `npx tsc --noEmit -p .`, `npm run lint`, `git diff --check`,
  `VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL=''
  NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150 npm run build`
  passed (prebuild skipped DB sync).
- **Fresh synthetic PostgreSQL:** created new loopback PostgreSQL 17.11 database
  `citycare_shell_fresh`, initialized with `FORCE_SEED=1 node
  scripts/db-bootstrap-node.mjs`, synthetic seed only. With local DATABASE_URL,
  VERCEL_ENV unset and test server port 3111, `BASE=http://127.0.0.1:3111 node
  scripts/e2e.mjs` passed **396, failed 0**: document upload/download, cross-patient
  denial, doctor scope, immediate consent revocation, FHIR and doctor/patient print
  regressions. The suite is HTTP-based, not language interaction testing. Test DB
  and server stopped; no production database or infrastructure modified.
- **Browser/accessibility NOT RUN:** no system Chromium, Chrome or Firefox; dynamic
  linker/library search finds no `libnspr4.so`, `libnss3.so`, `libnssutil3.so`.
  The previous portable Chromium launch failed on these and is not present now.
  Browser persistence, mobile layout, keyboard, screen-reader and Devanagari print
  were not verified. Clinical/legal review and owner acceptance remain outstanding.
- **Status:** A-3.2 is **in progress, not complete and not accepted**. Shell work is
  implemented but not browser verified; full patient route audit/localization and
  remaining modules above are not complete.

#### A-3.2 patient route continuation — partial, not accepted

- **Changes:** `web/src/app/patient/loading.tsx` now uses the saved locale for its
  accessible loading name, via `records.patientLoading` in `web/src/lib/i18n.ts`.
  `web/src/lib/__tests__/patient-records-route-i18n.test.ts` renders the actual
  async `/patient/records` route with synthetic mocked server dependencies in each
  language and checks headings, empty states, document heading and loading label.
  Previously implemented shell, document, timeline, medication, trends and export
  modules were not reimplemented. No database schema, auth, consent or doctor changes.
- **Patient route inventory and status:** `/patient/records` uses localized intro,
  export, backfill, documents, timeline, trends, medicine/allergy cards and patient
  print; loading accessible name localized this continuation. The route-level test
  covers its empty rendering, not all interactive, populated or conditional states.
  `/patient` dashboard remains English including profile, appointment and sharing
  cards; `/patient/access` sharing/consent interface remains English;
  `/patient/doctors` and `/patient/doctors/[id]` search, profile and booking remain
  English; `/patient/onboard` and `wizard` remain English; `/patient/notifications`
  uses `inbox-page` / `inbox` with English UI and stored generated notification text.
  `/patient/layout` shell is localized as described in previous entry. These are
  known application-generated strings, not excluded as clinical content; complete
  string-by-string dynamic route audit and all-route localization remain outstanding.
  Clinical source values, clinician/author text, patient names, uploaded document
  contents and user titles are intentionally not translated. Shared doctor-only UI
  remains outside patient localization and retains its English defaults.
- **Verification from `web/`:** `npm test` passed **419 tests**, 0 failed, 0 skipped
  (38 files), including three actual-route static renders and existing doctor print,
  doctor navigation, preference, FHIR and document tests. `npx tsc --noEmit -p .`,
  `npm run lint`, `git diff --check` and `VERCEL_ENV=development RETENTION_POLICY=demo
  DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150
  npm run build` passed; prebuild skipped schema sync. Records/documents catalog audit
  en/hi/mr 191/191 each, missing 0 each; this is key parity, not full route coverage.
- **Fresh isolated synthetic E2E:** created `citycare_route_fresh` in the isolated
  loopback PostgreSQL 17.11 cluster; `FORCE_SEED=1 node scripts/db-bootstrap-node.mjs`
  applied schema and synthetic seed to the new database. With local DATABASE_URL,
  VERCEL_ENV unset and port 3111, `BASE=http://127.0.0.1:3111 node scripts/e2e.mjs`
  passed **396, failed 0**, including FHIR, document access and cross-patient denial,
  doctor scope, revocation and print regressions. DB and server stopped afterward.
- **Browser/accessibility/print NOT RUN:** installed temporary `puppeteer-core` and
  `@sparticuz/chromium` outside the repository and attempted a launch. The first
  script used the wrong module export; corrected launch failed with exit 127:
  `/tmp/chromium` could not load `libnspr4.so`. `ldd /tmp/chromium` additionally
  reports `libnss3.so` and `libnssutil3.so` missing. No working browser; no keyboard,
  screen-reader, responsive or Devanagari print-layout verification was executed.
  Translation review by qualified clinical/legal reviewers remains necessary.
- **Status:** the user's requested complete patient route localization and complete
  audit are **not done**; A-3.2 remains **in progress and not accepted**.

#### A-3.2 records-journey scope closure audit — in progress, not accepted

**Scope and classification**

- Entry is an authenticated patient session (`/login` is the existing prerequisite)
  and the localized Records tab in the shared patient shell, leading to
  `/patient/records`. The record route invokes patient-role authorization and
  fetches only that viewer's record. Its timeline, medicine/allergy, document,
  trends, backfill, FHIR export and print workflows are all on that route; their
  APIs are existing patient/document endpoints. The shared root language switcher,
  demo banner (when enabled), patient header, conditional dependent switch-back,
  notification bell, privacy reaccept banner, legal footer and loading state are
  displayed around that route. Open/download/delete documents and FHIR/print use
  their existing endpoints, not additional patient pages.
- `/patient` dashboard: a possible landing/entry point, but not technically required
  once authenticated (the Records tab is in the shared shell on all patient pages).
  Dashboard body is a separate workflow and remains English; shell is shared.
- `/patient/access`: independent consent/access-management workflow, not needed for
  the patient to view or export their own records. Its consent enforcement remains
  security-critical server-side but its page body is not rendered within records.
- `/patient/doctors` and `/patient/doctors/[id]`: independent search/booking
  workflows, not needed for patient-owned records. They share the patient shell,
  not the records components. Their bodies remain English.
- `/patient/onboard`: independent profile/safety-card workflow, not required to
  open records; shares shell only and remains English. The existing account/profile
  data shown inside records remains source data.
- `/patient/notifications`: independent inbox workflow; the shell's bell is present
  on records, but inbox body and stored notifications are not. The inbox remains
  English. These classifications do not imply these routes are A-3.2 complete.

**Audit and work**

- Inspected `patient/records/page.tsx`, `patient/layout.tsx`, `patient/loading.tsx`,
  root `layout.tsx`, `language-switcher`, `demo-banner`, `patient-shell`,
  `patient-records-cards`, `fhir-download`, `photo-paste`, `document-manager`,
  `trends`, `records-timeline`, `confirm-draft`, `patient-print-summary`,
  `print-summary`, `print-button`, and associated i18n/print helpers. Existing
  route-level tests render the actual records route in each locale with mocked empty
  authorized data; component tests exercise populated timeline, charts, medications,
  shell and print. They do NOT prove every conditional/error state, dynamic
  interaction or all hardcoded text absent. Native browser file/date/download/print
  UI follows browser locale; sample prescription, clinical names, user titles, values,
  advice and document contents are intentionally source-language content. Standards
  such as FHIR, ICD-10, ABHA ID and encryption/hash names remain unchanged.
- Found the root public demo banner was English on the patient records route, and
  known gender and allergy-severity enums appeared in English in non-English print.
  `web/src/components/demo-banner-content.tsx` localizes the patient-route banner
  using the existing catalog and server-computed actual retention enabled/days;
  non-patient/doctor presentation remains English. `demo-banner.tsx` remains the
  server-side policy authority. `patient-print-summary.ts` translates only known
  presentation enums while preserving unknown values and clinical source content;
  English and doctor print builders unchanged. Added 11 `records` keys in
  `web/src/lib/i18n.ts`, new `demo-banner-locale.test.ts`, and print enum tests.
  No database schema, calculation, FHIR, document, consent or authorization changes.
  Clinical/legal translations need qualified review.
- No claim of zero remaining hardcoded generated text: `PrintButton` uses an
  unlabelled ellipsis while busy; unexpected source enum values intentionally fall
  back to their source code; the sign-in prerequisite and browser-native controls
  are outside this narrow route's translated UI. The exact complete dynamic route
  audit, populated real-route interaction and browser verification are not complete.
  Print action still proceeds if its existing audit request fails; not changed here.

**Evidence and limits**

- From `web/`: after `npm ci --no-audit --no-fund` (node_modules was absent),
  `npm test` **425 passed, 0 failed, 0 skipped** in 39 files. Catalog parity for
  records + documents is en/hi/mr **202/202, missing 0** each, which is not proof
  of whole-journey localization. Demo tests cover both enabled/disabled retention
  and doctor English; print tests cover known enum labels and source preservation.
  Existing route-level, locale persistence unit, doctor navigation/English print,
  timeline and document tests passed. `npx tsc --noEmit -p .`, `npm run lint`,
  `git diff --check` and `VERCEL_ENV=development RETENTION_POLICY=demo
  DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150
  npm run build` passed, prebuild skipped DB sync. The first `npx tsc` before npm ci
  failed because local dependencies were absent; subsequent TypeScript passed.
- Fresh isolated PostgreSQL 17.11 cluster initialized under `/home/user/synthetic-pg`;
  new loopback `citycare_scope_fresh` DB bootstrapped with
  `FORCE_SEED=1 node scripts/db-bootstrap-node.mjs` and synthetic data. With local
  DATABASE_URL, VERCEL_ENV unset and port 3111, `BASE=http://127.0.0.1:3111 node
  scripts/e2e.mjs` passed **396, failed 0**. Covers FHIR success/anonymous denial,
  document upload/download/delete, cross-patient denial, doctor scope, immediate
  consent revocation and patient/doctor print access. HTTP E2E does not execute
  locale switching or browser export/print. Test server and DB server stopped.
- **Browser/accessibility/Devanagari print NOT RUN:** no Chromium, Chrome or Firefox
  in this runtime; library search and dynamic linker cache show no `libnspr4.so`,
  `libnss3.so` or `libnssutil3.so`. Previous turn attempted portable Chromium, which
  failed to launch for these missing libraries. Outbound package hosts do not provide
  a supported system browser environment here; no production infrastructure was
  changed. Persistence behavior, responsive layout, keyboard/screen reader and actual
  Devanagari print/pagination remain unverified.
- **Status:** A-3.2 records scope is **in progress, not complete and not accepted**;
  remaining dynamic audit, real browser/accessibility and clinical/legal review are
  explicit risks. Do not conflate independent untranslated route bodies with this
  narrower records milestone or call those modules complete.

#### A-3.2 dynamic records states — partial verification, not accepted

**State inventory (catalog keys in selected en/hi/mr locale unless noted)**

- `patient/loading.tsx`: `patientLoading` accessible name for initial route loading;
  no separate route error component was found, so Next.js generic route errors are
  not established as localized. `PatientHeader` / `PatientReacceptBanner`: shell
  tab labels, unread count, dependent switch-back and notice reaccept use `shell*`;
  storage preference hook starts English during SSR and follows saved preference
  after hydration. Conditional reaccept write failure uses `shellAcceptError`.
- `DocumentManager`: null list `documents.loading`; empty `empty`; list type,
  metadata and actions are localized; user titles and content remain unchanged.
  Upload disabled without a file, busy `uploading`, result `uploaded`; errors use
  `documentErrorKey`, network `errorNetwork`, required `required`; delete native
  confirmation `confirmDelete`, success `deleted`, error mapped by code. Link mint
  failure previously collapsed missing/expired-session/privacy-reaccept errors into
  generic text. This continuation maps `auth_required`, `not_found`,
  `consent_outdated`, `wrong_role`, `no_consent`, `scope_excludes_documents` and
  `bad_link` to safe localized messages, without changing server permission or the
  shared doctor's `openDocument` return contract. Cross-patient `not_found` remains
  indistinguishable from missing/deleted. Download after the signed URL opens in a
  new tab is handled by the existing server/browser and its failure response is not
  presented by the localized document component; expired/revoked link response in
  that tab can still be English. Consent revocation is rechecked server-side.
- `RecordsTimeline`: empty `emptyTimeline`; populated visit types, follow-up, lab
  reference and dates localized; authored diagnoses, advice and lab values unchanged.
  `PatientRecordCards`/`ConfirmDraftButton`: empty/confirmed/draft, source label,
  busy and generic/network confirmation errors localized; raw source preserved.
- `TrendsCard`/`TrendsPanel`: heading, band, chart name/title, direction, statistics,
  form, empty/recent, saving, result, network/save/delete errors localized; actual
  values, source names, units and reference values unchanged. A cleared date can still
  cause invalid `Date.toISOString()` before a request and leave busy state; validation
  and locale-specific interactive behavior need follow-up. Existing browser-native
  number/date validation language is controlled by browser, not saved locale.
- `PhotoPaste`: instructions, sample action, preview headings/none, ignored count,
  processing, success and generic/network error localized; input/sample clinical text
  remains as entered. Not all validation and populated preview interactions were
  executed in a browser.
- `FhirDownload`: `exportPreparing`, `exportReady`, `exportSignIn`, `exportFailed`,
  `exportNetwork`, `exportInvalid`, retry localized; machine-readable blob unchanged.
  UI cannot confirm that the user actually saved the browser download. `PrintButton`
  label localized and busy uses an ellipsis; existing audit-log failure is ignored and
  printing continues. `PatientPrintSummary` localized headings, empty and populated
  generated labels; original source values preserved, with known gender/severity
  display enums localized. Actual pagination/fonts not verified.

**Work and verification**

- Changed `web/src/lib/i18n.ts`, `web/src/lib/document-i18n.ts`,
  `web/src/components/document-manager.tsx`, `web/src/lib/__tests__/document-i18n.test.ts`,
  `web/src/lib/__tests__/patient-records-route-i18n.test.ts`, and this ledger.
  Extended the actual route static-render test with populated synthetic patient,
  encounter, lab, medicines, allergy, trends and print in en/hi/mr. Verified labels
  and source strings, but static React rendering does not execute effects, clicks,
  upload, backfill preview, FHIR browser download or consent-revocation interaction.
  Existing English doctor print/navigation and locale preference tests still pass.
- From `web/`: `npm test` **428 passed, 0 failed, 0 skipped** (39 files); records +
  documents catalog parity **205/205** in each locale, missing 0. Parity is not proof
  every displayed state is translated. `npx tsc --noEmit -p .`, `npm run lint`,
  `git diff --check`, and `VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL=''
  NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150 npm run build`
  passed; prebuild skipped schema sync.
- Fresh loopback PostgreSQL 17.11 database `citycare_dynamic_fresh` in isolated
  synthetic cluster: `FORCE_SEED=1 node scripts/db-bootstrap-node.mjs` applied schema
  and synthetic seed. With local DATABASE_URL and VERCEL_ENV unset,
  `BASE=http://127.0.0.1:3111 node scripts/e2e.mjs` **396 passed, 0 failed**; includes
  PDF upload/download/delete, patient isolation, doctor scope, revocation denial,
  photo draft, FHIR and doctor/patient print HTTP behavior. These are API tests, not
  language-specific UI interactions. Servers stopped; no production DB touched.
- **Browser/accessibility/print NOT RUN:** temporary npm `puppeteer-core` and
  `@sparticuz/chromium` outside the repo were used to attempt launch. Chromium exited
  127: `libnspr4.so: cannot open shared object file`. `ldd /tmp/chromium` also reports
  `libnss3.so` and `libnssutil3.so` missing. No visual, keyboard, screen-reader,
  responsive or Devanagari print/pagination checks were executed.
- **Remaining:** real populated language-specific interactions, all dynamic failures,
  server-download error localization, invalid trend-date handling, qualified
  clinical/legal translation review and owner acceptance. Independent dashboard,
  consent, search, onboarding and inbox bodies remain outside this records scope.
  A-3.2 remains **in progress, not complete and not accepted**.

#### A-3.2 records interaction defects — implemented, owner review pending

- **Trend root cause:** the date input could be cleared, yet submit set busy before
  `new Date(...).toISOString()`, which threw for invalid input and never cleared busy.
  `web/src/lib/trend-submission.ts` validates exact calendar dates and preserves the
  existing 09:00 IST conversion; invalid/empty dates make no API call and are not
  replaced by today. `web/src/components/trends.tsx` displays `trendInvalidDate`
  via `web/src/lib/i18n.ts` in en/hi/mr, marks the field invalid, uses a synchronous
  in-flight guard and clears busy in `finally`. Existing payload, values, references
  and trend calculations remain unchanged. Helper tests cover valid/leap, empty,
  cleared-after-valid, invalid dates, API failure, network rejection and later retry;
  no browser test exercised a real repeated click or busy-state rendering.
- **Signed download root cause:** patient `openDocument` minted a signed link and
  opened `/api/documents/[id]` in a separate tab. That GET's `auth_required`,
  `bad_link` (expired/forged/replayed), `not_found` (deleted/missing), `not_yours`,
  `no_consent`, `wrong_role` and `integrity_failure` errors were English JSON;
  the original UI cannot receive errors from the noopener tab. The patient link now
  includes optional `ui_lang` and `web/src/lib/document-download-error.ts` renders a
  minimal escaped, non-reflecting localized HTML error with the original HTTP status,
  no-store, CSP and no-referrer. Unknown codes use a generic localized message;
  `not_yours` is deliberately shown as unavailable. Only opted-in error responses
  change presentation: successful bytes, signature binding/expiry, session, role,
  ownership and live-consent checks are unchanged; no patient ID/document title is
  reflected. The doctor's unmodified call still opens the original link and receives
  the existing JSON response. Unexpected exceptions handled by the generic API
  wrapper can still return English JSON; popup blocking and browser save/print
  behavior are not verified. No cross-tab messaging or new subsystem was added.
- **Files this continuation:** `web/src/components/trends.tsx`,
  `web/src/lib/trend-submission.ts`, `web/src/lib/i18n.ts`,
  `web/src/components/document-manager.tsx`,
  `web/src/app/api/documents/[id]/route.ts`,
  `web/src/lib/document-download-error.ts`,
  `web/src/lib/__tests__/trend-submission.test.ts`,
  `web/src/lib/__tests__/document-download-error.test.ts`,
  `web/scripts/e2e.mjs`, and this ledger. No schema, clinical calculations,
  consent enforcement or production infrastructure changes.
- **Verification from `web/`:** `npm test` **445 passed, 0 failed, 0 skipped** in
  41 files, including calendar validation/retry and en/hi/mr safe error response tests,
  existing populated/empty route render, FHIR response handling, patient print and
  English doctor print regression. Records/documents catalog parity 206/206 each
  (not proof of all states). `npx tsc --noEmit -p .`, `npm run lint`,
  `git diff --check`, and `VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL=''
  NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150 npm run build`
  passed; prebuild skipped schema sync.
- **Security regression:** fresh isolated loopback PostgreSQL 17.11 database
  `citycare_fixes_fresh`, bootstrapped with `FORCE_SEED=1 node
  scripts/db-bootstrap-node.mjs` and synthetic data. `BASE=http://127.0.0.1:3111
  node scripts/e2e.mjs` with local DATABASE_URL and VERCEL_ENV unset: **406 passed,
  0 failed**. Added HTTP checks for localized forged links in all three languages,
  expired parameter, anonymous and cross-patient replay, deleted file, and a doctor
  link minted while FULL consent is live but denied immediately after revocation,
  including localized denial. The expired HTTP case also modifies the signed expiry,
  while the existing `storage.test.ts` verifies a correctly signed link after time
  expiry. Existing upload/download, patient isolation, FHIR and doctor print tests
  pass. Test server and database server stopped.
- **Browser/accessibility/Devanagari print NOT RUN:** prior portable Chromium launch
  failed with exit 127; current `ldd /tmp/chromium` still reports missing
  `libnspr4.so`, `libnss3.so` and `libnssutil3.so`. Static rendering and HTTP tests
  are not real browser interaction tests. Locale switching, double-click blocking,
  popup handling, visual/accessibility and actual print pagination remain unverified.
  Clinical/legal translations require qualified review. A-3.2 remains **in progress,
  not accepted**; owner review is requested, not implied acceptance.

#### A-3.2 patient records acceptance audit — NOT ACCEPTED / verification incomplete

**Route/component matrix.** `C` means relevant catalog text exists and was inspected;
`S` means synthetic static rendering tested; neither means browser interaction,
visual accessibility or qualified translation review passed. User-entered source
content is excluded from translation, not counted as untranslated application copy.

| Route / component and inspected states | en | hi | mr | Evidence and limits |
|---|---|---|---|---|
| `/patient/records`, `patient/loading`, patient shell, language switcher, conditional demo/reaccept/dependent/footer | C/S | C/S | C/S | Route/shell static tests; live preference/hydration and conditional actions not browser tested. Root generic route error has no records-specific localized error boundary. |
| `DocumentManager`, `document-i18n`, signed `/api/documents/[id]` | C/S | C/S | C/S | Static loading/form, error-code mapping and HTTP security tests. File picker/download UI is browser-native; signed-link expected and unexpected opted-in errors render safe locale HTML. Upload/delete success/failure clicks not browser tested. |
| `RecordsTimeline` encounter/labs and empty state | C/S | C/S | C/S | Populated and empty static render; original diagnosis, values, advice and codes remain source text. |
| `PatientRecordCards`, `ConfirmDraftButton` | C/S | C/S | C/S | Populated and empty static rendering; confirmation success/network/failure interaction not browser tested. |
| `TrendsCard`, `TrendsPanel`, `trend-submission` | C/S | C/S | C/S | Chart and form static render, date validation/API retry unit tests; real date clearing, repeated click and visual chart remain untested. |
| `PhotoPaste` backfill | C/S | C/S | C/S | Static initial render and parser tests; sample/preview and submit behavior not executed in browser. Source prescription text intentionally unchanged. |
| `FhirDownload` | C/S | C/S | C/S | Static labels and response classification unit tests; HTTP auth regression, but progress, error and actual file download not browser tested. |
| `PatientPrintSummary`, `PrintSummary`, `PrintButton` | C/S | C/S | C/S | Synthetic populated/empty static rendering; doctor default English regression and HTTP access tests. Busy is an ellipsis; actual Devanagari font, pagination, print/save and audit-failure behavior not browser tested. |

**Error fallback and security.** The `GET /api/documents/[id]` response wrapper now
converts unexpected JSON 5xx results to the existing safe catalog `errorGeneric`
HTML for supported `ui_lang` opted-in tabs while retaining the original status.
It does not reflect exception details, URL, patient identifiers or filename.
Expected 401/403/404 and successful bytes are unchanged; without `ui_lang` the
original JSON/doctor response remains. Other records UI API components already use
safe mapped/generic/network errors rather than server error text. No authorization,
signature, consent or audit logic was changed. Generic Next.js route/render failures,
browser-native file/date/download dialogs, and some browser download/save failures
are not localized by this API fallback. `PrintButton` still prints if its pre-print
logging request fails; this pre-existing behavior was not changed.

**Changes and verification.** This continuation changed
`web/src/app/api/documents/[id]/route.ts`, added
`web/src/lib/__tests__/document-download-exception.test.ts`, and updated this ledger.
From `web/`: after `npm ci --no-audit --no-fund`, `npm test` **451 passed, 0 failed,
0 skipped (42 files)**, including three synthetic exception locale tests, status-
bearing 503 safety, preserved doctor/API default JSON and expected 401 tests; existing
populated/empty route tests, doctor print/navigation and FHIR tests passed. Records +
documents catalog parity en/hi/mr **206/206, missing 0 each**, not a substitute for
dynamic audit. `npx tsc --noEmit -p .`, `npm run lint`, `git diff --check`, and
`VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL=''
NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150 npm run build`
passed; prebuild skipped schema sync. First TypeScript attempt before `npm ci` failed
because local node_modules were absent; subsequent run passed.

**Synthetic security E2E.** Initialized an isolated loopback PostgreSQL 17.11
cluster in `/home/user/synthetic-pg`, created fresh `citycare_audit_fresh`, ran
`FORCE_SEED=1 node scripts/db-bootstrap-node.mjs`; only synthetic fixtures used.
With that local DATABASE_URL, VERCEL_ENV unset and test server on 3111,
`BASE=http://127.0.0.1:3111 node scripts/e2e.mjs` passed **406, failed 0**. Includes
FHIR anonymous denial, document upload/download/delete, forged/expired/replayed
links, cross-patient denial, doctor scope, issued doctor link denial after consent
revocation, patient and doctor print scope. HTTP/API tests do not demonstrate browser
interaction. Server and DB stopped, no production infrastructure or DB changes.

**Browser/accessibility/print: NOT RUN.** Temporary `puppeteer-core` and
`@sparticuz/chromium` outside the repository were used to attempt launch; Chromium
exited 127 with `/tmp/chromium: error while loading shared libraries: libnspr4.so`.
`ldd /tmp/chromium` also reports `libnss3.so` and `libnssutil3.so` missing. No
actual UI interactions, keyboard, screen-reader, responsive or Devanagari rendering/
print-layout checks ran. Patient language-specific dynamic flows and clinical/legal
review remain outstanding. English sample prescriptions, medical/source values,
patient names, uploaded content, FHIR/ICD/ABHA codes and units are deliberately
not translated. Independent dashboard, consent-management, search, onboarding and
inbox bodies remain outside this records-specific audit. The journey is **not
verified complete** and A-3.2 is **in progress, not accepted**; owner review requested.

### A-3.2 owner review and translation QA package (current audit)

This section supersedes broad coverage wording above; **not accepted**. No product
code or tests changed in this audit, so the prior verification was not rerun. The
full, reviewable 210-row English/Hindi/Marathi source table is
[`CITYCARE_A32_TRANSLATION_REVIEW.md`](CITYCARE_A32_TRANSLATION_REVIEW.md): all 206
`records`/`documents` keys, plus two shared language-switcher foundation keys and two linked privacy retention variants from the earlier correction.
It is an intentionally inclusive snapshot, not a claim all keys were newly added in
A-3.2 or all rendered. Each row has component, sensitivity and reviewer expertise;
placeholders and source content are distinguished. **No qualified approval exists.**

#### Actual route and component evidence matrix

Legend: `S` = synthetic static-render assertion in that locale, not interactive;
`I` = implementation inspected only; `H` = synthetic HTTP assertions, not locale UI;
`U` = pure/helper/unit assertion. No cell implies qualified linguistic approval or
browser, keyboard, screen-reader or print verification. For each row language status
is text availability plus stated evidence, **not** catalog parity. Test paths below
are relative to `web/src/lib/__tests__/`; `%s` is run separately for en/hi/mr.

| Route/component | English | Hindi | Marathi | Empty | Populated | Error | Accessibility labels / test evidence |
|---|---|---|---|---|---|---|---|
| `records/page`, `patient/loading`, `PatientHeader`, footer, `LanguageSwitcher`, demo/reaccept/dependent conditionals | S | S | S | S mocked empty route | S mocked synthetic page; shell acting-for/unread/reaccept static | I reaccept error; route render error not localized/tested | S localized loading label and shell unread; `patient-records-route-i18n.test.ts`: `%s renders actual route sections and loading name`, `%s renders populated synthetic records and print without changing source data`; `patient-shell-i18n.test.ts`: `%s renders routes, conditional labels and unchanged name`; `i18n.test.ts`: `renders a labelled keyboard-native selector and a disclosure of incomplete translations` (English static only); `demo-banner-locale.test.ts`: `%s respects enabled and disabled server retention`. Selector native does not prove keyboard operation. |
| `DocumentManager` list/upload/mint/delete | S initial | S initial | S initial | I after fetch, no component assertion | I after fetch; H synthetic file lifecycle | U mapping only; I UI handlers; H server denial; dynamic alerts not rendered/tested | S file/type/date labels; I title, open/delete per-file labels; `document-i18n.test.ts`: `%s renders a labelled form, loading state and full-record and emergency disclosure`, `maps document types and safe failure codes with fallback`; `web/scripts/e2e.mjs` D4. |
| `RecordsTimeline` encounters and labs | S | S | S | S | S synthetic encounter/lab and source values | N/A component; parent server failure has no localized boundary | I section heading association / decorative dots; `records-timeline.test.ts`: `%s provides all timeline keys`, `%s displays clinical source text unchanged`, `maps known encounter types and safely handles unknown types`, `uses IST and handles invalid dates without throwing`. |
| `PatientRecordCards`, medication/allergy/conditions and `ConfirmDraftButton` | S | S | S | S | S synthetic draft/confirmed, allergen, condition | I generic/network confirm; no dynamic UI error test | I button visible localized name, source title; `patient-records-cards.test.ts`: `%s labels, source data and export link`, `%s empty state`; route populated test above. |
| `TrendsCard`, chart, form, recent list | S | S | S | S | S synthetic two-point series; no interactive fill | U date validation, API failure/retry; I rendered alerts only | S chart label text and form labels, I date invalid/remove labels; known stored English name is interpolated into labels; `patient-trend-i18n.test.ts`: `%s preserves values and localizes chart label and heading`, `%s renders labels without changing submitted known values`, `%s renders localized summary without changing values`; `trend-submission.test.ts`: `handles clearing after a valid date without defaulting to today`, `returns failures and supports a later retry`, `handles a thrown network failure without throwing`; `trends.test.ts` pure calculations. |
| `PhotoPaste` prescription backfill | S initial | S initial | S initial | S initial blank form | I preview/success state, no dynamic render test | I generic/network status, no dynamic UI test | S textarea label; `photo-paste-i18n.test.ts`: `renders %s labels and keeps the sample in its source language`. The synthetic sample/placeholder are app-authored English, not user source. |
| `FhirDownload` | S initial button | S initial button | S initial button | N/A | H own-record bundle | U response classification; I localized UI status | I visible button and role=status/alert; `patient-records-cards.test.ts`: `%s labels, source data and export link`; `fhir-download.test.ts`: `only accepts successful FHIR responses`, `accepts only the safe server filename`; `web/scripts/e2e.mjs` F4. No browser download test. |
| `PatientPrintSummary` / `PrintSummary` / `PrintButton` | S | S | S | U empty medication/lab assertions | S synthetic fields; U shared builder | I pre-print audit error silently ignored | I localized button; print headings and lang S; `patient-print-summary.test.ts`: `%s prints localized headings and unmodified clinical data`, `%s prints localized empty sections`, `%s translates known presentation enums without changing source names`, `preserves English builder output and doctor behavior`; `print-summary.test.ts` builder tests; E2E F18 scoped doctor/patient. Physical print/assistive reading not tested. |
| Signed download GET and fallback | U/H | U/H | U/H | N/A | H success bytes; locale HTML affects errors only | U expected codes and 500 in all locales; U 503 Marathi; H forged/anonymous/replay/deleted/revoked | U HTML `role=alert` produced by helper (no assistive tech verification); `document-download-error.test.ts`: `%s localizes invalid, forbidden, missing and session errors`, `keeps the legacy JSON response without opt-in`, `does not reflect an unsupported language`; `document-download-exception.test.ts`: `%s returns safe localized fallback with original 500 status`, `localizes status-bearing server errors without reflecting details`, `keeps default doctor/API JSON status and safe body`, `does not turn expected authorization failures into a 500`; E2E D4. |

#### Defect and exclusion register

**Must fix before acceptance:**

1. **Valid enum omitted in patient print.** `schema/citycare_init.sql` defines
   `AlertSeverity` as INFO, WARNING, CRITICAL. `buildPatientPrintSummary` translates
   WARNING/CRITICAL but falls back to `a.severity.toLowerCase()` for INFO, yielding
   English `info` in Hindi/Marathi print. Current enum test checks only the other
   two. Add a reviewed presentation label and actual INFO regression without changing
   stored clinical data or doctor output.
2. **App-selected trend names return in English.** `KNOWN` option captions are
   localized but their English canonical values are stored; chart headings, recent
   list, print lines and chart/remove accessible names use `s.name`/`r.name` verbatim.
   Thus a patient selecting a Hindi/Marathi predefined reading sees English afterward.
   Arbitrary original observation names must remain intact. Review a presentation-only
   mapping for the exact known identifiers, with tests for unknown source values and
   doctor behavior; do not rewrite clinical data. This is not evidence that arbitrary
   user-entered observation names should be translated.
3. **Route render failure lacks localized fallback.** No patient/records error
   boundary is present; unexpected server-component/render failures are outside the
   localized API fallbacks. Provide and verify a safe records-specific localized
   failure/retry presentation without exposing internal errors, while preserving
   framework and authorization behavior.
4. **Language metadata/accessibility needs resolution.** Root `html lang="en"`
   never changes with preference; localized sections override `lang`, but document
   title/default language and any unwrapped content remain English. Assess a safe
   scoped strategy alongside actual assistive-technology testing. Invalid-date
   `aria-invalid` exists but the message is not explicitly associated with the date
   input (`aria-describedby`); correct/test that association for reliable navigation.

**Known limitations / owner decisions:**

- App-authored English in `PhotoPaste` sample and placeholder includes prescription
  shorthand and “Follow up after 6 weeks”; it is synthetic illustrative input,
  not actual patient data. Keep parser-compatible sample untouched until clinician/
  linguist review of safe localized framing or alternatives; do not claim this is
  user-entered text. `sha`, `AES-256-GCM`, `SHA-256`, `FHIR R4`, `JSON`, `ABHA ID`,
  `ICD-10`, `MB`, `KB`, standard units, native language names and the brand remain
  technical identifiers. Root metadata title/description is English.
- Original patient/doctor names, medication names/doses/frequencies, clinical notes,
  diagnoses, advice, lab names/values, uploaded file contents and unknown source
  enum/string values remain untouched. Print fallback for an unknown enum also
  preserves a lowercased source value, so it may appear English. This is separate
  from the known INFO enum defect above.
- No live UI test covers post-fetch document empty/populated/error messages, backfill
  preview/save, confirmation failures, FHIR progress/failure, trend delete/validation,
  popup blocking, print dialogs, locale hydration or conditional shell updates. No
  screenshot, responsive, screen-reader, keyboard or Devanagari print inspection ran.
  Document popup blocking is not surfaced by `openDocument`; FHIR's “download was
  started” cannot confirm saving; print continues if audit logging fails. Existing
  document link/upload audit append can fail open. These are pre-existing behaviors,
  not evidence of successful UI or guaranteed audit; owner to disposition.
- Terminology consistency (e.g. prescription/records wording, target/trend language,
  consent/access and legal wording, plural forms and presentation of English clinical
  abbreviations) is **unreviewed**, not certified consistent. Qualified Hindi and
  Marathi clinicians plus privacy/legal/security and accessibility reviewers should
  evaluate the review package in rendered context.
- API clients map failures to localized generic/network states, and opted-in signed
  GET maps JSON 5xx to a safe localized page; browser-native dialogs and catastrophic
  framework/network navigation errors can still be English or browser-controlled.
  Doctor's no-opt-in signed download retains JSON. No test demonstrates a real browser
  popup, download or automatic retries.
- **Out of A-3.2 scope:** independent dashboard, doctors/search, inbox, onboarding,
  consent-management bodies and linked legal pages (their links in the shared shell
  are within scope); doctor journey and doctor-default English print/download.

#### Preserved verification and outstanding acceptance criteria

Previous run, without rerunning now: 451 unit tests/42 files, 406 synthetic HTTP E2E
checks, TypeScript, ESLint, production build and `git diff --check` passed. Fresh
loopback PostgreSQL 17.11 `citycare_audit_fresh` was bootstrapped with synthetic
fixtures; app and DB stopped afterward. Tests cover signed file bytes and forged,
expired-parameter, replay/cross-patient, missing/deleted and post-mint revoked-consent
checks; `storage.test.ts` covers correctly signed expired verification; FHIR checks
own export and anonymous denial, **not a direct signed-in cross-patient FHIR URL**
(the endpoint derives patient ID from the viewer); doctor print scope and default
English builder/download JSON have tests. No production infrastructure/database used.
HTTP E2E and static render are not browser interactions.

Portable Chromium launch previously failed exactly:
`/tmp/chromium: error while loading shared libraries: libnspr4.so: cannot open shared object file: No such file or directory` (exit 127).
`ldd` also listed `libnss3.so` and `libnssutil3.so` as not found. Browser
interaction, keyboard/accessibility and Devanagari rendering/print checks **NOT RUN**.
To meet acceptance: resolve the must-fix register; complete supported-browser checks
in all three locales for every requested workflow including consent denial and print;
verify keyboard/screen-reader and Devanagari output; obtain qualified clinical,
privacy/legal and language review; rerun affected tests and full final verification;
then obtain explicit owner acceptance. No automatic acceptance claimed.

### A-3.2 must-fix localization/accessibility continuation — owner review pending

**Status: implemented in part; A-3.2 NOT ACCEPTED.** This entry supersedes the
previous audit's defect register where noted, but the provenance and browser limits
below prevent a claim that every acceptance criterion is fully established.

- **Allergy severity:** `records-presentation.ts` maps the schema's full
  `AlertSeverity` set INFO/WARNING/CRITICAL to typed en/hi/mr presentation strings;
  patient print and the patient allergy badge use that mapping. Source allergen and
  stored severity are not rewritten. Unknown severity remains source in the patient
  helper; the English shared print builder retains its prior behavior. INFO translation
  is new and remains subject to qualified review. Doctor print builder is unchanged.
- **Predefined readings:** exact canonical names of the seven selector options map
  to existing translation keys for patient chart headings, chart aria names, recent
  reading and remove labels, and patient print. Unknown/non-exact source values are
  displayed verbatim. Storage, request bodies, values, units, statistics and doctor
  chart defaults are unchanged. **Provenance limitation:** historical Observation
  has no application-owned/user-entered name discriminator. A user-entered or
  imported name *identical* to a canonical string is indistinguishable and will also
  receive the display alias in Hindi/Marathi; the original name is shown beside the alias. The database source is not changed, but
  the literal requirement never to translate any arbitrary user-entered name cannot
  be proven for collisions. A provenance-aware data design or explicit owner decision
  is needed; no migration or invented provenance was introduced here.
- **Scoped rendering error:** new `patient/records/error.tsx` shows locale catalog
  fallback and retry, never renders the supplied error/stack. It catches errors within
  that Next.js segment, not parent patient layout/root errors. It does not change
  auth, doctor/admin handling or API semantics.
- **Document language:** server `<html>` uses `DEFAULT_LOCALE` (English) because
  the saved preference is browser localStorage and cannot be known at SSR. The
  server's content and initial lang therefore agree; `LanguageSwitcher` layout effect
  synchronizes `document.documentElement.lang` when hydration applies the saved
  preference and on later preference changes. jsdom React hydration tests confirm
  the selector/DOM and absence of recoverable hydration errors for en/hi/mr; they
  are not browser/assistive-technology tests. With JS disabled SSR stays English;
  the preference cannot be applied before hydration. The root preference also
  applies to independent English-only/doctor pages; mixed-language inherited metadata
  outside scoped records remains a limitation requiring assistive review.
- **Invalid date:** `TrendDateField` renders an `aria-invalid` input with a unique
  `aria-describedby` pointing to the localized `role=alert` message only when invalid;
  the existing validation, request guard, busy cleanup and date conversion remain.
  Static tests validate association in each locale, not actual screen-reader output.
- Files this continuation: `web/src/lib/i18n.ts`,
  `web/src/lib/records-presentation.ts`, `web/src/lib/patient-print-summary.ts`,
  `web/src/components/{trends,patient-records-cards,language-switcher}.tsx`,
  `web/src/app/{layout,patient/records/page,patient/records/error}.tsx`,
  `web/src/lib/__tests__/{records-fixes,document-language-hydration}.test.ts`,
  `web/package.json`, `web/package-lock.json` (jsdom added as a dev-only dependency
  for React hydration tests), this ledger and `CITYCARE_A32_TRANSLATION_REVIEW.md`.
  No auth, clinical calculation, production infrastructure, schema or data migration
  changes. Translation package now has 213 rows; human approval remains pending.

**Verification from `web/`:** `npm test` **470 passed, 0 failed, 0 skipped, 44 files**;
`records-fixes.test.ts` tests INFO/WARNING/CRITICAL screen and print, all seven exact
names, unknown fallback in charts and print, accessible names/date association, safe
error and doctor chart; `document-language-hydration.test.ts` runs React server
markup/hydration and preference switching in jsdom. Records/documents catalog parity
209/209 in each locale is not route or translation approval. `npx tsc --noEmit -p .`,
`npm run lint`, `git diff --check` and `VERCEL_ENV=development RETENTION_POLICY=demo
DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150 npm
run build` passed; schema sync skipped. Full synthetic HTTP E2E with fresh isolated
loopback PostgreSQL 17.11 `citycare_locale_final_fresh`, `FORCE_SEED=1 node
scripts/db-bootstrap-node.mjs`, `BASE=http://127.0.0.1:3111 node scripts/e2e.mjs`:
**406 passed, 0 failed**. Existing patient isolation, forged/expired/replayed and
revoked-consent signed download, FHIR auth and scoped doctor print checks passed.
A preceding fresh `citycare_locale_fixes_fresh` run also passed 406/0 before the final source-visible alias adjustment; the final run used the new database and rebuilt app. Only synthetic fixtures used; test app and DB stopped. Initial attempted edit script
ran with wrong cwd and made no changes; rerun from repository root succeeded.

**Browser/accessibility/print NOT RUN:** temporary Puppeteer + Sparticuz Chromium
outside the repository again exited 127 with `/tmp/chromium: error while loading
shared libraries: libnspr4.so: cannot open shared object file: No such file or
directory`. `ldd /tmp/chromium` additionally reports `libnss3.so` and
`libnssutil3.so` missing. No cached copies existed; local non-privileged
`apt-get download libnspr4 libnss3` failed `Unable to locate package` for both
(package index unavailable). No system or production infrastructure modified. No
real keyboard, screen reader, browser locale interaction, Devanagari font or print
layout check was run; jsdom/static/HTTP tests are not those checks. Existing review
and UI limitations from the preceding audit remain except the changes described here.
Qualified clinical/privacy/legal translations and explicit owner acceptance remain
outstanding.

### A-3.2 trend provenance safety and acceptance readiness — NOT ACCEPTED

**Finding and safe behavior.** `schema/citycare_init.sql` Observation has free-text
`name`, `category`, nullable `encounterId`, values and units but no predefined-option
ID or origin marker. The patient POST `/api/patient/observations` accepts both name
and category from the request, generates only a row UUID and always writes NULL
`encounterId`; seed uses the same columns directly. Thus category, encounterId, name,
row ID, reference ranges, or matching names cannot prove selector provenance. Repository
search found patient POST and synthetic seed as Observation INSERT paths; doctor record
reads scoped rows, not a provenance flag. Series grouping uses case-insensitive names
and can combine rows from different origins. No currently persisted reliable identifier
can establish that an observation name is app-owned.

Accordingly removed `patientTrendName` and its exact-string alias mapping from
`records-presentation.ts`, `TrendsPanel`/`TrendSparkline`, recent reading/remove aria
labels and `buildPatientPrintSummary`. Stored-reading source names, including an
arbitrary/manual reading called exactly `Fasting glucose`, now pass through untranslated
in en/hi/mr; unknowns do likewise. The application-owned selector itself still has
localized captions while its canonical option values are unchanged. Resulting known
limitation: charts, recent readings, printed readings and their accessible names may
contain English/source-language names in Hindi/Marathi, including the app's previously
selected names. No claim of full localized display. Existing `buildSeries` still
case-folds/group names and trims the first display spelling, as before; recent-row
names are directly displayed. This change does not alter grouping, values, units,
statistics, request bodies, stored records or doctor output.

**Optional future design (proposal only, no migration):** if the owner requires
localized historical readings, a separately designed nullable, validated stable
application measurement identifier and origin/provenance field could accompany new
writes through storage, APIs, FHIR/scoping, series and print. Migrate with backward-
compatible nullable defaults and preserve old clients/readers; unknown historic rows
must stay unknown without guessing from names. Decide how mixed-provenance series
are grouped, audit origin assignment and avoid asserting a code solely because a
client supplied one. Review canonical-code/clinical semantics and maintain original
name and unit. This implies schema migration, deployment compatibility/rollback and
integrity tests and owner authorization; none performed in this milestone.

**Review of five earlier fixes:** allergy INFO/WARNING/CRITICAL patient labels still
render and test across three locales, unknown severities fall back; doctor print
unchanged. Text-inferred patient trend aliases are **removed**, with selector-only
translation as described above. The records-segment error fallback still hides the
error and supplies a retry (does not cover parent/root errors). Root lang switches
after hydration via saved preference; SSR and JS-disabled remain English, and
English-only doctor/other pages inheriting global language may need accessibility
review. Invalid-date `aria-invalid`, unique `aria-describedby` and alert remain,
with static tests; real announcement has not been verified. English/hindi/marathi
clinical/legal/security translations have not received qualified approval.

**Regression and verification:** code changes in `web/src/components/trends.tsx`,
`web/src/lib/patient-print-summary.ts`, `web/src/lib/records-presentation.ts` and
`web/src/lib/__tests__/records-fixes.test.ts`; documentation updated in this ledger
and the translation review package. `npm test`: **470 passed / 44 files**, 0 failed,
including source-name collision, unknown/custom/historical-shaped rows, localized
selector options, chart/recent/print/aria and doctor English, severity, safe error,
date association and jsdom hydration. There is no reliable persisted identifier to
test as a proven selector-origin case; only the current in-memory option identity is
known. Tests check inputs unchanged and existing trend math tests run; existing HTTP
E2E F5 checks a submitted synthetic value in DB and doctor record names/numbers.
`npx tsc --noEmit -p .`, `npm run lint`, `git diff --check`, and
`VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1
NODE_OPTIONS=--max-old-space-size=1150 npm run build` passed; schema sync skipped.
Full `BASE=http://127.0.0.1:3111 node scripts/e2e.mjs` against freshly bootstrapped
isolated loopback PostgreSQL 17.11 `citycare_provenance_fresh` (`FORCE_SEED=1 node
scripts/db-bootstrap-node.mjs`, synthetic data only) passed **406, failed 0**,
including patient isolation, signed-link forged/replay/expired/deleted and consent
revocation, FHIR access, and patient/doctor print scoping. App and DB stopped; no
production database or infra touched. HTTP and static/jsdom tests are not browser
interaction or screen-reader evidence.

**Browser verification NOT RUN:** fresh launch attempt with temporary Puppeteer and
Sparticuz Chromium failed with exit 127: `/tmp/chromium: error while loading shared
libraries: libnspr4.so: cannot open shared object file: No such file or directory`.
`ldd /tmp/chromium` also reports `libnss3.so` and `libnssutil3.so` missing. No actual
browser locale switching, keyboard/screen-reader announcement, Devanagari display,
print layout or dynamic states verified. Qualified translation review and owner
acceptance remain outstanding. The original 210-row translation review package is
preserved with three later additions (213 rows total); no professional, clinical or
legal approval claimed. No commit, push, PR, merge or deploy.

### A-3.2 browser and accessibility QA — implementation frozen, NOT ACCEPTED

A real headless Chromium 153.0.8010.0 launched against fresh isolated PostgreSQL
17.11 `citycare_browser_qa_fresh`, synthetic seed only, after NSPR was built from
Mozilla source and NSS unpacked from `chrome-aws-lambda` **outside the application**.
The attempted full NSS build failed (`multiple target patterns`); no production
infrastructure or app functionality changed. Serverless Chromium flags include
`--no-sandbox` and `--disable-web-security`, so browser sandbox/CORS/CSP security
was not validated. App/DB are stopped after QA. The detailed results, exact defect
reproduction, severity, component and recommended correction are in
[`CITYCARE_A32_BROWSER_QA.md`](CITYCARE_A32_BROWSER_QA.md); synthetic screenshots,
PDFs, axe findings and raw test logs are in `qa-evidence/`.

**Browser passes:** en/hi/mr locale selection, root lang/reload persistence;
populated and empty states; synthetic document upload/signed file download/delete;
fault-injected document loading/error/retry; valid trend save and cleared-date
DOM association; sample prescription preview/POST/confirmation (first run); FHIR
success and fault-injected failure; patient UI consent revoke followed by absent
scoped doctor print and 403 record request; print-button audit POST and
`beforeprint` event. Headless direct PDF generation executed in all three locales.
Initial selector/download harness issues were corrected and retried; the repeat
backfill run timed out because the same synthetic sample was already processed,
not evidence of a defect. App-level revocation was tested despite insecure browser
test flags; browser security policy checks were not.

**Actual browser failures/findings requiring owner disposition, not fixed:** 390px
viewport had document `scrollWidth=411` in all locales; PDFs had blank extra pages
(4 en, 3 hi/mr, with text on page 1 only); axe found moderate `page-has-heading-one`
and `region` findings in all locales. Initial isolated environment without a
Devanagari fallback produced missing glyph boxes; supplying a test-only Noto Sans
Devanagari font made Hindi/Marathi text legible. This is a conditional environment/
font-delivery issue, not proof of failure on every supported device. No product code
was altered to fix or bypass findings.

**Accessibility executed:** 20 English Tab presses with observed 2px visible focus;
axe-core and a Chrome accessibility-tree check of Hindi invalid-date name,
description and invalid state; status/alert roles inspected. Actual keyboard-only
end-to-end, assistive-language speech and screen-reader announcements **NOT RUN**.
**Print executed:** headless A4 PDFs, extracted text/pages and rasterized first/blank
pages; real native dialog, physical print and long-record pagination **NOT RUN**.
**Rendering:** sample Hindi/Marathi desktop/mobile and PDF inspected with a test-only
font; real devices and exhaustive clipping **NOT RUN**. Qualified language/clinical/
legal review remains pending. Earlier unit/HTTP results remain separate; none were
counted as browser verification. No acceptance implied; await owner decision.

### A-3.2 browser defect triage — remediation proposed, no implementation

Reviewed browser QA report/axe outputs, synthetic mobile and Hindi/Marathi print
page screenshots, route/component/CSS/font sources, then reran isolated synthetic
Chromium with **temporary in-memory** DOM/style experiments. Full reproduction,
root-cause evidence, patient impact, minimal candidate changes, regression/browser
verification and owner decisions are in
[`CITYCARE_A32_REMEDIATION_PROPOSAL.md`](CITYCARE_A32_REMEDIATION_PROPOSAL.md);
measurements are in `qa-evidence/triage-measurements.json`. A-3.2 stays frozen and
NOT ACCEPTED. No product-code changes, migration, commit, push, PR or deployment.

- **QA-2:** at 390px document 411px wide; records outer grid auto track 395px despite
  a 358px content box. Document manager's unconstrained native file input and trends
  value/unit flex controls are separate min-content contributors (file removed 411→406;
  with file removed either trend field removed 406→390). All records cards are
  widened; navigation is separate intentional internal scrolling. Temporary broad
  shrink/wrap experiment fit 320/375/390/414 in all locales but is not implemented,
  minimized or a desktop visual verification.
- **QA-1:** patient print hides screen elements with `visibility:hidden` and overlays
  an absolutely positioned summary, leaving hidden body/main height in print flow.
  At hi print, body ~2264px, hidden main ~2030px, summary ~749px; experimentally
  isolating identical summary text in normal flow reduced 3 A4 pages to 1. A 100-line
  synthetic long-summary test retained all markers in both variants; full long-record
  visual and native printer checks remain outstanding. Shared doctor print must not be
  silently altered.
- **QA-3:** missing screen H1 and two outside-landmark blocks are genuine navigation
  best-practice findings, not proven WCAG failures; `role=note` is not a landmark.
  Suggested a localized patient H1 and a named patient-scoped landmark without adding
  duplicate banners or changing doctor structure; requires accessibility review.
- **QA-4:** no Devanagari font in stripped environment caused tofu; Noto supplied only
  for QA restored glyphs. Inter loads but has no Devanagari codepoints; screen and
  print rely on platform fallback, and print names Noto without bundling it. This is a
  demonstrated environment issue / conditional product portability risk, not evidence
  of universal failure. Font support policy, tested compressed size, OFL 1.1 licensing,
  offline behavior and deployment implications need owner decision before bundling.

Actual screen-reader, native print-dialog, physical-printer and multi-browser/device
verification remain NOT RUN. The headless test browser used insecure serverless flags;
no browser security enforcement validated. Await explicit owner authorization; STOP.

### A-3.2 — authorized browser QA remediation; still NOT ACCEPTED

Owner authorized the scope in `CITYCARE_A32_REMEDIATION_PROPOSAL.md`. Implemented
only A-3.2 patient records fixes; no product schema/migration, authorization, consent,
stored clinical source values, doctor print rules or dependency changes. No commit,
push, PR or deployment. New markup remains subject to qualified language review.

**QA-2 resolved for tested fixtures:** mobile records outer grid uses a shrinkable
single column; document native file control is width constrained below `sm`; patient
interactive trend form/grid and recent rows can shrink/wrap. Patient-records-scoped
mobile wrapping also preserves unusually long source strings rather than clipping or
translating them. `web/src/app/patient/records/page.tsx`,
`web/src/components/document-manager.tsx`, `web/src/components/trends.tsx` and
`web/src/app/globals.css` changed. Before, all en/hi/mr sampled 320/375/390 widths had
411px scroll width; after, Chromium reported matching client and scroll widths at
320/375/390/414/768/1280 for all three languages on the synthetic populated fixture.
At 320px, browser-only 216-character synthetic unbroken names in each of medicine,
allergy badge, chart, recent reading and document title separately still produced
320px page width. This is targeted test coverage, not a guarantee for all content.
Navigation retains its own horizontal scroller. Desktop 1280 screenshots and grid
measurements show the existing two-column arrangement retained; the intended new H1
changes vertical position, and fixture data differs between before/after screenshots.
They are not a pixel-identical desktop comparison.

**QA-1 resolved for patient short-summary PDF samples:** patient records now separates
summary from its screen content; a patient-only print rule removes screen layout from
print flow and uses static summary flow, leaving shared doctor rules intact. Changed
`web/src/app/patient/records/page.tsx`, `web/src/app/patient/layout.tsx` and
`web/src/app/globals.css`. Prior headless A4 sample: en 4 pages, hi/mr 3, only page 1
had text; final short synthetic sample: **1 page en, 1 hi, 1 mr**, no extra page.
PDF text includes the expected seeded allergies, conditions, medication names, selected
reading/lab names and encounter/advice tokens in all locales; PDF screenshots were
inspected. A browser-only long Marathi summary with 100 additional synthetic markers
rendered 3 nonempty pages, all 100 markers and footer text extracted. This is not an
exhaustive comparison of all possible clinical content or physical pagination.

**QA-3A/3B resolved in automated checks:** a visible localized patient records H1
reuses `records.shellRecords`; a named localized patient-only region wraps existing
notice and language control without adding a second banner landmark or changing
non-patient markup. Files: `web/src/components/patient-records-cards.tsx`,
`web/src/components/patient-notice-region.tsx`, `web/src/app/layout.tsx`,
`web/src/lib/i18n.ts`; the translation review package adds the three new region-name
translations (214 rows total), all still awaiting human review. Chromium axe-core on
populated records at 1280 reported **zero violations** in each locale (previously
`page-has-heading-one` and `region`); browser DOM found exactly one visible H1 and the
localized named region. `web/src/lib/__tests__/a32-browser-remediation.test.ts` adds
static checks for these patient and nonpatient cases and patient-only print rules.
This is not an assertion of general WCAG conformance.

**QA-4 disposition:** no application font-loading failure was established, and no
font package or bundled asset was added. Devanagari is legible in the tested browser
when its isolated fontconfig supplies Noto Sans Devanagari variable TTF from Google
Fonts' GitHub `ofl/notosansdevanagari` (SIL OFL 1.1; ~627 KiB test TTF, not added to
app). CDP observed the installed Noto fallback for Hindi glyphs alongside loaded
Inter; Hindi and Marathi screen/print screenshots were inspected. Inter itself lacks
Devanagari; systems without a suitable fallback can still show missing-glyph boxes.
This is a **remaining platform/font-delivery risk**, not marked fixed; an owner
supported-platform/bundling decision and license/size/deployment review remain needed.

**Actual browser workflow regression:** on fresh synthetic seed, en/hi/mr locale and
reload, document upload 201, signed-link 200 and browser fetch of `%PDF`, delete 200,
valid trend save 201, FHIR response 200 and localized download status, patient print
audit 200 and `beforeprint` passed. English sample prescription preview, save and
confirmation passed. This time document signed bytes were checked with browser fetch
after clicking Open, rather than verifying a native save dialog; FHIR ready state does
not prove an OS download dialog. Doctor Sheikh's authorized Anita summary remained
present; comparing doctor print with the five new patient-only rules removed in-memory
produced **identical raster hashes**, same two-page PDF (711/0 extracted characters),
and unchanged absolute positioning. A doctor without consent had no print summary
and record request returned 403. The doctor sample's second blank page is a **known
remaining doctor-print issue**: preserving doctor behavior was explicitly required,
so no doctor print fix was made. Patient tests do not imply no blank doctor pages.

**Additional observed keyboard issue — NOT FIXED / owner decision required:** at
320px, keyboard Tab can focus an internally scrolling patient nav link without bringing
it fully into view: English Records link reached x=381 while nav right edge is x=304
and nav scrollLeft was 0. Screenshot `qa-evidence/remediation/nav-keyboard-clipping.png`;
hi/mr samples also had partially out-of-viewport focused links. This is separate from
the two authorized records sizing causes and needs scope/owner review. In the same
35-Tab samples, native date inputs did not match `:focus-visible` on the parent input
while matching `:focus-within`; native shadow-control focus appearance was not
conclusively assessed. Full keyboard-only tasks and actual screen-reader speech,
language announcements and navigation **NOT RUN**.

**Verification:** TypeScript `npx tsc --noEmit -p .` and ESLint passed; `npm test`
**478 passed / 45 files**. Production build passed with schema sync explicitly
skipped (`DATABASE_URL=''`, development build context). Full HTTP E2E against a fresh,
separate synthetic PostgreSQL 17.11 database: **406 passed, 0 failed**. An initial
isolated E2E run had 4 backup-configuration failures because its test BACKUP_KEY was
not base64; after correcting the isolated synthetic environment and reseeding a fresh
DB, the final run passed. Bootstrap and E2E exercise DDL only in isolated scratch
synthetic databases; no product migration/schema alteration was made. Chromium
153.0.8010.0 used recovered local NSPR/NSS and serverless insecure flags
(`--no-sandbox`, `--disable-web-security`), so no browser security-policy assurance.
App/database services stopped after testing. `git diff --check` passed. Evidence,
PDF analysis, screenshots, JSON and QA-only scripts: `qa-evidence/remediation/`;
prior before evidence remains in `qa-evidence/`. Native print dialogs, physical
printing, representative real devices/other browsers, full visual long-document
pagination and human clinical/legal/translation review remain outstanding. STOP for
owner review; A-3.2 is not accepted.

### A-3.2 — QA-2-only iteration and expanded viewport matrix; NOT ACCEPTED

Owner authorized **QA-2 only** and instructed preservation of existing uncommitted
work. QA-1/QA-3A/QA-3B work from the prior, separately authorized iteration already
existed; it was preserved, not newly implemented or reverted here. QA-4 was not
changed. The previously implemented QA-2 scope remains in patient records page,
DocumentManager and interactive TrendsPanel, with existing patient-records-scoped
mobile wrap CSS in `globals.css`; no global `overflow-x` hiding is used.

**New changes in this iteration:** only `web/src/components/trends.tsx` and
`web/src/lib/__tests__/patient-trend-i18n.test.ts` changed, in addition to this ledger
and QA evidence. An actual 60-character synthetic custom name exposed an additional
768px overflow in the patient chart at the desktop breakpoint: en/hi/mr document
scroll width **924** vs client **768**. Patient-only chart name and recent-row
`min-width:0` / `overflow-wrap:anywhere` now allow the source name to wrap at all
widths; read-only doctor chart markup is unchanged. When a selected reading name is
longer than 30 characters, the patient form displays the complete original selected
name in a wrapping line below the native select (whose single-line label can otherwise
be visually truncated). No source name, value, unit or API payload is translated or
changed. Normal desktop uses the same two-column tracks; the supplemental line is an
intentional layout change only for long selected names. The new unit test asserts the
long name in patient markup and the original doctor class/absence of those wrap classes.

**Measurements:** before the original QA-2 sizing remediation, the synthetic populated
fixture's document scroll widths, same for each en/hi/mr locale, were 411 / 411 / 411 /
414 / 768 / 1280 at 320 / 375 / 390 / 414 / 768 / 1280 CSS pixels respectively
(`qa-evidence/triage-measurements.json`). After the earlier remediation but before this
iteration's long-name fix, a 60-character custom reading with long filename yielded
320 / 375 / 390 / 414 / **924** / 1280 in en and mr, and the same through 768 in hi;
the hi 1280 initial run timed out in the test harness and was not measured
(`qa-evidence/qa2/matrix-initial.json`). Final full browser matrix, with actual long
custom reading and 113-character synthetic filename, in **each en/hi/mr locale**:

| Viewport | Prior original scroll width | Final client / scroll width |
|---|---:|---:|
| 320 × 844 | 411 | 320 / 320 |
| 375 × 844 | 411 | 375 / 375 |
| 390 × 844 | 411 | 390 / 390 |
| 414 × 844 | 414 | 414 / 414 |
| 768 × 844 | 768 (normal fixture); 924 with long reading | 768 / 768 |
| 1280 × 900 | 1280 | 1280 / 1280 |

The final matrix also checked main records form controls/chart bounds; no sampled
control extended beyond the viewport. Every combination used the native file input to
select a synthetic PDF, fault-injected delayed upload 500 to inspect busy and error,
then uploaded 201 and deleted 200; edited trend value/unit, cleared date and observed
invalid state, fault-injected delayed save 500 to inspect busy/error, then saved 201.
Browser automation used Puppeteer's `uploadFile`; the native OS picker itself was not
interacted with. The visible full selected value, chart name and recent name all kept
the exact synthetic string with no element scroll overflow at every combination
(`long-text-bounds.json`). Native select's single-line text can still ellipsize, but the
full selected value is displayed immediately below it. No exhaustive arbitrary-content
or device-size guarantee is claimed. Fault injection is not a real service outage.

Horizontal wheel gestures moved the patient nav's own scroll position in all 320–414px
cases; at 768/1280 all tabs fit in the sampled locales. At every matrix combination
35 real Tab steps were checked for `:focus-visible`, `:focus-within` and clipping.
**Remaining known issue:** focused nav links can be partially clipped by their internal
scroller at 320–414px in en/hi/mr; this is separate from the two authorized QA-2 sizing
contributors and was not modified. Native date inputs' parent `:focus-visible` did not
match while `:focus-within` did; screenshots `date-focus-21.png` and `date-focus-30.png`
show a native black outline on the calendar subcontrol in this headless Chromium
sample. This does not establish full keyboard or screen-reader accessibility. No actual
screen reader, native picker dialog, touch device or other browser was used.

**Desktop / doctor:** before/after 1280 synthetic screenshots are preserved in
`qa-evidence/qa2/initial-en-1280.png`, `records-en-1280.png` and locale-specific
screenshots; the long selected name deliberately wraps and shows a full-value hint.
A same-DOM controlled comparison at 1280 with long QA entries hidden and the new wrap
classes temporarily removed produced identical grid/card bounding boxes in all locales
(`desktop-comparison.json` and screenshot pairs). English/Hindi last-run image bytes
were not identical despite matching geometry; no pixel-perfect claim. A real consented
doctor browser view showed the synthetic two-point read-only trend, English chart label,
original name class and value; the doctor component's noninteractive branch remains
unchanged. Screenshot/JSON in `qa-evidence/qa2/doctor-trend*`.

**Regression:** final code TypeScript and ESLint passed; unit suite **479 passed / 45
files**; production build passed with database schema sync skipped. Full HTTP E2E on a
fresh isolated synthetic PostgreSQL 17.11 database **406 passed, 0 failed**. Isolated
seed/bootstrap and E2E created scratch schema only; no product migration, shared or
production database, deployment or infrastructure change. Chromium 153 used isolated
NSPR/NSS and test-only Noto from Google Fonts, with serverless `--no-sandbox` and
`--disable-web-security`; results do not validate browser security policy. All app and
DB processes stopped; `git diff --check` passed. Matrix, before/after screenshots,
keyboard traces and executable QA harnesses are in `qa-evidence/qa2/`. No commit,
push, PR, merge or deployment. A-3.2 remains unaccepted; STOP for owner review.

### QA-1-only follow-up: patient print pagination verification (2026-11-06; owner review pending)

**Scope and prior state.** Inspected the working tree/diff, QA-1 proposal, earlier remediation PDF analysis and this ledger before changes. The existing uncommitted QA-1 implementation already addresses the identified cause: `visibility:hidden` left the screen layout occupying print space while the summary was absolutely overlaid. Patient-scoped CSS now removes non-summary content with `display:none` and puts the summary in normal flow (`position:static`), with hooks in the patient layout and records page. The shared doctor rules are not changed by that correction. This iteration changed **no product files** and did not redo the correction; it adds `qa-evidence/qa1/` (PDFs, per-page raster PNGs, DOM/PDF analysis, reproducibility scripts and README) and this ledger entry. QA-2 and QA-3 work was preserved; A-3.2 remains **NOT ACCEPTED**.

**Actual headless Chromium output** (fresh local synthetic DB; explicit PDF A4/Letter and print backgrounds; Noto Sans Devanagari supplied through sandbox Fontconfig):

| Locale | A4 short | A4 long | Letter short | Letter long |
|---|---:|---:|---:|---:|
| English | 1 | 3 | 1 | 3 |
| Hindi | 1 | 3 | 1 | 3 |
| Marathi | 1 | 3 | 1 | 3 |

The long test uses actual isolated database clinical rows, not DOM injection: 14 synthetic allergies, 14 conditions, 60 confirmed medications, 3 excluded drafts, 12 named reading series, 5 recent labs and a new last encounter with diagnosis/advice, in addition to the demo seed. All 107 unique fixture markers appeared exactly once per long PDF; draft medicine names were absent, while the exclusion note and the identity, sections, visit and footer were visible. Each page had extracted text; no patient blank page, clipped content or overlapping lines was observed in raster inspection of the 24 patient pages. Medication continuation has no repeated heading; large records beyond this fixture are not exhaustively covered. The last page retains a pale background rectangle below the footer when printing backgrounds. The existing summary intentionally limits labs to five and prints the latest visit, not all historical encounters or arbitrary medication notes.

PDFium extracted all English DOM section/footer lines after whitespace normalization. Exact matching could not be established for 3–5 Hindi/Marathi DOM lines per PDF (headings, footers and/or draft note) because of shaping/extraction differences; do not claim complete Unicode text extraction or assistive-technology compatibility. Visual inspection is not qualified translation review. See `qa-evidence/qa1/pdf-analysis.json`, `browser-matrix.json`, page rasters and README for evidence/limitations.

**Doctor regression.** With a genuinely consented seeded doctor/patient, current rules and patient-specific rules removed in-memory produced identical PDFium raster pixels on each page for A4 and Letter. Both were 2 pages, the second text-empty: pre-existing doctor blank-page issue, outside this patient-only scope, not repaired. A different non-consented patient had no doctor summary and the record API returned 403. These checks do not constitute a complete authorization audit.

**Commands/results.** From `web`: `npx vitest run src/lib/__tests__/patient-print-summary.test.ts src/lib/__tests__/print-summary.test.ts src/lib/__tests__/a32-browser-remediation.test.ts` (28/3 files); `npx tsc --noEmit -p .` (pass); `npm run lint` (pass); `npm test` (479/45 files); `VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150 npm run build` (pass; prebuild DML=0, DDL=0); `source /home/user/synthetic-pg/env; BASE=http://127.0.0.1:3112 DATABASE_URL=postgresql://citycare@127.0.0.1:5432/citycare_qa1_e2e node scripts/e2e.mjs` (406/0 with synthetic 32-byte base64 backup key). The E2E suite itself executes migration-apply validation against a fresh **isolated scratch loopback** database; no production/shared database or deployment was touched and no migration files were changed. The fresh local print and E2E databases were bootstrapped with `scripts/db-bootstrap-node.mjs`. Browser capture: `FONTCONFIG_FILE=/tmp/fonts/fonts.conf LD_LIBRARY_PATH=/home/user/browser-libs/extract/lib:/home/user/browser-libs/nspr/build/dist/lib node /home/user/browser-check/qa1-print.cjs`; analysis: `PYTHONPATH=/home/user/browser-check/python python3 /home/user/browser-check/qa1-analyze.py`; scripts are also retained under the evidence directory. `git diff --check` passed. No new application dependencies or translations.

**Limits / stop.** Only isolated headless Chromium PDF generation was tested, not native print preview, physical printers, other browser engines or a screen reader. Devanagari font availability on other hosts remains unverified; no font was bundled. The previously documented narrow navigation focus clipping and doctor blank page remain open and outside this scope. Human review of clinical/legal/privacy translations remains required. Stop for owner review; no acceptance, commit, push or deployment.

### QA-3A-only: visible records H1 in route and fallbacks (2026-11-06; owner review pending)

Inspected `git status`, tracked diff, `CITYCARE_A32_BROWSER_QA.md`, `CITYCARE_A32_REMEDIATION_PROPOSAL.md`, prior remediation evidence and this ledger before editing. Existing uncommitted `PatientRecordsIntro` already supplies the original populated/empty records H1 via `records.shellRecords`, prior to H2 sections; the print-only H1 is hidden on screen. No change to that implementation was needed. Actual browser testing, however, found **zero visible H1 in records loading and records error fallbacks** in all three locales. To meet the one-visible-heading requirement in those states, this iteration changed only `web/src/app/patient/records/error.tsx` (existing untracked file: localized H1 before existing alert text/button), added `web/src/app/patient/records/loading.tsx` (records-only localized H1 plus the existing shared patient skeleton), and added `web/src/lib/__tests__/patient-records-heading-fallback.test.ts` (3 locale cases). No catalog/translation changes. Existing QA-1, QA-2, QA-3B and unrelated work were preserved. Evidence files added only under `qa-evidence/qa3a/`; this entry updates the ledger. A-3.2 is **NOT ACCEPTED**.

**Actual browser results.** Headless Chromium 153, synthetic demo populated long record and a separate empty patient, en/hi/mr: exactly one visible on-screen H1, respectively `Records`, `रिकॉर्ड`, `नोंदी`; six visible H2 sections in populated state follow the H1 with no level skip. The separate print H1 stays hidden on screen. At 320, 375, 390, 414, 768 and 1280 CSS px, document scroll width equals client width in each locale for populated and empty states. At 320px Marathi, a 214-character DOM-only synthetic medicine/chart string retained its full text without document overflow (not an exhaustive QA-2 workflow re-test). Loading and error were reached in the real browser using a temporary table lock and terminating the blocked synthetic read twice; both localized fallback states rendered one H1 and no document overflow at each of the same 18 locale/width combinations. No DDL/migration/fixture-row update was used. Normal application login and doctor record access wrote only synthetic sessions/audit entries.

**Observed limitation:** the existing error-boundary `Try again` did not restore the page within six seconds after the deliberately induced two-query termination, either before or after the H1 change; browser reload did restore the empty record. Root cause not investigated and retry behavior was not altered under this heading-only authorization. `qa-evidence/qa3a/error-states.json` records the result. Thus the heading and error message are verified, not successful recovery via the retry button.

**Regression.** Screen H1 is removed from print flow and only the print summary H1 appears; long A4 Chromium PDF is three nonempty pages in each language, with six selected synthetic clinical markers once each (`qa-evidence/qa3a/print-analysis.json`). This is a focused check, not a repeat or replacement of the full QA-1 matrix. The consented doctor route displayed the same existing five visible H2 headings and no visible H1 (its print H1 is hidden); doctor route and workspace source have no tracked diff from HEAD. Non-consented doctor record API returned 403. No claim is made that the doctor heading structure itself is ideal. Existing QA-1 doctor blank page and QA-2 navigation keyboard-focus clipping remain open and unchanged.

**Commands/results** from `web`: `npx vitest run src/lib/__tests__/patient-records-heading-fallback.test.ts src/lib/__tests__/a32-browser-remediation.test.ts src/lib/__tests__/patient-records-cards.test.ts src/lib/__tests__/patient-records-route-i18n.test.ts src/lib/__tests__/patient-shell-i18n.test.ts src/lib/__tests__/patient-print-summary.test.ts src/lib/__tests__/print-summary.test.ts src/lib/__tests__/patient-trend-i18n.test.ts` (**58 passed/8 files**); `npx tsc --noEmit -p .` (pass); `npm run lint` (pass); `npm test` (**482 passed/46 files**); `VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150 npm run build` (pass, prebuild DML=0/DDL=0). From repo root: `node qa-evidence/qa3a/http-e2e.cjs` (**14 focused HTTP checks passed**); `NODE_PATH=/home/user/browser-check/node_modules FONTCONFIG_FILE=/tmp/fonts/fonts.conf LD_LIBRARY_PATH=/home/user/browser-libs/extract/lib:/home/user/browser-libs/nspr/build/dist/lib node qa-evidence/qa3a/browser-http.cjs` (matrix/doctor/print checks pass); same environment `node qa-evidence/qa3a/error-states.cjs` (headings/overflow pass; retry limitation above); PDFium extraction as documented in `qa-evidence/qa3a/print-analysis.json`; `git diff --check` (pass). The full `scripts/e2e.mjs` was **not run** because it creates scratch schemas and executes migration DDL, contrary to the current no-database/schema-changes-or-migrations boundary. Focused HTTP E2E is not equivalent to the full suite.

The environment reused an already-provisioned isolated synthetic database; no schema operation, migration, external service, production data, new dependency, deployment, commit, push, PR or merge. Browser uses serverless insecure flags and test-only Noto, not a shipped font. No native print preview, physical printer, other browser engine, screen reader, qualified translation review or general accessibility-conformance claim. Stop for owner review.

### QA-3B-only: patient notices landmark verification (2026-11-06; owner review pending)

Inspected working-tree status/diff, `CITYCARE_A32_BROWSER_QA.md`, `CITYCARE_A32_REMEDIATION_PROPOSAL.md`, prior remediation evidence and this ledger before editing. The original axe `region` finding concerned the demo `role=note` and language selector outside landmarks; the patient shell already had header, nav, main and footer. The existing uncommitted QA-3B implementation in `web/src/components/patient-notice-region.tsx` and `web/src/app/layout.tsx` already places those two root children inside a single patient-only named localized section, returning a fragment on nonpatient routes. **No product code change was needed or made in this iteration.** Exact iteration files: `CITYCARE_IMPLEMENTATION_LEDGER.md` and the new `qa-evidence/qa3b/` scripts, screenshots, PDFs and analysis JSON. Earlier QA-1/QA-2/QA-3A/QA-3B work and evidence remain intact. A-3.2 remains **NOT ACCEPTED**.

**Before/after browser evidence.** To reproduce the pre-QA-3B structure without touching checkout code, an isolated copy of the current app was built with only `PatientNoticeRegion` replaced by a fragment. With banner on, Chromium axe's `region` rule flagged **two** outside-landmark nodes for each of en/hi/mr; with banner off it flagged **one**. Current implementation flagged **zero** in each of the six cases. In both modes and all locales there was exactly one named localized notice region followed by the existing HEADER, NAV, MAIN and FOOTER; no duplicated region, banner, or language select. On: one visible demo note within the region; off (`NEXT_PUBLIC_DEMO_MODE=0` at build and runtime): no demo note, with the language select still inside the region. Locale choice updated labels, HTML language and stored preference and persisted after actual reload; select description target existed. No patient page/console errors were captured. Region translations await qualified human review; a targeted axe rule is not a general accessibility or WCAG conformance claim.

For `/doctor`, `/admin` and public `/legal/privacy`, current vs fragment-only baseline normalized rendered body HTML matched in both banner modes for the tested Hindi preference (scripts/style/link elements and transient animation transform style excluded). The expected existing nonpatient landmarks remained and no patient region appeared. This controlled comparison isolates QA-3B, rather than claiming equivalence to the older main commit before other authorized localization work. See `qa-evidence/qa3b/browser-{on,off}.json` and README.

**QA-1/2/3A regression.** Populated records have exactly one visible localized screen H1; the print-only H1 remains hidden on screen and is the sole visible H1 in print. With both demo modes, long-record A4 PDFs have 3 nonempty pages for each locale and six selected marker strings occur once each. This is focused coverage, not a repeat of the full QA-1 matrix. Populated fixture scroll width equals viewport width for 320/375/390/414/768/1280 in all locales and both banner modes; 220-character injected medicine/reading strings fit at 320–414 in all locales (banner off). At 768 and 1280 a very long unbroken medicine name caused overflow in **both** current and fragment baseline: scroll/client 2415/768 and 2671/1280; the analogous chart label stayed within viewport. This newly observed wider-screen edge case is not caused by QA-3B and was not fixed under this scope. `qa-evidence/qa3b/long-text-comparison.json` records it. Existing keyboard-focus clipping, retry-button recovery and doctor blank-print-page limitations also remain open.

**Commands/results.** From `web`: `npx vitest run src/lib/__tests__/a32-browser-remediation.test.ts src/lib/__tests__/demo-banner-locale.test.ts src/lib/__tests__/patient-shell-i18n.test.ts src/lib/__tests__/i18n.test.ts src/lib/__tests__/patient-records-heading-fallback.test.ts src/lib/__tests__/patient-print-summary.test.ts src/lib/__tests__/print-summary.test.ts src/lib/__tests__/patient-trend-i18n.test.ts` (**66 passed/8 files**); `npx tsc --noEmit -p .` (pass); `npm run lint` (pass); `npm test` (**482 passed/46 files**). `NEXT_PUBLIC_DEMO_MODE=1 VERCEL_ENV=development RETENTION_POLICY=demo DATABASE_URL='' NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1150 npm run build` and the same command with `NEXT_PUBLIC_DEMO_MODE=0` both passed; each prebuild reported DML=0/DDL=0. Equivalent baseline-copy builds also passed with no database work. From repo root: `node qa-evidence/qa3b/http-e2e.cjs` (**14 focused HTTP checks passed**, banner off); `NODE_PATH=/home/user/browser-check/node_modules FONTCONFIG_FILE=/tmp/fonts/fonts.conf LD_LIBRARY_PATH=/home/user/browser-libs/extract/lib:/home/user/browser-libs/nspr/build/dist/lib node qa-evidence/qa3b/browser.cjs on` and `... node qa-evidence/qa3b/browser.cjs off` (locale, axe, landmark, regression and controlled comparison checks); same environment `node qa-evidence/qa3b/long-text-comparison.cjs` (same baseline/current widths; wider overflow noted). PDFium extracted page counts and six markers into `qa-evidence/qa3b/pdf-analysis.json`. `git diff --check` passed. Full `scripts/e2e.mjs` was deliberately **not run** because it executes prohibited schema/migration operations; focused HTTP coverage is not equivalent to the full suite.

Reused existing isolated synthetic DB; no schema/migrations or clinical fixture modifications. Normal login/authorized or denied doctor requests write synthetic sessions/audits. No production/shared DB, infrastructure settings, new app dependency, commit, push, PR, merge or deployment. Test-only Noto and Chromium serverless insecure flags were used; no actual screen reader, native print preview, physical printer, cross-browser, or translation-review claims. Stop for owner review.

### QA-4 assessment only — Devanagari support (2026-11-06; owner decision required)

Inspected the working tree, existing font/print configuration and prior QA-4 evidence. No application code, CSS, dependencies, font assets, schema, migration or clinical fixtures were changed; added only `qa-evidence/qa4/` (assessment, scripts, font coverage JSON, screenshots, synthetic A4/Letter PDFs and raster/text evidence) and this ledger entry. A-3.2 remains **NOT ACCEPTED**.

`next/font/local` serves the bundled 352,240-byte variable Inter WOFF2; FreeType finds **0/128** U+0900–U+097F characters. The browser loaded Inter on screen, but Hindi/Marathi rely on platform fallback. Patient print CSS names `Noto Sans Devanagari` first without bundling it; even English summaries can use that system face. A named but absent font is not deterministic support.

Headless Chromium 153 on the existing synthetic long record tested en/hi/mr × A4/Letter with sandbox ambient fonts, explicitly isolated DejaVu-only system fonts, and a previously provisioned Noto Sans Devanagari 2.007 system font. Ambient and DejaVu-only visibly produced missing-glyph boxes on Hindi/Marathi screens and PDFs; the Noto environment visibly produced shaped sample text. English samples were readable. All 18 PDFs had 3 text-bearing pages and six selected Latin synthetic markers once each; this does **not** establish Devanagari glyph coverage. PDFium extraction could yield Unicode from visually boxed PDFs and introduce spaces/duplicate clusters; pypdf also emitted NULs for shaped glyphs. Correct Unicode extraction, full script shaping, PDF accessibility and external-device behavior are not established. CDP confirmed Inter on English screen and Noto fallback for Hindi/Marathi in the controlled environment; see browser JSON and raster captures. No third-party font requests were observed in this journey.

Candidate Noto Sans Devanagari OFL 1.1 and source/rights, proposed conservative codepoint and shaping coverage, loading/print/cache/offline trade-offs, supported-platform assumptions and test commands are detailed in `qa-evidence/qa4/README.md`. The existing test-only TTF is 641,944 bytes. Separately, GitHub metadata for an external Fontsource 5.3.0 variable Devanagari WOFF2 subset reports an actual 121,192-byte asset; it is not a CityCare-specific measured subset and was not tested. **Boundary disclosure:** querying GitHub's contents API for metadata inadvertently transferred its base64 font payload to a transient `gh` process before filtering; no font file was saved, added, modified or used. No CityCare subset has been created, so its exact size and performance are not known.

**Recommendation:** if deterministic hi/mr rendering without installed fonts is a supported requirement, separately authorize a self-hosted, shaping-preserving and properly licensed candidate after confirming supported languages/platforms and measuring the actual subset; otherwise define and validate a system-font-guaranteed support matrix or explicitly defer with risk. This assessment does not authorize implementation. Chromium-only visual evidence is not physical-print, native-dialog, screen-reader, multi-engine, real-device, translation, or full shaping/extraction verification. No commit, push, PR, merge, deployment or infrastructure change. Stop for owner decision.

### QA-4 follow-up — subset assessment and incident documentation (2026-11-07)

- The owner approved the requirement that Hindi/Marathi render readably without installed system Devanagari fonts, but has not authorized implementation. A-3.2 remains **NOT ACCEPTED**.
- Assessment only: added reproducible hi/mr catalog and conservative source glyph inventories under `qa-evidence/qa4/`. Catalog union is 62 U+0900–097F code points; source scan (including legal localization and language switcher) has 63. These do not bound patient-entered/future/generated content or prove glyph shaping.
- Compared full, catalog-only and broad subset options conceptually and documented a separate implementation proposal with license/provenance, planned paths, coverage, security, offline/cache, measurement, validation, rollback and decision gates. No actual subset or full WOFF2 was generated or measured in this fresh environment, and no new rendering test was run. Existing visual/PDF evidence remains historical and uses a system Noto TTF, not a proposed subset.
- Documented the previous unintentional inbound public font payload in `qa-evidence/qa4/SECURITY_INCIDENT_REVIEW.md`; prior process/log persistence, credential use/exposure and external disclosure remain unknown, and operator follow-up is pending. No evidence of outbound patient data is not proof of absence.
- No production font, app code/CSS/localization, dependencies, schema, settings or deployment were changed for this follow-up. No commit, push or PR. Owner authorization and the decisions listed in the proposal are required before implementation.
