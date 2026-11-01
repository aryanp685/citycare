# CityCare — Master Gap Register (Step 1)

_Every discoverable issue found in the 2026-11-01 Step-1 audit, each with a unique ID,
evidence, severity, priority, owner workstream and completion criterion. Existing project
drawbacks (D1–D62) and fixed bugs (A1–A76) from `web/DRAWBACKS_AND_BUGFIXES.md` are
**cross-referenced below, not removed and not duplicated** — where an old D-item maps to a
new NG finding, both IDs are linked._

**Scales**
- Severity: Critical > High > Medium > Low > Informational (impact × likelihood, demo→pilot)
- Priority: **P0** critical security/privacy/data-loss/clinical-safety · **P1** high-impact
  functionality/authorization/reliability/regulatory · **P2** important UX/scalability/ops ·
  **P3** enhancement/optimization
- Closure class: `CODE` fixable in code · `CREDS` needs external credentials · `APPROVAL`
  needs official approval · `LEGAL` needs legal review · `CLINICAL` needs clinical review ·
  `COMMERCIAL` needs commercial agreement · `REALWORLD` needs real-world validation

**Headline: 0 Critical · 3 High · 28 Medium · 19 Low · 6 Informational — 56 active NG
findings** (58 NG IDs issued: 1 alias NG-D08→NG-P03, 1 closed-in-audit NG-G02). No
Criticals: the security-critical paths re-tested green today (162/162 unit, 241/241 e2e,
probes clean). The three Highs: no backup/DR (NG-S09), no monitoring (NG-S10), and the
unreviewed clinical rule set (NG-C06) — two operational, one governance; the code that
touches health data is not the weak point.

---

## A. New findings (NG series)

### Security & operations (NG-S)

| ID | Category | Finding | Evidence (2026-11-01) | Severity | Impact | Proposed fix | Deps | Validation | Priority | Class | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NG-S09 | Data resilience | No backup/DR path; Neon Free has no PITR; no tested restore | FEATURES.md deploy row; no dump script in `web/scripts` | **High** | Total data + audit-evidence loss on provider incident | scheduled `pg_dump` to private store under `CRON_SECRET`; restore runbook + drill (verify `ledger_verify()` on restore) | — | restore drill green; RPO/RTO documented | **P0** (pilot) | CODE (+CREDS for prod DB) | Sec/Ops |
| NG-S10 | Monitoring | No uptime/alerting; self-cron is the only heartbeat | `vercel.json`; no external monitor (owner-side NOT VERIFIED) | **High** | Unknown downtime window | free uptime probe on `/api/health`; Neon usage alerts (paid) | — | monitor live; outage drill | P1 | CODE (+CREDS) | Sec/Ops |
| NG-S13 | Auth strength | No 2FA/passkeys; password-only on health data | `auth.ts` (no MFA path); F6 roadmap | Medium | Phished/leaked credential = full account | F6 passkeys (WebAuthn); TOTP for doctors/admins interim | F6 | passkey e2e; stolen-pw simulation denied | P1 | CODE | Product |
| NG-S14 | Demo hygiene | Public demo accounts + published creds live on prod | README/START_HERE demo logins | Medium | Anyone acts as patient/doctor on a pilot | pilot env without seeded users (or isolated flag + separate DB) | — | old creds fail on pilot DB | P1 | CODE | Sec/Ops |
| NG-S11 | CI | GitHub Actions disabled — workflow written, never ran (D59) | `.github/workflows/ci.yml`; D59; local re-run green today | Medium | Regressions ship by hand | owner enables Actions → first green run | — | green Actions run on main | P1 | APPROVAL (owner repo setting) | Sec/Ops |
| NG-S01 | Transport security | HSTS not declared in code (platform-dependent) | `next.config.ts` headers; probe: absent locally | Medium | Downgrade window on hosts without platform HSTS | add `Strict-Transport-Security` to build-time headers | — | header on all paths | P2 | CODE | Sec/Ops |
| NG-S03 | Key management | `DOCUMENT_KEY` falls back to HKDF(SESSION_SECRET) — runbook rotation step would destroy all files silently | `storage.ts key()`; breach runbook §4 | Medium | Document loss via documented runbook step | make key mandatory at boot; derive-only-for-local with loud log | — | boot fails without key; runbook updated | P2 | CODE | Sec/Ops |
| NG-S05 | Consent semantics | `liveConsent` "newest row wins" is a latent invariant; one careless future writer flips access | `consent.ts`; all 3 writers verified today to avoid shadow rows | Medium | Wrong grant/deny on future bug | explicit preference query + e2e "pending coexists with live" | — | e2e + unit green | P2 | CODE | Sec/Ops |
| NG-S02 | Header trust | `requestIsHttps` trusts first-hop XFP | `auth.ts` | Low | Self-inflicted cookie friction if ever proxy-less | document assumption; optional proxy allow-list | — | review note | P3 | CODE | Sec/Ops |
| NG-S04 | Audit fail-open | Some ledger writes `.catch(()=>null)` (doc link issuance) | `documents/[id]/link/route.ts` | Low | Silent transparency gap on edge failure | fail-or-retry for ledger-critical events | — | forced-failure test → 503+retry | P3 | CODE | Sec/Ops |
| NG-S06 | Error mapping | Consent-pair 23505 mislabelled `slot_full` (atomic rollback — message only) | `appointments/route.ts` catch | Low | Confused retry | map by constraint name | — | race e2e distinct code | P3 | CODE | Product |
| NG-S08 | Cron security | Single `CRON_SECRET`, no granularity/rotation path | `cron/daily` probe → 401 mismatch | Low | Bounded abuse | per-job secrets or IP allow-list + rotation note | — | rotated-secret 401/200 | P3 | CODE | Sec/Ops |
| NG-S07 | Info disclosure | `/api/health` public (PG version, TZ, timeout, ledger breaks, key-source) | probe | Info | Minor, deliberate (A44) | keep; strip version if scanners complain | — | — | P3 | CODE | Sec/Ops |
| NG-S12 | Secrets hygiene | `SESSION_SECRET` length-checked, not entropy-checked | `env.ts` | Info | Low | entropy hint in deploy script (already generates random) | — | — | P3 | CODE | Sec/Ops |
| NG-S16 | Token design | JWT signed not encrypted (claims non-sensitive) | `auth.ts signSession` | Info | None found | keep — documented decision | — | — | P3 | CODE | Sec/Ops |

### Database & platform (NG-D)

| ID | Category | Finding | Evidence | Severity | Impact | Proposed fix | Deps | Validation | Priority | Class | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NG-D03 | Multi-tenancy | No clinic/org model (membership, staff roles, org audit); HOSPITAL_ADMIN unreachable | `Hospital`/`HospitalAdmin` tables; grep | Medium | Blocks brief's clinic/lab future users | org model design + migration (join tables only — patient ownership preserved) | design doc | org-isolation e2e | **P1** (pilot→commercial) | CODE | Platform |
| NG-D05 | Storage ceiling | bytea blobs in Neon Free 0.5 GB ≈ 15 patients at quota (D53) | `storage.ts`; D53 | Medium | DB full → total outage | object storage (R2/S3/Supabase) + same AES-GCM envelope; backfill script | — | 50+ patients upload; DB flat | P1 | CODE (+CREDS) | Platform |
| NG-D01 | Schema hygiene | Dead tables: `JobQueue`, `Otp`, `AiExtraction`, `AiSummary` (no writers), `HospitalAdmin` | grep | Medium | Dilutes schema story; audit finds | document reserved status in schema README (cheap) or drop with owning feature | F11, NG-D03 | README status column | P2 | CODE | Platform |
| NG-D04 | Connections | pool(10)×instances vs Neon ~100 direct conns (D18/D32); pooler untested | `db.ts` | Medium | Burst 5xx | validate `-pooler` URL end-to-end or paid Neon | NG-P03 | load test green | P2 | CODE | Platform |
| NG-D07 | Clinical data | No clinician-authored observations (encounter vitals not in `Observation`) | `recordSections`; D60 note | Medium | Longitudinal record incomplete | doctor encounter vitals → `Observation` w/ `encounterId` + provenance | — | e2e doctor-obs in trends | P2 | CODE+CLINICAL | Clinical |
| NG-D02 | Source of truth | `prisma/schema.prisma` duplicates SQL DDL (tool-only, drift risk) | `schema/` | Low | Silent drift | CI `prisma migrate diff` check or delete prisma file | — | drift check in CI | P3 | CODE | Platform |
| NG-D06 | Growth | Ledger unbounded, no archival plan | `ledger.sql` | Low | Long-tail cost | verify→cold-store→truncate-with-head-proof policy | — | archival runbook+test | P3 | CODE | Platform |
| NG-D08 | → alias | load/concurrency testing — **canonical ID: NG-P03** | — | (see NG-P03) | — | — | — | — | P2 | CODE | Platform |

### Features & product (NG-F)

| ID | Category | Finding | Evidence | Severity | Impact | Proposed fix | Deps | Validation | Priority | Class | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NG-F01 | Communications | No live e-mail/SMS delivery (Outbox + UI honesty only) (D3/D56) | `email.ts`; D56 | Medium | Breach intimation (r.7), reminders, recovery e-mail all in-app only | owner's Resend key + verified domain; DLT-registered SMS later | CREDS (owner) | code delivered from prod | P1 | CREDS+LEGAL | Product |
| NG-F05 | Interoperability | No ABDM/ABHA integration; ABHA ≈ 93.95 crore (Jul 2026) makes it table-stakes | D10; market doc [1] | Medium | First-visit data entry friction; strategic gap | ABHA as default identifier + (later) M1/M2 flows; certification separate decision | APPROVAL (NHA credentials) | ABHA lookup e2e (sandbox) | P1 (strategic) | APPROVAL+COMMERCIAL | Product |
| NG-F03 | Language | UI English-only; hi/mr key-points unreviewed (D17/D58/L-G2); Nagpur is Marathi-first | D17/D58 | Medium | Adoption blocker in target market | next-intl dictionaries hi/mr-first + legal review | LEGAL | MR/hi pass on 5 key screens | P1 (pilot) | CODE+LEGAL | Product |
| NG-F04 | OCR | OCR simulated (paste text → DRAFT) (D5) | D5; F11 | Medium | Document intake manual | F11 client-side tesseract.js → existing DRAFT pipeline | — | OCR e2e (synthetic rx) | P2 | CODE | Product |
| NG-F02 | Governance UX | Grievance officer name/mailbox envs unset (L-G1) | `LEGAL_COMPLIANCE.md` §3 | Medium | No published contact for non-signed-in users | set `NEXT_PUBLIC_GRIEVANCE_OFFICER/EMAIL` + appoint | owner decision | envs live, page shows contact | P1 | CODE (owner input) | Product |
| NG-F06 | Business | No payment model (deliberate; Razorpay KYC pending) | plan C10 | Low | Commercial launch blocker only | doctor subscription design + Razorpay | COMMERCIAL | first payment in pilot | P2 (launch) | COMMERCIAL | Product |
| NG-F07 | Roles | No lab / organization staff roles (future users) | grep | Low | Roadmap only | after NG-D03 | NG-D03 | role e2e | P2 | CODE | Product |
| NG-F08 | Notifications | Polling not push (D42) | D42 | Low | Acceptable | Web Push after PWA | NG-U05 | push e2e | P3 | CODE | Product |
| NG-F11 | Clinical data | Drug-class coverage: 1 real class (penicillin); F14 expansion pending | `rules.ts`; D11 | Medium | Safety-engine false negatives | RxClass-derived class tables + curated pairs, **clinically reviewed** | CLINICAL | reviewed rule pack + tests | P2 | CLINICAL | Clinical |

### Clinical safety (NG-C)

| ID | Category | Finding | Evidence | Severity | Impact | Proposed fix | Deps | Validation | Priority | Class | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NG-C06 | Clinical governance | **Rule set is student-curated and has never had clinical review.** Until reviewed, the engine is a decision-support aid with a disclaimer — not a safety net. | `rules.ts`; no review artefact | **High (for real use)** | Wrong confidence in alerts with real patients | ≥2 practising physicians review all rules + severity mapping + disclaimer wording; sign-off artefact in repo | CLINICAL | signed review doc + updated copy | **P0 (before any real patient data)** | CLINICAL | Clinical |
| NG-C01 | Rule coverage | **No drug–drug interaction rule exists** (`DRUG_DRUG_INTERACTION` declared, never emitted); `NSAID_CLASS` dead | grep `rules.ts` L14, L39 | Medium | Class of missed conflicts | implement DDI rules from curated pairs (with NG-F11 review) | NG-F11, NG-C06 | DDI e2e + unit | P2 | CODE+CLINICAL | Clinical |
| NG-C02 | Rule precision | Allergy matching = substring on free text (FP risk) + no cross-class modelling (e.g. β-lactam cross-reactivity) | `checkDrugAllergyConflicts` | Medium | FP erodes trust; FN misses conflicts | controlled allergy vocabulary + class-based matching (clinically reviewed) | NG-C06 | FP/FN test matrix | P2 | CODE+CLINICAL | Clinical |
| NG-C04 | Alert lifecycle | No retroactive alerts when profile changes later (new allergy added doesn't flag existing active meds) | encounter route (rules run at write only) | Medium | Silent conflicts until next encounter | re-run rules on profile/med mutation → `Alert` rows | — | e2e: add allergy → alert appears | P2 | CODE | Clinical |
| NG-C05 | Interop | No ICD-10 coding (diagnoses free text) — limits FHIR/ABDM mapping | `Encounter`; `fhir.ts` | Medium | Portability partial | ICD-10 code field + searchable list (WHO public list) | — | FHIR bundle carries codes | P2 | CODE+CLINICAL | Clinical |
| NG-C03 | Reference data | Lab reference ranges static per row (no age/sex-specific bands) | `LabResult` | Low | Mild misflagging at extremes | age/sex band table (curated) — low priority | CLINICAL | band e2e | P3 | CODE | Clinical |

### UI/UX & design (NG-U)

| ID | Category | Finding | Evidence | Severity | Impact | Proposed fix | Deps | Validation | Priority | Class | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NG-U06 | Design system | Two visual tiers (premium landing / utilitarian app); ad-hoc spacing; no shared Empty/Error/SectionHeader components | `globals.css`; page reads | Medium | Product feels "tool", not "premium platform" (brief's target) | tokens v2 (spacing/type/z scale) + shared state components + elevation pass on 3 dense pages; **no redesign, no glass/gradient** | — | token file + visual pass screenshots | P2 | CODE | Design |
| NG-U01 | Forms | Validation errors are joined strings, not field-mapped | probe: `valueNum: …; takenOn: …` | Medium | Bad first-impression UX on phones | field-level inline mapping (structured issues already returned) | — | field-level e2e | P2 | CODE | Design |
| NG-U02 | A11y | No automated accessibility audit ever run | no axe/lighthouse in CI | Medium | Unknown a11y debt on clinical pages | axe-core (Playwright) or Lighthouse CI on key pages | NG-S11 (CI) | 0 critical findings | P2 | CODE | Design |
| NG-U03 | Mobile | Responsiveness code-present, visually unverified (no browser in sandbox) | read-only audit | Low | Unknown breakpoint debt | `_needs visual pass` 320/375/768 + Playwright screenshots in CI | — | archived screenshots, no h-scroll at 320 | P2 | REALWORLD | Design |
| NG-U07 | Error states | No network-error state on data pages; `error.tsx` segment boundaries absent | grep: no `error.tsx` | Low | Blank cards on failure | per-segment `error.tsx` + card-level retry | — | killed-DB shows retry UI | P3 | CODE | Design |
| NG-U04 | Theme | No dark mode (F16) — tokens already CSS vars | FEATURES F16 | Low | Preference feature | `prefers-color-scheme` via tokens | — | both modes visual pass | P3 | CODE | Design |
| NG-U05 | Platform | No PWA/manifest (F10) | FEATURES F10 | Low | Installability on clinic phones | manifest + icons + offline shell | — | install on Android | P3 | CODE | Design |
| NG-U08 | Bundle hygiene | (see NG-P01 for the animation-bundle finding; UI-side ask = pause out-of-view GSAP loops) | UI doc §2 | Low | Battery on older phones | ScrollTrigger visibility pause | — | frame-rate visual pass | P3 | CODE | Design |

### Performance (NG-P)

| ID | Category | Finding | Evidence | Severity | Impact | Proposed fix | Deps | Validation | Priority | Class | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NG-P03 | Load testing | **No load/concurrency harness** — concurrency claims rest on SQL/unit negative tests (alias of NG-D08) | e2e functional; `gap_test.sql` | Medium | Unknown burst behaviour (booking races, ledger) | k6/autocannon: 50-concurrent bookings/doctor-day + parallel ledger; publish p95/5xx | — | green run + published numbers | P2 | CODE | Platform |
| NG-P02 | Cold start | Neon scale-to-zero 0.5–3 s; warmup covers 2 entry pages only (D31) | D31 | Medium | First-touch UX | paid compute/autosuspend off; warmup on booking page | CREDS (prod settings) | p95 first-touch < 1 s | P2 | CREDS | Platform |
| NG-P01 | Bundle | Landing +97 KB gzip animation libs (D35) | D35; chunk listing | Low | Landing LCP on slow networks | LazyMotion (~−20 KB); out-of-view pause | — | gzip delta measured | P3 | CODE | Design |
| NG-P04 | Rate limiting | Per-limited-request DB write (D51) | `ratelimit.ts` | Low | Extra auth round trip | keep; WAF at scale | — | — | P3 | CODE | Platform |
| NG-P05 | Images | No `next/image` — because no third-party images exist (by design, copyright-clean) | grep | Info | None | use `next/image` if F11 photos arrive | F11 | — | P3 | CODE | Platform |
| NG-P06 | Prod perf | Production p95 NOT VERIFIED (no `*.vercel.app` egress from sandbox) | — | Info | Unknown | owner `curl` timings + Vercel Analytics → README | CREDS | numbers in README | P3 | REALWORLD (BLOCKED) | Sec/Ops |

### Governance, docs & process (NG-G)

| ID | Category | Finding | Evidence | Severity | Impact | Proposed fix | Deps | Validation | Priority | Class | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NG-G01 | Docs | Stale top-level docs: START_HERE (old `citycare-xi` URL, `cp .env.example` **— the file doesn't exist**, 0001–0004, 131/217 counts); root README (48 tests, 43/43, "file storage unimplemented", old URL); ci.yml comment (217) | read today | Medium | New contributor/owner confusion; `env.example` missing is a real onboarding break | create `web/.env.example` (template, no secrets); sync START_HERE/README/ci comments to 2026-11-01 state | — | `cp .env.example .env.local` works; counts match | P2 | CODE | Governance |
| NG-G04 | Verification | **Production e2e not re-run since F5/F18** (last prod run 190/9-skip pre-F5; sandbox cannot reach `*.vercel.app`) | README verified blocks | Medium | Live-site verification gap (now closed by A76 guard locally, but prod unproven) | owner runs `BASE=https://citycare-z95n.vercel.app node scripts/e2e.mjs` (190+/9-skip expected) | CREDS/owner | prod numbers in README | P1 | REALWORLD (BLOCKED here) | Sec/Ops |
| NG-G07 | Key ops | No rotation procedure for `DOCUMENT_KEY`/`ANCHOR_SIGNING_KEY` (keyVersion column ready but unused) | D54; `storage.ts` | Low | Incapable of key rotation when needed | KMS-held key or documented re-wrap job + keyVersion use | — | rotation drill | P2 | CODE | Sec/Ops |
| NG-G02 | Docs | No architecture doc existed | repo listing | (closed) | — | **closed by this audit: `CITYCARE_CURRENT_ARCHITECTURE.md`** | — | file exists | done (audit) | CODE | Governance |
| NG-G03 | Docs | No ADRs; decisions scattered in bug log | repo listing | Low | Decision archaeology | short ADR set for the top-10 decisions (from DRAWBACKS) | — | `docs/adr/` | P3 | CODE | Governance |
| NG-G06 | Env | Sandbox checkout is a single-commit snapshot (full history on GitHub) — environment note, not product debt | `git log` | Info | Audit scoping | none | — | — | P3 | — | Governance |

**Note on numbering**: NG-S15 is unused (reserved); NG-D08 and NG-F09/NG-F10 are aliases of
NG-P03 and NG-U04/NG-U05 respectively (canonical IDs in each category).

---

## B. Cross-reference: existing drawbacks D1–D62 (status 2026-11-01)

_Closed rows were struck through in the source doc; statuses below re-verified by the audit
(read + grep + probes), not copied._

| D# | Status | Maps to | Note |
|---|---|---|---|
| D1 raw SQL, no Prisma | Open (accepted) | NG-D02 | prisma file is tool-only; drift check proposed |
| D2 scrypt sync | **Closed** (A59) | — | — |
| D3 phone/email unverified | Partially closed (e-mail path exists) | NG-F01 | live delivery needs owner's keys; SMS needs DLT |
| D4 no file storage | **Closed** (F12) | NG-D05, NG-G07 | storage ceiling + key rotation remain |
| D5 OCR simulated | Open | NG-F04 | F11 client-side OCR |
| D6/D7 slot capacity/grid | **Closed** | — | — |
| D8 JWT revocation | **Closed** (A60) | — | — |
| D9 lockout recovery | **Closed** (A63+F9) | — | passkeys later (NG-S13) |
| D10 ABDM fields, no integration | Open | NG-F05 | strategically important now (market doc) |
| D11 2 classes + 4 rules | Open | NG-C01, NG-C02, NG-F11 | audit found only 1 class wired + no DDI rule |
| D12 registration not verified | **Closed as far as law allows** (A68) | LG-19 | attestation, not lookup |
| D13 no external anchor | **Closed** (D13/L1) | NG-D06 | OTS receipts pending-confirm (D55) |
| D14 ledger pagination | **Closed** | — | — |
| D15 erasure vs retention tension | Open (documented) | LG-08 | needs counsel confirmation |
| D16 e2e lockout | **Closed** (A63) | — | — |
| D17 English-only UI | Open | NG-F03, NG-U06 | pilot blocker for Nagpur |
| D18 single pool node | Open | NG-D04 | pooler/paid path |
| D19 scope untested | **Closed** (A58) | — | — |
| D20 build OOM | Open (accepted) | NG-P (doc) | CI box fine |
| D21 stateless JWT | **Closed** (A60) | — | — |
| D22 CSRF | **Closed** (multipart) | — | — |
| D23 third-party cookie blocking | Open (accepted) | — | own-domain deploy cures |
| D24 Workers per-query conn | Open (CF path not deployed) | NG-P04 context | D28/BLOCKED |
| D25 CF scrypt 4096 | Open (CF path) | — | paid plan lever |
| D26 free-plan CPU | Open (CF path) | — | — |
| D27 Workers startup params | Open (CF path) | — | — |
| D28 CF deploy unexecuted | Open (BLOCKED: no creds) | — | — |
| D29 vercel/Neon round-trip | **Closed** (Sep 27 2026) | — | — |
| D30 Neon TLS pinning | Open (accepted) | — | `sslrootcert` pin optional |
| D31 cold start | Mitigated (warmup) | NG-P02 | paid compute cures |
| D32 pooled endpoint untested | Open | NG-D04 | validate `-pooler` |
| D33 per-deploy URL protection | Open (accepted) | — | — |
| D34 Marketplace env noise | Open (accepted) | — | — |
| D35 GSAP landing cost | Open (accepted) | NG-P01, NG-U08 | LazyMotion + pause |
| D36 doctor signup open | **Closed** (A48/F1) | — | — |
| D37 per-IP rate limiting | **Closed** (A61) | NG-P04 | DB limiter; WAF at scale |
| D38 Supabase idle pause | Open (Supabase path unused) | — | — |
| D39 plan cites unbuilt features | **Closed** (plan v2) | — | — |
| D40 startup params behind proxies | Open (mitigated by role/db pins) | — | health endpoint watches |
| D41 break-glass honesty | **Closed** (F7 review queue) | — | post-hoc by design |
| D42 inbox polling | Open | NG-F08 | push after PWA |
| D43 grievance channel | **Closed in code** | NG-F02 | officer envs = team item |
| D44 legal docs English-only | Partially closed | NG-F03 | summary ≠ full translation |
| D45 re-acceptance | **Closed** (L2) | — | — |
| D46 retention sweep once daily | Open (accepted) | — | external scheduler at scale |
| D47 env pull placeholder | Open (accepted) | — | vault note |
| D48 guardian self-declared DOB | Open | LG-11 | DigiLocker token (CREDS) |
| D49 no claim-at-18 | **Closed** (F13-b) | — | — |
| D50 SUPER_ADMIN only, one account | Open | — | org model (NG-D03) + two-person rule |
| D51 rate limit DB write | Open (accepted) | NG-P04 | — |
| D52 fixed sessions | **Closed** (sliding) | — | — |
| D53 blob 0.5 GB | Open | NG-D05 | object storage |
| D54 no DOCUMENT_KEY rotation | Open | NG-G07 | KMS/re-wrap |
| D55 OTS receipts pending | Open (accepted) | — | `ots upgrade` job |
| D56 e-mail scaffold only | Open | NG-F01 | CREDS (owner) |
| D57 attestation not lookup | Open | LG-19 | HPR when ABDM creds exist |
| D58 hi/mr partial | Open | NG-F03 | next-intl |
| D59 CI never ran | Open (BLOCKED: repo setting) | NG-S11 | owner enables Actions |
| D60 Observation dead | **Closed** (F5) | NG-D07 | clinician-authored obs still missing |
| D61 `:has()` print | Open (accepted) | — | evergreen-only target |
| D62 Vercel migration drift | **Closed** (A76 prebuild, 2026-11-01) | — | build = schema sync |

**Open-but-accepted** (D23, D26, D30, D33, D34, D35, D38, D40, D42, D44, D46, D47, D48, D50,
D51, D55, D61) are documented trade-offs with mitigations — re-validated as honest.
**Open-needs-action**: D3/D56 (NG-F01), D10 (NG-F05), D11 (NG-C01/C02/F11), D15/LG-08,
D17/D58 (NG-F03), D18/D32 (NG-D04), D28 (BLOCKED), D31 (NG-P02), D53 (NG-D05), D54 (NG-G07),
D59 (NG-S11), D48 (LG-11), D43 (NG-F02).

## C. Cross-reference: fixed bugs A1–A76

All 76 bug entries in §A of `DRAWBACKS_AND_BUGFIXES.md` are **fixed and test-pinned**
(verified: every fix names its test; today's 162/162 + 241/241 re-run is the standing
proof). None is re-opened by this audit. Grouped: A1–A8 ledger/plpgsql · A9–A19 app+e2e
correctness · A20–A34 proxy/cookie/CSRF/deploy-script class · A35–A47 operational (lockout,
scrypt, tabs, queries, envs, health) · A48–A66 feature-class (F1–F13, legal L1–L4, A58 the
consent-scope leak, A60 sessions, A61 rate limits) · A67–A75 UI/UX + e2e math · **A76 the
2026-11-01 production 500 (schema⇄code drift, closed via prebuild hook)** — the A76 fix is
itself evidence the drift class is structurally closed, not just patched.

## D. Prioritization roll-up

- **P0 (before any real patient data / controlled pilot)**: NG-S09 (backup/DR) · NG-C06
  (clinical review of the rule engine).
- **P1 (pilot-ready)**: NG-S10 (monitoring) · NG-S13 (2FA/passkeys) · NG-S14 (demo-account
  hygiene) · NG-S11 (CI on) · NG-G04 (prod e2e re-run — owner) · NG-D03 (org model, if
  clinics are in the pilot) · NG-D05 (object storage) · NG-F01 (e-mail leg) · NG-F02
  (grievance officer) · NG-F03 (hi/mr for Nagpur) · NG-F05 (ABHA identifier path, strategic).
- **P2 (important, scheduled)**: NG-S01, NG-S03, NG-S05, NG-D01, NG-D04, NG-D07, NG-F04,
  NG-F06, NG-F11, NG-C01, NG-C02, NG-C04, NG-C05, NG-U01, NG-U02, NG-U03, NG-U06, NG-P02,
  NG-P03, NG-G01, NG-G07.
- **P3 (enhancements)**: all remaining Low/Info rows.
