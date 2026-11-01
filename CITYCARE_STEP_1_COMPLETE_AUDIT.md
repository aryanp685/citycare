# CityCare — Step 1: Complete Project, Security, UI/UX & India Market Audit (Main Report)

_Audit date 2026-11-01 · Auditor scope: audit-only (no code changes, no deploys, no schema
changes — honored). Subject: `main @ 9212ee4` (PR #5 merged: F5 trends + F18 print + A76
prod-500 fix). All test numbers below were **actually run in this sandbox today**._

## Companion deliverables (all in the repo root)

| File | Contents |
|---|---|
| `CITYCARE_CURRENT_ARCHITECTURE.md` | verified stack/versions, 27-page/54-route/33-lib/35-table inventory, trust-core execution path, dead-code sweep, deploy topology |
| `CITYCARE_SECURITY_AUDIT.md` | 14-finding risk register + control-by-control verdicts with probe evidence |
| `CITYCARE_DATABASE_AUDIT.md` | 35-table/45-FK/96-index audit, ledger/plpgsql review, 8 findings, multi-clinic path, monolith verdict |
| `CITYCARE_FEATURE_COMPLETENESS.md` | 37-row matrix (patient 20 / doctor 11 / admin 6) — implemented·works·tested·gaps |
| `CITYCARE_UI_UX_AUDIT.md` | design-system assessment, GSAP/Motion/Lenis architecture, page-by-page gaps, 8 findings |
| `CITYCARE_PERFORMANCE_AUDIT.md` | measured build/test/e2e timings, bundle facts, serverless constraints, bottleneck order |
| `CITYCARE_INDIA_MARKET_RESEARCH.md` | ABDM 2026 numbers, competitor map (Practo/HealthPlix/Eka), 12-question answers, Nagpur verdict, sources |
| `CITYCARE_LEGAL_COMPLIANCE_GAPS.md` | verified DPDP/ABDM/NMC dates (2026-11-01 research), 25-row gap matrix, 8 unresolved legal questions |
| `CITYCARE_MASTER_GAP_REGISTER.md` | **56 active NG findings (0 Critical / 3 High / 28 Medium / 19 Low / 6 Info), unique IDs, severity/priority/owner/completion criteria; D1–D62 + A1–A76 fully cross-referenced** |
| `CITYCARE_STEP_2_IMPLEMENTATION_PLAN.md` | 16 workstreams in 5 phases + the 12-item pilot gate (plan only, nothing implemented) |

## What was actually run today (evidence, not assumption)

| Check | Result |
|---|---|
| `npx vitest run` | **162/162 pass** (18 files) |
| `npx tsc --noEmit` (TS 7 native) | clean |
| `npx eslint .` | clean |
| `next build` | clean, `BUILD_ID` present (~29 s) |
| `node scripts/e2e.mjs` (fresh seed, prod server) | **241/241 pass** (~18 s) |
| Read-only HTTP probe (17 probes: headers, unauth pages/APIs, CSRF gates, cookie attrs, error shapes, oracle comparison, cron auth) | all as-designed (details in security doc §2/§3) |
| Live DB catalog audit (tables/FKs/indexes/triggers/functions, ledger verify) | 35 tables · 45 FKs · 96 indexes · trigger + 2 ledger functions · **0 chain breaks** |
| Docs cross-check (15 markdown files read) | stale-docs finding NG-G01 (incl. missing `web/.env.example`) |
| Web research (DPDP commencement, ABDM figures, competitor landscape) | 3 search rounds, sources cited in market + legal docs |

**NOT VERIFIED / BLOCKED** (stated, per the brief's honesty rule): visual rendering and
mobile breakpoints (no browser in sandbox — NG-U03), all production-runtime behaviour
(sandbox has no `*.vercel.app` egress — NG-P06/NG-G04, owner 10-min check specified),
Cloudflare deploy path (no credentials — D28), Nagpur-specific market data (interviews
required), any external legal/clinical sign-off.

---

## The 12 required answers

### 1. What is genuinely working
The trust core, end-to-end, with evidence: consent enforced on **every** clinical read
(DB clock, 5 scopes, unit-pinned `applyScope` that caught a real leak — A58); **instant
revocation** (next request 403s — e2e); **break-glass** bounded 60 min/3-per-24h with
mandatory reason, patient CRITICAL notice, admin review queue and **auto-suspension** at 2
unjustified verdicts; **concurrency-correct booking** (tx + partial unique index, distinct
409 classes, cancelled slots free — A11); **tamper-evident ledger** (hash chain with stored
canonical UTC string, trigger-blocked UPDATE/DELETE, `ledger_verify()` = 0 today, nightly
Ed25519 anchors + OpenTimestamps receipts); **real erasure** (delete + redact + blob cascade,
tested); **real file security** (magic-byte sniff, AES-256-GCM key outside DB, 60-s
viewer-bound links, FULL_RECORD-only doctor access); scrypt 2¹⁷ async auth with revocable
server-side sessions, per-IP rate limits, sliding lockout; DPDP-native legal pack
(itemised notice from code, 428 re-acceptance, grievance desk with 30-day SLA, breach
register with 72-h clock, hi/mr key-points, nominee, dependents + handover at 18); FHIR R4
export; F5 trends; F18 print. 241/241 e2e today.
*(Ref: security doc §3, feature matrix §1–3.)*

### 2. What is only partially implemented
- **Safety engine** (doctor D7): 4 rule types live and deterministic, but **no drug–drug
  interaction rule exists at all** (declared type, never emitted; `NSAID_CLASS` dead) and
  **only one drug class (penicillin, 7 members) is wired** (NG-C01/C02, NG-F11).
- **Communications**: e-mail/SMS delivery scaffolded, not live (NG-F01) — so breach
  intimation, reminders and e-mail recovery are in-app only.
- **Language**: hi/mr legal key-points only; app shell English-only (NG-F03).
- **FHIR/interoperability**: works, but no ICD-10 coding, no ABDM profiles, no ABHA
  integration (NG-C05, NG-F05).
- **Multi-clinic**: `Hospital`/`HospitalAdmin` exist as shells; the role is unreachable
  (NG-D03).
- **Grievance desk**: works in code; officer name/mailbox unset (NG-F02).

### 3. What is broken
**Nothing was found broken in code today.** The one production breakage of this period
(the 2026-11-01 `/patient` 500 from the missing migration 0005) was **fixed and
structurally closed** (A76 prebuild hook — deploys now sync the schema; repro-tested).
Remaining "broken" items are *operational*, not code: **no backup/DR and no monitoring**
(NG-S09/S10), **CI never ran** (NG-S11/D59), and **production e2e hasn't been re-run since
F5/F18** (NG-G04 — the sandbox can't reach the live URL).

### 4. What is missing
2FA/passkeys (NG-S13) · real OCR (NG-F04) · ABHA/ABDM integration (NG-F05) · org model
(NG-D03) · ICD-10 (NG-C05) · clinician-authored observations (NG-D07) · PWA/dark mode
(NG-U05/U04) · payment model (NG-F06) · load testing (NG-P03) · `web/.env.example`
(NG-G01) · ADRs/architecture doc (NG-G03/G02 — the latter closed by this audit).

### 5. What is technically risky
Rank order (full detail in register): schema⇄code drift class — **closed** (A76, verified) ·
consent "newest-row" read invariant — latent, one careless writer away (NG-S05) · `DOCUMENT_KEY`
derivation couples file survival to the session-rotation runbook step (NG-S03) · Neon free-tier
ceiling: 0.5 GB ≈ 15 full-quota patients (NG-D05), connection cap under burst (NG-D04),
scale-to-zero latency (NG-P02) · no load evidence for the concurrency claims (NG-P03) ·
fail-open ledger writes on one path (NG-S04) · HSTS platform-dependent (NG-S01).

### 6. What is legally unresolved
Eight questions need qualified Indian counsel (legal doc §4) — headliners: erasure-vs-NMC
retention design (LG-08), cross-border posture at the **13 May 2027** commencement (LG-14 —
Singapore hosting today; Mumbai cutover scripted), consent-manager posture from
**13 Nov 2026** (LG-16), guardian self-declared DOB under r.10 (LG-11), and the **pilot
governance pack** (ethics + informed consent + counsel sign-off — LG-21). Verified current
law: DPDP Rules 2025 notified 13 Nov 2025; substantive obligations commence **13 May 2027**;
SPDI/IT Act operates until then (legal doc §1).

### 7. What is clinically incomplete
No DDI rules · 1 drug class wired · free-text allergies (substring matching FP/FN risk) ·
no ICD-10 · static reference ranges · no retroactive alerts on profile edits · **and the
meta-gap: the entire rule set has never had clinical review** (NG-C01–C06). The engine is
honest about its limits (disclaimers, DRAFT rows never fire, 0-LLM by design) — it is
decision-support, not a safety net, until W2's sign-off exists.

### 8. What is visually weak
Not the design language — the tokens (deep teal, warm wash, single amber accent, Inter,
restrained radius/shadow, global reduced-motion) already match the brief's premium direction.
Weak in **application**: two visual tiers (premium landing vs utilitarian app shell), ad-hoc
spacing, no shared empty/error/section components, form errors as joined strings (NG-U01),
no automated a11y audit ever run (NG-U02), mobile breakpoints visually unverified (NG-U03),
no network-error states (NG-U07). The fix is a token/elevation pass, not a redesign
(NG-U06, Step 2 W13).

### 9. What could prevent Indian market adoption
Doctor time friction (any added step = rejection; first-visit data entry without ABHA is the
#1 friction — NG-F05) · Marathi/Hindi gap in a Marathi-first pilot city (NG-F03) · trust
deficit of a student-built product holding health data (mitigation exists: ledger + DPDP
posture + external review; brand trust needs a real pilot) · patient adoption without a
doctor on the other end (the patient is a passenger, the doctor is the driver — market doc
§3) · ABDM's own patient app improving the UX gap away · Hobby-tier hosting/ToS capping the
pilot (LG-24).

### 10. What must be fixed before a controlled pilot
The **12-item pilot gate** (Step 2 plan, final section): backup+restore drill (NG-S09) ·
clinical sign-off (NG-C06) · monitoring (NG-S10) · CI green (NG-S11) · prod e2e re-run
(NG-G04) · hardening batch (NG-S01/03/04/05) · e-mail + grievance officer (NG-F01/F02) ·
2FA (NG-S13) · Marathi/Hindi screens (NG-F03) · ICD-10 + reviewed rule pack (NG-C01–C05) ·
pilot env without demo data on ToS-permitted hosting (NG-S14, LG-24) · governance pack
(LG-21/22).

### 11. What must be completed before commercial launch
Everything in #10, plus: object storage at real volume (NG-D05) · org model if clinics pay
(NG-D03) · ABHA identifier + lookup (NG-F05) · load/concurrency proof (NG-P03/NG-D04) ·
payment/subscription (NG-F06) · key rotation (NG-G07) · DPDP 13-May-2027 commencement
re-check incl. cross-border list + SDF thresholds (LG-14/17) · counsel sign-off on the
pilot→commercial data terms.

### 12. What can wait until after product-market validation
PWA + Web Push (NG-U05/F08) · dark mode (NG-U04) · LazyMotion bundle trim (NG-P01) · ledger
archival (NG-D06) · OTS receipt upgrade (D55) · ADR writing (NG-G03) · lab/org staff roles
(NG-F07) · consent-manager integration beyond honouring withdrawals (LG-16) · ABDM
certification (a 6–9 month commercial decision, D10/NG-F05 phase 2).

---

## Overall assessment (genuine, per the project's rule 6)

This is **unusually well-built for a BCA final-year project** — the honest dev diary
(A1–A76), the database-enforced invariants, the zero-LLM clinical path and the pre-built
DPDP machinery put it ahead of the overwhelming majority of student healthcare projects,
and the audit found **no Critical defects in code**. The product's real risks are
**operational** (backup/monitoring/CI — all cheap fixes, Phase 1–2 of Step 2),
**governance** (clinical + legal sign-offs are external and must actually happen, not be
papered), and **market** (doctor-side time-friction and first-visit data entry are the
adoption killers; ABHA is the unlock). The architecture is right for the next several orders
of magnitude; the monolith stands; the trust stack is the defensible moat. Step 2, as
planned, is 16 focused workstreams — each verifiable, each with a completion criterion,
nothing hand-waved.
