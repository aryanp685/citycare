# CityCare — MASTER GAP REGISTER (Consolidated, Step 1 Final)

_Consolidated 2026-11-01 from all Step 1 audit deliverables (listed in §0), the in-repo
registers (`web/DRAWBACKS_AND_BUGFIXES.md` A1–A76 / D1–D62, `web/LEGAL_COMPLIANCE.md`
LG-01–LG-25), and direct re-verification against the repository (`main @ 9212ee4` +
consolidation-time re-runs: vitest **162/162**, tsc/eslint clean, build `z3V6kdcbj_3asdYqYEvJ4`
clean, e2e **241/241** fresh seed — all executed 2026-11-01 in this sandbox)._

**ID policy (per consolidation brief):** all Step-1 NG IDs are preserved verbatim and none
is deleted. Seventeen new IDs are issued, none colliding with an existing one:
**NG-S15, NG-S17, NG-F12, NG-F13, NG-G08**, plus the twelve legal-matrix gap rows
re-registered as **NG-L07, NG-L08, NG-L11, NG-L14, NG-L16, NG-L17, NG-L18, NG-L19, NG-L20,
NG-L21, NG-L24, NG-L25** (the LG-xx IDs of `CITYCARE_LEGAL_COMPLIANCE_GAPS.md` remain valid
citations; NG-Lxx is this register's namespace for them). NG-S15 was **explicitly reserved
as unused** in the Step-1 register and is now assigned to a new finding (an assignment of a
reserved number, not an overwrite). NG-G05 remains reserved/unused. Aliases (kept as
pointer rows, not double-counted): NG-D08→NG-P03, NG-F09→NG-U04, NG-F10→NG-U05,
NG-U08→NG-P01 (UI-side ask). NG-G02 is recorded as Verified Resolved (closed by the
Step-1 audit's architecture doc).

**Evidence categories:** VERIFIED (code inspection and/or reproducible test, cited) ·
REPORTED (in an audit or secondary source, not independently verified here) · PARTIALLY
VERIFIED · NOT VERIFIED · BLOCKED (external service/human/credentials required).
**Sandbox vs production:** every measurement here is **sandbox** (this environment, embedded
Postgres 18.6, `next start` on 127.0.0.1). Production (`citycare-z95n.vercel.app` + Neon)
is **not reachable from this sandbox** — no production measurement is claimed anywhere in
this register; items needing production confirmation are marked accordingly (NG-G04,
NG-P06, NG-S10 owner-side).

---

## 0. Source material (all read in full during consolidation)

| Source | Used for |
|---|---|
| `CITYCARE_STEP_1_COMPLETE_AUDIT.md` | main report, 12 answers |
| `CITYCARE_CURRENT_ARCHITECTURE.md` | stack/versions, inventory, dead-code sweep |
| `CITYCARE_SECURITY_AUDIT.md` | security control verdicts + probes |
| `CITYCARE_DATABASE_AUDIT.md` | schema/FK/index/trigger audit, growth paths |
| `CITYCARE_FEATURE_COMPLETENESS.md` | 37-row feature matrix |
| `CITYCARE_UI_UX_AUDIT.md` | design system, animation architecture, page gaps |
| `CITYCARE_PERFORMANCE_AUDIT.md` | measured timings, serverless constraints |
| `CITYCARE_INDIA_MARKET_RESEARCH.md` | ABDM figures, competitor map, 12 answers (cited sources) |
| `CITYCARE_LEGAL_COMPLIANCE_GAPS.md` | verified DPDP/ABDM/NMC dates, LG matrix |
| `CITYCARE_STEP_2_IMPLEMENTATION_PLAN.md` | workstreams W0–W16, pilot gate |
| `web/DRAWBACKS_AND_BUGFIXES.md` | A1–A76 fixed bugs, D1–D62 drawbacks |
| `web/FEATURES.md`, `web/LEGAL_COMPLIANCE.md`, `web/README.md`, `web/DEPLOY_VERCEL.md` | in-repo claims cross-checked against code |
| Repo code (179 ts/tsx files, 1,142 lines schema SQL) | direct verification |

## 1. Summary (calculated from the reconciled register below — not estimated)

**Total unique active findings: 73** = 56 carried from Step 1 (every ID preserved) +
**17 new at consolidation** (NG-S15, NG-S17, NG-F12, NG-F13, NG-G08 + the 12 legal-matrix
rows NG-Lxx listed above). Alias pointers (4) and the closed row (1, NG-G02) are listed in
the appendices but not counted.

**By priority**

| Priority | Count | IDs |
|---|---|---|
| **P0 — Launch Blocker** | **6** | NG-S09, NG-S15, NG-C06, NG-L08, NG-L18, NG-L21 |
| **P1 — Pilot Critical** | **13** | NG-S10, NG-S11, NG-S13, NG-S14, NG-S17, NG-G04, NG-D03, NG-D05, NG-F01, NG-F02, NG-F03, NG-F05, NG-L11 |
| **P2 — Important** | **28** | NG-S01, NG-S03, NG-S05, NG-D01, NG-D04, NG-D07, NG-F04, NG-F06, NG-F11, NG-F12, NG-F13, NG-G01, NG-G07, NG-G08, NG-C01, NG-C02, NG-C04, NG-C05, NG-U01, NG-U02, NG-U03, NG-U06, NG-P02, NG-P03, NG-L14, NG-L16, NG-L19, NG-L24 |
| **P3 — Future** | **20** | NG-S02, NG-S04, NG-S06, NG-S08, NG-D02, NG-D06, NG-F07, NG-F08, NG-C03, NG-U04, NG-U05, NG-U07, NG-U08, NG-P01, NG-P04, NG-G03, NG-L07, NG-L17, NG-L20, NG-L25 |
| **INFO — Observation** | **6** | NG-S07, NG-S12, NG-S16, NG-P05, NG-P06, NG-G06 |

**By section (primary assignment):** A Security & Privacy **19** · B Database &
Architecture **6** · C Healthcare & Clinical Safety **10** · D Workflows **5** ·
E UI/UX & Accessibility **8** · F Performance & Scalability **6** · G Market & Commercial
**3** · H Legal & Regulatory **12** · I Governance & Process **4** = **73**.

**By evidence status** (computed from the per-finding `Evidence status:` lines below; each
finding counted once under its primary status, with dual aspects noted inside the finding):
VERIFIED **63** · PARTIALLY VERIFIED **2** (NG-S10, NG-U03) · BLOCKED **5** (NG-S11,
NG-G04, NG-S17, NG-L11, NG-L19 — the gap itself is confirmed in-repo; final verification of
the fix needs an external actor, credentials, or budget) · NOT VERIFIED (production value)
**1** (NG-P06) · REPORTED (official/secondary source, not measured here) **2** (NG-F13,
NG-L17).
*(Dual aspects are stated in the finding, e.g. NG-S01 is code-VERIFIED while the production
HSTS value is NOT VERIFIED until NG-G04's owner run; NG-F03/NG-F05 have VERIFIED absence
plus REPORTED market context.)*

**P0 launch blockers (6)** — must close before any real patient data:
1. **NG-S09** no database backup / DR / tested restore
2. **NG-S15** *(new)* the live demo **7-day retention sweep is active on the production instance** — a pilot reusing that env would auto-erase real pilot users
3. **NG-C06** clinical rule engine has never had clinical review
4. **NG-L08** erasure-vs-retention design needs counsel confirmation (subsumed by the L21 pack)
5. **NG-L18** retention/redaction design needs counsel confirmation (subsumed by the L21 pack)
6. **NG-L21** pilot governance pack (ethics + informed consent + counsel sign-off)

**P1 pilot-critical (13):** monitoring (NG-S10) · CI green (NG-S11) · 2FA (NG-S13) ·
demo-credential isolation (NG-S14) · external pen test (NG-S17) · production e2e re-run
(NG-G04) · org model (NG-D03) · object storage (NG-D05) · e-mail leg (NG-F01) · grievance
officer (NG-F02) · Marathi/Hindi (NG-F03) · ABHA identifier (NG-F05) · verifiable guardian
age (NG-L11).

**Blocked items (5):** NG-S11 (owner must enable GitHub Actions) · NG-G04 (owner must run
prod e2e) · NG-S17 (external budget/approval) · NG-L11 (DigiLocker partner credentials) ·
NG-L19 (ABDM/HPR credentials).
**External dependencies (non-blocked):** owner's Resend key + verified domain (NG-F01),
grievance-officer appointment (NG-F02), translation legal review (NG-F03), prod DB access
for backup drills (NG-S09), 2+ practising physicians (NG-C06), qualified Indian counsel
(NG-L08/L18/L21/L14), 5–10 doctor + 10–20 patient interviews (NG-F13), object-storage
account (NG-D05).

**Highest-risk unresolved issues (ranked):**
1. NG-S15 (new) — **silent real-user data loss** if the pilot reuses the demo env (sweep is
   live in cron code today; `DEMO_RETENTION_DAYS` defaults 7, clamped 1–365, `@/lib/legal.ts`
   L31).
2. NG-S09 — total data loss on provider incident (no backup at all).
3. NG-C06 — clinical confidence without review (the product's safety claim is unreviewed).
4. NG-S14 — public demo accounts on the live site (pilot contamination / unauthorised use).
5. NG-S10 — nobody knows when the system is down.
6. NG-D05 — 0.5 GB Neon Free ≈ 15 full-quota patients (DB-full = total outage).
7. NG-G04 — the live site has not been verified since F5/F18 (locally it is green; prod
   unknown — the A76 prod 500 proved how that gap bites).

**Readiness (detail in `CITYCARE_READINESS_SCORECARD.md`):** Technical **good** (241/241,
no Critical code defects) · Security **good in code, weak in operations** (backup/monitoring
missing) · Clinical **incomplete** (no DDI rules, 1 drug class, no review) · Legal
**pre-built for DPDP 2027-05, counsel sign-off missing** · Operational **weak** (no DR, no
monitoring, CI off, prod unverified) · Commercial **unvalidated** (desk research only, no
interviews, Hobby ToS caps non-commercial).

---

## A. Security & Privacy (19 findings)

#### NG-S09 — No database backup / disaster-recovery path
- **Category**: Security & Ops → Data resilience
- **Description**: Production data lives only in Neon Free (no PITR, autosuspend, 0.5 GB cap). There is no scheduled dump, no private backup store, and no documented/tested restore procedure anywhere in the repo.
- **Current implementation / observed behaviour**: Nothing performs a backup. `web/scripts` contains bootstrap/seed/e2e/deploy scripts only (verified by directory read, 2026-11-01). The deploy docs state "free tiers — no backup: disclose in report" (an accepted demo limitation, now a pilot blocker).
- **Expected behaviour**: A scheduled encrypted dump (RPO documented) and a restore runbook that has been executed at least once, with `ledger_verify()` clean on the restored DB.
- **Evidence**: Step-1 security doc §2; repo script inventory; `web/DEPLOY_VERCEL.md`; plan doc §6 deploy note.
- **Evidence status**: VERIFIED (absence confirmed by inspection, 2026-11-01)
- **Severity**: High · **Priority**: P0 (launch blocker)
- **Business impact**: One provider incident (or a fat-fingered `FORCE_SCHEMA=1` against prod — the guard is human discipline) destroys the product's entire asset: records, consents, ledger evidence.
- **Patient safety impact**: Loss of clinical data (allergies, meds, labs) can directly affect care continuity; loss of the ledger destroys the tamper-evidence the product's trust claim rests on.
- **Security/privacy impact**: DPDP "reasonable security safeguards" (s.8(5)/r.6, from 13 May 2027; SPDI today) plausibly include recoverability for health data.
- **Technical impact**: None until the event; then total.
- **Dependencies**: production DB access (owner credentials).
- **Recommended solution**: Step-2 W1 — daily `pg_dump` under `CRON_SECRET` to a private object store (30-day retention) + restore runbook + drill.
- **Required tests**: restore drill (restore → schema check → `ledger_verify()` = 0 breaks → login works); dump-failure alerting.
- **Acceptance criteria**: **A documented, executed restore drill** whose output is committed to the repo (date, RPO/RTO, `ledger_verify` result); a cron failure is observable.
- **External deps / approvals**: owner's prod DB access.
- **Complexity**: Small · **Status**: Open

#### NG-S15 — Live demo retention sweep will erase real pilot users if the pilot reuses the production instance *(NEW at consolidation)*
- **Category**: Security & Ops → Data lifecycle / environment separation
- **Description**: The daily cron (`/api/cron/daily`) erases **every self-registered account older than `DEMO_RETENTION_DAYS`** (default **7**, clamped 1–365; `@/lib/legal.ts` L31; sweep SQL + `erasePatientData`/`anonymiseDoctor` in the cron route, read 2026-11-01). Only seeded `@demo.in` identities are exempt. This is correct for the public demo (DPDP s.8(7) purpose-served erasure) — but it is **live on the current production instance**. A controlled pilot that reuses that instance (or an env with the same default) would silently auto-erase real pilot patients/doctors after 7 days, with ledger entries `DATA_ERASED reason=demo_retention`.
- **Current implementation / observed behaviour**: Cron step 1 runs daily (Vercel schedule 02:30 IST), budgeted 20 s, `LIMIT 200` per run, `deferred` overflow next day. Verified in code (`src/app/api/cron/daily/route.ts` L28–L61) and in `LEGAL_COMPLIANCE.md` §5.
- **Expected behaviour**: On any instance handling real (non-demo) data, the sweep is disabled or its horizon set to a policy-approved value (and the policy disclosed in the notice with a notice-version bump).
- **Evidence**: code read 2026-11-01 (consolidation); Step-1 docs did **not** flag the pilot interaction — this is the gap the reconciliation surfaces.
- **Evidence status**: VERIFIED (code read)
- **Severity**: High (for any real-data environment) · **Priority**: P0 (launch blocker — data loss of real users)
- **Business impact**: A pilot that loses its users' data on day 8 destroys trust and is a reportable-incident candidate.
- **Patient safety impact**: Erasure deletes the patient's clinical record (allergies/meds/encounters) after 7 days — care-continuity harm.
- **Security/privacy impact**: Inverted erasure — deleting data whose purpose is still being served (DPDP s.8(7) requires erasure *when the purpose is no longer served*, not on a fixed demo clock).
- **Technical impact**: Configuration-only fix; low effort.
- **Dependencies**: none for the env-flag change; notice update if the policy text changes (L2 428 machinery already exists).
- **Recommended solution**: Pilot env (Step-2 W11) must set the sweep OFF (or a documented, disclosed horizon) + add a boot-time warning when the sweep is active on a non-demo env; add e2e/health fact so `/api/health` reports the effective retention policy.
- **Required tests**: e2e: on a test DB with the sweep disabled, a 10-day-old self-registered account survives one cron run; on the demo config it is erased (existing behaviour preserved).
- **Acceptance criteria**: pilot env demonstrably does not erase self-registered real users (test above); `/api/health` exposes the active policy; the notice reflects it.
- **External deps / approvals**: none (code/config only); notice text change needs the L2 discipline.
- **Complexity**: Small · **Status**: Open

#### NG-S10 — No external uptime monitoring / alerting
- **Category**: Security & Ops → Reliability
- **Description**: The only heartbeat is the app's own daily cron hitting itself; if Vercel or Neon is down, no one is notified.
- **Current implementation / observed behaviour**: `vercel.json` cron (self-probe); no third-party monitor configured. Owner-side state NOT VERIFIED from this sandbox (no `*.vercel.app` egress).
- **Expected behaviour**: An independent probe on `/api/health` with alerting; DB-level alerts on the DB plan.
- **Evidence**: Step-1 security doc §2 (NG-S10 row); `vercel.json` read.
- **Evidence status**: PARTIALLY VERIFIED (code/config absence verified; owner-side monitoring unknown)
- **Severity**: High · **Priority**: P1 (pilot critical)
- **Business impact**: Unbounded unknown downtime during a pilot = failed trust event.
- **Patient safety impact**: Indirect (unavailable records during consultation).
- **Security/privacy impact**: Breach response (72 h clock) is slower if the outage hides the incident.
- **Technical impact**: None until the event.
- **Dependencies**: free-tier monitor account (owner).
- **Recommended solution**: Step-2 W3 — UptimeRobot/BetterStack on `/api/health`; Neon alerts when the paid plan decision (W11) lands.
- **Required tests**: induced 5-minute outage in staging → alert received.
- **Acceptance criteria**: monitor live on the production URL; an induced outage is caught + notified in < 10 min; evidence (screenshot/log) committed.
- **External deps / approvals**: owner account.
- **Complexity**: Small · **Status**: Open

#### NG-S13 — No second-factor authentication
- **Category**: Security → Authentication
- **Description**: Password-only auth on health data. Mitigations exist (scrypt N=2¹⁷ async, 15-min sliding lockout, per-IP rate limits, server-side revocable sessions, device list) but a phished/leaked password grants full account access (read, export, erase).
- **Current implementation / observed behaviour**: No MFA code path in `src/lib/auth.ts` or any route (verified by read). F6 (passkeys) is on the roadmap, unimplemented.
- **Expected behaviour**: Phish-resistant login (passkeys) at least for doctor/admin roles before real-data use; ideally patient roles too.
- **Evidence**: Step-1 security doc §2; `auth.ts` read; FEATURES.md "Next" (F6).
- **Evidence status**: VERIFIED (absence in code)
- **Severity**: Medium · **Priority**: P1 (pilot critical)
- **Business impact**: A single credential leak becomes a patient-data incident (72 h clock starts).
- **Patient safety impact**: An attacker with the account can read records (and request erasure).
- **Security/privacy impact**: Credential theft = full access; "reasonable safeguards" for health data increasingly expect a second factor.
- **Technical impact**: WebAuthn adds credential-management surface (recovery path must stay solid — one-time codes already exist).
- **Dependencies**: none (F6 design drafted in FEATURES.md).
- **Recommended solution**: Step-2 W8 — passkeys (platform authenticators first, `@simplewebauthn`), TOTP fallback for doctors/admins; security-panel credential list.
- **Required tests**: passkey-only login e2e; passkey + password login; recovery-codes path still works; stolen-password simulation denied when passkey is registered.
- **Acceptance criteria**: documented + tested second-factor flow; security panel lists passkey devices; e2e green.
- **External deps / approvals**: none.
- **Complexity**: Medium · **Status**: Open

#### NG-S14 — Production demo accounts with published credentials
- **Category**: Security → Environment hygiene
- **Description**: `@demo.in` seeded identities (3 patients, 3 doctors, 1 admin) with the password published in README/START_HERE are live on the public site. By design for a demo (banner, synthetic data, 7-day sweep for self-registrations) — but a pilot cannot ship this: anyone can act as a "patient"/"doctor" on the pilot instance and pollute the audit trail.
- **Current implementation / observed behaviour**: Seeded by `scripts/seed.mjs` (11 users incl. admin); credentials in `web/README.md` (public). The 7-day sweep covers only *self-registered* accounts, not the seeded ones.
- **Expected behaviour**: Pilot instance has zero seeded identities (or demo data isolated behind a flag + separate DB); old demo credentials fail.
- **Evidence**: README/START_HERE read; seed.mjs read.
- **Evidence status**: VERIFIED
- **Severity**: Medium · **Priority**: P1 (pilot critical)
- **Business impact**: Unauthorised actors in pilot data; medico-legal noise in the ledger.
- **Patient safety impact**: A stranger logged in as demo-doctor can grant/break-glass *as that doctor* (break-glass requires a verified doctor — seeded demo doctors **are** verified: `isVerified=true` in seed — so this is a real attack surface on a shared pilot env).
- **Security/privacy impact**: Identity confusion in the audit trail (the product's core promise is verifiable "who saw what").
- **Technical impact**: Bootstrap flag + e2e adjustment (the suite currently logs in as demo users — see NG-G08).
- **Dependencies**: none (code + env).
- **Recommended solution**: Step-2 W11 — `SEED_DEMO=0` bootstrap mode; pilot env starts empty; e2e demo-dependent checks gated (NG-G08).
- **Required tests**: fresh pilot-mode DB has 0 users; login with old demo creds → 401; e2e green in both modes.
- **Acceptance criteria**: pilot URL with 0 seeded users verified by the owner; old creds fail (evidence committed).
- **External deps / approvals**: owner (deploy of the flag).
- **Complexity**: Small · **Status**: Open

#### NG-S17 — No external penetration test has ever been performed *(NEW at consolidation)*
- **Category**: Security → Assurance
- **Description**: All security evidence in the repo is self-assessed (code review + unit/e2e + probes by the same team). An independent OWASP-style assessment is the standard pre-pilot assurance for a product holding health data, and is mandatory later if ABDM certification is ever pursued (STQC/CERT-IN empanelled audit).
- **Current implementation / observed behaviour**: No pen-test report exists in the repo; Step-1 security doc §4 item 1 states this explicitly ("BLOCKED without owner budget").
- **Expected behaviour**: A scoped external assessment (auth, consent paths, IDOR, upload, cron, headers) with a findings report before real-data use.
- **Evidence**: Step-1 security doc §4; repo search for any report: none (2026-11-01).
- **Evidence status**: BLOCKED (execution needs owner budget + provider selection); the absence itself is VERIFIED — no pen-test report exists in the repo
- **Severity**: Medium · **Priority**: P1 (pilot critical for a "serious" pilot; P2 if the pilot stays fully synthetic)
- **Business impact**: Investors/examiners/regulators expect third-party assurance for health data.
- **Patient safety impact**: Independent verification of the safety-critical paths.
- **Security/privacy impact**: May surface findings self-review structurally misses (assumption blindness).
- **Technical impact**: Findings (if any) become new register rows.
- **Dependencies**: owner budget + provider selection.
- **Recommended solution**: Scope a focused OWASP ASVS L2 assessment (this app's threat model is well documented in the security audit — hand it over as the scope document).
- **Required tests**: the pen test itself.
- **Acceptance criteria**: signed report; all Critical/High findings either fixed (with this register updated) or risk-accepted in writing by the owner.
- **External deps / approvals**: owner budget, provider.
- **Complexity**: Small (in-repo work is only finding-fixes) · **Status**: Blocked

#### NG-S11 — CI (GitHub Actions) is disabled; no automated gate on merge
- **Category**: Security & Ops → CI/CD security
- **Description**: `.github/workflows/ci.yml` exists (lint, tsc, vitest, licence gate, schema bootstrap, build, 241-check e2e on a Postgres service) but the repo's Actions are disabled — the 2026-10-31 push produced a 0-second failure with no log (D59). Regressions currently ship by hand. Note for the record (INFO, not a separate finding): the workflow's committed `SESSION_SECRET: ci-only-secret-…` literal is a CI-only value for a throwaway Postgres — low risk, but rotate-on-any-change hygiene is noted.
- **Current implementation / observed behaviour**: Workflow file present and correct in content (read 2026-11-01); never completed a run. The identical sequence was re-run green in the sandbox **twice** (Step 1 and consolidation time: 162/162 + 241/241 + build clean) — so the gate would pass if enabled.
- **Expected behaviour**: A green Actions run on every push/PR; merge without a green run is blocked by habit (and ideally branch protection).
- **Evidence**: D59; `.github/workflows/ci.yml` read; consolidation-time re-run green.
- **Evidence status**: BLOCKED (owner must enable Actions in repo settings)
- **Severity**: Medium · **Priority**: P1 (pilot critical — also a Step-2 gate: CI must precede major implementation batches)
- **Business impact**: Regression risk between merges during a fast implementation phase.
- **Patient safety impact**: Indirect (regressions in consent/erasure paths).
- **Security/privacy impact**: The licence gate + build gate are the only structural defence against accidental copyleft/secret regressions.
- **Technical impact**: None (the sequence is proven green locally).
- **Dependencies**: owner repo setting (Settings → Actions → enable).
- **Recommended solution**: Step-2 W4 — owner enables Actions; first push → green run; then enable branch protection (require status).
- **Required tests**: the existing suite via Actions.
- **Acceptance criteria**: a green Actions run on `main` (link committed to README); D59 closed in the bug log.
- **External deps / approvals**: owner.
- **Complexity**: Small · **Status**: Blocked

#### NG-G04 — Production e2e not re-run since F5/F18 (live site unverified)
- **Category**: Security & Ops → Production verification
- **Description**: The last production e2e (190 passed / 9 skipped) predates F5 and F18. The sandbox cannot reach `*.vercel.app`, so the live site's current behaviour is unverified by any test. (Context: the A76 incident showed exactly this gap biting — a production-only failure with no prod test coverage.)
- **Current implementation / observed behaviour**: Local e2e is green (241/241, consolidation-time run). Prod state unknown.
- **Expected behaviour**: `BASE=https://citycare-z95n.vercel.app node scripts/e2e.mjs` re-run by the owner; numbers + date in README; HSTS header + timing samples captured (feeds NG-S01, NG-P06).
- **Evidence**: README "Verified" blocks; Step-1 main report §NOT VERIFIED.
- **Evidence status**: BLOCKED (owner run) — sandbox egress limitation, documented
- **Severity**: Medium · **Priority**: P1 (pilot critical)
- **Business impact**: Shipping a pilot on an unverified prod is how A76-class incidents repeat.
- **Patient safety impact**: Indirect.
- **Security/privacy impact**: The A76 guard (`/patient` render check) now exists in the suite — the prod run exercises it.
- **Technical impact**: None.
- **Dependencies**: owner + suite caveats (NG-G08: demo-dependent checks and rate limits on repeated prod runs).
- **Recommended solution**: Step-2 W5 — single fresh run (the suite is not idempotent against its own rate limits — one run per seed/IP-window), record numbers.
- **Required tests**: the e2e suite against the prod URL.
- **Acceptance criteria**: prod numbers (pass/skip/fail + date) committed to README; HSTS + p95 timing samples recorded.
- **External deps / approvals**: owner.
- **Complexity**: Small · **Status**: Blocked

#### NG-S01 — HSTS not declared in code
- **Category**: Security → Transport
- **Description**: `next.config.ts` sets nosniff / X-Frame-Options / CSP frame-ancestors / Referrer-Policy / Permissions-Policy — but no `Strict-Transport-Security`. Vercel adds HSTS at the platform level; the Cloudflare path (if ever deployed) would not. Probe (sandbox, 2026-11-01): header absent locally (expected; platform adds it in prod — prod value NOT VERIFIED, NG-G04).
- **Expected behaviour**: HSTS declared in build-time headers with a sensible `max-age` + `includeSubDomains`, present on every deploy path.
- **Evidence**: `next.config.ts` read; Step-1 probe output.
- **Evidence status**: VERIFIED (code + sandbox probe); prod value NOT VERIFIED
- **Severity**: Medium · **Priority**: P2
- **Business impact**: Low (platform covers prod today).
- **Patient safety impact**: None direct.
- **Security/privacy impact**: First-visit downgrade window on any host without platform HSTS.
- **Technical impact**: None.
- **Dependencies**: NG-G04 (capture the current prod value to avoid double/changed headers).
- **Recommended solution**: Add to `next.config.ts` headers after the prod curl (W6).
- **Required tests**: header probe on local + prod.
- **Acceptance criteria**: header present on all paths incl. CF preview; value consistent with the platform (no conflicts).
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-S03 — `DOCUMENT_KEY` fallback couples file encryption to the session secret
- **Category**: Security → Key management
- **Description**: When `DOCUMENT_KEY` is unset, blob encryption keys are derived via HKDF from `SESSION_SECRET` (`storage.ts key()`, read 2026-11-01). The documented breach-runbook step #1 is "rotate `SESSION_SECRET`" — doing that would make **every stored document permanently unreadable**, silently. A session-secret compromise also exposes all file bytes (coupled blast radius).
- **Current implementation / observed behaviour**: Derivation path live in code; `/api/health` reports `documentKey: "env" | "derived"` (probe showed `env` locally because the sandbox sets it). Production env var is set (deploy script prints it once) — so the fallback is latent, not active, but unguarded.
- **Expected behaviour**: `DOCUMENT_KEY` mandatory at boot (fail fast); derivation only for local dev with a loud log line; runbook updated.
- **Evidence**: `storage.ts` read; `LEGAL_COMPLIANCE.md` §4 runbook; probe.
- **Evidence status**: VERIFIED
- **Severity**: Medium · **Priority**: P2
- **Business impact**: Document loss via the documented incident response.
- **Patient safety impact**: Records (lab PDFs, prescriptions) unreadable after a rotation.
- **Security/privacy impact**: Key-coupling widens the blast radius of a single secret.
- **Technical impact**: Env-schema change + one log line; the health endpoint already distinguishes the modes.
- **Dependencies**: none.
- **Recommended solution**: W6 — env schema `min(1)` for `DOCUMENT_KEY` (prod), local-derivation loud warning, runbook step #1 corrected (rotate DB password + re-issue, files survive).
- **Required tests**: boot fails fast without the key; local derivation logs the warning; existing file round-trip tests green.
- **Acceptance criteria**: boot-without-key test fails the build/run loudly; runbook text updated in-repo.
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-S05 — `liveConsent` "newest row wins" is a latent invariant, not an enforced rule
- **Category**: Security → Consent semantics
- **Description**: `liveConsent()` reads `… WHERE patient+doctor ORDER BY requestedAt DESC LIMIT 1` and evaluates **that row**. Today all three consent writers avoid creating a shadowing row (booking checks for an active pair first; grant upgrades the pending row or 409s when a live consent exists; emergency expires pending rows in-tx — all three verified by code read 2026-11-01). But the *read* silently assumes the invariant: any future writer that forgets would flip doctor access (a newer pending row would shadow a still-valid approval → 403 where access should exist; or vice-versa).
- **Current implementation / observed behaviour**: Works correctly today (e2e consent checks green, 241/241). The risk is structural: the invariant lives in writer discipline, not in the read or the schema.
- **Expected behaviour**: The read implements the semantics explicitly (e.g. prefer latest APPROVED-unexpired; else latest row for status messaging), so writer mistakes cannot change access.
- **Evidence**: `consent.ts` + `repo.ts liveConsentFor` (1-line alias) + the three writer routes, read 2026-11-01.
- **Evidence status**: VERIFIED (code); no live misbehaviour observed
- **Severity**: Medium · **Priority**: P2
- **Business impact**: Trust product — a consent-semantics bug is a headline incident.
- **Patient safety impact**: Wrong-deny is benign; wrong-grant (if the preference were inverted) is serious — hence fixing the read, not just adding a test.
- **Security/privacy impact**: Consent correctness is the core DPDP control.
- **Technical impact**: One query + semantics tests.
- **Dependencies**: none.
- **Recommended solution**: W6 — explicit preference query + unit tests for the row-set matrix (live+pending, pending-only, live-only, none, expired variants) + e2e "pending request coexists with live consent → access stays up".
- **Required tests**: unit matrix (8+ row-set cases); e2e coexistence case; existing 241-suite stays green.
- **Acceptance criteria**: a deliberately-wrong new writer (test fixture) cannot change the verdict.
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-S04 — Some ledger writes are fail-open (`.catch(() => null)`)
- **Category**: Security → Audit integrity
- **Description**: Document-link issuance logs `DOWNLOAD_DOC` with `.catch(() => null)` (`documents/[id]/link/route.ts`, read 2026-11-01) — a ledger failure is swallowed and the download proceeds unlogged. The chain stays valid (no fake rows), but transparency can silently miss an entry — the patient's "who saw what" could under-report.
- **Current implementation / observed behaviour**: Verified in code; no observed failures (would need a ledger error to trigger).
- **Expected behaviour**: Ledger-critical events (VIEW, DOWNLOAD, EMERGENCY, ERASE) fail the request or queue-and-retry; only best-effort events may be swallowed (and are then logged to the app log).
- **Evidence**: code read.
- **Evidence status**: VERIFIED (pattern present)
- **Severity**: Low · **Priority**: P3
- **Business impact**: Erosion of the transparency promise in edge cases.
- **Patient safety impact**: None direct.
- **Security/privacy impact**: Under-reported access in the patient's view.
- **Technical impact**: Distinguish critical vs best-effort events in `appendAudit` callers.
- **Dependencies**: none.
- **Recommended solution**: W6 (or a small standalone pass) — fail-on-error for critical events; forced-failure test.
- **Required tests**: simulate a ledger write failure (test DB trigger or fault injection) → critical path returns 5xx, best-effort path logs + continues.
- **Acceptance criteria**: no critical event is emitted with a swallowed ledger failure (code review + test).
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-S06 — Consent-pair index conflict mislabelled as `slot_full`
- **Category**: Security → Error semantics (booking flow)
- **Description**: In `POST /api/patient/appointments`, any `23505` (including `one_active_consent_per_pair` from a rare consent race) maps to the "slot_full — pick another slot" message. The transaction rolls back atomically (no corruption); only the message misleads.
- **Current implementation / observed behaviour**: Verified in the catch block (read 2026-11-01); the race window is tiny (two concurrent bookings creating consents for the same pair).
- **Expected behaviour**: Distinct code/message per constraint (token_race, slot_full, consent_racing).
- **Evidence**: code read.
- **Evidence status**: VERIFIED
- **Severity**: Low · **Priority**: P3
- **Business impact**: Confused retry in a rare race.
- **Patient safety impact**: None.
- **Security/privacy impact**: None.
- **Technical impact**: One mapping branch.
- **Dependencies**: none.
- **Recommended solution**: W6 — map by `constraint` name.
- **Required tests**: race e2e (or a direct 23505 with the consent constraint) returns the distinct code.
- **Acceptance criteria**: each of the three constraints yields its own code (unit-level mock or e2e).
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-S08 — Single `CRON_SECRET`, no granularity or rotation path
- **Category**: Security → Secrets hygiene
- **Description**: One bearer secret guards the daily cron (probe 2026-11-01: `GET /api/cron/daily` → 401 `cron secret mismatch`; 503 if unset). No per-job secrets, no documented rotation. Leak impact is bounded (the job only touches 7-day self-registered demo accounts, budgeted 20 s, `LIMIT 200`) but repeated triggering is a nuisance-DoS vector.
- **Current implementation / observed behaviour**: Verified by probe + code read.
- **Expected behaviour**: Per-job or IP-allow-listed secrets; rotation documented (Vercel env change = instant, no redeploy).
- **Evidence**: probe; `cron/daily/route.ts` read.
- **Evidence status**: VERIFIED
- **Severity**: Low · **Priority**: P3
- **Business impact**: Bounded.
- **Patient safety impact**: None (sweep scope is self-registered accounts — see NG-S15 for the real risk).
- **Security/privacy impact**: Bounded DoS.
- **Technical impact**: Config.
- **Dependencies**: none.
- **Recommended solution**: W6 note — document rotation; consider IP allow-list (Vercel cron IPs) if the Hobby plan allows headers.
- **Required tests**: rotated secret → 401 with old, 200 with new.
- **Acceptance criteria**: rotation procedure in DEPLOY doc + tested.
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-S02 — `requestIsHttps` trusts the first hop of `x-forwarded-proto`
- **Category**: Security → Header trust
- **Description**: Cookie attributes (Secure/SameSite/Partitioned) derive from `requestIsHttps`, which trusts the first `X-Forwarded-Proto` hop before the URL scheme. Correct behind Vercel/Cloudflare (the only front doors). If the app were ever exposed without a proxy, a spoofed header could flip cookie attributes — worst realistic outcome is `Secure` set over plain HTTP → the browser drops the cookie → self-inflicted login friction, **not** privilege escalation (no path found to gain access).
- **Current implementation / observed behaviour**: Verified in `auth.ts` (read); no escalation path found in this audit.
- **Expected behaviour**: Document the trust assumption; optionally allow-list the proxy.
- **Evidence**: code read; Step-1 security doc.
- **Evidence status**: VERIFIED (behaviour); risk LOW
- **Severity**: Low · **Priority**: P3
- **Business impact**: Negligible.
- **Patient safety impact**: None.
- **Security/privacy impact**: Self-inflicted availability at worst.
- **Technical impact**: A comment + optional flag.
- **Dependencies**: none.
- **Recommended solution**: W6 — document in `auth.ts` header comment + security doc.
- **Required tests**: unit tests for the four header combos (present/absent × https/http first hop).
- **Acceptance criteria**: behaviour pinned by tests; assumption documented.
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-S07 — `/api/health` is public and reveals platform details (INFO)
- **Category**: Security → Information disclosure
- **Description**: The public health endpoint reports Postgres version (`18.6` in sandbox), session timezone, statement timeout, ledger break count, and key-source mode. Deliberate by design (uptime monitors; secret-free — A44). Probe 2026-11-01 confirms the exact fields.
- **Current implementation / observed behaviour**: As designed; no secret in the payload (verified by probe output).
- **Expected behaviour**: Keep; strip the version string only if a scanner ever flags it.
- **Evidence**: probe 2026-11-01.
- **Evidence status**: VERIFIED
- **Severity**: Informational · **Priority**: INFO
- **Business impact**: None. **Patient safety impact**: None. **Security/privacy impact**: Minor fingerprinting (standard for health endpoints). **Technical impact**: None.
- **Dependencies**: none. **Recommended solution**: no action; note in the runbook. **Required tests**: none. **Acceptance criteria**: n/a. **Complexity**: — · **Status**: Open (observation)

#### NG-S12 — `SESSION_SECRET` validated for length, not entropy (INFO)
- **Category**: Security → Secrets hygiene
- **Description**: `env.ts` requires ≥32 chars (Zod `min(32)`). A hand-typed low-entropy 32-char secret passes. The deploy script generates cryptographically random values, so the production value is strong (process, not code, is the guard).
- **Current implementation / observed behaviour**: Verified in `env.ts` (read).
- **Expected behaviour**: Length check (kept) + entropy/charset hint in the deploy-script docs.
- **Evidence**: code read.
- **Evidence status**: VERIFIED
- **Severity**: Informational · **Priority**: INFO
- **Business impact**: Low. **Patient safety impact**: None. **Security/privacy impact**: Weak-secret risk only if a human hand-types a secret. **Technical impact**: None.
- **Dependencies**: none. **Recommended solution**: one-line hint in `vercel-deploy.sh` comment + DEPLOY doc. **Required tests**: none. **Acceptance criteria**: doc note present. **Complexity**: — · **Status**: Open (observation)

#### NG-S16 — Session JWTs are signed, not encrypted (INFO — design decision)
- **Category**: Security → Token design
- **Description**: The cookie carries an HS256-signed JWT whose payload contains `role`, `profileId`, `sid`, optional `actingFor` — no sensitive data. The real gate is the per-request DB join on `sid` (`getViewer`), so the payload's visibility is not a finding; recorded so a future reviewer doesn't "fix" it into a problem or assume the payload is sensitive.
- **Current implementation / observed behaviour**: Verified in `auth.ts` + probe (login Set-Cookie payload decoded during the audit; no secrets in it).
- **Expected behaviour**: Keep; documented decision.
- **Evidence**: code read + probe.
- **Evidence status**: VERIFIED
- **Severity**: Informational · **Priority**: INFO
- **Business impact**: None. **Patient safety impact**: None. **Security/privacy impact**: None found. **Technical impact**: None.
- **Dependencies**: none. **Recommended solution**: none. **Required tests**: none. **Acceptance criteria**: n/a. **Complexity**: — · **Status**: Open (observation)

#### NG-G07 — No rotation procedure for `DOCUMENT_KEY` / `ANCHOR_SIGNING_KEY`
- **Category**: Security → Key operations
- **Description**: `DOCUMENT_KEY` is a single key with a `keyVersion` column present but unused; losing it loses every file (D54). `ANCHOR_SIGNING_KEY` (Ed25519) signs ledger heads; its public half is published at `/legal/transparency`. Neither has a rotation/re-wrap procedure. (Compounding: see NG-S03 — the fallback derivation makes an accidental rotation catastrophic.)
- **Current implementation / observed behaviour**: Verified: `keyVersion` column in schema (0004 migration), no rotation job in any script (directory read).
- **Expected behaviour**: A documented rotation runbook (new key → re-wrap job using `keyVersion` → verify a sample decrypts → swap); anchor-key rotation = publish new public key, keep old for verifying historical anchors.
- **Evidence**: D54; schema read; script inventory.
- **Evidence status**: VERIFIED
- **Severity**: Low · **Priority**: P2
- **Business impact**: Incapable of responding to a key-compromise incident.
- **Patient safety impact**: None direct.
- **Security/privacy impact**: Key-compromise response is manual ad-hoc.
- **Technical impact**: One backfill job + versioned read path.
- **Dependencies**: object storage (NG-D05) makes re-wrap cheaper; can also be done on bytea (slower).
- **Recommended solution**: W12 (object storage) includes the re-wrap path; anchor-key rotation note in the transparency page docs.
- **Required tests**: two-key round-trip test (write under v1, re-wrap to v2, read back); anchor verification across two keys.
- **Acceptance criteria**: rotation drill executed on the sandbox DB with output committed.
- **External deps / approvals**: none.
- **Complexity**: Medium · **Status**: Open

---

## B. Database & Architecture (6 findings)

#### NG-D03 — No organisation/clinic model; HOSPITAL_ADMIN unreachable (P1)
- **Category**: Data architecture → Multi-tenancy
- **Description**: No org/clinic entity, no staff-role model, no shared patient panel. A `HospitalAdmin` role exists in code but is **unreachable** (no way to create or assume it — verified). A single-doctor doctor can be onboarded today; a clinic (3 doctors, shared panel, reception) cannot.
- **Current implementation / observed behaviour**: Zero `org_id` in the 35-table schema (introspection, 2026-11-01); `roles.ts` role list includes the unreachable admin; F11's doctor→patient panel is strictly per-doctor.
- **Expected behaviour**: Org entity + doctor membership + staff roles (reception/doctor/admin) + clinic-level panel and consent policy.
- **Evidence**: DATABASE_AUDIT §6 (Q1–Q5 "none"); schema + `roles.ts` read.
- **Evidence status**: VERIFIED
- **Severity**: Medium · **Priority**: P1 (pilot critical — the pilot is clinic-mode)
- **Business impact**: The pilot's actual use case (clinics) is not representable.
- **Patient safety impact**: Consent/sharing boundaries at clinic level are exactly the "purpose specification" the product sells; retrofitting tenancy after real data exists is the expensive path.
- **Security/privacy impact**: Data boundaries (per-clinic) must be drawn before real data; a tenancy leak test is part of the fix.
- **Technical impact**: Migration + query-layer changes on ~12 queries (consent, appointments, panel, transparency); medium–large.
- **Dependencies**: pilot decision (done: clinics).
- **Recommended solution**: Step-2 W15 — `orgs` + memberships + staff roles (making `HospitalAdmin` reachable or deleting it), `org_id` on patients/encounters/consents, clinic admin views. Sequenced late-P1 so the core is proven first.
- **Required tests**: e2e clinic flow (reception books; two doctors see the panel; a different clinic's doctor is 403); cross-tenant leak test.
- **Acceptance criteria**: two clinics on one DB cannot read each other's data (test); a clinic panel view exists and is e2e-tested; every role in `roles.ts` is reachable or removed.
- **External deps / approvals**: none.
- **Complexity**: Medium–Large · **Status**: Open

#### NG-D05 — Files on Postgres `bytea`; 0.5 GB Neon Free ≈ 15 full-quota patients (P1)
- **Category**: Data architecture → Storage
- **Description**: Uploaded documents are AES-256-GCM ciphertext in `documents.data` (bytea, D53). At ~10 MB/patient the DB quota holds roughly **15 patients** with a full attachment set — and when a Neon table is full, **all** queries fail (total outage, not just uploads).
- **Current implementation / observed behaviour**: 50 MB single-file cap + 20 total-file cap per patient (`storage.ts`, read 2026-11-01); no separate storage exists (D4 closed *storage*, D53 left the ceiling).
- **Expected behaviour**: Objects in S3/B2/R2 (same crypto + signed-link flow); `documents` keeps metadata only.
- **Evidence**: DATABASE_AUDIT §6; code read; D53.
- **Evidence status**: VERIFIED
- **Severity**: High (capacity) · **Priority**: P1 (pilot critical)
- **Business impact**: A 15-patient pilot with attachments hits a wall; total-DB failure is the worst failure mode.
- **Patient safety impact**: Records unreadable at the worst time (clinic in session) if the DB is full.
- **Security/privacy impact**: The object store is a new processor (the notice's processor list already anticipates additions); encryption stays app-side.
- **Technical impact**: Migration job (re-wrap into S3 using the existing `keyVersion` column — also closes NG-G07), bytea fallback flag for local dev.
- **Dependencies**: owner's object-storage account (B2/R2 free tiers).
- **Recommended solution**: Step-2 W12 — S3-compatible store, re-wrap path, quota e2e.
- **Required tests**: upload/download round-trip against the real store (e2e, small file); orphan GC job test; query-verify 0 document bytes in Postgres afterwards.
- **Acceptance criteria**: 0 document bytes in Postgres on the pilot env; round-trip green; DR story = small DB dump + object-store versioning.
- **External deps / approvals**: owner account.
- **Complexity**: Medium · **Status**: Open

#### NG-D01 — Dead tables in the live schema (P2)
- **Category**: Database → Schema hygiene
- **Description**: `JobQueue`, `Otp`, `AiExtraction`, `AiSummary` have **no writers** in code; `HospitalAdmin`'s table is unreachable (verified by grep, 2026-11-01). Dilutes the schema story in any review and costs index/maintenance surface.
- **Current implementation / observed behaviour**: Tables created by the base SQL, untouched by any route or job.
- **Expected behaviour**: Every table either wired to a named feature or explicitly marked "reserved" with its owning feature — or dropped.
- **Evidence**: grep (no write path); DATABASE_AUDIT dead-table sweep.
- **Evidence status**: VERIFIED
- **Severity**: Medium (audit perception) · **Priority**: P2
- **Business impact**: An examiner/auditor reading the schema sees zombie infrastructure.
- **Patient safety impact**: None. **Security/privacy impact**: `Otp`/`AiExtraction` were intended for flows that don't run — dead attack-surface claims to keep honest. **Technical impact**: README status column (cheap) or drops (with the owning feature).
- **Dependencies**: F11 (client-side OCR would use the `AiExtraction`-style pipeline, client-side — table may stay reserved or go), NG-D03 (decides `HospitalAdmin`'s fate).
- **Recommended solution**: W0 hygiene — schema README "table status" column (wired/reserved(owner)/decommission); drop what nothing will own.
- **Required tests**: bootstrap still green after any drop; the status column matches a grep (check committed).
- **Acceptance criteria**: schema README lists every table with status; no unexplained table remains.
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-D04 — Connection budget: pool(10)×instances vs Neon ~100 direct conns; pooler untested (P2)
- **Category**: Database → Connections
- **Description**: The app opens a per-worker `Pool` (max 10, D18) — fine on one box, but Vercel function instances × 10 can approach Neon Free's ~100 direct-connection ceiling under burst; the `-pooler` (pgbouncer) URL path exists in the deploy docs but has **never been tested end-to-end** (D32).
- **Current implementation / observed behaviour**: `db.ts` pool config (read 2026-11-01); pooler URL documented, unused in e2e.
- **Expected behaviour**: A validated connection path (pooler or paid Neon) proven by a burst test.
- **Evidence**: `db.ts`; D18/D32.
- **Evidence status**: VERIFIED
- **Severity**: Medium · **Priority**: P2
- **Business impact**: Burst 5xx (booking races) at pilot scale.
- **Patient safety impact**: None direct (availability during sessions).
- **Security/privacy impact**: None. **Technical impact**: URL validation + one load test.
- **Dependencies**: NG-P03 (the harness that proves it).
- **Recommended solution**: W14 — validate the `-pooler` URL end-to-end (or pay for Neon; the W11 hosting decision settles it); run the burst test against it.
- **Required tests**: NG-P03 load test (50 concurrent bookings) against the pooler URL — no connection-exhaustion 5xx.
- **Acceptance criteria**: green burst run on the chosen path; the path documented in DEPLOY.
- **External deps / approvals**: owner (if paid Neon).
- **Complexity**: Small–Medium · **Status**: Open

#### NG-D06 — Ledger unbounded; no archival plan (P3)
- **Category**: Database → Growth
- **Description**: `ledger_log` is append-only and unbounded (by design — it is the trust asset). At pilot scale this is irrelevant; at multi-year scale it needs a defined lifecycle: verify → cold-store → truncate-with-head-proof. No plan exists.
- **Current implementation / observed behaviour**: Table grows with every event; daily verify re-scans it (cost is fine at current size — see Appendix 6 observation on verify scaling).
- **Evidence**: `ledger.sql`; DATABASE_AUDIT growth section.
- **Evidence status**: VERIFIED
- **Severity**: Low · **Priority**: P3
- **Business impact**: Long-tail cost. **Patient safety impact**: None. **Security/privacy impact**: Archival must preserve head-proof (a truncated ledger still verifies to its oldest retained head) — the design constraint, recorded here. **Technical impact**: Runbook + one job, later.
- **Dependencies**: scale evidence (W14); object storage (NG-D05) as the cold store.
- **Recommended solution**: Post-validation — archival runbook (verify snapshot → export cold → truncate retaining head anchor) + test.
- **Required tests**: archival test: truncation still passes `ledger_verify()` against the retained head.
- **Acceptance criteria**: runbook executed once on the sandbox DB with committed output (only when triggered by scale).
- **External deps / approvals**: none.
- **Complexity**: Small–Medium · **Status**: Open (watch)

#### NG-D02 — `prisma/schema.prisma` duplicates the SQL DDL (tool-only, drift risk) (P3)
- **Category**: Database → Source of truth
- **Description**: The runtime uses raw `pg` + SQL (deliberate, documented deviation — no Prisma at runtime), but `schema/schema.prisma` is kept as a tooling convenience and **duplicates** the DDL. Nothing checks the two agree (silent-drift risk — the A76 prod-500 class of bug, one layer down).
- **Current implementation / observed behaviour**: Prisma is validate-only; `prisma migrate diff` is not in CI.
- **Expected behaviour**: One source of truth: either a CI drift check or the prisma file deleted.
- **Evidence**: `schema/` read; D1.
- **Evidence status**: VERIFIED
- **Severity**: Low · **Priority**: P3
- **Business impact**: Drift between the two models misleads reviewers.
- **Patient safety impact**: None. **Security/privacy impact**: None. **Technical impact**: One CI step or one deletion.
- **Dependencies**: NG-S11 (CI must be on for the check to matter).
- **Recommended solution**: W4 (with CI) — add `prisma migrate diff` check, or delete the file and document SQL as the single source.
- **Required tests**: the drift check passes on `main`; an intentional drift fails it.
- **Acceptance criteria**: check in ci.yml (or file gone) + a failing-drift demo committed.
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

---

## C. Healthcare & Clinical Safety (10 findings)

#### NG-C06 — Clinical rule engine has never had clinical review (P0)
- **Category**: Clinical → Governance
- **Description**: **The rule set is student-curated and has never had clinical review.** Until reviewed, the engine is a decision-support aid with a disclaimer — not a safety net. All rules in `rules.ts` (allergy conflicts, lab-value flags, follow-up due) and the mirrored `ai_layer` pack were written by the team, signed off by no registered medical practitioner.
- **Current implementation / observed behaviour**: The engine is deterministic (same record in, same alerts out — no LLM on this path) and every alert is disclaimed ("verify before dispensing", "not a diagnosis"). The disclaimer is honest today; the *diligence* story is missing.
- **Expected behaviour**: ≥ 2 practising physicians review all rules + severity mapping + disclaimer wording; sign-off artefact in the repo; review date published on the med view.
- **Evidence**: `rules.ts` read; no review artefact exists in the repo (verified).
- **Evidence status**: VERIFIED (the absence); sign-off itself BLOCKED on the owner arranging the physicians
- **Severity**: **High (for real use)** · **Priority**: P0 (before any real patient data)
- **Business impact**: A clinician-facing pilot with an unreviewed safety panel is a credibility gap; the sign-off letter is also a marketing asset.
- **Patient safety impact**: The pack's errors (if any) are mitigated by the disclaimer today; the review is what makes that mitigation *credible* for real patients.
- **Security/privacy impact**: None. **Technical impact**: Review may change rule rows (migration) — hence early (W2), before the W10 expansion builds on top.
- **Dependencies**: owner arrangement of 2+ practising physicians (1 GP + 1 specialist ideal).
- **Recommended solution**: Step-2 W2 — review pack (every live rule row) → written sign-off (name, registration no., date) stored in `web/docs/clinical/`; `reviewedAt` surfaced in the UI.
- **Required tests**: none (human artefact) — but the sign-off doc's row list must match the DB (grep-check committed); both test suites (vitest + ai_layer unittest) re-run after any rule change (the mirror rule in `rules.ts` header).
- **Acceptance criteria**: signed review doc in-repo covering **every** live rule row; `reviewedAt` visible on the med view; a 6-month re-review cadence documented.
- **External deps / approvals**: 2+ physicians (owner).
- **Complexity**: Small (repo work) + external time · **Status**: Open

#### NG-C01 — No drug–drug interaction rule exists (P2)
- **Category**: Clinical → Rule coverage
- **Description**: **`DRUG_DRUG_INTERACTION` is declared in the alert-type union (`rules.ts` L14) but never emitted by any rule**; `NSAID_CLASS` (L39) is declared and **never used** (dead code — verified grep, no import outside `rules.ts`). A whole class of missed conflicts (e.g. warfarin + NSAID) produces no alert.
- **Current implementation / observed behaviour**: Only `DRUG_ALLERGY_CONFLICT`, `ABNORMAL_LAB_VALUE`, `CHRONIC_FOLLOWUP_DUE` fire today. The seeded interaction *data* (warfarin pairs) exists in the DB but no code path reads it into alerts.
- **Expected behaviour**: DDI rules from curated pairs, **clinically reviewed** (with NG-F11/NG-C06), emitting `DRUG_DRUG_INTERACTION` alerts.
- **Evidence**: grep `rules.ts` L14, L39; seed data read; D11.
- **Evidence status**: VERIFIED
- **Severity**: Medium · **Priority**: P2
- **Business impact**: The safety panel's headline capability is half-empty — it undermines the trust positioning.
- **Patient safety impact**: Under-flagging of real interaction pairs (mitigated by the "verify with your doctor" disclaimer, which is exactly what clinical review should confirm).
- **Security/privacy impact**: None. **Technical impact**: ~50 lines + tests; the data, event type, and UI slot all exist.
- **Dependencies**: NG-F11 (reviewed rule pack), NG-C06 (sign-off).
- **Recommended solution**: Step-2 W10 — wire DDI rules from the curated pair tables (mirror in `ai_layer/rules.py`, both suites green).
- **Required tests**: unit tests for each seeded pair (positive) + non-interacting negatives; e2e: warfarin med → DDI alert visible with pair IDs.
- **Acceptance criteria**: every seeded DDI pair emits an alert (e2e); the FEATURES.md description matches the code (the stale "2 classes" line is fixed).
- **External deps / approvals**: clinical sign-off (NG-C06 flow).
- **Complexity**: Small · **Status**: Open

#### NG-C02 — Allergy matching = substring on free text; no cross-class modelling (P2)
- **Category**: Clinical → Rule precision
- **Description**: `checkDrugAllergyConflicts` matches allergen text as a substring of the med name (`rules.ts`), with a special case that expands `penicillin` over `PENICILLIN_CLASS` (the one wired class). Free-text substrings give **false positives** (e.g. allergen "aspirin" matching "aspirated-note" style text) and the model has **no cross-class reactivity** beyond penicillin (e.g. β-lactam cross-reactivity: a penicillin allergy should also flag certain cephalosporins — it does not).
- **Current implementation / observed behaviour**: Verified in code (the `allergen === "penicillin"` branch, L59); e2e covers the positive case only.
- **Expected behaviour**: A controlled allergy vocabulary (canonical allergen IDs, not free text) + class-based matching (clinically reviewed pack).
- **Evidence**: `rules.ts` read; D11.
- **Evidence status**: VERIFIED
- **Severity**: Medium · **Priority**: P2
- **Business impact**: FPs erode doctor trust in every other alert; FNs miss real conflicts.
- **Patient safety impact**: Both directions matter on a safety panel; the penicillin special case shows the intended shape.
- **Security/privacy impact**: None. **Technical impact**: Vocabulary migration (canonical allergen enum with free-text fallback parse) + class tables.
- **Dependencies**: NG-C06 (the cross-class table is a clinical decision).
- **Recommended solution**: Step-2 W10 (with C01) — controlled vocabulary + class-based matching + FP/FN matrix.
- **Required tests**: FP/FN test matrix (substring traps, cross-class pairs, negation "no penicillin allergy"); e2e unchanged positives.
- **Acceptance criteria**: matrix green; no live free-text substring path remains for the canonical allergens.
- **External deps / approvals**: clinical sign-off.
- **Complexity**: Medium · **Status**: Open

#### NG-C04 — No retroactive alerts when the profile changes later (P2)
- **Category**: Clinical → Alert lifecycle
- **Description**: Rules run **at write time only** (the encounter/med route). Adding a new allergy today does **not** re-flag a patient's existing active medications; the conflict surfaces only at the next encounter write. A silent window where the record shows both facts but no alert.
- **Current implementation / observed behaviour**: Verified (encounter route — rule invocation only there); no re-evaluation job or mutation hook.
- **Expected behaviour**: Re-run the rule engine on profile/medication mutation → new `Alert` rows (ledgered).
- **Evidence**: encounter route read; D60 note.
- **Evidence status**: VERIFIED
- **Severity**: Medium · **Priority**: P2
- **Business impact**: The "safety net" story has a time gap a reviewer will find.
- **Patient safety impact**: A newly-recorded allergy conflicts with a currently-active med, but nothing says so until the next write — a real (if bounded) miss window.
- **Security/privacy impact**: None. **Technical impact**: A mutation hook (small) + the engine is already a pure function of the record (easy to re-run).
- **Dependencies**: none.
- **Recommended solution**: W10 — re-evaluation on allergy/med mutation (and a nightly sweep for parity), alerts ledgered as `ALERT_RAISED`.
- **Required tests**: e2e: add allergy → alert appears without a new encounter; nightly-sweep test; alert count assertions.
- **Acceptance criteria**: profile mutation produces alerts in the same request (e2e); no un-alerted conflict pair remains in a seeded fixture.
- **External deps / approvals**: none.
- **Complexity**: Small–Medium · **Status**: Open

#### NG-C05 — No ICD-10 coding (diagnoses free text) (P2)
- **Category**: Clinical → Interoperability
- **Description**: Diagnoses are free-text labels on encounters; no ICD-10 code field, no coded entity. This limits FHIR export usefulness (LG-06 portability is "partial, honest") and any ABDM HFR mapping.
- **Current implementation / observed behaviour**: `Encounter.diagnosisText` free text; `fhir.ts` exports the text, no codes (verified).
- **Expected behaviour**: ICD-10 code on diagnoses (code + text), searchable pick-list from the WHO public list.
- **Evidence**: `Encounter` schema; `fhir.ts` read.
- **Evidence status**: VERIFIED
- **Severity**: Medium · **Priority**: P2
- **Business impact**: Interop credibility; ABDM mapping later (NG-F05's API phase needs codes).
- **Patient safety impact**: Record fidelity for other clinicians (coded data is the lingua franca).
- **Security/privacy impact**: None (codes are less PII-dense than free text — a minor plus). **Technical impact**: Migration (code field, backward-compatible) + pick-list UI + export format.
- **Dependencies**: none (pair with the W10 clinical pass).
- **Recommended solution**: W10 — `icd10` field + searchable list + FHIR bundle carries codes.
- **Required tests**: coded diagnosis stores + exports with the code; old text-only rows readable (compat); FHIR validation.
- **Acceptance criteria**: a diagnosis carries code+text; the FHIR bundle includes the code (test).
- **External deps / approvals**: none.
- **Complexity**: Medium · **Status**: Open

#### NG-C03 — Lab reference ranges static per row; no age/sex-specific bands (P3)
- **Category**: Clinical → Reference data
- **Description**: `ABNORMAL_LAB_VALUE` compares against per-row `refRangeLow/High` (free text, entered at write time). No age/sex-specific band tables — a 70-year-old's creatinine gets the adult band.
- **Current implementation / observed behaviour**: Verified (`rules.ts` lab check; `LabResult` schema).
- **Expected behaviour**: Curated age/sex band tables (per test), used when the row has no explicit range.
- **Evidence**: `rules.ts`; `LabResult` schema.
- **Evidence status**: VERIFIED
- **Severity**: Low · **Priority**: P3
- **Business impact**: Clinical precision at the edges.
- **Patient safety impact**: Mild misflagging at population extremes (the alert says "abnormal — verify", not "you have X").
- **Security/privacy impact**: None. **Technical impact**: Band tables (curated, cited) + a lookup fallback.
- **Dependencies**: clinical sign-off for the band values.
- **Recommended solution**: Post-W10 (the pack is deliberately small: top labs for a GP panel) — or deferred until pilot clinics ask.
- **Required tests**: band e2e (child/adult/elder fixture per top-10 labs).
- **Acceptance criteria**: band tables in-repo with cited source; e2e flags correctly per age/sex.
- **External deps / approvals**: clinical sign-off.
- **Complexity**: Small · **Status**: Open (deferred)

#### NG-D07 — No clinician-authored observations (P2)
- **Category**: Clinical → Data model
- **Description**: The `Observation` table is wired (F5 closed the dead-table half, D60) but **encounter vitals are not stored as clinician-authored observations** — the record sections carry vitals as display fields, not first-class `Observation` rows with provenance. Longitudinal trends for doctor-entered vitals are incomplete.
- **Current implementation / observed behaviour**: Verified (`recordSections`; D60 note: "clinician-authored obs still missing").
- **Expected behaviour**: Doctor encounter vitals → `Observation` with `encounterId` + provenance (who recorded, from which encounter).
- **Evidence**: code read; D60.
- **Evidence status**: VERIFIED
- **Severity**: Medium · **Priority**: P2
- **Business impact**: The "longitudinal record" story is half-built on the doctor side.
- **Patient safety impact**: Trend visibility for clinicians (missed drift across visits).
- **Security/privacy impact**: Provenance strengthens the "who saw what" promise. **Technical impact**: Encounter form → observation writes (the table + triggers already exist).
- **Dependencies**: none.
- **Recommended solution**: W10 — encounter vitals write `Observation` rows (encounter-scoped, provenance field).
- **Required tests**: e2e doctor-observation appears in trends; provenance queryable.
- **Acceptance criteria**: an encounter's vitals are `Observation` rows (SQL-verified) and render in the trend view (e2e).
- **External deps / approvals**: none.
- **Complexity**: Small–Medium · **Status**: Open

#### NG-F04 — OCR is simulated (paste text → DRAFT) (P2)
- **Category**: Clinical → Document intake
- **Description**: "OCR" of prescription photos is currently paste-the-text-into-a-box → stored as a `DRAFT:` medication (D5). Draft meds correctly **never drive clinical alerts** (`isConfirmedActiveMed`), which is the safe part; the missing part is real on-device OCR so intake isn't manual transcription.
- **Current implementation / observed behaviour**: Verified (F11 route; the DRAFT pipeline + guard is e2e-covered).
- **Expected behaviour**: Client-side tesseract.js OCR → text → the existing DRAFT confirm pipeline (no server-side OCR service, no PHI to a third party).
- **Evidence**: D5; F11 route read.
- **Evidence status**: VERIFIED
- **Severity**: Medium · **Priority**: P2
- **Business impact**: Manual transcription is the #1 onboarding friction a pilot clinic will report.
- **Patient safety impact**: The DRAFT guard means OCR errors can't silently become active meds — the guard must stay e2e-pinned.
- **Security/privacy impact**: Client-side processing keeps image bytes off the server (the current behaviour is actually the privacy-clean one — preserve it).
- **Technical impact**: A client bundle addition (~200 KB wasm — see NG-P01's budget note) + one route change.
- **Dependencies**: none.
- **Recommended solution**: Step-2 F11 (the feature its own name implies) — client-side tesseract.js, same DRAFT flow, privacy note in the doc.
- **Required tests**: OCR e2e (synthetic prescription image → DRAFT med → confirm); the draft-never-alerts test stays green; bundle-size check.
- **Acceptance criteria**: a photo → confirmed med in ≤ 3 taps (e2e); DRAFT guard test green.
- **External deps / approvals**: none.
- **Complexity**: Medium · **Status**: Open

#### NG-F05 — No ABHA / ABDM integration (P1)
- **Category**: Clinical → Interoperability (India)
- **Description**: No ABHA field, no HFR/HPR endpoints. Market context (REPORTED, cited: Mission Steering Group, 10 Jul 2026 — 93.95 cr ABHA, 2.72 lakh ABDM facilities, 105 cr linked records): ABHA is the de-facto patient identifier in India and competitors (Practo Ray, Eka Care) advertise ABHA sync. D10: fields were planned, never built.
- **Current implementation / observed behaviour**: Zero `abha`/`abdm` in code (grep, 2026-11-01).
- **Expected behaviour**: Pilot-minimum: an ABHA field on the patient profile (self-attested, format-validated, "verify later" flag) + display + export. Real verification and HFR push/pull are a post-validation phase (needs ABDM credentials — NG-L19, BLOCKED).
- **Evidence**: grep; D10; INDIA_MARKET_RESEARCH §2 (cited).
- **Evidence status**: VERIFIED (absence); market context REPORTED (cited government source)
- **Severity**: Medium · **Priority**: P1 (pilot — clinics will ask on day one; the field is cheap, the API is not)
- **Business impact**: Onboarding friction + a visible "not ABDM-ready" gap vs every competitor in the ₹3 k–30 k/mo bracket.
- **Patient safety impact**: None direct (identifier only).
- **Security/privacy impact**: ABHA is a pseudonymous number (safe to store); patient-side ABDM consent-sharing is out of scope until the API decision — and the app's own consent ledger remains the consent layer (the product's differentiator).
- **Technical impact**: One field + UI + export (small); API integration (large, deferred, W16).
- **Dependencies**: none for the field; ABDM credentials (NG-L19) for verification.
- **Recommended solution**: W10 (small) — `abha` field, regex-validated, self-attested flag, in the JSON export; W16 (post-validation) — real ABDM integration if the direction confirms.
- **Required tests**: e2e field stores/displays/exports; invalid ABHA rejected (format); self-attested flag visible in the data dictionary.
- **Acceptance criteria**: pilot clinics can record an ABHA (e2e); the export carries it; the doc states self-attested-until-verified.
- **External deps / approvals**: none for the field.
- **Complexity**: Small (field) / Large (API, deferred) · **Status**: Open

#### NG-F11 — Drug-class coverage: 1 real class (penicillin); F14 expansion pending (P2)
- **Category**: Clinical → Knowledge base
- **Description**: The only class table the engine actually uses is `PENICILLIN_CLASS` (7 generics, allergy cross-matching for the "penicillin" allergen). `NSAID_CLASS` exists but is dead (NG-C01). The planned expansion (F14: more classes + reviewed pairs) is pending — and its gate is the clinical review (NG-C06).
- **Current implementation / observed behaviour**: Verified in `rules.ts` (L37–L39 class sets; only `PENICILLIN_CLASS` referenced by live logic). The comment says "In production these class tables come from RxNav" — that production path does not exist yet.
- **Expected behaviour**: RxClass-derived class tables + curated interaction pairs, **clinically reviewed**, feeding both the allergy matcher and the DDI rules (NG-C01).
- **Evidence**: `rules.ts` read; D11; FEATURES F14.
- **Evidence status**: VERIFIED
- **Severity**: Medium (safety-engine false negatives) · **Priority**: P2
- **Business impact**: Coverage is the measurable depth of the safety panel.
- **Patient safety impact**: Under-coverage = missed conflicts (mitigated by disclaimer; fixed by review + expansion).
- **Security/privacy impact**: None. **Technical impact**: Data tables + matcher changes; mirror in `ai_layer/rules.py`.
- **Dependencies**: NG-C06 (sign-off before the pack ships).
- **Recommended solution**: W10 — expansion pack (top classes for an Indian GP panel, cited sources) behind the review gate; RxNav-sourced naming documented.
- **Required tests**: reviewed rule pack + tests (every new class/pair has a unit test); both suites green.
- **Acceptance criteria**: the live class set ≥ the reviewed pack; the sign-off doc names the shipped pack version.
- **External deps / approvals**: clinical sign-off.
- **Complexity**: Medium · **Status**: Open

---

## D. Workflows (5 findings)

#### NG-F01 — Email leg (transactional) not implemented (P1)
- **Category**: Workflow → Communications
- **Description**: Every user-facing event (booking confirmation, consent request, report ready, break-glass notice) is in-app only. The e-mail scaffold exists (D56: `email.ts` renders templates) but **no provider is wired** — `RESEND_API_KEY` is an optional env var nothing sends through. A consent product without out-of-band notice has a narrow "the patient was told" story, and the breach runbook's "notify the data principal" step (DPDP r.7/r.12–13) has no delivery channel.
- **Current implementation / observed behaviour**: Verified (code read 2026-11-01: no send call anywhere; the UI honestly says "delivered in-app").
- **Expected behaviour**: A transactional provider (Resend — the documented choice) with the core 5 templates: booking confirm, consent request (deep-link), report ready, break-glass patient notice, grievance ack.
- **Evidence**: code read; D3/D56; runbook in `LEGAL_COMPLIANCE.md` §4.
- **Evidence status**: VERIFIED (absence)
- **Severity**: High (trust + legal-adjacent) · **Priority**: P1 (pilot critical)
- **Business impact**: The consent loop (the product's core) depends on the patient opening the app.
- **Patient safety impact**: Break-glass without patient notification is exactly what the law expects to be followed by notice — no channel = procedure gap.
- **Security/privacy impact**: E-mail bodies must stay minimal — "a doctor accessed your record", never the data (the template design must enforce this; a PHI-scan test guards it).
- **Technical impact**: Transport abstraction (mock in dev/test), 5 template functions, a `notification_log` table (what was told to whom, when — also the DPDP "consent record" evidence for out-of-band notice), rate-limited sends.
- **Dependencies**: owner's Resend key + verified sending domain (**externally BLOCKED until provided**; all code can proceed now on the mock transport).
- **Recommended solution**: Step-2 W7 — transport + 5 templates + `notification_log` + send-on-event wiring.
- **Required tests**: unit: every event maps to the right template (table test); e2e: consent request → notification row + captured mock mail; PHI-scan test: no diagnosis/medication string appears in any template for a seeded patient.
- **Acceptance criteria**: 5 templates live; `notification_log` queryable; PHI-scan green; the runbook's "notify" step names the channel.
- **External deps / approvals**: owner Resend key + domain.
- **Complexity**: Medium · **Status**: Open (externally blocked on credentials; code can proceed with mock)

#### NG-F02 — Grievance officer: role exists, appointment is empty (P1)
- **Category**: Workflow → Legal operations
- **Description**: The grievance desk is fully built (30-day SLA clock, queue, ledgering — D43 closed in code) but the **officer name + monitored mailbox envs are unset** (L-G1) and the public page shows a placeholder. DPDP r.9/s.13 expect a named, reachable officer; for a pilot, a complaint with no officer is a legal-ops incident.
- **Current implementation / observed behaviour**: Verified (the `legal/grievance` page renders "coming soon" for the identity; env vars absent from the deploy docs).
- **Expected behaviour**: A named officer (owner or designee), a reachable channel (e-mail — needs NG-F01), the 30-day SLA stated publicly, a submitted-grievance log.
- **Evidence**: page read; `LEGAL_COMPLIANCE.md` §3; D43.
- **Evidence status**: VERIFIED
- **Severity**: Medium · **Priority**: P1 (pilot)
- **Business impact**: Pilot trust; the officer is also the breach-notification addressee.
- **Patient safety impact**: None. **Security/privacy impact**: The grievance endpoint is the DPDP redressal mechanism — a placeholder is a non-start for real users. **Technical impact**: Officer config + page render + `grievance_log` timestamps (the queue code exists).
- **Dependencies**: owner decision (who is the officer); NG-F01 for the e-mail channel.
- **Recommended solution**: Step-2 W7 (with mail) — officer config, page render, SLA text, log.
- **Required tests**: e2e: submit grievance → log row → ack (mock mail) → status change; SLA timer unit test.
- **Acceptance criteria**: a named officer on the public page (real person, real channel); an auditable trail with timestamps for one submitted grievance.
- **External deps / approvals**: owner appointment.
- **Complexity**: Small · **Status**: Open (owner decision pending)

#### NG-F07 — No lab / organization staff roles (P3)
- **Category**: Workflow → Roles
- **Description**: No lab-technician or org-staff roles (future users of the record: whoever types the lab value, whoever manages the org). Roadmap-only; the pilot's clinics run on doctor + (later, via NG-D03) reception/admin.
- **Current implementation / observed behaviour**: Verified (grep: no such roles in `roles.ts`).
- **Expected behaviour**: Role + permission row + e2e, built **after** the org model exists (a staff role without an org is a permission orphan).
- **Evidence**: grep; Step-1 register.
- **Evidence status**: VERIFIED (absence by design)
- **Severity**: Low · **Priority**: P3 *(Step-1 rated it P2 under the 3-tier scheme; consolidated to P3 under the 5-tier scheme — it is post-pilot scope and depends on NG-D03; change recorded in Appendix 2)*
- **Business impact**: Lab-intake automation later. **Patient safety impact**: Provenance of lab values (who typed it) improves with a staff role. **Security/privacy impact**: Role = permission boundary (keep it scoped). **Technical impact**: Small (role row + route guards), but must wait on D03.
- **Dependencies**: NG-D03.
- **Recommended solution**: Post-pilot (the one-at-a-time rule) — lab role first (highest data-value), org-staff second.
- **Required tests**: role e2e (lab user writes a value → provenance shows the role).
- **Acceptance criteria**: n/a until built (the e2e above).
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open (deferred)

#### NG-F08 — Polling, not push (P3)
- **Category**: Workflow → Notifications
- **Description**: The patient inbox polls (D42). Acceptable at pilot scale (it is correct — no service workers on a non-PWA app); push is the natural upgrade and is deliberately sequenced after the PWA shell so notifications have an installable home.
- **Current implementation / observed behaviour**: Verified (polling interval in the inbox page; no push code).
- **Expected behaviour**: Web Push after NG-U05 (PWA/manifest) lands.
- **Evidence**: D42; inbox page read.
- **Evidence status**: VERIFIED (absence by design)
- **Severity**: Low · **Priority**: P3
- **Business impact**: Timeliness of consent-request pickup (mitigated today by NG-F01's e-mail leg — the push path is the second channel).
- **Patient safety impact**: None. **Security/privacy impact**: Push payloads must be opaque tokens (the notification server never carries PHI) — design constraint recorded. **Technical impact**: Service worker + notification endpoint, after the PWA.
- **Dependencies**: NG-U05.
- **Recommended solution**: Post-PWA (the plan's post-validation phase) — Web Push with opaque tokens.
- **Required tests**: push e2e (subscribe → notify → click → deep link); the opaque-token assertion.
- **Acceptance criteria**: n/a until built.
- **External deps / approvals**: none.
- **Complexity**: Small–Medium · **Status**: Open (deferred)

#### NG-F12 — Seeded demo listings carry synthetic ratings/reviews presented as real *(NEW at consolidation)* (P2)
- **Category**: Workflows → Data integrity / consumer perception
- **Description**: `scripts/seed.mjs` inserts synthetic `rating`/`totalReviews` values on hospitals and doctors (realistic invented Indian names, e.g. a seeded doctor gets a 4.x rating with triple-digit "reviews"). On the public site these render as if they were real — and **no review/rating feature exists anywhere in the app** (no UI or route can create one; verified). Unlabelled fabricated review counts for real-looking entities are a consumer-protection hygiene issue (misleading presentation) for a product whose entire brand is "honest by construction".
- **Current implementation / observed behaviour**: Verified in `seed.mjs` + the listing routes (read 2026-11-01). The site-wide "demo data" banner is adjacent context but does not label the rating fields themselves as synthetic.
- **Expected behaviour**: In demo mode, rating/review fields render with a visible "sample data" marker; in pilot mode (NG-S14's `SEED_DEMO=0`) the fields are never populated.
- **Evidence**: seed + listing code read.
- **Evidence status**: VERIFIED
- **Severity**: Low–Medium (reputational/consumer) · **Priority**: P2
- **Business impact**: A patient seeing "4.6 (128 reviews)" for a doctor with no review feature = doubt about the product's honesty — the opposite of its positioning.
- **Patient safety impact**: None. **Security/privacy impact**: Seeded names are invented, but the *pattern* is real-world-plausible; keeping them synthetic-and-labelled is the defensible posture. **Technical impact**: UI chip or seed change (small).
- **Dependencies**: pairs with NG-S14 (pilot-mode env).
- **Recommended solution**: W11 — "sample data" chip on rating/review fields in demo mode; fields never populated when `SEED_DEMO=0`.
- **Required tests**: e2e: demo listing shows the chip; pilot-mode listing has no rating data.
- **Acceptance criteria**: no unlabelled synthetic review data renders anywhere (e2e + committed screenshots).
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

---

## E. UI/UX & Accessibility (8 findings)

#### NG-U01 — Validation errors are joined strings, not field-mapped (P2)
- **Category**: UI → Forms
- **Description**: Form failures return a joined string ("`valueNum: …; takenOn: …`" — probe 2026-11-01) rendered as one block; the API already returns structured Zod issues, the UI just doesn't map them. Bad first-impression UX on phones (the primary pilot device).
- **Current implementation / observed behaviour**: Verified by probe (Step-1) and re-read of the form error paths (consolidation-time).
- **Expected behaviour**: Field-level inline errors (map the structured issues to inputs; `aria-invalid` already present).
- **Evidence**: Step-1 probe output; form code read.
- **Evidence status**: VERIFIED
- **Severity**: Medium · **Priority**: P2
- **Business impact**: Completion rate on intake/lab forms.
- **Patient safety impact**: A lab value rejected with an unclear error may be re-entered wrong (the error message should name the field and the fix).
- **Security/privacy impact**: None. **Technical impact**: ~50 lines per form family (the structured payload exists — pure UI mapping).
- **Dependencies**: none.
- **Recommended solution**: W13 (design pass) or W6 hygiene — field mapping on the 4 long forms first (intake, lab, med, encounter).
- **Required tests**: field-level e2e (each invalid field gets its own inline message); screen-reader pass (label association).
- **Acceptance criteria**: no joined-string error block remains on any form (grep + e2e).
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-U02 — No automated accessibility audit ever run (P2)
- **Category**: UI → Accessibility
- **Description**: Keyboard operability and ARIA basics were verified by hand in the Step-1 audit (6 core flows), but **no automated a11y check has ever run** — no axe/lighthouse in CI, no conformance statement. The unknown debt on clinical pages (the highest-stakes screens) is the actual finding.
- **Current implementation / observed behaviour**: Verified (no axe/Playwright-a11y/lighthouse in ci.yml or any script, read 2026-11-01).
- **Expected behaviour**: axe-core (Playwright) or Lighthouse CI on the key pages; 0 critical findings; an honest a11y statement (scope, known gaps, feedback channel — no conformance % claimed).
- **Evidence**: ci.yml + scripts inventory.
- **Evidence status**: VERIFIED (the absence); the debt itself is unknown until the audit runs
- **Severity**: Medium · **Priority**: P2
- **Business impact**: Trust/enterprise posture; clinical usability for older users.
- **Patient safety impact**: Indirect (usability of consent actions for users with impairments).
- **Security/privacy impact**: None. **Technical impact**: One CI job + fixes it surfaces.
- **Dependencies**: NG-S11 (CI must be on).
- **Recommended solution**: W4 (with CI) — axe-core on the 8 key pages; fix criticals; publish the statement.
- **Required tests**: the a11y job itself; 0 critical findings on `main`.
- **Acceptance criteria**: green a11y job on CI (link committed); statement page published with honest scope.
- **External deps / approvals**: none.
- **Complexity**: Small–Medium · **Status**: Open

#### NG-U03 — Mobile responsiveness: code present, visually unverified (P2)
- **Category**: UI → Mobile
- **Description**: The responsive CSS exists and was read (breakpoints present, grids collapse) — but there is **no browser in this sandbox**, so no viewport was ever *seen*. Breakpoint debt (clipped modals, h-scroll, mis-ordered stacks) is unknown, and the pilot's primary device is a phone.
- **Current implementation / observed behaviour**: Read-only audit (Step-1 UI doc §5): code-level pass, zero visual evidence.
- **Expected behaviour**: A visual pass at 320/375/768 with archived screenshots; no horizontal scroll at 320 on any of the 27 pages.
- **Evidence**: UI_UX_AUDIT §5 (method stated).
- **Evidence status**: PARTIALLY VERIFIED (code inspected; visual state NOT VERIFIED — no browser available here)
- **Severity**: Low (risk, not observed defect) · **Priority**: P2
- **Business impact**: Pilot friction on the primary device.
- **Patient safety impact**: The consent "why" text must be fully readable on a 320 px screen (transparency depends on it).
- **Security/privacy impact**: None direct. **Technical impact**: CSS fixes (whatever the pass finds) + screenshot CI.
- **Dependencies**: a machine with a browser (the owner's laptop suffices for a one-time pass; Playwright in CI after).
- **Recommended solution**: W13 — 320/375/768 pass on all pages, fixes, archived screenshots; then Playwright screenshots in CI (needs NG-S11).
- **Required tests**: archived before/after screenshots (committed); h-scroll assertion at 320 (Playwright, when CI is on).
- **Acceptance criteria**: archived screenshots for all 27 pages at 320 px, no h-scroll, no clipped readable text in any modal.
- **External deps / approvals**: none (a browser — owner or CI).
- **Complexity**: Small · **Status**: Open

#### NG-U06 — Two visual tiers: premium landing / utilitarian app (P2)
- **Category**: UI → Design system
- **Description**: The marketing layer (GSAP/Lenis/Motion choreography) and the app layer (dense tables, ad-hoc spacing) are visibly two products. No shared `Empty`/`Error`/`SectionHeader` components; spacing is ad-hoc per page. The brief's target is "premium platform", and the app tier currently reads "internal tool".
- **Current implementation / observed behaviour**: Verified (UI audit §2 component inventory: ~40 components, 6+ pages define display treatments inline, `globals.css` token coverage partial).
- **Expected behaviour**: Tokens v2 (spacing/type/z-index scale) + shared state components (Empty/Error/SectionHeader) + an elevation pass on the 3 densest pages (ledger, consent, panel). **Constraint from the brief: no redesign, no glass/gradient** — token/elevation pass only.
- **Evidence**: UI_UX_AUDIT §2; page reads.
- **Evidence status**: VERIFIED
- **Severity**: Medium (perception) · **Priority**: P2
- **Business impact**: The "trust platform" positioning is judged by the app tier, where most time is spent.
- **Patient safety impact**: None direct (state clarity is a mild plus: a real `Error` component stops blank-card misreads).
- **Security/privacy impact**: None. **Technical impact**: Token file + 3 components + 3 pages; e2e must stay green (no behaviour change).
- **Dependencies**: none (all tooling present).
- **Recommended solution**: Step-2 W13 — the design-elevation pass (this finding is its primary scope).
- **Required tests**: e2e unchanged (241/241 after); visual pass screenshots (with NG-U03's); grep-able assertion that display typography lives only in the token components.
- **Acceptance criteria**: token file + 3 shared state components in use on all list screens; before/after screenshots of the 3 dense pages committed.
- **External deps / approvals**: none.
- **Complexity**: Medium · **Status**: Open

#### NG-U04 — No dark mode (P3)
- **Category**: UI → Theme
- **Description**: Light theme only (F16 on the roadmap). The tokens are already CSS variables, so a `prefers-color-scheme` dark value set is mechanical — but it is a preference feature, not a trust/safety item, and the brief says no features to look advanced.
- **Current implementation / observed behaviour**: Verified (deps: no `next-themes`; grep: no `data-theme`/scheme hooks).
- **Expected behaviour**: `prefers-color-scheme` via the existing tokens, if and when the design pass (W13) leaves room.
- **Evidence**: deps + grep.
- **Evidence status**: VERIFIED (absence)
- **Severity**: Low · **Priority**: P3
- **Business impact**: Preference feature (clinic staff long hours).
- **Patient safety impact**: None. **Security/privacy impact**: None. **Technical impact**: Dark value set + per-component audit (tokenised components make this cheap; ad-hoc pages make it costly — the U06 pass reduces the cost).
- **Dependencies**: NG-U06 (tokens v2 first).
- **Recommended solution**: Post-validation (the plan lists it there); do not pre-build.
- **Required tests**: both-modes visual pass (when built).
- **Acceptance criteria**: n/a until scoped.
- **External deps / approvals**: none.
- **Complexity**: Small–Medium · **Status**: Open (deferred)

#### NG-U05 — No PWA / manifest (P3)
- **Category**: UI → Platform
- **Description**: No web-app manifest, no installability (F10). Clinic phones are the realistic device story; "add to home screen" is the cheapest install UX that exists, and it is a precondition for NG-F08 (push).
- **Current implementation / observed behaviour**: Verified (no manifest link, no icons set, no service worker).
- **Expected behaviour**: Manifest + icons + an offline shell (the app is server-rendered; the offline shell is a "you're offline" card, not cached PHI — the privacy-clean scope).
- **Evidence**: grep; FEATURES F10.
- **Evidence status**: VERIFIED (absence)
- **Severity**: Low · **Priority**: P3
- **Business impact**: Installability on clinic phones.
- **Patient safety impact**: None (offline shell deliberately shows nothing clinical).
- **Security/privacy impact**: The offline shell must not cache record data (design constraint, recorded); service worker scope = shell only.
- **Technical impact**: Manifest + icons + SW (small); the SW is the trickiest part (scope discipline).
- **Dependencies**: none.
- **Recommended solution**: Post-validation (plan phase 5) — manifest first, SW shell second, push (NG-F08) third.
- **Required tests**: install on a real Android (owner's phone) when built; SW scope test (no record URLs in the SW's fetch handler).
- **Acceptance criteria**: n/a until built.
- **External deps / approvals**: none.
- **Complexity**: Small–Medium · **Status**: Open (deferred)

#### NG-U07 — No network-error states; no `error.tsx` segment boundaries (P3)
- **Category**: UI → Error states
- **Description**: Data pages have no network-error state (a failed fetch renders a blank card), and there are no per-segment `error.tsx` boundaries (a route error takes the whole page down to the top-level boundary). On a serverless platform with cold starts and provider hiccups, "blank card" is the expected failure face today.
- **Current implementation / observed behaviour**: Verified (grep: no `error.tsx` in `src/app`; no card-level retry anywhere).
- **Expected behaviour**: Per-segment `error.tsx` (data sections) + card-level retry buttons; the killed-DB scenario shows a retry UI, not blanks.
- **Evidence**: grep; UI audit §7.
- **Evidence status**: VERIFIED
- **Severity**: Low · **Priority**: P3
- **Business impact**: Perceived fragility exactly when the platform hiccups.
- **Patient safety impact**: A blank card during a consultation is read as "no record" — a retry state removes that misread.
- **Security/privacy impact**: None. **Technical impact**: 5–6 `error.tsx` files + a `CardRetry` component (Next 16 makes the boundary API straightforward).
- **Dependencies**: none.
- **Recommended solution**: W13 tail (or W6 hygiene) — segment boundaries + retry component.
- **Required tests**: killed-DB e2e (stop the DB mid-run → pages show retry UI; restart → data returns).
- **Acceptance criteria**: no data page renders a blank card on fetch failure (killed-DB test).
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-U08 — Animation bundle hygiene: pause out-of-view GSAP loops (P3, linked to NG-P01)
- **Category**: UI → Performance (bundle/runtime)
- **Description**: The UI-side half of NG-P01 (the bundle finding, primary in section F): the landing's GSAP loops keep ticking when out of view (battery/CPU on older phones). The ask is `ScrollTrigger` visibility pause + `LazyMotion` (which is NG-P01's own first fix) — one engineering effort, two register rows, one primary (NG-P01).
- **Current implementation / observed behaviour**: Verified (UI audit §2; the hero loops have no visibility gate).
- **Expected behaviour**: Out-of-view loops paused; reduced-motion path already exists (extend it).
- **Evidence**: UI_UX_AUDIT §2.
- **Evidence status**: VERIFIED (by reference to NG-P01)
- **Severity**: Low · **Priority**: P3
- **Business impact**: Older-phone battery (the pilot's device population).
- **Patient safety impact**: None. **Security/privacy impact**: None. **Technical impact**: `ScrollTrigger` `toggleActions` (a few lines per loop).
- **Dependencies**: NG-P01 (same workstream, W13 or W6).
- **Recommended solution**: With NG-P01 — visibility pause on all hero loops.
- **Required tests**: frame-rate/visual pass; the reduced-motion no-op test stays green.
- **Acceptance criteria**: no GSAP tick when the hero is out of view (devtools-verified, screenshot committed).
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Linked to NG-P01 (one primary)

---

## F. Performance & Scalability (6 findings)

#### NG-P03 — No load/concurrency harness (P2, primary — alias NG-D08)
- **Category**: Performance → Assurance
- **Description**: **Concurrency claims rest on SQL-level and unit negative tests only** — no k6/autocannon harness, no published p95/5xx, no burst test (booking races, parallel ledger appends). The product's "100% systematic" claim needs a measured ceiling. (Step-1 also listed this as NG-D08 under Database — same root cause; one primary: NG-P03.)
- **Current implementation / observed behaviour**: Verified (repo scan: no load script; `gap_test.sql` is the concurrency evidence).
- **Expected behaviour**: A load harness (k6, dependency-free script) + a written budget (e.g. p95 < 800 ms for the 6 core API calls at 20 concurrent users — a pilot-realistic ceiling, not a marketing number) + one honest published run.
- **Evidence**: repo scan; Step-2 plan W14.
- **Evidence status**: VERIFIED (absence)
- **Severity**: Medium · **Priority**: P2
- **Business impact**: The pilot SLO can't be promised without this; it is also the input to the hosting decision (NG-L24/NG-F06 context: Hobby ceiling vs Pro vs VPS).
- **Patient safety impact**: None direct (availability during sessions).
- **Security/privacy impact**: None. **Technical impact**: One script (~100 lines) + results doc.
- **Dependencies**: none (sandbox-runnable; the Neon side via the pooler URL — NG-D04).
- **Recommended solution**: Step-2 W14 — harness + budget doc + published run (date-stamped, in-repo).
- **Required tests**: the k6 run itself: 50 concurrent bookings on one doctor-day + parallel ledger appends; p95/5xx published.
- **Acceptance criteria**: green run + published numbers in the repo; the budget quoted on the pilot plan page with its test date.
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-P02 — Cold start: Neon scale-to-zero 0.5–3 s; warmup covers 2 entry pages only (P2)
- **Category**: Performance → First-touch
- **Description**: Neon Free autosuspends (scale-to-zero; 0.5–3 s resume, D31). The deploy warmup hits only 2 entry pages — the booking flow (the deep link a consent e-mail would land on, once NG-F01 ships) is not covered.
- **Current implementation / observed behaviour**: Verified (warmup script in deploy docs; D31).
- **Expected behaviour**: Warmup on the booking page (and the consent-request landing) or paid compute with autosuspend off.
- **Evidence**: D31; deploy scripts read.
- **Evidence status**: VERIFIED (sandbox values); production timing NOT VERIFIED (folds into NG-G04's owner run)
- **Severity**: Medium · **Priority**: P2
- **Business impact**: First-touch UX for deep-linked patients (the consent e-mail flow lands here).
- **Patient safety impact**: None. **Security/privacy impact**: None. **Technical impact**: One script change or a plan decision.
- **Dependencies**: the W11 hosting decision (paid compute makes this moot); owner prod access for the timing sample.
- **Recommended solution**: W11/W14 — autosuspend off (paid) or warmup extended to the booking + consent pages.
- **Required tests**: owner-run: 5 curls after 10-min idle on the prod URL, first-response delta recorded (the NG-G04 runbook fold-in).
- **Acceptance criteria**: p95 first-touch < 1 s on the pilot paths (prod, dated, in README).
- **External deps / approvals**: owner (prod settings/access).
- **Complexity**: Small · **Status**: Open

#### NG-P01 — Landing bundle: +97 KB gzip animation libraries (P3)
- **Category**: Performance → Bundle
- **Description**: GSAP + Motion + Lenis add ~97 KB gzip on the landing page (D35, chunk listing in the perf audit). On the landing only (app pages don't load the hero layer), it is a slow-network LCP cost — accepted for the demo, recorded for the record.
- **Current implementation / observed behaviour**: Verified (chunk listing, perf audit §3).
- **Expected behaviour**: `LazyMotion` (~−20 KB) + out-of-view pause (NG-U08); consider dynamic-importing the hero layer.
- **Evidence**: D35; build chunk listing (2026-11-01 build).
- **Evidence status**: VERIFIED
- **Severity**: Low · **Priority**: P3
- **Business impact**: LCP on slow mobile networks (the pilot's population).
- **Patient safety impact**: None. **Security/privacy impact**: None. **Technical impact**: A couple of import changes; measured delta.
- **Dependencies**: none.
- **Recommended solution**: W13 (shares the design pass) — LazyMotion + pause + dynamic import if the delta justifies it.
- **Required tests**: gzip delta measured (build output before/after committed); LCP sample on a throttled profile (NG-U03's pass).
- **Acceptance criteria**: landing gzip −20 KB or better (measured), e2e green.
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-P04 — Rate limiting writes to the DB per limited request (P3)
- **Category**: Performance → Auth path
- **Description**: The rate limiter (A61, per-IP, sliding) performs a DB write per limited request (D51) — an extra auth round-trip on the hottest path. Accepted at current scale (the limiter exists to survive abuse; the cost is its price); a WAF layer is the scale answer, not a rewrite.
- **Current implementation / observed behaviour**: Verified (`ratelimit.ts` read).
- **Expected behaviour**: Keep; revisit only at scale (WAF in front).
- **Evidence**: D51; code read.
- **Evidence status**: VERIFIED
- **Severity**: Low · **Priority**: P3
- **Business impact**: Marginal latency on the hot path.
- **Patient safety impact**: None. **Security/privacy impact**: None — the limiter is a security control; the note is "don't remove it to save latency". **Technical impact**: None (recorded decision).
- **Dependencies**: none.
- **Recommended solution**: No action at pilot scale; WAF note in the scale doc.
- **Required tests**: none (behaviour is pinned by existing tests).
- **Acceptance criteria**: n/a (watch item).
- **External deps / approvals**: none.
- **Complexity**: — · **Status**: Open (accepted)

#### NG-P05 — No `next/image` — by design (INFO)
- **Category**: Performance → Images
- **Description**: There are no third-party images anywhere (copyright-clean, deliberate) — so `next/image` is unused *by design*, not by omission. If F11's OCR/photo flow (NG-F04) or doctor profile photos ever add images, `next/image` comes with them.
- **Current implementation / observed behaviour**: Verified (grep: zero `<img>` with external src; no image CDN).
- **Expected behaviour**: Adopt when images arrive; until then nothing to fix.
- **Evidence**: grep.
- **Evidence status**: VERIFIED
- **Severity**: Informational · **Priority**: INFO
- **Business impact**: None. **Patient safety impact**: None. **Security/privacy impact**: None (no external image = no referrer leak, no third-party pixel — consistent with the no-trackers rule). **Technical impact**: None.
- **Dependencies**: F11/photo features (future).
- **Recommended solution**: None; the note travels with NG-F04.
- **Required tests**: n/a. **Acceptance criteria**: n/a.
- **Complexity**: — · **Status**: Open (observation)

#### NG-P06 — Production p95 NOT VERIFIED (INFO)
- **Category**: Performance → Production observability
- **Description**: All performance numbers in the repo are sandbox (`next start` on embedded PG 18.6). Production (Vercel + Neon) latency, TTFB, p95, and cold-start are **unknown** — the sandbox has no egress to `*.vercel.app` (verified: connection fails, 2026-11-01). This is an evidence gap, not a code gap: the code path is identical.
- **Current implementation / observed behaviour**: As stated; sandbox figures are labelled sandbox in the perf audit.
- **Expected behaviour**: The NG-G04 owner run doubles as the perf capture (5-URL timing sample + Vercel Analytics export), date-stamped in README.
- **Evidence**: sandbox egress test (curl failure); perf audit §2.
- **Evidence status**: NOT VERIFIED (production) — the absence is verified; the production value is unknown by construction
- **Severity**: Informational · **Priority**: INFO
- **Business impact**: The pilot SLO can't be quoted until this exists.
- **Patient safety impact**: None. **Security/privacy impact**: None. **Technical impact**: None.
- **Dependencies**: NG-G04 (owner run).
- **Recommended solution**: W5 runbook fold-in (5-URL sample + cold-start 5 curls after idle).
- **Required tests**: the sample itself.
- **Acceptance criteria**: dated prod timings (p95 per core URL + cold-start delta) in the perf doc / README.
- **External deps / approvals**: owner.
- **Complexity**: — · **Status**: Open (blocked by NG-G04)

---

## G. Market & Commercial (3 findings)

#### NG-F03 — No Hindi / Marathi UI (P1)
- **Category**: Market → Localisation
- **Description**: The UI is English-only (D17/D58: hi/mr *key-points* exist in the legal notice only, flagged "pending legal-cell review"). The pilot market (Nagpur/Pune per the market doc) is Marathi-first; the **patient** is the localisation target (the product's differentiator is patient-controlled consent — and a consent the patient can't read is the weakest kind of consent). Clinicians can stay English; the patient surface cannot.
- **Current implementation / observed behaviour**: Verified (no i18n framework; no locale routing; `legal-i18n.ts` covers the notice key-points only — read 2026-11-01).
- **Expected behaviour**: Patient-surface first (consent request, rights, record view, grievance) in hi + mr, with the notice versioning (L2 428 machinery) extended per locale; clinician-surface second if the pilot asks.
- **Evidence**: deps + code read; INDIA_MARKET_RESEARCH §4 (localisation cited as a differentiator in the competitor bracket).
- **Evidence status**: VERIFIED (absence); market context REPORTED (cited)
- **Severity**: High (for the pilot population) · **Priority**: P1 (pilot critical)
- **Business impact**: The patient-side value proposition is inaccessible in the user's language.
- **Patient safety impact**: Indirect — informed consent quality (the DPDP "informed" element).
- **Security/privacy impact**: The consent *text* in hi/mr must be reviewed by counsel (part of the NG-L21 pack) — the legal cell sign-off the notice key-points already flag as pending.
- **Technical impact**: `next-intl` (or a dict module — the app is server-component-heavy; decision in W9) + ~400 patient-surface strings + per-locale notice versioning.
- **Dependencies**: native reviewer (owner); counsel skim of the consent text (NG-L21 pack).
- **Recommended solution**: Step-2 W9 — patient surface first, hi + mr; clinician surface deferred.
- **Required tests**: e2e consent flow in hi and mr (toggle persisted per user); 428 re-acceptance fires per locale (version bump test); no RTL/bidi handling needed (Devanagari is LTR — verified).
- **Acceptance criteria**: a patient can read, understand (native-review attested), and act on a consent request in hi or mr (e2e); the notice page lists all three languages.
- **External deps / approvals**: native reviewer; counsel (NG-L21).
- **Complexity**: Medium · **Status**: Open

#### NG-F06 — No payment model (deliberate; Razorpay KYC pending) (P2)
- **Category**: Market → Commercial
- **Description**: No payments, deliberately (plan C10): the demo is non-commercial (Vercel Hobby ToS — the hosting side is NG-L24), Razorpay KYC is not done, and the brief forbids revenue features before validation. The register records the *decision* and its gate: the pilot's commercial posture (owner) decides when this becomes a build.
- **Current implementation / observed behaviour**: Verified (no payment code; plan C10; Hobby ToS cited).
- **Expected behaviour**: If the pilot is commercial: doctor subscription design + Razorpay (KYC first) **and** the hosting move (NG-L24) as one decision. If the pilot is community/academic: this stays closed with the ToS posture documented (it already is — Terms §1).
- **Evidence**: plan C10; Vercel terms (cited); NG-L24.
- **Evidence status**: VERIFIED (absence + documented decision)
- **Severity**: Low today · **Priority**: P2 (launch gate only — "commercial launch blocker", per Step-1)
- **Business impact**: A ToS-breach-free path to revenue *or* a documented non-commercial pilot — the decision itself is the deliverable.
- **Patient safety impact**: None. **Security/privacy impact**: A processor (Razorpay) line in the notice if built. **Technical impact**: Subscription + webhooks + plan gating (medium, later).
- **Dependencies**: owner's commercial decision; NG-L24 (hosting) is the coupled half.
- **Recommended solution**: W11 (with the hosting decision) — pilot charter states the posture; build only if commercial.
- **Required tests**: n/a (decision); if built: first-payment e2e on a test account.
- **Acceptance criteria**: the pilot charter (in-repo) states the commercial posture and the matching tier; first payment in pilot only if commercial.
- **External deps / approvals**: owner; Razorpay KYC (if commercial).
- **Complexity**: — (decision) / Medium (if built) · **Status**: Open (owner decision pending)

#### NG-F13 — No customer discovery / interviews done *(NEW at consolidation)* (P2)
- **Category**: Market → Validation
- **Description**: The market research is strong *desk* work (cited government figures, competitor pricing, 12 Q&A answers) — but **zero primary research exists**: no doctor interviews, no patient interviews, no waitlist, no "would you pay" data. Per the brief's rule, this register makes **no PMF claim** — it records that demand is unverified and names the cheapest way to verify it.
- **Current implementation / observed behaviour**: Verified (repo + all audit docs: no interview notes, no survey data, no waitlist — absence confirmed by inventory).
- **Expected behaviour**: Before the pilot env is built (W11): 5–10 doctor conversations (the owner's network) + 10–20 patient conversations, with anonymised notes committed to `docs/market/` (quotes, objections, pricing sensitivity). These notes are the pilot charter's input.
- **Evidence**: audit scope (desk research only, stated in the market doc).
- **Evidence status**: REPORTED (desk-research findings, all cited in the market doc); primary evidence: does not exist (verified absence)
- **Severity**: Medium (process) · **Priority**: P2 (pre-pilot; not a code blocker)
- **Business impact**: Building a pilot env for an unverified use case is the classic expensive mistake.
- **Patient safety impact**: None. **Security/privacy impact**: Interview notes must stay PHI-free (anonymise — a design rule for the notes template).
- **Technical impact**: None.
- **Dependencies**: owner's network (time, not money).
- **Recommended solution**: A discovery sprint before W11 (the plan's phase-3 ordering has room): structured questions (would you onboard 3 doctors? what do you pay today? what would make you quit?).
- **Required tests**: none (the artefact is the notes).
- **Acceptance criteria**: ≥ 5 doctor + ≥ 10 patient conversations documented (anonymised) in-repo; the pilot charter cites them; any contradiction with the assumed pilot shape is a named decision.
- **External deps / approvals**: owner's time.
- **Complexity**: Small (process) · **Status**: Open

---

## H. Legal & Regulatory (12 findings)

_The LG-01…LG-25 matrix (`CITYCARE_LEGAL_COMPLIANCE_GAPS.md`, dated 2026-11-01) is the source.
Of its 25 rows: 7 are fully met (Appendix 5), 5 duplicate already-registered findings
(LG-02→NG-F03, LG-06→NG-C05, LG-09→NG-F02, LG-13→NG-F01, LG-22→NG-C06 — linked, not
re-counted), 1 maps to an existing security finding (LG-12 residual = NG-S09), and the 12
gap rows below are registered here as NG-Lxx. Dates verified against official sources during
Step 1 (DPDP Rules 2025 G.S.R. 846(E), notified 13 Nov 2025, three commencement phases:
13 Nov 2025 / 13 Nov 2026 / 13 May 2027; IT-SPDI Rules 2011 in force until 13 May 2027)._

#### NG-L08 — Erasure-vs-retention design needs counsel confirmation (P0)
- **Category**: Legal → DPDP erasure / statutory retention tension (LG-08)
- **Description**: The app does **real erasure** (delete + redact + blob cascade + sessions, ledger deliberately retained — D15 documented) and runs the 7-day demo sweep. The tension: DPDP erasure rights (s.12/r.8) vs the clinician's statutory record-keeping duties (NMC 3 yr / DGHS up to 10 yr, NG-L18). For synthetic demo data this is resolved by design; **for real (non-demo) data the redaction design must be confirmed by counsel** before the pilot.
- **Current implementation / observed behaviour**: Verified (erasure code + D15 documentation; the 428/re-consent machinery is live).
- **Expected behaviour**: A counsel-confirmed redaction design: what stays (clinician shells, ledger, anchors), what goes (identifiers, clinical content, blobs), and how a doctor can still discharge their retention duty from their own records (the app must never *prevent* retention).
- **Evidence**: erasure code read; D15; LG-08 matrix row.
- **Evidence status**: VERIFIED (the design and its documented tension); confirmation itself requires counsel (external)
- **Severity**: High (real data) · **Priority**: P0 (before any real patient data)
- **Business impact**: A wrong erasure posture is a DPDP grievance waiting to happen.
- **Patient safety impact**: Over-erasure destroys care-continuity data; under-erasure is a rights violation — the design has to thread both.
- **Security/privacy impact**: This is the core DPDP tension for a health app; the ledger-retention choice (≥ 1 yr post-erasure) is the defensible middle, pending counsel.
- **Technical impact**: Possibly redaction-scope changes (a migration) — hence resolved **before** the W10/W11 real-data work.
- **Dependencies**: NG-L21 (the counsel engagement is part of the pilot governance pack — they are one external engagement, one pack).
- **Recommended solution**: In the W2 pilot-governance workstream — counsel review of D15's redaction design; written confirmation stored in `web/docs/legal/`.
- **Required tests**: none (legal artefact) — but the erasure e2e suite stays green before/after any change.
- **Acceptance criteria**: counsel's written confirmation in-repo; the design doc (D15) updated to reference it; erasure e2e green.
- **External deps / approvals**: qualified Indian counsel (owner; part of NG-L21).
- **Complexity**: Small (repo) + external time · **Status**: Open

#### NG-L18 — Retention/redaction design needs counsel confirmation (P0)
- **Category**: Legal → Medical-record retention (LG-18)
- **Description**: The app **never claims a statutory retention period** (A51 fixed a false "7 years" claim; retention is policy-configurable) — correct, because the NMC 3 yr / DGHS up-to-10-yr duties attach to the **doctor/clinic**, not the app. The open legal question: does the app's redaction-on-erasure design (NG-L08) *prevent* a doctor from keeping their statutory record? (Current design: redaction removes patient content but keeps clinician shells — the intent is "no", but that intent needs counsel's confirmation.)
- **Current implementation / observed behaviour**: Verified (A51 fix; retention config in the notice; D15 shell design).
- **Expected behaviour**: Counsel confirmation that (a) the app is not the statutory record-holder, (b) the doctor can export their statutory record before erasure (the clinical summary export, NG-D07's print/CSV work, is the enabler), and (c) the app never blocks retention.
- **Evidence**: A51; D15; LG-18 row.
- **Evidence status**: VERIFIED (the design); confirmation requires counsel (external)
- **Severity**: High (real data) · **Priority**: P0 (before any real patient data)
- **Business impact**: A clinic that can't discharge its NMC duty because of the app's erasure is a liability and a churn event.
- **Patient safety impact**: Record continuity across the erasure boundary (the doctor's copy must survive intact).
- **Security/privacy impact**: The export-before-erasure flow must be ledgered (`EXPORT`) and consented.
- **Technical impact**: The export work (NG-D07) is the practical enabler; no other code expected.
- **Dependencies**: NG-L21 (same counsel engagement); NG-D07 (the export).
- **Recommended solution**: W2 pack — counsel confirmation + the "export before erasure" note in the notice.
- **Required tests**: e2e: doctor exports the clinical summary → patient requests erasure → export still downloadable from the doctor's side (shell intact), patient data gone.
- **Acceptance criteria**: counsel's written confirmation in-repo; the e2e above passes; notice states the app's non-record-holder posture.
- **External deps / approvals**: counsel (owner; NG-L21).
- **Complexity**: Small (repo) + external time · **Status**: Open

#### NG-L21 — Pilot governance pack does not exist (P0)
- **Category**: Legal → Real-data pilot (LG-21)
- **Description**: All data today is synthetic + banner + 7-day sweep + `@demo.in` reserved — clean. **A controlled pilot with real data needs: ethics clearance (college), an informed-consent form beyond the app's UI consent, data-processing terms with the pilot clinics, named incident contacts, and a qualified lawyer's sign-off — none of these exist yet.** This is the single gate that converts the demo into a real-data product.
- **Current implementation / observed behaviour**: Verified (no such artefacts in the repo; the app's own consent mechanics are the strong half of this — LG-03/04/05 all met).
- **Expected behaviour**: The pack, in `web/docs/pilot/`: ethics clearance (or its waiver), the paper/digital informed-consent form (hi/mr per NG-F03), DPT with each pilot clinic, incident-contact sheet (owner + officer per NG-F02), counsel sign-off covering NG-L08/L18/L14 + the hi/mr consent text.
- **Evidence**: repo inventory (absence); LG-21 row.
- **Evidence status**: VERIFIED (the absence); the pack itself is human/external work
- **Severity**: High · **Priority**: P0 (before any real patient data)
- **Business impact**: Without the pack, the pilot is either illegal or a demo; with it, the pilot is defensible end-to-end.
- **Patient safety impact**: Informed consent beyond the app UI is the patient's last line of protection.
- **Security/privacy impact**: The DPT names the processor roles; the incident sheet is the 72-h clock's operational form (LG-13).
- **Technical impact**: None directly (it gates, it doesn't code) — except the hi/mr consent text (NG-F03) and the officer channel (NG-F01/F02), which the pack references.
- **Dependencies**: owner (ethics body, clinics, counsel); NG-F03 (consent text in the pilot languages); NG-F01/F02 (channels the incident sheet names).
- **Recommended solution**: Step-2 W2 (the P0-gate workstream) — assemble the pack in `web/docs/pilot/` with an owner per item and a date; the pilot gate checklist (12 items in the Step-2 plan) keys off it.
- **Required tests**: none (documents) — but the gate checklist itself is the test: 12/12 before the pilot env is stood up.
- **Acceptance criteria**: every item in the pack exists in-repo with a signer and a date; the 12-item pilot gate references it; counsel sign-off names the reviewed artefacts (including the hi/mr consent text).
- **External deps / approvals**: owner (ethics, counsel, clinics).
- **Complexity**: Medium (coordination) · **Status**: Open

#### NG-L11 — Verifiable guardian age/identity: self-declared today, DigiLocker BLOCKED (P1)
- **Category**: Legal → Children's data (LG-11)
- **Description**: The children's flow is the strongest in the app: minor self-registration refused, guardian dependents flow, handover at 18 — all e2e-pinned. The one soft point (D48): **guardian adulthood is self-declared** (DOB typed, not verified). Verifiable age/identity via a DigiLocker token is the designed fix — **BLOCKED on DigiLocker partner credentials** (no public self-serve for this use).
- **Current implementation / observed behaviour**: Verified (dependents flow read; the self-declared DOB field; D48).
- **Expected behaviour**: A DigiLocker verification step (or equivalent) for guardian DOB/identity; until it exists, the attestation + "self-declared" label stays (it is disclosed).
- **Evidence**: code read; D48; LG-11 row.
- **Evidence status**: BLOCKED (partner credentials); the current self-declared behaviour is VERIFIED
- **Severity**: Medium · **Priority**: P1 (pilot — a guardian's identity is the gate to a minor's health data; real-data stakes)
- **Business impact**: A guardian dispute in the pilot is an unresolvable incident without verification.
- **Patient safety impact**: Wrong-person access to a minor's record is the worst access error class.
- **Security/privacy impact**: DPDP r.10 (child data, from 13 May 2027) expects verifiable parental consent — the self-declared DOB is today's honest substitute.
- **Technical impact**: A verification endpoint (token exchange) when credentials exist; the current flow needs no change.
- **Dependencies**: DigiLocker partner credentials (owner/partner — external, no public path known).
- **Recommended solution**: Keep the attestation + disclosure for the pilot (document the risk in the pilot charter, NG-L21); pursue DigiLocker in parallel; implement when credentials arrive (F13-b).
- **Required tests**: when built: token-verify e2e (valid/invalid/expired tokens); the current self-declared path's tests stay green.
- **Acceptance criteria**: pilot charter states the residual risk + mitigation; DigiLocker integration shipped (with e2e) when credentials exist — or a documented decision to accept the self-declared posture.
- **External deps / approvals**: DigiLocker partner (owner).
- **Complexity**: Medium · **Status**: Blocked (credentials)

#### NG-L14 — Cross-border transfer: re-check at 13 May 2027 (P2)
- **Category**: Legal → Cross-border (LG-14)
- **Description**: Singapore hosting (Vercel) is **disclosed** in the notice (s.16/r.15 posture: disclosure + the transfer is necessary for performance). As of 28 Sep 2026 no transfer-restriction notification has been issued under the Rules (verified at Step 1 against official sources; IT-SPDI 2011 remains in force until 13 May 2027). The duty is **forward-dated**: at 13 May 2027 (Phase 3), restriction notifications *can* be issued by rule — the posture must be re-checked then, and the Mumbai cutover (Supabase, scripted) is the residency lever if it ever becomes necessary.
- **Current implementation / observed behaviour**: Verified (notice disclosure text; the cutover script exists; the date checks were current at Step 1).
- **Expected behaviour**: A dated re-check (owner + counsel) on/after 13 May 2027; the residency decision documented either way.
- **Evidence**: notice read; cutover script; DPDP commencement schedule (official source, cited).
- **Evidence status**: VERIFIED (disclosure + script); the 13 May 2027 state is future (re-check is the finding)
- **Severity**: Medium (conditional) · **Priority**: P2 (a calendar-dated legal duty — cheap to track, expensive to miss)
- **Business impact**: If restrictions bite, the Mumbai cutover is the only fast lever — it must stay tested.
- **Patient safety impact**: None direct (residency doesn't change the clinical data).
- **Security/privacy impact**: Data-residency posture for health data under DPDP s.16.
- **Technical impact**: The cutover script exists; a periodic dry-run keeps it honest.
- **Dependencies**: counsel (the 2027 re-check); the W11 hosting decision (if it picks Mumbai/Pro, this finding shrinks).
- **Recommended solution**: A calendar item in the pilot charter (NG-L21) — re-check on 13 May 2027 + annual cutover dry-run until then.
- **Required tests**: cutover dry-run on the sandbox (script green, date committed).
- **Acceptance criteria**: the re-check is a named charter item with a date; one dry-run recorded before the pilot.
- **External deps / approvals**: counsel (at the date).
- **Complexity**: Small · **Status**: Open

#### NG-L16 — Consent managers (DPDP Rule 4, from 13 Nov 2026): no path (P2)
- **Category**: Legal → Consent infrastructure (LG-16)
- **Description**: From **13 Nov 2026**, registered consent managers (CMs) may give/withdraw consent on users' behalf, and fiduciaries must honour CM-initiated withdrawals. CityCare has **no CM API path** (no integration, no "withdrawal initiated via CM" event).
- **Current implementation / observed behaviour**: Verified (no CM code; the consent engine is app-internal — which is the correct core, the CM layer is an *external initiation* channel).
- **Expected behaviour**: A design decision by 13 Nov 2026: (a) register as a CM (unlikely for a pilot — it creates duties), or (b) honour CM-initiated withdrawal (an event type + an admin-verified flow that the CM's proof can trigger).
- **Evidence**: DPDP Rules 2025 commencement schedule (official, cited); code grep (no CM path).
- **Evidence status**: VERIFIED (absence + the dated duty)
- **Severity**: Medium (conditional, dated) · **Priority**: P2 (the date is ~12 months out; the design task is small, the decision must be made *before* the date)
- **Business impact**: A CM-initiated withdrawal that the app can't honour is a compliance miss on a dated rule.
- **Patient safety impact**: None direct.
- **Security/privacy impact**: The CM channel is an *additional* consent path — it must produce the same ledger evidence as in-app withdrawal (the `DATA_ERASED`/revoke machinery already exists).
- **Technical impact**: One event type + an admin verification flow (the proof-of-CM is human-verified until CM APIs mature).
- **Dependencies**: counsel (what "honour" means under Rule 4); the date (13 Nov 2026).
- **Recommended solution**: A design note in the pilot charter (NG-L21) by 13 Nov 2026 — expected answer: (b) honour-with-verification; build only if the pilot's users actually have CMs (unlikely at pilot scale — document the decision).
- **Required tests**: n/a unless built (an e2e for the CM-withdrawal flow if implemented).
- **Acceptance criteria**: a dated, counsel-reviewed decision in the charter; (if built) the e2e.
- **External deps / approvals**: counsel; CM API availability (external ecosystem).
- **Complexity**: Small (decision) / Medium (if built) · **Status**: Open (dated)

#### NG-L19 — Doctor registration verification: attestation only (P2)
- **Category**: Legal → Professional verification (LG-19)
- **Description**: Doctor registration is recorded as an **attestation** (register number + "matched" checkbox + admin + date, ledgered) and the UI **never says "NMC verified"** (audited). No official NMC lookup API exists; scraping is deliberately not done (legally grey). The designed upgrade — HPR/ABDM verification once ABDM credentials exist — is **BLOCKED on those credentials**.
- **Current implementation / observed behaviour**: Verified (onboarding flow read; the "never verified" UI assertion is e2e-pinned).
- **Expected behaviour**: Keep the honest attestation for the pilot (it is disclosed as attestation); HPR verification when credentials exist.
- **Evidence**: onboarding code; D12/D57; LG-19 row.
- **Evidence status**: BLOCKED (ABDM/HPR credentials); the attestation behaviour is VERIFIED
- **Severity**: Medium · **Priority**: P2
- **Business impact**: A fake-doctor risk (mitigated by admin review + attestation + the pilot's closed doctor set — the pilot knows its doctors personally).
- **Patient safety impact**: Verifying a prescriber's registration is the classic guard; the attestation + closed pilot set is the substitute until HPR.
- **Security/privacy impact**: The attestation record is ledgered (evidence exists even if it's self-declared).
- **Technical impact**: A verification endpoint when credentials exist (small).
- **Dependencies**: ABDM credentials (owner/ABDM — external).
- **Recommended solution**: Pilot charter: name the attestation posture + the closed-doctor-set mitigation; pursue HPR credentials (same track as NG-F05's API and NG-L11's DigiLocker — the ABDM credentials engagement is one).
- **Required tests**: when built: verified-doctor e2e (valid/invalid registration).
- **Acceptance criteria**: charter documents the posture; HPR verification shipped (or documented decision) when credentials exist.
- **External deps / approvals**: ABDM credentials (owner).
- **Complexity**: Small (if built) · **Status**: Blocked (credentials)

#### NG-L24 — Commercial pilot must move hosting (Vercel Hobby ToS) (P2)
- **Category**: Legal → Platform terms (LG-24)
- **Description**: Vercel Hobby Terms §1 states **non-commercial** use. The current demo complies. A *commercial* pilot (clinics paying) on Hobby is a ToS violation — not a technical problem, but it couples to the platform decision (Pro vs Mumbai self-host) and to the payment decision (NG-F06). The register keeps the *ToS half* here and the *money half* there.
- **Current implementation / observed behaviour**: Verified (terms cited in the market doc; the running platform is Hobby).
- **Expected behaviour**: A documented decision: community pilot (Hobby stays, posture documented) or commercial pilot (Pro or Mumbai self-host, per the W11 hosting workstream).
- **Evidence**: Vercel terms (cited); deploy config.
- **Evidence status**: VERIFIED (terms + current tier); commercial intent is the owner's pending decision
- **Severity**: Medium (if commercial) · **Priority**: P2
- **Business impact**: A ToS breach mid-pilot = forced migration + downtime; deciding early is free.
- **Patient safety impact**: None. **Security/privacy impact**: Self-host (Mumbai) changes the processor list + the residency story (NG-L14's lever) — the notice update rides with it.
- **Technical impact**: Pro = zero code; Mumbai = Dockerfile + prebuild path (exists) + region choice.
- **Dependencies**: NG-F06 (the commercial decision); owner cost call.
- **Recommended solution**: W11 (hosting workstream) — the pilot charter states posture + tier in one line; the notice's hosting section updates if the tier moves.
- **Required tests**: if moved: full suite green on the new host (the prebuild schema sync, A76, is the critical path).
- **Acceptance criteria**: charter line (posture + tier) + (if moved) green suite on the new host + notice updated.
- **External deps / approvals**: owner.
- **Complexity**: — (decision) / Medium (if Mumbai) · **Status**: Open (owner decision pending)

#### NG-L20 — ABDM certification: deliberately not pursued (P3)
- **Category**: Legal → Certification (LG-20)
- **Description**: ABDM certification (6–9 months + STQC/CERT-IN empanelled audit) is **deliberately not pursued** and nothing in the UI claims or implies it (wording audited). Recorded as a finding so the *decision* is visible: if strategy changes (e.g. a government tender), this is the 6–9 month item that gates it.
- **Current implementation / observed behaviour**: Verified (no certification claims anywhere; the ABHA *field* (NG-F05) is identifier-only and says so).
- **Expected behaviour**: Stay uncertified at pilot scale; revisit only on a strategy change (a named decision, not drift).
- **Evidence**: UI wording audit (Step-1); LG-20 row.
- **Evidence status**: VERIFIED
- **Severity**: Low (informational decision) · **Priority**: P3
- **Business impact**: Certification is a market-entry item for government/enterprise segments the pilot is not targeting.
- **Patient safety impact**: None. **Security/privacy impact**: The pen-test (NG-S17) and the pack (NG-L21) are the *inputs* any future audit would want — the sequencing pays twice.
- **Technical impact**: None (a watch item).
- **Dependencies**: a strategy change (owner).
- **Recommended solution**: No action; the non-claim wording stays e2e-pinned.
- **Required tests**: the existing "no verification claims" UI test stays green.
- **Acceptance criteria**: n/a (the decision is the register row).
- **External deps / approvals**: none.
- **Complexity**: — · **Status**: Open (decision recorded)

#### NG-L25 — DLT/SMS registration: before any SMS (P3)
- **Category**: Legal → Telecom regulation (LG-25)
- **Description**: No SMS exists (correctly — the e-mail leg, NG-F01, is the pilot channel). If SMS is ever added (appointments, reminders), Indian DLT registration + a registered sender id are **legal prerequisites**, not an afterthought.
- **Current implementation / observed behaviour**: Verified (no SMS code anywhere).
- **Expected behaviour**: A build gate: DLT registration + registered sender **before** the first SMS; the reminder use case is post-pilot anyway (NG-F07-class scope).
- **Evidence**: grep (no SMS); LG-25 row.
- **Evidence status**: VERIFIED (absence + the documented gate)
- **Severity**: Low · **Priority**: P3
- **Business impact**: Unregistered SMS = undelivered/penalised; a cheap pre-check avoids a dead channel.
- **Patient safety impact**: None. **Security/privacy impact**: SMS content rules (no PHI in the body) apply the same discipline as NG-F01's e-mail templates.
- **Technical impact**: A provider integration (later).
- **Dependencies**: NG-F01 (e-mail first); DLT registration (owner, external).
- **Recommended solution**: No action until the use case is real; the gate is this row.
- **Required tests**: n/a until scoped.
- **Acceptance criteria**: n/a (the gate is the register row).
- **External deps / approvals**: DLT registration (owner).
- **Complexity**: — · **Status**: Open (gate recorded)

#### NG-L07 — Free-text clinical fields have no correction trail (P3)
- **Category**: Legal → DPDP correction right (LG-07)
- **Description**: The correction right (s.12) is met structurally: the profile is editable, observation delete = correction, the med-confirm flow rewrites the record, and every mutation is ledgered. The soft point: **free-text clinical fields have no correction *trail*** beyond the ledger events (the old value isn't stored, the ledger records that a change happened). For the app's posture (the clinician's system of record is their own), this is adequate — flagged for counsel's eyes rather than treated as a gap to build.
- **Current implementation / observed behaviour**: Verified (edit routes + ledger events; D15).
- **Expected behaviour**: Counsel's assessment that ledger-event-only correction evidence satisfies "the data principal can correct" for this product's scope; if counsel disagrees, a `previousValue` column on the edited fields.
- **Evidence**: route reads; LG-07 row.
- **Evidence status**: VERIFIED (the current posture)
- **Severity**: Low · **Priority**: P3
- **Business impact**: A correction dispute (rare) has weaker evidence than an audit trail would give.
- **Patient safety impact**: A corrected (vs deleted) clinical value preserves the history *intent*; the gap is the value itself.
- **Security/privacy impact**: Storing `previousValue` is more PII retention — the trade-off counsel should weigh, not the engineer.
- **Technical impact**: One column + a diff, only if counsel requires it.
- **Dependencies**: counsel (folds into the NG-L21 pack review — it's a one-paragraph question).
- **Recommended solution**: Add to the counsel questions list (NG-L21 pack); build only if answered negatively.
- **Required tests**: n/a (a doc question); if built: correction e2e shows old→new.
- **Acceptance criteria**: counsel's answer in the pack; (if built) the e2e.
- **External deps / approvals**: counsel.
- **Complexity**: Small (if built) · **Status**: Open (in counsel list)

#### NG-L17 — Significant Data Fiduciary duties (DPIA/data audit): monitor thresholds (P3)
- **Category**: Legal → SDF duties (LG-17)
- **Description**: The DPDP SDF thresholds (R.13: DPIA, data-audit duties) are **not met at the demo's scale** — the user base is synthetic. A pilot with real data *may approach* them depending on the fiduciary's overall volume; the honest state is "monitor, and if the fiduciary crosses the threshold, the DPIA and audit duties switch on".
- **Current implementation / observed behaviour**: Verified (scale facts: demo = synthetic; no threshold-calculation code exists or is needed).
- **Expected behaviour**: A threshold note in the pilot charter (what the threshold is, how the pilot volume compares, who re-checks at scale-up).
- **Evidence**: DPDP Rules 2025 (official, cited); scale facts from the inventory.
- **Evidence status**: REPORTED (the threshold analysis is desk-based on the published Rules; the pilot volume is the owner's number)
- **Severity**: Low (conditional) · **Priority**: P3
- **Business impact**: A missed SDF designation is a category error in the legal posture.
- **Patient safety impact**: None direct.
- **Security/privacy impact**: DPIA/audit duties, if triggered, are substantial (a documented assessment + periodic audit) — better known early.
- **Technical impact**: None (a document).
- **Dependencies**: counsel (the threshold reading); the pilot's real volume.
- **Recommended solution**: One paragraph in the NG-L21 pack: the threshold, the pilot estimate, the re-check trigger.
- **Required tests**: n/a.
- **Acceptance criteria**: the paragraph exists in the pack with counsel's initial.
- **External deps / approvals**: counsel.
- **Complexity**: Small (doc) · **Status**: Open (in counsel list)

---

## I. Governance & Process (4 findings)

#### NG-G01 — Stale top-level docs + missing `web/.env.example` (P2)
- **Category**: Governance → Documentation accuracy
- **Description**: (a) `web/.env.example` is referenced by `START_HERE.md` ("cp .env.example .env.local") and the root README but **does not exist in the repo** (verified: `find`, 2026-11-01) — onboarding is broken for a new machine. (b) `START_HERE.md` cites the old live URL (`citycare-xi.vercel.app`), migrations 0001–0004, and 131/217 test counts — all superseded (current: `citycare-z95n.vercel.app`, 0001–0005 + prebuild hook, 162/241). (c) The root README cites 48 unit tests / 43 e2e and "file storage is unimplemented" (F12 shipped real storage). (d) The `ci.yml` comment says 217 checks.
- **Current implementation / observed behaviour**: All verified by direct read on 2026-11-01. The in-repo `web/README.md` verified blocks are current (dated rounds) — the drift is in the root-level docs written for the 2026-10-29 zip.
- **Expected behaviour**: One source of truth per fact; an onboarding command that actually works.
- **Evidence**: file reads + `find` (2026-11-01).
- **Evidence status**: VERIFIED
- **Severity**: Low (onboarding) + Medium (examiners/viva readers get wrong numbers) · **Priority**: P2
- **Business impact**: An examiner who follows START_HERE hits a missing file and stale claims on the first try.
- **Patient safety impact**: None. **Security/privacy impact**: None (the missing template carries no secrets — it is a template; the hygiene note is that it must stay value-free). **Technical impact**: None.
- **Dependencies**: none.
- **Recommended solution**: Step-2 W0 — create `web/.env.example` (generation commands, no values); sync START_HERE/README/ci comments to the 2026-11-01 state (URL, counts, migrations, prebuild note).
- **Required tests**: `cp .env.example .env.local` + bootstrap + build works on a clean checkout; doc numbers match the suites (grep-check committed).
- **Acceptance criteria**: no doc in the repo cites a number or URL the tests/production contradict (a spot-check list committed).
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-G08 — E2E suite is coupled to demo data and rate-limit caveats *(NEW at consolidation)* (P2)
- **Category**: Governance → Test infrastructure
- **Description**: The 241-check e2e suite (a) logs in as the **seeded `@demo.in` identities** (ramesh@/anita@/sunita@/dr.kulkarni@/dr.joshi@/dr.sheikh@demo.in) in a large fraction of checks, and (b) is sensitive to per-IP rate limits (login 60/10/min/IP) — repeated runs on a dirty seed 429 and look like regressions (a known D3 symptom, not a bug). Consequences: a **demo-free pilot env (NG-S14) cannot run the suite as-is**, and the **production re-run (NG-G04) needs a stated expected-number profile** (which checks skip without demo data, and the one-fresh-run-per-seed rule).
- **Current implementation / observed behaviour**: Verified (`web/scripts/e2e.mjs` read 2026-11-01: the demo-login constants; the rate-limit window; consolidation-time green run 241/241 on a fresh seed — the suite is solid *on a demo env*).
- **Expected behaviour**: Demo-dependent checks gated behind an env flag (`E2E_DEMO=1` default); a documented "prod-mode" subset (no demo logins, registration-based identities); the runbook states: fresh seed, one run, expected profile per mode.
- **Evidence**: e2e.mjs read; D3; consolidation-time run.
- **Evidence status**: VERIFIED
- **Severity**: Medium (it gates two P1 items: NG-G04 and NG-S14) · **Priority**: P2
- **Business impact**: Without it, the pilot env has no test story and the prod run's numbers are uninterpretable.
- **Patient safety impact**: None direct (test infrastructure).
- **Security/privacy impact**: None (the suite uses synthetic data in both modes).
- **Technical impact**: Check gating + registration-based identity setup (the suite already knows how to register — the demo logins are a shortcut, not a dependency of the assertions).
- **Dependencies**: none; unblocks NG-G04's runbook and NG-S14's pilot-mode verification.
- **Recommended solution**: W5 (with the prod re-run workstream) — flag-gate the demo checks; register identities in prod mode; publish the two expected profiles (demo: 241; prod: 241−N skipped, N named).
- **Required tests**: e2e green in **both** modes on the sandbox (demo mode = today's 241/241; prod mode on a `SEED_DEMO=0` DB).
- **Acceptance criteria**: the runbook names both profiles; the pilot-mode DB (0 users) runs the prod-mode suite green.
- **External deps / approvals**: none.
- **Complexity**: Small–Medium · **Status**: Open

#### NG-G03 — No ADRs; decisions scattered in the bug log (P3)
- **Category**: Governance → Decision records
- **Description**: The project's significant decisions (raw `pg` over Prisma, no LLM on the clinical path, bytea→object-storage, the ledger's append-only design, the erasure/redaction split) live in `DRAWBACKS_AND_BUGFIXES.md` and doc prose — as *rationale-for-a-fix*, not as *decisions-with-alternatives*. Decision archaeology is possible but slow; an ADR set would make the 6 "why not X" questions a reviewer will ask one-page answers.
- **Current implementation / observed behaviour**: Verified (no `docs/adr/`; the deviations are documented in the bug log §B and the architecture doc — the substance exists, the format doesn't).
- **Expected behaviour**: A short ADR set (top-10 decisions, each: context/decision/alternatives/consequences) in `docs/adr/`, distilled from the existing docs (no new analysis — a reformatting pass).
- **Evidence**: repo listing; Step-1 register.
- **Evidence status**: VERIFIED
- **Severity**: Low · **Priority**: P3
- **Business impact**: Reviewer/viva efficiency; onboarding speed.
- **Patient safety impact**: None. **Security/privacy impact**: None. **Technical impact**: None (docs only).
- **Dependencies**: none.
- **Recommended solution**: W0 (hygiene) or W13 tail — 10 ADRs, one page each, each linking the bug-log row that carries the detail.
- **Required tests**: n/a (docs); a link-check that every ADR's cited row exists.
- **Acceptance criteria**: `docs/adr/` with 10 ADRs covering the register's key "accepted" decisions; every link resolves.
- **External deps / approvals**: none.
- **Complexity**: Small · **Status**: Open

#### NG-G06 — Sandbox checkout is a single-commit snapshot (INFO — environment note)
- **Category**: Governance → Audit scope
- **Description**: This audit environment's git checkout is a **shallow single-commit snapshot** of `main` (full history lives on GitHub). Consequence: audit evidence that cites "git blame / history" is scoped to what the snapshot plus the remote allow; this register therefore cites *file + date + re-run* for every claim rather than commit archaeology. **Not product debt** — an environment property, recorded so a re-reader doesn't mistake it for one.
- **Current implementation / observed behaviour**: Verified (`git log` = single root in-sandbox; remote history present on GitHub, fetched 2026-11-01 during consolidation — which also recovered the Step-1 commit `dcee992` after a session reset).
- **Expected behaviour**: Nothing to fix; the note is the deliverable.
- **Evidence**: `git log`; the fetch that recovered `dcee992` (2026-11-01).
- **Evidence status**: VERIFIED
- **Severity**: Informational · **Priority**: INFO
- **Business impact**: None (process note). **Patient safety impact**: None. **Security/privacy impact**: None. **Technical impact**: None.
- **Dependencies**: none. **Recommended solution**: None.
- **Required tests**: n/a. **Acceptance criteria**: n/a (observation).
- **Complexity**: — · **Status**: Open (observation)

---

## Appendices

### Appendix 1 — ID namespace and lifecycle

| Class | IDs | Note |
|---|---|---|
| Security (S) | NG-S01…NG-S14, NG-S16 | carried from Step 1 |
| Security — new | NG-S15 (reserved-then-assigned), NG-S17 | issued at consolidation |
| Database (D) | NG-D01…NG-D07 | carried; NG-D08 = alias → NG-P03 |
| Feature (F) | NG-F01…NG-F08, NG-F11 | carried; NG-F09 = alias → NG-U04, NG-F10 = alias → NG-U05 |
| Feature — new | NG-F12, NG-F13 | issued at consolidation |
| Clinical (C) | NG-C01…NG-C06 | carried |
| UI (U) | NG-U01…NG-U08 | carried; NG-U08 = UI-side pointer → NG-P01 (one primary) |
| Performance (P) | NG-P01…NG-P06 | carried |
| Governance (G) | NG-G01, NG-G03, NG-G04, NG-G06, NG-G07 | carried; NG-G02 = Verified Resolved (closed by the Step-1 architecture doc); **NG-G05 reserved/unused** |
| Governance — new | NG-G08 | issued at consolidation |
| Legal (L) | NG-L07, NG-L08, NG-L11, NG-L14, NG-L16, NG-L17, NG-L18, NG-L19, NG-L20, NG-L21, NG-L24, NG-L25 | issued at consolidation (12 gap rows of the LG-01…LG-25 matrix; LG-xx citations remain valid) |

Counts: 56 carried + 17 new = **73 active**. Aliases (4 pointer rows) + closed (1) + reserved (2: NG-G05, and NG-S15 before assignment) are not counted.

### Appendix 2 — Audit Conflicts and Reconciliation

_Where the source documents disagreed with each other or with the code, and how each was
resolved. Rule applied: **code wins over docs; verified wins over claimed; one primary ID
per root cause; no original ID is deleted.**_

1. **Step-1 headline count (internal typo, fixed pre-consolidation).** The first cut of the
   Step-1 register/main report headed "39 findings / 2 High"; the reconciled count is
   **56 active findings (0 Critical / 3 High / 28 Medium / 19 Low / 6 Informational)** —
   fixed in both files before commit `dcee992` (2026-11-01). This register recomputes all
   totals from the final 73-row table (56 + 17 new), not from either headline.
2. **`FEATURES.md` "2 drug classes" vs code.** FEATURES.md claims the interaction engine
   covers "drugs (2 classes)". Code (`rules.ts`, read 2026-11-01) shows **one** class set
   wired (`PENICILLIN_CLASS`, for the "penicillin" allergy match), `NSAID_CLASS` declared
   but never used, and the DDI event type never emitted. **Code wins** → NG-C01 / NG-F11
   (the D11 drawback row is cross-referenced there).
3. **Legal matrix duplicates (5 links, no new IDs).** LG-02 → NG-F03 (hi/mr), LG-06 →
   NG-C05 (FHIR/ICD-10 portability), LG-09 → NG-F02 (grievance officer envs), LG-13 →
   NG-F01 (e-mail leg of breach intimation), LG-22 → NG-C06 (rules-engine clinical review).
   LG-12's residual ("no backup/DR") maps to the already-registered NG-S09 (cross-reference,
   not a duplicate finding). LG-07/LG-08/LG-11/LG-14/LG-16/LG-17/LG-18/LG-19/LG-20/
   LG-21/LG-24/LG-25 (12 rows) were **not** already registered → new NG-Lxx IDs issued.
4. **Alias rows (4).** NG-D08 ≡ NG-P03 (load testing; primary NG-P03) · NG-F09 ≡ NG-U04
   (dark mode) · NG-F10 ≡ NG-U05 (PWA) · NG-U08 → NG-P01 (animation bundle; UI-side ask,
   one engineering effort, one primary). None double-counted.
5. **Stale root-level counts.** `START_HERE.md` (old URL, 0001–0004, 131/217), root
   `README.md` (48/43, "file storage unimplemented"), `ci.yml` comment (217) all predate
   the 2026-10-31 fresh-stack redeploy + F5/F18/A76. **Current truth**: 162 unit / 241 e2e,
   migrations 0001–0005 + prebuild hook, `citycare-z95n.vercel.app` (all re-verified
   2026-11-01) → NG-G01.
6. **`ci.yml` L22 `SESSION_SECRET` literal.** The workflow commits a CI-only session secret
   (a literal for a throwaway service-container Postgres). Risk is low (CI-only, throwaway
   DB, no PHI) but it is a committed secret by common definition. **Disposition**: recorded
   here as an INFO hygiene note rather than a register finding — rotate the literal, add a
   "CI-only, never reuse in prod" comment, and (with NG-S11) use a GitHub Actions secret if
   the workflow ever touches shared infrastructure.
7. **Session notice-version compare (minor, unregistered).** `session.ts` compares notice
   versions lexicographically (`vYYYY-MM-DD`) — correct for the current format, fragile to
   any future non-zero-padded version. Works today; noted for the W13/W6 hygiene pass, not
   registered (no user-visible defect).
8. **NG-S15 assignment of a reserved number.** The Step-1 register explicitly marked
   "NG-S15 unused (reserved)". This consolidation **assigns** that reserved number to the
   newly-surfaced demo-retention-sweep finding — an assignment of a reserved slot, recorded
   here so it is never read as an overwrite. NG-G05 remains reserved.
9. **Priority-scheme mapping (Step-1 3-tier → consolidated 5-tier).** Step 1 used
   P0/P1/P2 + execution tags (CODE / REALWORLD / BLOCKED). The consolidated P0–P3/INFO
   scheme re-slates Step-1 "P2" rows by their actual horizon: one change — **NG-F07
   (Step-1 P2 → P3**: lab/org staff roles are post-pilot scope and depend on NG-D03) —
   recorded in the finding. All other rows keep their Step-1 tier; Step-1's P0/P1 sets are
   unchanged, and the new P0s (NG-S15, NG-L08, NG-L18, NG-L21) are consolidation additions,
   not re-grades.
10. **Sandbox vs production (global reconciliation).** Every measurement in every source
    doc is a **sandbox** measurement (embedded PG 18.6, `next start`, 127.0.0.1). No source
    doc claims production verification. Consolidation re-ran the gauntlet 2026-11-01
    (vitest 162/162, tsc/eslint clean, build clean, e2e 241/241 fresh seed) — all sandbox.
    Production state is carried as NOT VERIFIED / BLOCKED (NG-G04, NG-P02, NG-P06), never
    implied.
11. **Market claims.** All competitor/pricing/ABDM figures are **REPORTED** (cited in
    `CITYCARE_INDIA_MARKET_RESEARCH.md`: Mission Steering Group 10 Jul 2026 for ABDM
    adoption; DPDP G.S.R. 846(E) for the commencement dates; public pricing pages for
    competitor brackets). No primary evidence exists (NG-F13) — consequently **no PMF or
    demand claim appears anywhere in this register**.
12. **Legal "compliance" language.** Per the brief, nothing here claims DPDP *compliance*
    or NMC/ABDM *certification*. The register distinguishes: **verified legal requirements**
    (dates/obligations checked against official sources) · **needs-official-verification**
    (NG-L14 re-check at 13 May 2027) · **needs-Indian-counsel** (NG-L07/L08/L11/L14/L16/L18/
    L21 pack) · **ABDM-technical** (NG-F05 API, NG-L19, NG-L20) · **best-practice** (the
    rest of the security hardening).

### Appendix 3 — Cross-reference: existing drawbacks D1–D62 (status 2026-11-01)

_Closed rows were struck through in `web/DRAWBACKS_AND_BUGFIXES.md` §B; statuses below
re-verified by the audit (read + grep + probes), not copied._

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
| D12 registration not verified | **Closed as far as law allows** (A68) | NG-L19 | attestation, not lookup |
| D13 no external anchor | **Closed** (D13/L1) | NG-D06 | OTS receipts pending-confirm (D55) |
| D14 ledger pagination | **Closed** | — | — |
| D15 erasure vs retention tension | Open (documented) | NG-L08, NG-L18 | needs counsel confirmation |
| D16 e2e lockout | **Closed** (A63) | — | — |
| D17 English-only UI | Open | NG-F03, NG-U06 | pilot blocker for Nagpur |
| D18 single pool node | Open | NG-D04 | pooler/paid path |
| D19 scope untested | **Closed** (A58) | — | — |
| D20 build OOM | Open (accepted) | NG-P03 context | CI box fine |
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
| D48 guardian self-declared DOB | Open | NG-L11 | DigiLocker token (CREDS) |
| D49 no claim-at-18 | **Closed** (F13-b) | — | — |
| D50 SUPER_ADMIN only, one account | Open | NG-D03 | org model + two-person rule |
| D51 rate limit DB write | Open (accepted) | NG-P04 | — |
| D52 fixed sessions | **Closed** (sliding) | — | — |
| D53 blob 0.5 GB | Open | NG-D05 | object storage |
| D54 no DOCUMENT_KEY rotation | Open | NG-G07 | KMS/re-wrap |
| D55 OTS receipts pending | Open (accepted) | — | `ots upgrade` job |
| D56 e-mail scaffold only | Open | NG-F01 | CREDS (owner) |
| D57 attestation not lookup | Open | NG-L19 | HPR when ABDM creds exist |
| D58 hi/mr partial | Open | NG-F03 | next-intl |
| D59 CI never ran | Open (BLOCKED: repo setting) | NG-S11 | owner enables Actions |
| D60 Observation dead | **Closed** (F5) | NG-D07 | clinician-authored obs still missing |
| D61 `:has()` print | Open (accepted) | — | evergreen-only target |
| D62 Vercel migration drift | **Closed** (A76 prebuild, 2026-11-01) | — | build = schema sync |

### Appendix 4 — Cross-reference: fixed bugs A1–A76

All 76 bug entries in §A of `web/DRAWBACKS_AND_BUGFIXES.md` are **fixed and test-pinned**
(verified: every fix names its test; the 2026-11-01 re-run — 162/162 unit + 241/241 e2e —
is the standing proof). None is re-opened by this audit. Grouped: A1–A8 ledger/plpgsql ·
A9–A19 app+e2e correctness · A20–A34 proxy/cookie/CSRF/deploy-script class · A35–A47
operational (lockout, scrypt, tabs, queries, envs, health) · A48–A66 feature-class (F1–F13,
legal L1–L4, A58 the consent-scope leak, A60 sessions, A61 rate limits) · A67–A75 UI/UX +
e2e math · **A76 the 2026-11-01 production 500 (schema⇄code drift, closed via prebuild
hook)** — the A76 fix is itself evidence the drift class is structurally closed, not just
patched. Register rows that cite A-entries: NG-S09 (A44 health payload), NG-L18 (A51),
NG-S13 (A59/A60 context), NG-S14 (A48/F1), NG-F01 (A61/D56), NG-D03 (A60 sessions),
NG-D07 (A63/D60), NG-G04 (A76).

### Appendix 5 — Legal obligations: met, linked, and registered (LG-01…LG-25)

| LG # | Obligation | Disposition |
|---|---|---|
| LG-01 | Plain-language itemised notice (r.3; s.5) | **Met** — `/legal/privacy` rendered from `DATA_INVENTORY`, versioned, footer-linked |
| LG-02 | Eighth-Schedule-language notice (s.5(3)) | **Linked → NG-F03** (hi/mr key-points only, flagged pending legal-cell review) |
| LG-03 | Free, specific, informed consent by affirmative act (s.6; r.5) | **Met** — two mandatory checkboxes, server-side `z.literal(true)`, `PolicyAcceptance` in-tx, per-pair scope/expiry |
| LG-04 | Withdrawal as easy as giving (s.6(4)) | **Met** — one-tap per-doctor revoke + full erasure; reads/logout/grievance never gated |
| LG-05 | Re-consent on notice change (L2) | **Met** — banner + 428 `consent_outdated` on mutations until re-acceptance |
| LG-06 | Rights: access/portability (s.11) | **Met, partial** — FHIR R4 export + print summary + ledger view; **linked → NG-C05** (no ICD-10 codes) |
| LG-07 | Correction (s.12) | **Registered → NG-L07** (correction trail beyond ledger events, LREVIEW) |
| LG-08 | Erasure (s.12; r.8) | **Registered → NG-L08** (P0, counsel confirmation for real data) |
| LG-09 | Grievance officer + 30-day SLA (s.13; r.9) | **Linked → NG-F02** (desk built; officer name/mailbox envs unset) |
| LG-10 | Nomination (s.14) | **Met** — nominee API + form, ledgered, erased with record |
| LG-11 | Children's data (s.9; r.10) | **Registered → NG-L11** (verifiable age BLOCKED on DigiLocker creds) |
| LG-12 | Reasonable safeguards + logs ≥ 1 yr (s.8(5); r.6) | **Met except backup** — residual = **NG-S09** (cross-reference) |
| LG-13 | Breach intimation to Board + principals (r.7, 72 h) | **Linked → NG-F01** (register + 72-h clock + one-click intimation live; e-mail leg not live) |
| LG-14 | Cross-border transfer (s.16; r.15) | **Registered → NG-L14** (re-check at 13 May 2027) |
| LG-15 | Processor contracts (s.8(2)) | **Met** — Vercel/Neon DPAs by ToS, listed in notice |
| LG-16 | Consent managers (Rule 4, from 13 Nov 2026) | **Registered → NG-L16** (no CM path; dated design decision) |
| LG-17 | SDF duties (r.13: DPIA, data audit) | **Registered → NG-L17** (not met at scale; monitor) |
| LG-18 | Medical-record retention (NMC 3 yr / DGHS 10 yr) | **Registered → NG-L18** (P0, counsel confirmation of redaction design) |
| LG-19 | Doctor registration verification | **Registered → NG-L19** (attestation only; HPR BLOCKED on creds) |
| LG-20 | ABDM certification | **Registered → NG-L20** (deliberately not pursued) |
| LG-21 | Real patient data in a college project | **Registered → NG-L21** (P0, pilot governance pack) |
| LG-22 | Medical-advice boundary | **Linked → NG-C06** (no LLM clinical path; disclaimers; review pending) |
| LG-23 | OSS/licences | **Met** — 361 prod packages, no copyleft (gate script), Inter OFL, GSAP No-Charge |
| LG-24 | Non-commercial hosting (Vercel Hobby) | **Registered → NG-L24** (commercial pilot must move hosting) |
| LG-25 | DLT/SMS | **Registered → NG-L25** (no SMS; gate before any SMS) |

### Appendix 6 — Consolidation-time observations (considered, not registered)

_New in this consolidation but deliberately **not** given register IDs — recorded so the
analysis is auditable. Each has a disposition._

| # | Observation | Disposition |
|---|---|---|
| 6.1 | No FTS/trigram index on report text (`ilike` scans) | Fine at pilot scale; if search quality becomes a complaint, a `pg_trgm` GIN on report text is a one-migration fix (folds into W14 scale work). Not a gap at current volume. |
| 6.2 | `reports.body` is unbounded TEXT (ledger is capped at 16 KB, D18) | Hygiene: a `textMax` Zod rule + UI counter is a one-liner; folded into the W10 clinical pass. Not registered (no user-visible defect at pilot volume). |
| 6.3 | Postgres 18.6 is ~10 months old; schema uses no 18-specific features (verified by migration read) | If the W11 hosting decision picks self-hosted, pin to a boring major (floor: 16). A hosting-decision note, not a product finding. |
| 6.4 | `ledger_verify()` re-computes the whole chain per call (~8 ms at ~2 k rows, sandbox probe 2026-11-01) | Scale item: incremental verify + nightly full re-verify (the W3 monitoring job can run the full verify with alerting). **Never "less verification"** — the fix is speed, not scope. Not registered (irrelevant at pilot scale). |
| 6.5 | Next.js 16: zero caching by design (every read is live; `cache:"no-store"` discipline) | This is the *safe* default for PHI (no shared/CDN copies of personalised data). A one-paragraph caching policy belongs in the architecture doc; if a public cacheable surface ever appears, the model must be designed, not accidental. Doc note, not a finding. |
| 6.6 | Cold-start / prod-perf measurement method | Folded into NG-G04's runbook + NG-P02/NG-P06 acceptance (5-URL sample + 5 curls after 10-min idle, date-stamped). Registered there. |
| 6.7 | WhatsApp/SMS reminders (competitor practice, cited) | Post-pilot growth feature; DLT gate = NG-L25; push = NG-F08. Not pre-built (brief: no features to look advanced). |
| 6.8 | Clinic print/OPD-file workflows | Deliberately not pre-built; the pilot's paper artifacts define the scope (one-at-a-time rule). Watch item in the pilot charter. |
| 6.9 | "Retroactive consent" for pre-app visits | Pilot edge case, not a code hole; build only if pilot clinics demand it. Not registered (no defect in the current flows). |
| 6.10 | Immunisation/vaccine reminders | Explicit non-goal (no recommendation logic). Recorded so the absence is a decision. |
| 6.11 | Data-state motion language (skeleton/enter/status-change) | Candidate scope of the NG-U06 elevation pass (the shared-state components get a small motion vocabulary); not a separate finding. |
| 6.12 | Landing "tamper-evident" claim | The word is correct (evidence of tampering exists and is verifiable; it does not prevent tampering). The honest scope already lives on `/legal/transparency`; a one-line footnote on the landing is suggested for the W13 content pass. The ledger design itself is verified (not a finding). |
| 6.13 | Vercel Hobby build ceiling: 5.85 GB peak vs 6 GB cap (2026-11-01 build) | Context for the NG-L24/NG-F06 hosting decision (the Pro/VPS trigger set); a monitoring note, not a defect. |

---

_End of Master Gap Register. Companion documents: `CITYCARE_AUDIT_RECONCILIATION.md`
(duplicate/conflict detail), `CITYCARE_IMPLEMENTATION_DEPENDENCY_MAP.md` (Mermaid +
5-stage order), `CITYCARE_READINESS_SCORECARD.md`, `CITYCARE_STEP_2_RECOMMENDATION.md`._
