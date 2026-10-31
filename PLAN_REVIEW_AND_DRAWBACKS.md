# CityCare — Plan Review, Drawback Register & Roadmap (v2, 28 Sep 2026)

Companion to `CITYCARE_PROJECT_PLAN.md` (19 Sep). That document was written **before** the system
existed; this one is written **against the system that now exists** — every "built" claim below was
checked by reading the code or running a command in this workspace (unit tests 78/78, local e2e 55/55,
live e2e 52/0/5 on `https://citycare-xi.vercel.app` — **redeployed this round with everything below**). Where something was *not* checked, it says so.

Legend — **Status**: ✅ fixed & verified · 🟡 partially / mitigated · 🔴 open · 📝 documented only (deliberate).
**Severity**: S1 = would fail a security/ethics review or a viva; S2 = real weakness, defensible if disclosed; S3 = polish.

---

## 0. Verdict in ten lines

1. The **core thesis is right and is now demonstrable**: a patient-owned longitudinal record, consent checked
   server-side on *every* request, a hash-chained append-only ledger, a deterministic safety engine. These are
   the things the plan said would make it "problem solving" — and they are the parts that actually got built.
2. The plan **over-promises in §6, §10 and §12** (Prisma, argon2id, OTP, refresh tokens, AES-256-GCM files,
   signed URLs, Tesseract, LLM, RxNav, BullMQ/Redis, MinIO, FHIR, break-glass). Of these, only *the idea* of
   break-glass exists as a column. The viva table (§12) answers with things that do not exist → **must be rewritten**
   before the seminar (patched in v2 of the plan; see §2 below).
3. Three of the plan's factual anchors are **wrong or stale**: RxNav interaction API (dead since Jan 2024),
   "7-year" retention (no such single rule), DPDP "immediate" obligations (phased to May 2027). Sources in §3.
4. Security posture moved from "student demo" to "defensible" this round: clickjacking headers, timed lockout
   (the old permanent lock was a denial-of-service you could trigger against any user), OWASP-grade scrypt with
   transparent rehash, proper env precedence. Still missing: per-IP rate limiting, MFA, password reset, email verification.
5. ~~The biggest unfixed product risk is fake doctors~~ **Closed (F1)**: registration number + admin approval; unverified doctors are invisible and get 403 everywhere. What remains manual is the IMR lookup itself.
6. **Minors / caregivers** are unaddressed and DPDP treats children's data specially (verifiable parental consent).
   Design exists in §6 (R5); not built.
7. Infrastructure is free-tier everywhere: fine for a seminar, but disclose it — non-commercial licence (Vercel Hobby),
   no backups, no PITR, scale-to-zero cold starts. Supabase Mumbai cutover is scripted, waiting on credentials.
8. The UI was functional but flat; it is now a proper product surface (self-hosted Inter, motion system, GSAP hero,
   smooth scroll on the landing only, skeleton loading, animated tabs) **without** giving up server rendering or
   accessibility (`prefers-reduced-motion` is honoured globally).
9. Process debt is the quietest risk: no CI, no migration tool, no UI tests, one AI-assisted author. The team must
   be able to explain every line in the viva — §7 has a reading plan per member.
10. Naming is still inconsistent (PPT "Intelligent Patient Health Record" vs app "one health record for your whole city";
    BCA/Pune vs B.Sc/G H Raisoni). Pick one; it costs nothing and looks careless if left.

---

## 1. Plan vs. what is actually built

| # | Plan said (§) | Reality in `web/` (verified) | Gap | Action |
|---|---|---|---|---|
| 1 | Prisma ORM, "parameterised queries free" (§6, §10) | Raw `pg` with `$n` placeholders; Prisma only generated the DDL once. One boolean-constant `${}` interpolation in `doctor/appointments/[id]/status` (safe, reviewed) | Wording | Plan v2: "Prisma-generated schema, `pg` at runtime (Workers-compatible, 0 ORM overhead)" |
| 2 | OTP login (§5 P0, §9 wk 1–2) | Email + password; no SMS provider | Scope | Keep password; OTP = roadmap R6 (needs a paid SMS gateway, DLT registration in India) |
| 3 | argon2id (§10, §12) | scrypt N=2^17, r=8, p=1, 256 MiB maxmem, rehash-on-login (A39) — OWASP-equivalent | Wording | Plan v2 says scrypt + why (no native addon → runs on Vercel *and* Workers) |
| 4 | 15-min access + refresh token, optional TOTP (§6) | Stateless HS256 JWT, 7-day cookie, no refresh, no MFA | Real | Roadmap R7 (session table + revocation list); disclose in report |
| 5 | AES-256-GCM files, signed URLs, MinIO (§6, §10) | **No file storage at all** — paste-OCR text only, no images persisted | Real, deliberate | Roadmap R3 (Supabase Storage + signed URLs + KMS-less envelope encryption) |
| 6 | Tesseract OCR (§5 P1, §6) | Paste text → DRAFT medicines; no OCR engine | Real | Roadmap R3b: client-side `tesseract.js` (image never leaves the browser) |
| 7 | Gemini / Ollama summaries (§6) | None; rule engine only | Real, deliberate | Keep out until R3 exists; `AI_ACCURACY_AND_HALLUCINATION.md` design stands |
| 8 | RxNav drug interactions (§6, §7, §9) | Not built — **API discontinued Jan 2024** | Plan error | Curated class table (7 penicillins, 4 NSAIDs) today; RxClass for class membership; openFDA labels; DrugBank academic licence (R4) |
| 9 | FHIR R4 export (§5 P2) | ✅ **F4** `GET /api/patient/fhir` | closed | run through the HAPI validator once |
| 10 | BullMQ + Redis (§6) | None; nothing is slow enough to need a queue | Wording | Drop from v2; add back only with OCR/LLM |
| 11 | Break-glass emergency access (§3 C6, §12) | ✅ **F2** built: route + UI + reason + 60-min consent + quota + ledger + CRITICAL alert + revoke | closed | viva answer is now true |
| 12 | Soft delete + 30-day purge (§10) | Immediate hard delete + encounter redaction, ledger keeps pseudonymous IDs | Different, defensible | Plan v2 documents the chosen behaviour (DPDP erasure "without undue delay") |
| 13 | Rate limiting on login (§10) | Per-account lockout (5 fails → 15-min sliding window, A38); **no per-IP limit** | Partial | Roadmap R9 (Vercel WAF rule or `@upstash/ratelimit`) |
| 14 | Doctor NMC verification (§3 C1) | ✅ **F1**: registration no. + admin approval; unverified doctors invisible + 403 | closed | manual IMR lookup by the admin |
| 15 | Minor/guardian handling | none | S1 gap (DPDP §9) | Roadmap R5 |
| 16 | SMS/email notifications (§5 P1) | ✅ **F3** in-app inbox + bell; email/SMS delivery still absent | partial | Resend for email (F9) |
| 17 | Schema "694 lines, 25 tables, 29 explicit indexes" (§8) | 698 lines, 25 tables, **42** explicit indexes (71 incl. PK/unique on live), 38 FKs | Stale | Plan v2 numbers corrected |
| 18 | Team of 4 (§9) | PPT lists **5** members | Stale | Plan v2 split for 5 (§7 here) |
| 19 | Next.js 15 (§6) | **Next.js 16.3.6, React 19.3, TypeScript 7.0 native + 6.0 API, Tailwind 4.3.3** | Stale | corrected; blocked upgrades documented in `web/FEATURES.md` |
| 20 | Deploy Vercel + Neon + Railway (§6) | Vercel Hobby `sin1` + Neon Singapore; Cloudflare Workers path prepared; **Supabase Mumbai scripted** | Evolved | `web/DEPLOY_SUPABASE.md` |
| 21 | KPI targets (§4.2: "booking < 90 s", "consent decision < 10 s") | Not measured; e2e measures correctness, not UX time | Missing | Roadmap R11: 5-user task timing before the final report |

---

## 2. Facts the plan got wrong (with sources)

| Claim | Correction | Source |
|---|---|---|
| "RxNav API — `interaction.json?rxcuis=…`, authoritative" | The **Drug Interaction API was discontinued on/about 2 Jan 2024**; nothing replaced it. RxNorm and RxClass (drug-class membership) still exist. | NLM RxNav API docs (InteractionAPIs page notice) |
| "Records retention: **7 years** post-treatment (Medical Council regs)" | No single figure. **NMC/MCI Code of Ethics 2002 Reg 1.3.1**: indoor records **3 years**; **Reg 1.3.2**: supply records within **72 h** of request. DGHS Hospital Manual: inpatient case sheets **10 years**, MLC registers 10 years, OPD 5 years. Design: configurable, default ≥ 10 years, never delete MLC. | NMC Code of Medical Ethics 2002; DGHS Hospital Manual |
| DPDP obligations apply now | **DPDP Rules 2025 notified 13/14 Nov 2025**, phased: Board immediately; consent-manager provisions **13 Nov 2026**; all substantive duties (notice, consent, **72-h breach reporting**, children's verifiable consent, rights, penalties) **13 May 2027**. Until then IT Act 2000 + SPDI Rules 2011 apply. | Gazette G.S.R. 846(E); legal summaries (Lexology, Jan 2026) |
| "argon2id, never MD5/SHA1" as the bar | OWASP: **scrypt N=2^17, r=8, p=1** (or Argon2id t=2, m=19 MiB). App is now at that bar. | OWASP Password Storage Cheat Sheet |
| "Free tiers" without conditions | **Vercel Hobby is non-commercial only** (a B2B pitch to hospitals on it violates ToS); Neon free = 0.5 GB, scale-to-zero; **Supabase free pauses after 7 idle days** (mitigated by the daily cron). | Vercel / Neon / Supabase pricing pages |
| "Multi-role: Patient/Doctor/Hospital Admin/Lab" as built-in | Only PATIENT and DOCTOR roles have any code path. Admin/Lab are schema enum values. | `src/app/api/auth/signup/route.ts`, layouts |

---

## 3. Drawback register

### 3.1 Security

| ID | Drawback | Sev | Mitigation | Status |
|---|---|---|---|---|
| D-S1 | Site was framable → clickjacking on consent "Allow" | S1 | `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` unless `ALLOW_EMBED=1` **at build** (sandbox preview only) — A37 | ✅ live-verified (`curl -I`) |
| D-S2 | Permanent lockout after 5 failures = **DoS against any known email** | S1 | 15-min sliding window, `429 {code:"locked", retryAfterMin}`; counter reset on success — A38 | ✅ verified (6 fails → 429; +16 min → 200) |
| D-S3 | scrypt N=2^14 (8× below OWASP) | S2 | N=2^17, maxmem 256 MiB, `needsRehash()` upgrades on login; stored-N guard ≤ 2^20 (a hostile hash cannot OOM the server) — A39 | ✅ (seed 4096 → 131072 on login, observed) |
| D-S4 | No per-IP rate limit (credential stuffing across many accounts) | S2 | R9: Vercel WAF rate-limit rule (free: 1 rule) or Upstash; until then lockout + strong hashing | 🔴 |
| D-S5 | No MFA, no password reset, no email verification | S2 | R6/R7; report as limits. Reset needs email delivery (Resend free 3k/mo) | 🔴 |
| D-S6 | Lock status reveals account existence (429 vs 401) | S3 | Accept for now (usability of the lock message > enumeration risk at demo scale); alternative: generic 401 + email notice | 📝 |
| D-S7 | 7-day stateless JWT — cannot revoke a stolen cookie before expiry | S2 | R7: `Session` table (id in JWT, checked per request, ~1 ms), logout-all | 🔴 |
| D-S8 | Demo credentials public on landing + login | S3 | By design for the seminar; demo DB is synthetic; reseed script restores state | 📝 |
| D-S9 | DB role is table owner → can drop the ledger trigger | S2 | Least-privilege `citycare_app` role (SQL in `DEPLOY_SUPABASE.md`), root-hash anchoring (R12) | 🔴 (scripted) |
| D-S10 | CSRF relies on Origin/Host + JSON-only | S3 | Adequate for cookie-auth JSON APIs; `SameSite=Lax` + `Origin: null → 403` verified in e2e | ✅ |
| D-S11 | Secrets handling: a Vercel token was pasted in chat | S1 (ops) | Delete/rotate that token; deploy script never prints secrets | 📝 (user action) |

### 3.2 Privacy & compliance

| ID | Drawback | Sev | Mitigation | Status |
|---|---|---|---|---|
| D-P1 | Data in Singapore (Neon) | S2 | Supabase **Mumbai** + Vercel `bom1`, scripted (`scripts/supabase-cutover.sh`) | 🟡 waiting on credentials |
| D-P2 | Minors: no DOB gate, no guardian consent | S1 | R5: age from DOB; < 18 → guardian account links, guardian approves consents, child's data scope | 🔴 |
| D-P3 | No breach-notification procedure (72 h from May 2027) | S2 | Add a one-page runbook to `DATA_AND_TRUST.md`; `/api/health` + ledger verify are the detection primitives | 🔴 |
| D-P4 | Retention: nothing is ever aged out; plan quoted wrong figure | S2 | Policy table (`RetentionPolicy` per record type, default 10 y), never-delete for MLC; purge honours policy | 🔴 |
| D-P5 | Erasure deletes clinical rows immediately; doctors' *own* encounter notes are redacted, not deleted | S3 | Correct per NMC (doctor must retain records) — document as intended | 📝 |
| D-P6 | No privacy notice / consent text for the platform itself (DPDP notice) | S2 | Add `/privacy` static page + checkbox at signup, versioned | 🔴 |
| D-P7 | Ledger stores actor IDs forever (pseudonymous after purge) | S3 | Intended: proof-of-deletion; disclose | 📝 |

### 3.3 Clinical safety

| ID | Drawback | Sev | Mitigation | Status |
|---|---|---|---|---|
| D-C1 | Drug-class tables are tiny (7 penicillins, 4 NSAIDs) → false negatives | S1 (if presented as complete) | Present as "demonstration coverage"; R4: RxClass import for β-lactams, NSAIDs, sulfonamides, ACE-i; unit tests per class | 🔴 |
| D-C2 | Alert fatigue not designed (every out-of-range lab flags) | S2 | Severity tiers (critical vs. borderline), "acknowledged" state, per-encounter summary | 🔴 |
| D-C3 | Not a medical device, but recommendations look like one | S2 | Footer + doctor screen disclaimer present; CDSCO SaMD note in report; never auto-act | 🟡 |
| D-C4 | No drug-drug interaction check at all (RxNav gone) | S2 | R4 curated top-50 pairs + openFDA label text as evidence | 🔴 |
| D-C5 | Free-text ICD codes (no validation) | S3 | ICD-10 code list (WHO, free) for autocomplete | 🔴 |
| D-C6 | Paste-OCR parser is regex-based; unusual formats produce wrong drafts | S3 | Drafts are quarantined until confirmed (by design); R3b OCR + confidence | 📝 |

### 3.4 Data & database

| ID | Drawback | Sev | Mitigation | Status |
|---|---|---|---|---|
| D-D1 | No migration tool; schema changes = hand-written SQL | S2 | `schema/migrations/*.sql` (idempotent, applied by bootstrap every deploy) — `0001` shipped | 🟡 |
| D-D2 | No backups on any free tier | S2 | Weekly `pg_dump` cron from a laptop (command in `DEPLOY_SUPABASE.md`) | 🔴 |
| D-D3 | Ledger is tamper-*evident*, not tamper-*proof* (owner can rebuild the chain) | S2 | Least-privilege role (D-S9) + daily root hash published to an external place (GitHub Gist / email) — R12 | 🔴 |
| D-D4 | Naive `timestamp(3)` convention (stored = UTC) depends on session timezone | S2 | Startup param + `ALTER DATABASE` + **role default** (A46) + `/api/health` asserts `TimeZone = UTC` | ✅ |
| D-D7 | Managed proxies (Neon, Supavisor, Hyperdrive) drop pg startup parameters — `statement_timeout` was 0 live | S2 | Role-level defaults in bootstrap (A46); health exposes effective values | ✅ |
| D-D5 | Patient layout ran 3 queries per navigation | S3 | Merged into one (A41) | ✅ |
| D-D6 | `DATABASE_URL_UNPOOLED` always won → could not move off Neon by env alone | S2 | Precedence fixed (A42): `DATABASE_URL` wins unless it is a transaction pooler | ✅ |

### 3.5 Infrastructure & operations

| ID | Drawback | Sev | Mitigation | Status |
|---|---|---|---|---|
| D-I1 | Vercel Hobby = non-commercial | S2 | Fine for academic demo; Pro ($20) or Cloudflare Workers (prepared, `DEPLOY_CLOUDFLARE.md`) for anything else | 📝 |
| D-I2 | No monitoring / uptime check | S2 | `/api/health` + daily cron + `/admin/system` dashboard; point UptimeRobot (free) at it | ✅ endpoint; 🔴 external monitor |
| D-I3 | Cold starts (Neon scale-to-zero, Supabase pause) | S3 | Cron keeps Supabase active; first request after idle ~1–3 s — disclose | 🟡 |
| D-I4 | No CI: tests run only when someone remembers | S2 | GitHub Actions: `vitest` + `next build` + e2e against a Postgres service (R14) | 🔴 |
| D-I5 | No UI tests (Playwright) | S3 | R14: 5 smoke flows (login, book, allow, doctor view, revoke → 403) | 🔴 |
| D-I6 | Next.js 16 / Tailwind 4 / React 19 = bleeding edge | S3 | Pinned versions in lockfile; upgrade only between milestones | 📝 |
| D-I7 | Landing page ships GSAP+Motion (+97 KB gzip) | S3 | Landing-only chunk (verified: `/login` and `/patient` do not load it); `LazyMotion` could cut ~20 KB more | 🟡 |

### 3.6 Product & UX

| ID | Drawback | Sev | Mitigation | Status |
|---|---|---|---|---|
| D-U1 | Tab bar showed two active tabs on sub-routes | S3 | Longest-prefix match (A40) + unit test | ✅ |
| D-U2 | Flat, iconless, system-font UI; no loading feedback | S3 | Design tokens, Inter (self-hosted), motion system, skeletons — this round | ✅ |
| D-U3 | Notifications exist in DB but the user never sees them | S2 | Inbox + bell + badge (F3) | ✅ |
| D-U4 | English only; Marathi/Hindi absent | S2 | `next-intl` with 2 locales for the 6 patient screens (R15) | 🔴 |
| D-U5 | Accessibility not audited (contrast, labels, keyboard) | S2 | This round: focus-visible ring, `aria-current`, reduced-motion, SVG titles; run axe before the report | 🟡 |
| D-U6 | No offline/low-bandwidth story | S3 | Out of scope; SSR pages already work on 3G; document | 📝 |
| D-U7 | Doctor has a single "Today" tab — no patient search, no history view | S2 | `/doctor/patients` + Inbox tab | ✅ |
| D-U8 | KPI claims unmeasured | S2 | R11 timing study | 🔴 |

### 3.7 Process & academic

| ID | Drawback | Sev | Mitigation | Status |
|---|---|---|---|---|
| D-A1 | Plan/PPT/app naming and college/course inconsistent | S2 | One title everywhere: **"CityCare: Intelligent Patient Health Record"** (matches the PPT) — decision needed | 🔴 |
| D-A2 | Viva table cites unbuilt features | S1 | Rewritten in plan v2 §12 | ✅ |
| D-A3 | Plan is Hinglish; report needs formal English | S3 | This document is report-ready English; reuse §0–§3 | ✅ |
| D-A4 | AI-assisted code the team cannot explain | S1 (viva) | Reading plan per member (§7) + each member re-implements one function from scratch in a pairing session | 🔴 |
| D-A5 | References in PPT incomplete / mis-attributed | S2 | See Request-5 feedback; add Roehrs 2017, Abd-Alrazaq 2019, DPDP Act, NMC 2002, OWASP | 🔴 |

---

## 4. Fixed and verified this round

| Fix | What changed | Evidence |
|---|---|---|
| A37 | Security headers in `next.config.ts` (nosniff, Referrer-Policy, Permissions-Policy, `frame-ancestors 'self'` + XFO unless `ALLOW_EMBED=1` at build) | live: `content-security-policy: frame-ancestors 'self'`, `x-frame-options: SAMEORIGIN`, nosniff, referrer, permissions ✓ |
| A38 | Timed lockout (5 fails / 15-min sliding window via `updatedAt`, no schema change) | 6 wrong → `429 locked, retryAfterMin 15`; `updatedAt −16 min` → correct password → 200, counter 0 |
| A39 | scrypt 2^17 + `maxmem` + rehash-on-login + hostile-N guard; `engines.node >=20.9` | vitest `auth-cookie.test.ts` (N=131072, `needsRehash` cases); `vikas@demo.in` hash N 4096 → 131072 after login |
| A40 | Tabs longest-prefix active logic | `tabs-active.test.ts` 4 cases; unit total 78/78 |
| A41 | Patient layout 3 queries → 1 | e2e 55/55; page renders name/pending/drafts |
| A42 | DB URL precedence (`DATABASE_URL` wins unless transaction pooler) | tsc/eslint; live path unchanged for Neon (its `DATABASE_URL` is `-pooler.` → falls to UNPOOLED) |
| A43 | Dead `AppNav.tsx` removed (duplicate of tabs with the A40 bug) | grep: zero importers |
| A44 | `/api/health` + daily Vercel cron (`vercel.json`) | live: `{"status":"ok","db":{"timezone":"UTC","statementTimeout":"8s","postgres":"18.6","ledgerBreaks":0}}` |
| A45 | Seed never inserted the allergy `reaction` text (ESLint unused-var was the clue) | Ramesh: "Penicillin → rash + swelling (childhood)" in DB |
| A46 | `statement_timeout` was **0 in production** (Neon proxy drops pg startup params) → hung queries ran to Vercel's 30 s kill | bootstrap sets role defaults; live health went `"0"` → `"8s"`; `rolconfig={statement_timeout=8s,TimeZone=UTC}` |
| UI | Self-hosted Inter, tokens, focus rings, reduced-motion, GSAP hero/flow/steps, Lenis (landing only), Motion reveals/page transitions/tab underline, skeleton `loading.tsx` | build ✓, landing SSR contains all copy, e2e 55/55, gsap chunk only on `/` |

---

## 5. Decisions taken (the clarifying questions were skipped)

1. **Supabase = Postgres only**, Mumbai. Rationale in `web/DEPLOY_SUPABASE.md`. Reversible: Supabase Auth/RLS
   can be layered later; nothing in the app assumes Neon.
2. **Animation stack**: Motion (`motion/react`, the Framer Motion successor) for UI micro-interactions, **GSAP +
   ScrollTrigger + MotionPath** for the landing hero/diagram/steps, **Lenis** for smooth scroll — mounted only on `/`.
   App screens keep native scroll (forms/tables). Everything respects `prefers-reduced-motion`.
3. **No auth rewrite** on top of Supabase — the consent model's guarantees are tested end-to-end today.
4. **Region stays `sin1` until the DB moves** (functions must sit next to the database, not the user).

## 6. Roadmap (ordered by marks-per-hour)

| R | Item | Effort | Acceptance |
|---|---|---|---|
| R1 | ✅ **shipped (F1)** — registration no. required, admin queue `/admin`, unverified = invisible/unbookable/403 everywhere, ledger + inbox | done | e2e `F1:` ×9 |
| R2 | ✅ **shipped (F2)** — exactly as specified, plus 3/24 h quota, 409 when consent already live, patient revoke | done | e2e `F2:` ×9 |
| R3 | Documents: Supabase Storage bucket, signed upload/download URLs (60 s), `Document.storageKey` only | 2 days | file never in DB; download URL expires |
| R3b | Client-side OCR: `tesseract.js` in the browser → text → existing DRAFT pipeline (image never uploaded) | 1 day | printed prescription → drafts with per-line confidence |
| R4 | Drug classes from RxClass export (β-lactam, NSAID, sulfonamide, ACE-i, statin) + curated top-50 interaction pairs | 2 days | unit tests per class; interaction warning in encounter form |
| R5 | Minors: DOB-derived age; guardian link table; guardian approves consents for < 18 | 2 days | e2e: minor cannot self-approve |
| R6 | Password reset + email verification (Resend) | 1 day | reset token single-use, 15 min |
| R7 | Server-side sessions (revocation, logout-all) | 1 day | stolen cookie dies on logout |
| R8 | ✅ **shipped (F4)** — `GET /api/patient/fhir`, + Observation with reference ranges, drafts excluded, export logged | done | 3 unit + 4 e2e; HAPI validation still to run |
| R9 | Per-IP rate limit on `/api/auth/*` | ½ day | 30 req/min/IP → 429 |
| R10 | ✅ **shipped (F3)** — inbox for all roles, bell polling, tab badge, mark-all-read | done | e2e `F3:` ×5 |
| R11 | Timing study: 5 users × (signup→booking, consent decision) | ½ day | numbers in the report replace the illustrative ones |
| R12 | Ledger root-hash anchoring (daily hash → Gist/email) | ½ day | anchored hash matches `ledger_verify()` head |
| R13 | Migrations (`dbmate`) | ½ day | `schema/migrations/0001_init.sql` reproducible |
| R14 | CI (GitHub Actions): vitest + build + e2e vs Postgres service; 5 Playwright smoke flows | 1 day | red build on PR |
| R15 | Marathi/Hindi for patient screens | 2 days | locale switch persists |
| R16 | ✅ **shipped** — `/doctor/patients` with live verdict in SQL, next appt, last visit, read count, search | done | render check |

## 7. Team split for five (replaces plan §9 "4 log")

| Member | Owns (must be able to whiteboard it) | First reading assignment |
|---|---|---|
| A | Auth & sessions: `src/lib/auth.ts`, `api/auth/*`, lockout, cookie flags | write the login sequence diagram from code |
| B | Consent engine: `lib/consent` (liveConsent verdicts), `api/patient/consents`, auto-revoke in appointment status | explain why revoke → 403 without cache |
| C | Ledger: `schema/sql/ledger.sql`, `lib/ledger.ts`, `/api/health`, `ledger_verify()` | demonstrate a tampered row being detected |
| D | Clinical rules: `lib/rules.ts`, paste-OCR → DRAFT, encounter form checks | add one drug class with tests (R4 slice) |
| E | Product/UI & deployment: landing, motion system, `scripts/*.sh`, Vercel/Supabase, e2e | run the full deploy + e2e alone |

## 8. Open questions for the team

1. Final title: **"CityCare: Intelligent Patient Health Record"** (PPT) — confirm, and the app `<title>` + plan header change to match.
2. College/course line: G H Raisoni College, Dept. of Science & Technology, **B.Sc**? (plan header says BCA/Pune).
3. Supabase project: who creates it (needs an account) — hand over the **session pooler URI** only.
4. Which two of R1–R16 go into Seminar-II scope? Recommendation: **R1 + R2** (both close S1 gaps and are demo-able in 60 seconds).

---

### Addendum 28 Sep 2026 — legal round (L1)
The plan had no legal section at all. `web/LEGAL_COMPLIANCE.md` now holds the register. Shipped: DPDP notice/consent artefact/adult gate/nominee/grievance/retention sweep/licence gate (A51–A56 fixed). Open legal gaps are tracked as L-G1…L-G8 there; the roadmap items that close them are marked ⚖ in `web/FEATURES.md` (L2, F13, F15, F21).

---

## Addendum (29 Sep 2026) — "fix all gaps and drawbacks" round

Closed in code and proven live (`e2e` 160/0 against production): server-side sessions with
device list and sign-out-everywhere (D2/D8/D21), per-IP/per-user rate limiting (D37), admin
unlock (D9/D16), ledger pagination + account-level events on the patient ledger (D14/A57),
pure + tested consent-scope filter that found a real SPECIFIC_CONDITION leak (D19/A58),
re-consent gate with 428 (D45/L-G3), in-app grievance desk (D43/L-G1), breach register with
72-h clock and r.7(2) report (L-G5), break-glass review queue with auto-suspension (D41),
dependents for minors under an adult guardian (L-G4/F13), Hindi/Marathi key-points summary
(D44/L-G2), cron housekeeping + time budget (D46).

Left open on purpose, with reasons: argon2id (native addon; scrypt N=2¹⁷ is OWASP-acceptable),
Mumbai residency (needs the account owner's Supabase pooler URI), real IMR/HPR lookup (no public
API), file storage (needs bucket credentials), email/SMS legs (needs a provider key), verifiable
guardian ID (DigiLocker token), full legal translation (needs a reviewer). Each has an id in
`web/DRAWBACKS_AND_BUGFIXES.md` (D48–D52) or `web/LEGAL_COMPLIANCE.md` §3.

## Addendum (29 Sep 2026, round 3) — second "fix all gaps and drawbacks" pass

Closed in code and proven (local e2e 217/0 on migration 0004, live 190/0/9): **real file storage**
without a bucket (AES-256-GCM blobs in Postgres under an env key, 60-s viewer-bound links,
FULL-scope only, ledgered — D4/L-G8), **self-service recovery** (hashed one-time codes; e-mail
verify/reset scaffold that is honest about delivery — D3/D9), **handover at 18** with the adult's
own acceptance (D49/A70), **ledger anchoring** (Ed25519 + OpenTimestamps; live anchor #9 accepted
by a public calendar — D13), **slot capacity** with per-seat DB guard (D6/A71) and a self-refreshing
grid (D7), **verification attestation** recorded in the ledger (D12/L-G7/A68), sliding sessions
(D52), multipart CSRF (D22), warm-up (D31), notice v2026-09-29 (A69), CI workflow file (F19).

Still open and *why* — each needs something only the team can supply: Resend key + verified
sending domain (e-mail actually leaving the server), DLT-registered SMS sender (phone OTP),
Supabase Mumbai pooler URI (residency), ABDM sandbox + HPR credentials (registry verification,
ABHA linking), DigiLocker partner credentials (guardian age token), a lawyer for the hi/mr
translations, a GitHub remote for the CI file to run. Design-level leftovers: object storage +
key rotation (D53/D54), OTS receipt upgrade job (D55), app-shell i18n (D17/D58).
