# CityCare — Readiness Scorecard (Step 1 Final Consolidation)

_Consolidated 2026-11-01. Scores the system against six readiness dimensions. Every
score is anchored to findings in `CITYCARE_MASTER_GAP_REGISTER.md` (IDs cited) and to
evidence re-run 2026-11-01 in this sandbox (vitest **162/162** / 18 files · tsc clean ·
eslint clean · build clean, BUILD_ID `z3V6kdcbj_3asdYqYEvJ4` · e2e **241/241** fresh
seed · PG 18.6, 35 tables). Scale: **0–10** (0 = no capability, 5 = usable-with-known
gaps, 8 = strong, 10 = none known). **All measurements are sandbox** — production state
is separately marked NOT VERIFIED (NG-G04/P02/P06). No legal-compliance, clinical-safety,
or PMF claim is made (per the brief); the closest honest phrasings are quoted where they
matter._

## 1. Dimension scores

| Dimension | Score | One-line verdict | Headline blockers |
|---|---|---|---|
| Technical | **8/10** | Current, tested, no known critical code defects; unproven under load and unverified in production | NG-P03 (no load test), NG-G04 (prod unverified) |
| Security (code) | **8/10** | Genuinely strong control set for its scope — the weak spot is operations, not code | NG-S05 (latent consent invariant), NG-S04 (fail-open ledger writes) |
| Security (operations) | **3/10** | No backup, no monitoring, CI off, prod unverified, no pen test — every item is fixable in days-to-weeks, but together they are a P0 cluster | NG-S09, NG-S10, NG-S11, NG-G04, NG-S17 |
| Clinical | **4/10** | Deterministic, disclaimed, safely-guarded — but coverage is thin (1 class, no DDI) and the pack has never had clinical review | NG-C06 (P0), NG-C01, NG-F11, NG-C02 |
| Legal & regulatory | **6/10** | Best-in-class *pre-building* for DPDP 2027-05 (notice, consent, erasure, grievance, nomination, breach clock all in code) — zero sign-offs exist, and the pilot pack is absent | NG-L21 (P0), NG-L08/L18 (P0), NG-F01/F02 (channels empty) |
| Operational | **3/10** | One-person ops, no DR, no alerts, stale onboarding docs, single-commit sandbox — the demo runs, but nobody knows when it's down | NG-S09/S10/G01/G04 |
| Commercial | **3/10** | Honest desk research only; no interviews, no waitlist, no payment model; Hobby ToS caps non-commercial | NG-F13, NG-F06, NG-L24 |

**Overall for a controlled pilot: NOT READY yet — the 6 P0s are the gate** (NG-S09,
NG-S15, NG-C06, NG-L08, NG-L18, NG-L21; see the 12-item pilot gate in
`CITYCARE_STEP_2_RECOMMENDATION.md`). **Overall for the current public demo: healthy**
(241/241, synthetic data only, by design).

---

## 2. Technical — 8/10

**Strong (verified 2026-11-01):**
- Latest-stack discipline honoured: Next 16.3.6, React 19.3.0, Tailwind 4.3.3, Zod 4.6.5,
  Vitest 4.1.11, jose 6.2.12, pg 8.23, TypeScript 7.0.2 (native) + 6.0.2 (API), PG 18.6 —
  documented deviations (ESLint 9, raw `pg` + SQL instead of Prisma at runtime) are written
  down with reasons (standing rule 1; `CITYCARE_CURRENT_ARCHITECTURE.md` §5).
- 179 ts/tsx files, 27 pages, 54 API routes, ~12,048 LOC; **162 unit tests (18 files) and
  241 e2e checks — all green in the consolidation-time re-run** (fresh seed, single run).
- Schema: 35 tables, 45 FK, 35 unique/PK, 96 indexes; trigger-protected append-only ledger
  with `ledger_append`/`ledger_verify` (the A76 prebuild hook — build = schema sync — is
  the structural fix for the prod-drift class of bug).
- The ai_layer Python harness mirrors the TS rule engine (both suites green) — a genuine
  dual-language pin on the deterministic clinical path.

**Weak / unknown:**
- No load test of any kind (NG-P03) — the "100% systematic" claim has no measured ceiling.
- Production unverified since F5/F18 (NG-G04); the A76 incident proved this exact gap bites.
- Cold-start behaviour unmeasured in prod (NG-P02); Vercel Hobby build peak 5.85 GB vs a
  6 GB cap (Appendix 6.13) — headroom is thin, not broken.

## 3. Security — code 8/10 · operations 3/10

**Strong (code, verified by read + 17 HTTP probes + e2e):**
- Auth: scrypt N=2¹⁷ async, sliding lockout (15 min), per-IP rate limits, **server-side
  revocable sessions** (per-request DB join on `sid`), device list, one-time codes.
- Web: CSRF origin check (evil origin → 403 `csrf_origin`), JSON-only mutation guard
  (text/plain → 415 `json_only`), CSP frame-ancestors / XFO / nosniff / referrer-policy /
  permissions-policy in `next.config.ts`, HSTS platform-level (value NOT VERIFIED in prod —
  NG-S01/NG-G04).
- Data: AES-256-GCM file encryption (env key, `keyVersion` column present), 16 KB-capped
  trigger-protected ledger, erasure with redaction + blob cascade + ledger retention
  (D15 documented), demo 7-day retention sweep for self-registered accounts.
- Cron: single bearer secret, 20 s budget, LIMIT 200, probe-verified 401 without it.
- No secrets in any public payload (health endpoint probed: platform details only, A44).

**Weak (code, registered):** NG-S05 (the "newest consent row wins" invariant lives in
writer discipline, not the read), NG-S04 (a fail-open `.catch(()=>null)` on one ledger
write), NG-S03 (`DOCUMENT_KEY` HKDF fallback would make a documented rotation step destroy
all files), NG-S02/S06/S08 (low-severity hygiene).

**Weak (operations — the real score drag):**
- **No backup/DR of any kind (NG-S09, P0)** — one provider incident = total loss.
- **No external monitoring (NG-S10)** — the only heartbeat is the app probing itself.
- **CI disabled (NG-S11)** — regressions ship by hand; the gate exists and is green
  locally, it just never runs.
- **Prod unverified (NG-G04)**; **no pen test (NG-S17)**.
- The new consolidation finding **NG-S15**: the demo retention sweep is **live on the
  production instance** — correct for the demo, a silent real-user data-loss path if the
  pilot reuses the env. This is why the operations score is 3, not 4.

## 4. Clinical — 4/10

**Strong (verified):**
- The engine is **deterministic by construction** (table lookups, no LLM on the clinical
  path — a stated invariant, e2e-pinned), so "what did the AI hallucinate?" has the
  answer "nothing — these rows exist".
- Draft meds (OCR'd, unconfirmed) **never drive alerts** (`isConfirmedActiveMed`) — the
  safe default, test-pinned.
- Every alert is disclaimed ("verify before dispensing", "not a diagnosis"); the UI never
  claims a diagnosis or NMC verification.
- Both test suites (vitest + ai_layer unittest) pin the rule engine in two languages.

**Weak (registered):**
- **Never clinically reviewed (NG-C06, P0)** — the pack is student-curated; until two
  physicians sign, the honest statement is "decision-support aid with a disclaimer, not a
  safety net".
- **No DDI rules at all (NG-C01)** — the event type exists, is never emitted; `NSAID_CLASS`
  is dead. One class set is wired (`PENICILLIN_CLASS`, allergy matching).
- Allergy matching is substring-on-free-text with one cross-class special case (NG-C02);
  no retroactive alerts on profile change (NG-C04); no ICD-10 (NG-C05); static lab ranges
  (NG-C03); clinician-authored observations missing (NG-D07); OCR is simulated (NG-F04).

_Honest one-liner: the guardrails are excellent; the coverage and the sign-off are not
there yet. Both are buildable (W10 + W2) — the score reflects the gap, not the direction._

## 5. Legal & regulatory — 6/10

**Strong (verified in code + official-source date checks):**
- The DPDP 2027-05-13 Phase-3 deadline is **pre-built**: itemised versioned notice
  (LG-01), affirmative consent with in-tx artefacts (LG-03), one-tap withdrawal as easy as
  giving (LG-04), re-consent on notice change with a 428 gate (LG-05), full erasure +
  redaction (LG-08 mechanics), grievance desk with 30-day SLA (LG-09 mechanics),
  nomination (LG-10), breach incident register with a 72-h clock and one-click intimation
  (LG-13 mechanics), children's flow with minor self-registration refused + handover at 18
  (LG-11 mechanics), processor list in the notice (LG-15), OSS licence gate (LG-23).
- Dates verified against official sources (DPDP Rules 2025, G.S.R. 846(E), notified
  13 Nov 2025; phases 13 Nov 2025 / 13 Nov 2026 / 13 May 2027; IT-SPDI 2011 until
  13 May 2027). No false "verified/certified" claim anywhere in the UI (audited).
- Singapore hosting is **disclosed**; the Mumbai cutover is scripted (NG-L14 lever).

**Weak (registered):**
- **Zero sign-offs exist**: no ethics clearance, no counsel opinion, no pilot governance
  pack (NG-L21, P0). The erasure-vs-retention design (NG-L08) and the redaction-vs-
  statutory-retention design (NG-L18) are documented but **unconfirmed by counsel**.
- The **channels are empty**: no e-mail leg (NG-F01 — the breach runbook's "notify the
  principal" step has no delivery path), no named grievance officer (NG-F02).
- Dated duties ahead: consent managers from **13 Nov 2026** (NG-L16 — a design decision is
  due before the date); cross-border re-check at **13 May 2027** (NG-L14).
- Doctor verification is attestation-only (NG-L19 — no official lookup exists; scraping
  deliberately avoided); guardian age is self-declared (NG-L11 — DigiLocker BLOCKED on
  credentials).

_Honest one-liner: the app is built like a fiduciary that expects 13 May 2027; what it
lacks is the paper trail that makes "built" mean "confirmed"._

## 6. Operational — 3/10

- **DR: none (NG-S09)** — the single most dangerous zero in the register.
- **Monitoring: none external (NG-S10)**; **CI: off (NG-S11)**; **prod verification:
  stale (NG-G04)**.
- **Onboarding: broken for a new machine** — `web/.env.example` referenced but absent
  (NG-G01), root docs carry stale numbers/URLs.
- **One-person ops** with a long-pole external dependency graph (owner holds Vercel, Neon,
  Resend, counsel, physicians, ethics body — the dependency map's parallel tracks exist
  precisely because of this).
- The sandbox itself is a single-commit snapshot (NG-G06) — a process note, not product
  debt, but it shaped the audit's evidence method (file + date + re-run, not blame).
- Deploy path is proven end-to-end (A76: prebuild schema sync survived a real prod 500
  and fixed it — the one prod incident to date was caught by the A76 guard in the suite).

## 7. Commercial — 3/10

- **Validation: desk research only (NG-F13)** — strong cited sources (ABDM adoption
  figures, DPDP schedule, competitor pricing brackets) and zero primary evidence. Per the
  brief: **no PMF claim is made**; demand is explicitly unverified.
- **Positioning (from the research, REPORTED):** every EMR-first competitor in the
  ₹3 k–30 k/mo bracket (Practo Ray, HealthPlix, Eka Care, Cufront, etc.) lacks
  patient-controlled record + a DPDP-grade consent ledger — the differentiation is real on
  paper; the interviews will say whether it's real in clinics.
- **Constraints:** Vercel Hobby = non-commercial (NG-L24); no payment model by decision
  (NG-F06); Razorpay KYC not started. The hosting and the money are one coupled decision
  (Stage 3.6 of the dependency map).
- **Scale context (REPORTED):** ABHA ≈ 93.95 cr (10 Jul 2026, cited) makes the ABHA field
  (NG-F05) table-stakes for the pilot; full ABDM integration is deliberately deferred
  (NG-L20) with the honest cost named (6–9 months + STQC audit).

## 8. What would move each score (cheapest first)

| From → To | Dimension | Work (register IDs) | Effort |
|---|---|---|---|
| Ops 3 → 6 | Security-ops / Operational | NG-S09 drill + NG-S10 monitor + NG-S11 CI + NG-G04 run | days–1 wk (external: owner) |
| Legal 6 → 8 | Legal | NG-L21 pack + NG-L08/L18 counsel confirmations + NG-F01/F02 channels | 1–3 wks (external: counsel, owner) |
| Clinical 4 → 7 | Clinical | NG-C06 sign-off + NG-C01/C02/F11 pack (reviewed) | 1–2 wks + physician time |
| Tech 8 → 9 | Technical | NG-P03 load run + NG-G08 dual-mode suite | days |
| Commercial 3 → 5 | Commercial | NG-F13 discovery sprint | 1–2 wks (owner's network) |

_The six P0s are the difference between "healthy demo" and "pilot-ready". Everything in
the register is reachable; nothing in the register requires a redesign, a new platform,
or a feature nobody asked for._
