# CityCare — Step 2 Recommendation (Step 1 Final Consolidation)

_Consolidated 2026-11-01. The decision document: what to build next, in what order, with
what acceptance bar. It distills the 73-row `CITYCARE_MASTER_GAP_REGISTER.md`, the
`CITYCARE_IMPLEMENTATION_DEPENDENCY_MAP.md` (graph + 5 stages), the
`CITYCARE_AUDIT_RECONCILIATION.md`, and the `CITYCARE_READINESS_SCORECARD.md`. Full field
detail (evidence, impact, tests, acceptance) lives in the register under each ID; this
document is the sequence and the bar. Per the consolidation brief: **this document
recommends — it does not implement. Step 2 work starts only on the owner's go.**_

## 1. The recommendation in one paragraph

**Do not build features next. Do gates.** The system is a healthy, well-tested demo
(241/241 e2e, 162/162 unit, no known critical code defects) whose pilot path is blocked
by six P0 items that are all *governance and operations* items — backup/DR, the
pilot-env sweep guard, clinical sign-off, and the counsel-confirmed pilot governance
pack (erasure/retention design). The sequence: **Phase 1 (weeks 1–2, parallel external
engagements + P0 code guards) → Phase 2 (weeks 2–5, trust/hardening/monitoring/CI —
internal testing) → Phase 3 (weeks 4–8, the pilot itself: languages, clinical
expansion, org model, storage, env split) → Phase 4 (post-validation, only on a
commercial decision)**. Discovery (5–10 doctors, 10–20 patients) runs in Phase 2 and
feeds the Phase-3 charter — the pilot env is **not** stood up before the interview
notes exist. Total effort to pilot-ready: **~8 weeks of code work + the external
long-poles (physicians, counsel, ethics, owner runs)**, with no redesign, no new
platform, no new infrastructure beyond object storage and one paid plan decision.

## 2. Why this order (the three constraints that shape it)

1. **The P0s are the gate, and they are mostly non-code.** Clinical sign-off (NG-C06),
   the counsel pack (NG-L21/L08/L18), and ethics clearance are human engagements with
   the longest lead times — they start on day 1 and run parallel to all code work. The
   only P0s that are code are small: the backup/DR drill (NG-S09) and the sweep guard
   (NG-S15).
2. **The pilot env must be built *after* two inputs exist**: the discovery notes
   (NG-F13 — what the pilot actually tests) and the e2e dual-mode split (NG-G08 — the
   suite must run on a demo-free env before such an env can be verified). Building the
   env first is the classic expensive mistake this register is designed to prevent.
3. **External owner-side items cluster**: enabling CI (NG-S11), the prod e2e run
   (NG-G04), the Resend key (NG-F01), the officer appointment (NG-F02), and the
   pen-test budget (NG-S17) all need the owner. They are batched into Phase 2's first
   week as a single "owner day" — one sitting, five unlocks.

## 3. Phase 1 — P0 gates (weeks 1–2)

**Code (Small/Medium):**

| Item | ID | Acceptance criteria (measurable) |
|---|---|---|
| Backup + executed restore drill | NG-S09 | Drill output committed: date, RPO/RTO, `ledger_verify()` = 0 breaks on the restored DB, login works; dump failure observable |
| Sweep guard (pilot data-loss guard) | NG-S15 | 10-day-old self-registered account survives one cron run when the sweep is disabled; erased under demo config (behaviour preserved); `/api/health` reports the effective policy; boot warning on a non-demo env with the sweep active |
| Docs hygiene + `.env.example` | NG-G01 | Clean-checkout onboarding works; no stale number/URL in any root doc (spot-check list committed) |

**External (start day 1, parallel, no code):**
- **NG-C06**: engage 2+ practising physicians (1 GP + 1 specialist ideal). Bar: signed
  review covering **every live rule row** + severity mapping + disclaimer wording,
  artefact in `web/docs/clinical/`, `reviewedAt` on the med view, 6-month cadence.
- **NG-L21**: open the pilot governance pack — ethics clearance (college), informed-
  consent form (will need hi/mr per Phase 3), DPT template for pilot clinics, incident-
  contact sheet. Bar: every item with a signer + a date in `web/docs/pilot/`.
- **NG-L08 + NG-L18** (inside the pack): counsel review of the erasure/redaction design
  (D15) and the retention posture. Bar: written confirmations in `web/docs/legal/`
  naming the design docs reviewed; the erasure e2e stays green before/after.
- **NG-F13**: discovery sprint kickoff (owner's network; anonymised notes template in
  `docs/market/`; PHI-free by construction). Bar by Phase 2 end: ≥ 5 doctor + ≥ 10
  patient conversations documented; the pilot charter cites them.

**Phase-1 exit bar:** NG-S09 drill committed · NG-S15 guard tested · NG-G01 clean ·
physicians engaged with a review date · pack opened with named owners · counsel
engagement dated.

## 4. Phase 2 — Internal testing: trust, hardening, monitoring (weeks 2–5)

**The "owner day" (week 2, one sitting):** enable Actions (NG-S11) · run the prod e2e
(NG-G04 — one fresh run per seed/IP-window, with the 5-URL timing + cold-start curls) ·
provide the Resend key (NG-F01) · appoint the grievance officer (NG-F02) · approve the
pen-test budget + provider (NG-S17).

**Code (in dependency order):**

| # | Item | ID(s) | Acceptance criteria |
|---|---|---|---|
| 1 | CI green + branch protection | NG-S11 | Green Actions run on `main` (link committed); D59 closed |
| 2 | E2E dual-mode (unblocks the pilot env) | NG-G08 | Suite green in both modes: demo 241/241 + prod-mode profile (named skips) on a `SEED_DEMO=0` DB |
| 3 | Monitoring | NG-S10 | Induced 5-min staging outage → alert < 10 min (evidence committed) |
| 4 | E-mail leg (5 templates + `notification_log` + PHI-scan) | NG-F01 | PHI-scan test green (no clinical string in any template); consent request leaves a notification row (e2e) |
| 5 | Grievance officer live | NG-F02 | Named officer on the public page; submitted grievance → auditable timestamped trail (e2e) |
| 6 | Pen test | NG-S17 | Signed report; Critical/High fixed (register updated) or risk-accepted in writing |
| 7 | Second factor (passkeys + TOTP fallback) | NG-S13 | Passkey-only login e2e; stolen-password denied with a registered passkey |
| 8 | Hardening batch | NG-S01·S03·S05·S04·S06·S08 (+ INFO notes NG-S02·S12) | Per register: HSTS present on all paths (prod value consistent); boot fails fast without `DOCUMENT_KEY`; a deliberately-wrong consent writer cannot change the verdict (test); critical ledger events fail the request; 23505 mapped per constraint; cron rotation doc |
| 9 | a11y audit in CI + statement | NG-U02 | 0 critical axe findings on `main`; statement published (honest scope, no conformance %) |
| 10 | Load harness + published budget | NG-P03 | k6 run: 50-concurrent bookings + parallel ledger; p95/5xx published; budget (p95 < 800 ms @ 20 concurrent, 6 core calls) quoted with test date |
| 11 | Mobile visual pass + design elevation + error states + bundle | NG-U03·U06·U01·U07·P01/U08 | 320-px screenshots of all 27 pages, no h-scroll, no clipped modal text; tokens v2 + 3 shared state components + before/after of the 3 dense pages; no joined-string errors; killed-DB → retry UI; landing gzip −20 KB; no GSAP tick out of view |
| 12 | Schema/decision hygiene | NG-D02·D01·G03 | Drift check fails on intentional drift (or prisma file gone); every table has a status; 10 ADRs, all links resolve |

**Phase-2 exit bar:** all 12 rows green · discovery notes complete (NG-F13) · pen-test
report filed · the register's BLOCKED column shrinks to credential-only items
(NG-L11/L19).

## 5. Phase 3 — Pilot (weeks 4–8, clinic-mode, real data)

**Condition: the 12-item pilot gate is 12/12** (the gate is reproduced in
`CITYCARE_STEP_2_RECOMMENDATION` §6 and in the dependency map §5; it is the single
number that means "real data allowed").

| # | Item | ID(s) | Acceptance criteria |
|---|---|---|---|
| 1 | hi + mr patient surface | NG-F03 | E2E consent flow in hi and mr; per-locale 428 re-acceptance; native-review attestation + counsel skim of the consent text (in the pack) |
| 2 | Clinical expansion (all behind the Phase-1 sign-off) | NG-C01·C02·C04·C05·D07·F04·F11 | Every seeded DDI pair emits (e2e); allergy FP/FN matrix green; add-allergy → alert without a new encounter (e2e); FHIR bundle carries ICD-10 codes; encounter vitals are `Observation` rows (SQL-verified) + trend e2e; photo → confirmed med in ≤ 3 taps (DRAFT guard green); shipped pack named in the sign-off doc |
| 3 | ABHA field (self-attested) | NG-F05 | E2E store/display/export; invalid ABHA rejected; data dictionary states self-attested-until-verified |
| 4 | Org/clinic model | NG-D03 | Two clinics on one DB cannot read each other's data (test); clinic panel e2e; every `roles.ts` role reachable or removed |
| 5 | Object storage + pilot env split | NG-D05·S14·F12 | 0 document bytes in Postgres on the pilot env (query-verified); pilot URL has 0 seeded users, old demo creds → 401 (owner-verified); sweep off per NG-S15 config; no unlabelled synthetic ratings render (e2e + screenshots) |
| 6 | Hosting/commercial decision + its fixes | NG-L24·F06 → D04·P02 | Charter states posture + tier in one line; green burst run on the chosen connection path (NG-P03 harness); p95 first-touch < 1 s on pilot paths (prod, dated); suite green on the new host if moved; notice updated if the tier moves |
| 7 | Children's-data posture | NG-L11 | Charter states the attestation risk + mitigation; DigiLocker integration (e2e) when credentials exist — or documented acceptance |

**Riding the pilot (no build, calendar only):** NG-L16 consent-manager decision **by
13 Nov 2026** · NG-L14 cross-border re-check **at 13 May 2027** · NG-L17 SDF threshold
paragraph · NG-L07 counsel answer.

**Phase-3 exit bar (pilot success definition, pre-agreed with the pilot clinics):**
≥ 2 pilot clinics live for ≥ 4 weeks · 0 unmitigated P0/P1 findings open during the
period · the 12-gate items all still passing on the pilot env (re-run, dated) ·
pilot-charter success criteria met (defined in the charter from the discovery notes —
**no success criterion is invented here**, per the no-fabricated-claims rule).

## 6. The 12-item pilot gate (reproduced)

1. NG-S09 restore drill executed, output committed
2. NG-C06 clinical sign-off in-repo, covering every live rule row
3. NG-L21 governance pack complete (ethics, consent form, DPT, incident sheet, counsel)
4. NG-S15 sweep guard + pilot-env sweep-off verified
5. NG-S14 pilot env: 0 seeded users, old creds 401
6. NG-S10 monitor live; induced-outage alert < 10 min
7. NG-S11 CI green on `main` + branch protection
8. NG-G04 prod e2e numbers committed (both profiles)
9. NG-S17 pen-test report; Critical/High fixed or risk-accepted in writing
10. NG-F01 5 templates live + PHI-scan green; NG-F02 named officer on the public page
11. NG-S13 second factor live for doctor/admin
12. NG-D05 0 document bytes in Postgres on the pilot env

## 7. What Step 2 explicitly does NOT do (non-goals, reaffirmed)

- No LLM on the clinical path (determinism is the product's safety story).
- No microservices, K8s, Redis, or message queues — the demonstrated need (the
  dependency map) is met by one Next.js process + Postgres + one object store.
- No ABDM certification (6–9 months + STQC audit; the NG-L20 gate) and no ABDM *claim*
  anywhere (the ABHA field is identifier-only and says so).
- No payments before the commercial decision (NG-F06/NG-L24 are one coupled decision).
- No full UI redesign — the NG-U06 pass is tokens/elevation/shared-state components only
  (no glass, no gradients, no re-skinning of what works).
- No feature pre-builds for post-pilot scope (PWA, push, dark mode, lab roles, SMS,
  reminders) — they are registered with named re-triggers, not built on hope.
- No new claims of any kind: no PMF, no "NMC verified", no "DPDP compliant", no
  production numbers — until the corresponding evidence exists (owner runs, counsel
  artefacts, interview notes).

## 8. Risks to the plan (named, with mitigations)

| Risk | Likelihood | Mitigation |
|---|---|---|
| Physician/counsel lead times slip past the code track | Medium | External tracks start day 1 (Phase 1); code items that don't depend on them (Phase 2 rows 1–12) proceed regardless; the pilot gate, not the calendar, defines ready |
| Discovery notes contradict the assumed pilot shape (clinics, hi/mr, ABHA) | Medium | That is the point of NG-F13: the pilot charter is written *from* the notes, and any contradiction is a named decision before the env is stood up |
| Hobby build ceiling (5.85/6 GB) trips during Phase-3 builds | Low–Medium | The Phase-3.6 hosting decision includes a build-headroom check; the self-host path (Mumbai) is scripted, not hypothetical |
| Rate-limit pollution makes the prod e2e look red | High if run wrong | NG-G08's runbook is explicit: fresh seed, one run, the stated profile; D3 is documented as the known non-bug |
| A P0 slips past "pilot-ready" and surfaces in the pilot | Low (the gate re-runs) | The 12-gate is re-run dated on the pilot env before each clinic onboards; any red = that clinic waits, the pilot continues |

## 9. Definition of done for Step 2 (the whole thing)

Step 2 is **done** when: the pilot gate is 12/12 with dated evidence · ≥ 2 pilot
clinics have run ≥ 4 weeks · the register is updated so that every resolved finding
shows implementation + tests + acceptance pass + docs + (where applicable) prod
verification — **never "code added"** · the discovery notes + pilot charter are in
`docs/market/` and `web/docs/pilot/` · every non-goal in §7 was respected (auditable:
the diff contains none of them) · and the owner has seen a final Hinglish summary with
the same evidence discipline this consolidation used.

_Until that, the system stays exactly where the brief leaves it: a verified, synthetic-
data demo — and a named, gated path to a real pilot._
