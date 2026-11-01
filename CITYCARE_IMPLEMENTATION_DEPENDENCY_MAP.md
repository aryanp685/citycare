# CityCare — Implementation Dependency Map (Step 1 Final Consolidation)

_Consolidated 2026-11-01. Maps the 73 findings in `CITYCARE_MASTER_GAP_REGISTER.md` into
a dependency graph and a five-stage order. Rule from the brief: order is
**dependency-aware** — nothing starts before its inputs exist; P0/P1 items carry
measurable acceptance criteria (in the register); resolution means implementation +
tests + acceptance pass + docs + (where applicable) production verification — never
"code added" alone. Stage vocabulary (per the brief): **1 Before dev continues · 2
Internal testing · 3 Pilot · 4 Public launch · 5 Postponable**._

## 1. Dependency graph (Mermaid)

```mermaid
graph TD
    subgraph S1["STAGE 1 — Before dev continues (P0 gates + hygiene)"]
        G01[NG-G01 docs/.env.example]
        S09[NG-S09 backup + DR drill]
        C06[NG-C06 clinical sign-off]
        L21[NG-L21 pilot governance pack<br/>(incl. NG-L08 + NG-L18 counsel)]
        S15g[NG-S15 sweep guard<br/>boot-warning + health fact]
    end

    subgraph S2["STAGE 2 — Internal testing (P1 trust + hardening)"]
        S11[NG-S11 CI on — owner]
        G08[NG-G08 e2e demo/prod modes]
        G04[NG-G04 prod e2e re-run — owner]
        S10[NG-S10 monitoring]
        S17[NG-S17 external pen test — budget]
        HARD[Hardening batch: NG-S01·S03·S05·S04·S06·S08<br/>+ INFO notes NG-S02·S12·G07]
        F01[NG-F01 e-mail leg — owner keys]
        F02[NG-F02 grievance officer — owner]
        S13[NG-S13 2FA/passkeys]
        U02[NG-U02 a11y audit in CI]
        D02[NG-D02 prisma drift check in CI]
        P03[NG-P03 load harness + budget]
        U03[NG-U03 mobile visual pass]
        U06[NG-U06 design elevation pass<br/>+ NG-U01·U07·P01/U08]
        D01[NG-D01 schema README status]
        G03[NG-G03 ADR set]
        F13[NG-F13 discovery sprint<br/>5–10 doctors + 10–20 patients]
    end

    subgraph S3["STAGE 3 — Pilot (clinic-mode, real data)"]
        F03[NG-F03 hi/mr patient surface]
        CLIN[W10 clinical expansion:<br/>NG-C01·C02·C04·C05·D07·F04·F11]
        F05f[NG-F05 ABHA field]
        D03[NG-D03 org/clinic model]
        D05[NG-D05 object storage]
        S14[NG-S14 pilot env split<br/>SEED_DEMO=0 + NG-F12 chip + NG-S15 config]
        HOST[W11 hosting/commercial decision:<br/>NG-L24 + NG-F06 → NG-D04 + NG-P02]
        L11p[NG-L11 pilot posture: attestation + risk note]
    end

    subgraph S4["STAGE 4 — Public launch (post-validation, commercial)"]
        F06b[NG-F06 payments — if commercial]
        U05[NG-U05 PWA/manifest]
        F08[NG-F08 push after PWA]
        F07[NG-F07 lab/org staff roles]
        L25[NG-L25 DLT/SMS gate]
        L20[NG-L20 ABDM certification — only if strategy changes]
        D06[NG-D06 ledger archival — if scale]
    end

    subgraph S5["STAGE 5 — Postponable (watch / no action)"]
        W1[NG-C03 lab age/sex bands]
        W2[NG-U04 dark mode]
        W3[NG-P04 rate-limit write — accepted]
        W4[NG-P05 no next/image — by design]
        W5[NG-P06 prod p95 — resolved by NG-G04 run]
        W6[NG-L07 correction trail — counsel question]
        W7[NG-L17 SDF threshold monitor]
        W8[NG-L16 consent-manager decision by 13 Nov 2026]
        W9[NG-G06 env note — none]
        W10[NG-S07·S16 observations — none]
        W11[NG-L14 re-check at 13 May 2027 — calendar item]
    end

    G01 --> S1
    S09 --> L21
    C06 --> CLIN
    L21 --> S3
    S15g --> S14
    S11 --> G04
    S11 --> U02
    S11 --> D02
    S11 --> G08
    G08 --> G04
    G08 --> S14
    G04 --> W5
    G04 --> P03
    F01 --> F02
    F01 --> L21
    F01 --> F08
    F13 --> L21
    F13 --> S14
    F13 --> HOST
    D03 --> F07
    D03 --> D01
    D05 --> D06
    P03 --> D04
    HOST --> D04
    HOST --> W2h[NG-P02 cold-start fix]
    U05 --> F08
    L21 --> F03
    F13 --> F03
    C06 --> F03
    S3 --> S4
    L20 -.-> S4
    L11p --> S4
    C06 --> C01x[NG-C01 DDI rules]
    C06 --> F11x[NG-F11 class pack]
    C01x --> CLIN
    F11x --> CLIN
```

*(Legend: solid = hard dependency (cannot start without); dotted = conditional. W11's
hosting decision couples NG-L24 (ToS) + NG-F06 (commercial) + NG-D04 (pooler) +
NG-P02 (cold start) — one decision, four register rows.)*

## 2. Stage 1 — Before dev continues (P0 gates + hygiene)

_The rule: no further feature development starts while a P0 is open. This stage is the
gate. All items are Small/Medium; the external ones (physicians, counsel, ethics body)
run in parallel from day one because they are the long pole._

| # | Finding | Work | Acceptance criteria (measurable) |
|---|---|---|---|
| 1.1 | **NG-S09** (P0) | Daily encrypted `pg_dump` under `CRON_SECRET` to a private object store (30-day retention) + restore runbook + **executed drill** | Drill output committed: date, RPO/RTO, `ledger_verify()` = 0 breaks on restored DB, login works post-restore; a dump failure is observable |
| 1.2 | **NG-C06** (P0) | 2+ practising physicians review every live rule row + severity mapping + disclaimer wording | Signed review doc (name, registration no., date) in `web/docs/clinical/`; its row list matches the DB (grep-check); `reviewedAt` on the med view; 6-month cadence documented |
| 1.3 | **NG-L21** (P0) | Pilot governance pack in `web/docs/pilot/`: ethics clearance, informed-consent form (hi/mr per NG-F03), DPT with pilot clinics, incident-contact sheet, counsel sign-off covering NG-L08/NG-L18/NG-L14 + hi/mr consent text | Every item exists with a signer + a date; the 12-item pilot gate (below) references it; counsel sign-off names the reviewed artefacts |
| 1.4 | **NG-S15** (P0) | Sweep guard: boot-time warning when the retention sweep is active on a non-demo env + `/api/health` reports the effective policy; pilot-env config set in 3.5 | Test: on a test DB with the sweep disabled, a 10-day-old self-registered account survives one cron run; on demo config it is erased (behaviour preserved); health fact present |
| 1.5 | **NG-G01** (P2) | Create `web/.env.example` (no values) + sync START_HERE/README/ci comments to the 2026-11-01 state | `cp .env.example .env.local` + bootstrap + build works on a clean checkout; no doc cites a number/URL the tests contradict (spot-check list committed) |

**Parallel external tracks (start day 1, no code):** physician engagement (1.2) ·
counsel engagement (1.3) · owner's Resend key request (2.6) · discovery sprint (2.13).

## 3. Stage 2 — Internal testing (P1 trust + hardening)

_Condition: Stage 1's 1.1–1.4 done (or, for 1.3, the pack's items have named owners +
dates — the code items below don't wait on the pack's paper items, only the pilot does)._

| # | Finding(s) | Work | Acceptance criteria |
|---|---|---|---|
| 2.1 | **NG-S11** (P1, owner) | Enable GitHub Actions; first green run; branch protection on | Green Actions run on `main` (link committed); D59 closed |
| 2.2 | **NG-G08** (P2) | Gate demo-dependent e2e checks behind `E2E_DEMO=1`; registration-based identities for prod mode; publish both expected profiles | Suite green in **both** modes on the sandbox (demo 241/241; prod-mode profile on a `SEED_DEMO=0` DB, N named skips) |
| 2.3 | **NG-G04** (P1, owner) | Fresh prod e2e run (one per seed/IP-window) + HSTS + 5-URL timing + cold-start curls | Prod numbers (pass/skip/fail + date) in README; HSTS value captured; timings recorded (resolves NG-P05/NG-P06 evidence) |
| 2.4 | **NG-S10** (P1) | Independent uptime probe on `/api/health` + alerting; DB alerts when the paid plan lands | Induced 5-minute outage in staging → alert received < 10 min (evidence committed) |
| 2.5 | **NG-S17** (P1, budget) | Scoped external pen test (this register's security sections = the scope document) | Signed report; every Critical/High fixed (register updated) or risk-accepted in writing |
| 2.6 | **NG-F01** (P1) | Resend transport (mock in dev) + 5 templates + `notification_log` + send-on-event | 5 templates live; `notification_log` queryable; PHI-scan test green (no clinical string in any template) |
| 2.7 | **NG-F02** (P1, owner) | Officer config + page render + SLA text + grievance log | Named officer on the public page; submitted grievance leaves an auditable trail with timestamps (e2e) |
| 2.8 | **NG-S13** (P1) | Passkeys (platform authenticators) + TOTP fallback for doctor/admin; security-panel credential list | Passkey-only login e2e; stolen-password simulation denied when a passkey is registered; e2e green |
| 2.9 | Hardening batch: **NG-S01** (HSTS in `next.config.ts` after the 2.3 curl), **NG-S03** (env-fail-fast + runbook fix), **NG-S05** (explicit consent-preference query + row-set matrix tests), **NG-S04** (fail-on-error for critical ledger events), **NG-S06** (23505 mapping by constraint), **NG-S08** (cron rotation doc) | One W6 batch | Per-finding acceptance from the register; the "wrong writer can't flip the verdict" test for NG-S05 passes |
| 2.10 | **NG-U02** (P2) | axe-core (Playwright) on the 8 key pages in CI; fix criticals; a11y statement | 0 critical findings on `main` (job link committed); statement published with honest scope |
| 2.11 | **NG-D02** (P3) + **NG-D01** (P2) + **NG-G03** (P3) | Drift check (or delete prisma file) in CI; schema README table-status column; 10 ADRs | Drift check fails on intentional drift; every table has a status; every ADR link resolves |
| 2.12 | **NG-P03** (P2) | k6 harness: 50-concurrent bookings + parallel ledger; written budget (p95 < 800 ms at 20 concurrent for the 6 core calls); published run | Green run + published numbers (date-stamped, in-repo); budget quoted on the pilot plan page |
| 2.13 | **NG-F13** (P2, owner time) | Discovery sprint: 5–10 doctor + 10–20 patient conversations | Anonymised notes in `docs/market/`; pilot charter cites them; contradictions are named decisions |
| 2.14 | **NG-U03** (P2) + **NG-U06** (P2) + **NG-U01/U07/P01/U08** | Mobile visual pass (320/375/768, all 27 pages) + design elevation (tokens v2, 3 shared state components, 3 dense pages) + field-mapped errors + segment error states + LazyMotion/GSAP pause | Archived 320-px screenshots, no h-scroll, no clipped modal text; token file + before/after of the 3 dense pages; no joined-string errors; killed-DB shows retry UI; landing gzip −20 KB; no GSAP tick out of view |

## 4. Stage 3 — Pilot (clinic-mode, real data)

_Condition: the 12-item pilot gate below is 12/12._

| # | Finding(s) | Work | Acceptance criteria |
|---|---|---|---|
| 3.1 | **NG-F03** (P1) | hi + mr patient surface (consent, rights, record, grievance); per-locale notice versioning | E2E consent flow in hi and mr; 428 re-acceptance fires per locale; notice lists all three languages |
| 3.2 | **NG-C01/C02/C04/C05/D07/F04/F11** (P2) | W10 clinical expansion, all behind the 1.2 sign-off: DDI rules + controlled allergy vocabulary + retroactive alerts + ICD-10 field + clinician-authored observations + client-side OCR + reviewed class pack | Per-finding acceptance from the register (DDI e2e for every seeded pair; FP/FN matrix; add-allergy→alert; FHIR carries codes; vitals are Observation rows; photo→confirmed med in ≤ 3 taps); sign-off doc names the shipped pack version |
| 3.3 | **NG-F05** (P1) | ABHA field (self-attested, regex-validated, in export) | E2E stores/displays/exports; invalid ABHA rejected; data dictionary states self-attested-until-verified |
| 3.4 | **NG-D03** (P1) | Org/clinic model (orgs + memberships + staff roles + clinic panel) | Two clinics on one DB cannot read each other's data (test); clinic panel e2e; every `roles.ts` role reachable or removed |
| 3.5 | **NG-D05** (P1) + **NG-S14** (P1) + **NG-F12** (P2) | Object storage (S3-compatible, re-wrap via `keyVersion`) + pilot env split (`SEED_DEMO=0`, sweep off per 1.4, 0 seeded users) + sample-data chip | 0 document bytes in Postgres on the pilot env (query-verified); pilot URL has 0 seeded users (owner-verified); old demo creds → 401; no unlabelled synthetic ratings render (e2e + screenshots) |
| 3.6 | **NG-L24 + NG-F06** (P2) → **NG-D04** (P2) + **NG-P02** (P2) | Hosting/commercial decision (Pro vs Mumbai vs community) + pooler/paid-Neon validation + cold-start fix | Charter states posture + tier in one line; green burst run on the chosen connection path; p95 first-touch < 1 s on pilot paths (prod, dated); suite green on the new host if moved |
| 3.7 | **NG-L11** (P1) | Pilot posture: attestation + disclosed self-declared DOB + risk note in the charter; DigiLocker in parallel | Charter states the residual risk + mitigation; integration shipped (e2e) when credentials exist — or documented acceptance |

**Calendar items riding the pilot (no build):** NG-L14 re-check at **13 May 2027**
(counsel) · NG-L16 consent-manager decision by **13 Nov 2026** (counsel + design note) ·
NG-L17 SDF threshold paragraph in the pack.

## 5. The 12-item pilot gate (all must pass before real data)

1. NG-S09: restore drill executed, output committed
2. NG-C06: clinical sign-off in-repo covering every live rule row
3. NG-L21: governance pack complete (ethics, consent form, DPT, incident sheet, counsel)
4. NG-S15: sweep guard + pilot-env sweep-off verified (10-day-old account survives)
5. NG-S14: pilot env with 0 seeded users, old creds 401
6. NG-S10: independent monitor live, induced-outage alert < 10 min
7. NG-S11: CI green on `main` + branch protection
8. NG-G04: prod e2e numbers committed (both profiles per NG-G08)
9. NG-S17: pen-test report; Critical/High fixed or risk-accepted in writing
10. NG-F01 + NG-F02: 5 templates live + PHI-scan green; named officer on the public page
11. NG-S13: second factor live for doctor/admin
12. NG-D05: 0 document bytes in Postgres on the pilot env

## 6. Stage 4 — Public launch (post-validation, commercial)

_Trigger: the pilot is done and the owner decides to go commercial/public. Nothing in
Stage 4 may start before that decision (the brief: no features to look advanced)._

| Finding | Work | Gate |
|---|---|---|
| **NG-F06** | Doctor subscription + Razorpay (KYC first) + plan gating | first payment e2e on a test account; hosting tier matches ToS (NG-L24) |
| **NG-U05** | PWA manifest + icons + offline shell (no PHI cached) | install on a real Android; SW scope test (no record URLs) |
| **NG-F08** | Web Push with opaque tokens | push e2e (subscribe → notify → deep link); opaque-token assertion |
| **NG-F07** | Lab/org staff roles (after NG-D03) | role e2e (lab user writes a value → provenance shows the role) |
| **NG-L25** | DLT registration + registered sender **before** the first SMS | the gate is the register row |
| **NG-L20** | ABDM certification track | only on a strategy change (a named decision) |
| **NG-D06** | Ledger archival (verify → cold → truncate-with-head-proof) | only when scale demands; truncation still passes `ledger_verify()` |

## 7. Stage 5 — Postponable (watch / no action — do not pre-build)

| Finding | Reason it's deferred | Re-trigger |
|---|---|---|
| NG-C03 (P3) | Lab age/sex bands — precision at the edges | pilot clinics ask for specific tests |
| NG-U04 (P3) | Dark mode — preference feature | W13 leaves room + clinic demand |
| NG-P04 (P3) | Rate-limit DB write — accepted design | scale evidence says otherwise |
| NG-P05 (INFO) | No `next/image` — by design (no images exist) | F11 photos / profile photos arrive |
| NG-P06 (INFO) | Prod p95 unknown — evidence gap | resolved by the NG-G04 run (2.3) |
| NG-L07 (P3) | Correction trail — a counsel question | counsel answers "required" |
| NG-L17 (P3) | SDF threshold — monitor | the pilot volume approaches the threshold |
| NG-L16 (P2, dated) | Consent managers — a dated design decision | 13 Nov 2026 (decision), CM-initiated withdrawal in practice (build) |
| NG-L14 (P2, dated) | Cross-border re-check — a dated legal duty | 13 May 2027 |
| NG-G06 (INFO) | Environment note | none |
| NG-S07 / NG-S16 (INFO) | Observations by design | none |

## 8. Explicit non-goals (preserved from the Step-2 plan, reaffirmed)

No LLM on the clinical path · no blockchain/external anchor upgrade · no ABDM
certification (NG-L20 gate) · no payments before the commercial decision · no
microservices/K8s/Redis (no demonstrated need — the app is a single Next.js process +
Postgres; the dependency map above is the demonstrated need, and it doesn't require
them) · no full UI redesign (token/elevation pass only) · no feature pre-builds for
Stage 4/5 scope.
