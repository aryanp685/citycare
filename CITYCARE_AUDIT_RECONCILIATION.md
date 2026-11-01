# CityCare — Audit Reconciliation (Step 1 Final Consolidation)

_Consolidated 2026-11-01. Companion to `CITYCARE_MASTER_GAP_REGISTER.md` (the 73-row
register). This document is the audit-of-the-audit: every duplicate, conflict, and
reconciliation decision across the ten Step-1 deliverables, the two in-repo registers
(`web/DRAWBACKS_AND_BUGFIXES.md` A1–A76 / D1–D62, `web/LEGAL_COMPLIANCE_GAPS.md`
LG-01…LG-25), and the consolidation-time re-verification — with the rule applied and the
outcome for each case._

**Governing rules (from the consolidation brief):** documentation/analysis only; preserve
all finding IDs and original evidence/recommendations (reconcile, don't delete); new IDs
without overwriting; never delete original IDs (link duplicates, one primary per root
cause); distinguish sandbox vs production evidence; no production/legal/clinical/PMF
claims without verification; if a source doc is missing or repo access incomplete, say so.

## 0. Source coverage and completeness

**All ten Step-1 deliverables were read in full during consolidation** (listed in the
register §0) plus the three in-repo registers and the code/schema they cite. Repo access
was **complete for the tree at `main @ 9212ee4`** (179 ts/tsx files, 1,142 lines of schema
SQL, all `web/scripts`, all docs). Two access limitations, stated per the brief:

1. **Git history**: the sandbox checkout is a single-commit snapshot (NG-G06). During
   consolidation the remote branch was fetched, which **recovered the Step-1 commit
   `dcee992`** after a session reset had dropped the local ref — the Step-1 register,
   main report, and all ten docs were diffed against `dcee992` and found byte-identical,
   so no Step-1 content was lost or altered by the reset.
2. **Production**: `*.vercel.app` is unreachable from this sandbox (egress restricted to
   github.com / npmjs / pypi — verified by curl failure, 2026-11-01). **No production
   measurement is claimed anywhere**; production state is carried as NOT VERIFIED /
   BLOCKED (NG-G04, NG-P02, NG-P06).

**Missing-source check:** no source doc was found missing. One *expected* file is absent
**by audit finding, not by access failure**: `web/.env.example` (NG-G01 — referenced by
`START_HERE.md` but never created in the repo; verified by `find`).

## 1. Duplicate detection (12 cases, all linked, none deleted)

| # | Duplicate pair | Disposition |
|---|---|---|
| 1 | **NG-D08 ≡ NG-P03** (load/concurrency testing, listed under both Database and Performance in Step 1) | One primary: **NG-P03** (Platform section). NG-D08 kept as a pointer row in the Step-1 register; consolidated register lists it once, under F, with the alias noted. Not double-counted. |
| 2 | **NG-F09 ≡ NG-U04** (dark mode) | Primary **NG-U04** (UI section). Alias noted; not counted. |
| 3 | **NG-F10 ≡ NG-U05** (PWA/manifest) | Primary **NG-U05**. Alias noted; not counted. |
| 4 | **NG-U08 → NG-P01** (animation bundle: bundle-size half in P, runtime-pause half in UI) | One engineering effort, **one primary: NG-P01** (section F). NG-U08 kept as the UI-side ask ("pause out-of-view GSAP loops"), explicitly marked "Linked to NG-P01 (one primary)". Both are in the 73 count as *two distinct asks with one owner workstream* — this is the only deliberately-kept linked pair, because the acceptance criteria differ (gzip delta vs frame-rate pass). |
| 5 | **LG-02 → NG-F03** (Eighth-Schedule-language notice ↔ hi/mr UI) | One root cause: the language gap. LG-02 appears only in Appendix 5 (Linked). |
| 6 | **LG-06 → NG-C05** (FHIR portability "partial" ↔ no ICD-10 coding) | One root cause: uncoded diagnoses. LG-06 = Linked. |
| 7 | **LG-09 → NG-F02** (grievance officer duty ↔ officer envs unset) | One root cause: the appointment is empty. LG-09 = Linked. |
| 8 | **LG-13 → NG-F01** (breach intimation's e-mail leg ↔ no live e-mail delivery) | One root cause: the missing e-mail channel. LG-13 = Linked. |
| 9 | **LG-22 → NG-C06** (medical-advice boundary ↔ rule engine never clinically reviewed) | One root cause: the unreviewed rule pack. LG-22 = Linked. |
| 10 | **LG-12 residual → NG-S09** (reasonable-safeguards row, except "no backup/DR") | Cross-reference, not a new finding: the residual *is* NG-S09 (section A). LG-12 = "Met except backup". |
| 11 | **D15 (drawback) ↔ NG-L08/NG-L18** (erasure-vs-retention tension, documented) | The drawback row maps to the two legal findings (the *design* question splits into the erasure right and the retention duty). All three references kept. |
| 12 | **D11 (drawback "2 classes + 4 rules") ↔ NG-C01/NG-C02/NG-F11** | The drawback's claim is stale (see conflict #2 below); it maps to all three findings, and the register's code-verified state wins. |

**Result:** 56 Step-1 IDs → 56 carried (no deletion, no renumbering). 4 new non-legal IDs
(NG-S15, NG-S17, NG-F12, NG-F13) + 1 new process ID (NG-G08) + 12 new legal IDs
(NG-Lxx) = 17 issued. Total **73**.

## 2. Audit Conflicts and Reconciliation

_Conflicts found between source documents, between documents and code, or between audit
rounds — each with the rule applied and the resolution. (Register Appendix 2 carries the
same 12 entries in compact form; this is the detailed version.)_

### 2.1 Step-1 headline count (internal typo — fixed, recorded)
The first cut of the Step-1 register and main report headed "**39 findings / 2 High**".
The reconciled Step-1 count is **56 active findings (0 Critical / 3 High / 28 Medium /
19 Low / 6 Informational)**; the fix landed in both files **before** commit `dcee992`.
This consolidation does not inherit either headline — it **recomputes all totals from the
final 73-row table** (6 P0 / 13 P1 / 28 P2 / 20 P3 / 6 INFO; VERIFIED 63 · PARTIALLY
2 · BLOCKED 5 · NOT VERIFIED 1 · REPORTED 2). *Rule: computed, never manufactured.*

### 2.2 `FEATURES.md` "2 drug classes" vs code (code wins)
`web/FEATURES.md` states the interaction engine covers "drugs (2 classes)". Code
(`web/src/lib/rules.ts`, read 2026-11-01): **`PENICILLIN_CLASS` is the only class set
wired** (the "penicillin" allergy match, L37–L66); `NSAID_CLASS` (L39) is declared and
**never referenced** by any rule; the `DRUG_DRUG_INTERACTION` event type (L14) is
**never emitted**. The "2 classes" line also conflates the allergy matcher with the
(unbuilt) DDI rules. **Resolution: code wins.** Registered as NG-C01 (DDI absent +
NSAID dead) and NG-F11 (coverage = 1 real class); the D11 drawback row is cross-referenced;
the FEATURES.md line is slated for correction in W10 (acceptance criterion of NG-C01).

### 2.3 Step-1 register's own numbering notes (honoured)
The Step-1 register stated: "NG-S15 is unused (reserved); NG-D08 and NG-F09/NG-F10 are
aliases". Consolidation **honours both**: NG-S15's reserved slot is *assigned* (not
overwritten — the Step-1 doc explicitly left it open; the new finding is the demo
retention sweep, surfaced during consolidation because the Step-1 security review scoped
the sweep as demo-hygiene and did not model the pilot-env interaction); NG-G05 stays
reserved; the aliases stay pointers. No Step-1 ID was reused for a different meaning.

### 2.4 Stale root-level docs vs in-repo docs (document wins on its own territory, code wins on facts)
`START_HERE.md` / root `README.md` / `ci.yml` comment carry 2026-10-29-era numbers
(old URL `citycare-xi`, migrations 0001–0004, 131/217, 48/43, "file storage
unimplemented"). `web/README.md`'s dated verified blocks carry the 2026-11-01 state
(162/241, 0001–0005 + prebuild, `citycare-z95n.vercel.app`). **Resolution:** for *facts*,
the 2026-11-01 state wins (re-verified today: vitest 162/162, e2e 241/241 fresh seed,
build clean, BUILD_ID `z3V6kdcbj_3asdYqYEvJ4`); the stale files are registered as NG-G01
(sync them in W0). No Step-1 audit doc was found to contain a stale fact — the drift is
confined to the three root-level files + the ci comment.

### 2.5 Priority scheme change (Step-1 3-tier → consolidated 5-tier)
Step 1 graded P0/P1/P2 with execution tags (CODE/REALWORLD/BLOCKED). The brief's scheme
is P0–P3/INFO. Mapping applied: Step-1 P0/P1 carry over unchanged; Step-1 P2 rows were
re-slated by horizon — **exactly one row changed: NG-F07 (P2 → P3)**, because lab/org
staff roles are post-pilot scope and depend on NG-D03 (recorded in the finding and in
Appendix 2.9 of the register). All other Step-1 P2 rows stay P2; Step-1's P3/INFO rows
stay P3/INFO. The four new P0s (NG-S15, NG-L08, NG-L18, NG-L21) are consolidation
*additions* (a new finding / newly-registered legal rows), not re-grades of Step-1 rows.

### 2.6 The `ci.yml` committed `SESSION_SECRET` literal (INFO note, not a finding)
`.github/workflows/ci.yml` L22 commits a literal `SESSION_SECRET: ci-only-secret-…` for
the workflow's throwaway Postgres service container. Risk assessment: CI-only value,
throwaway DB, no PHI, Actions disabled (NG-S11). **Disposition:** not registered as a
finding (below the bar: no exploitable path), but recorded here and in Appendix 2.6 of
the register with the hygiene fix (rotate the literal, comment "CI-only", move to a
GitHub Actions secret once CI is enabled).

### 2.7 Session notice-version compare (minor, unregistered)
`session.ts` compares notice versions lexicographically on the `vYYYY-MM-DD` format —
correct today, fragile to a future non-zero-padded version. **Disposition:** unregistered
(no user-visible defect); folded into the W13/W6 hygiene pass (Appendix 6.12 of the
register lists it).

### 2.8 Sandbox vs production (global)
Every numeric claim in every source doc is a **sandbox** measurement. No source doc
claims production verification (verified by reading all ten). Consolidation re-ran the
full gauntlet 2026-11-01 (vitest **162/162** across 18 files, tsc clean, eslint clean,
build clean, e2e **241/241** on a fresh seed — all sandbox, embedded PG 18.6, `next
start`). **Resolution:** production items remain NOT VERIFIED / BLOCKED (NG-G04 owner
run, NG-P02 timing, NG-P06 p95); nothing is "upgraded" to verified by the consolidation.

### 2.9 Market and legal claims (REPORTED, cited — never verified-as-ours)
All ABDM figures (93.95 cr ABHA, 105 cr linked records, 2.72 lakh facilities, 450+
solutions — Mission Steering Group, 10 Jul 2026), DPDP commencement dates (G.S.R.
846(E), notified 13 Nov 2025; phases 13 Nov 2025 / 13 Nov 2026 / 13 May 2027; IT-SPDI
2011 in force until 13 May 2027), and competitor pricing brackets are **REPORTED with
citations** in the market/legal docs. **Resolution:** carried as REPORTED evidence; no
PMF/demand claim appears in any consolidated deliverable (NG-F13 records that primary
evidence does not exist).

### 2.10 Legal "compliance" language (none, by rule)
No consolidated deliverable claims DPDP *compliance*, NMC *approval*, or ABDM
*certification*. The register and scorecard use the five-bucket vocabulary from the
brief: verified legal requirements / needs-official-verification / needs-Indian-counsel /
ABDM-technical / best-practice. The only "compliance" statements that exist are the
app's own notice (pre-emptive, dated) and the LG matrix (obligation-by-obligation
status) — both preserved verbatim.

## 3. Evidence-quality register (per source doc)

| Source doc | Method | Re-verified 2026-11-01? | Notes |
|---|---|---|---|
| `CITYCARE_STEP_1_COMPLETE_AUDIT.md` | synthesis of the nine below | yes (all cited re-checks re-run) | 12 answers; headline fixed (2.1) |
| `CITYCARE_CURRENT_ARCHITECTURE.md` | inventory + reads | yes (counts re-grepped: 179 ts/tsx, 27 pages, 54 routes, 12,048 LOC) | version table matches `package.json`/PG |
| `CITYCARE_SECURITY_AUDIT.md` | code read + 17 HTTP probes | yes (probe script re-runnable; key probes re-run: CSRF 403/415, cron 401, health payload, HSTS absent locally) | §4 pen-test row → NG-S17 |
| `CITYCARE_DATABASE_AUDIT.md` | PG introspection (35 tables/45 FK/96 idx) | yes (introspection re-run on re-seeded DB) | dead-table sweep re-grepped |
| `CITYCARE_FEATURE_COMPLETENESS.md` | 37-row matrix vs code | yes (spot re-checks: F11 OCR DRAFT, F16 food pairs, F23 JSON export) | D11 stale line (2.2) |
| `CITYCARE_UI_UX_AUDIT.md` | component inventory + read-only viewport audit | yes (inventory re-grepped: ~40 components) | explicitly states no visual verification (NG-U03) |
| `CITYCARE_PERFORMANCE_AUDIT.md` | sandbox timings (labelled) | yes (build peak 5.85 GB re-confirmed in today's build) | all figures sandbox-labelled |
| `CITYCARE_INDIA_MARKET_RESEARCH.md` | desk research, cited | n/a (web citations; dates still current as of 2026-11-01) | REPORTED throughout (2.9) |
| `CITYCARE_LEGAL_COMPLIANCE_GAPS.md` | official-source date checks + code reads | yes (dates re-checked against the same official sources; code reads re-run) | 25-row matrix → 12 NG-Lxx + 5 links + 1 xref + 7 met |
| `CITYCARE_STEP_2_IMPLEMENTATION_PLAN.md` | planning (W0–W16) | n/a (plan) | consumed by the dependency map + recommendation |
| `web/DRAWBACKS_AND_BUGFIXES.md` | A1–A76 / D1–D62 registers | yes (D-table statuses re-verified; A-table test-pins green in today's run) | carried as Appendices 3–4 of the register |
| `web/LEGAL_COMPLIANCE.md` | in-repo legal doc | yes (runbook, notice text, sweep docs re-read) | basis for NG-L08/L18 framing |

## 4. What the audit did NOT cover (scope honesty)

1. **Production behaviour** (no egress) — NG-G04/P02/P06.
2. **Visual verification** (no browser) — NG-U03.
3. **Clinical review** (no physician engaged yet) — NG-C06.
4. **External assurance** (no pen test, no a11y tooling, no load test) — NG-S17/NG-U02/NG-P03.
5. **Credential-gated integrations** (DigiLocker, ABDM/HPR, Resend, DLT) — NG-L11/L19/F01/L25.
6. **Primary market research** (no interviews) — NG-F13.
7. **Post-13-May-2027 legal state** (future-dated) — NG-L14.

Each of these is a named, tracked finding — not a silent gap.

## 5. Consolidation-time new findings (5 code/doc + 12 legal rows)

| ID | Surfaced when | Why it was missed in Step 1 |
|---|---|---|
| NG-S15 | consolidation re-read of `cron/daily` | Step 1 scoped the 7-day sweep as *demo hygiene* (correct for the demo); the **pilot-env interaction** (real users erased on day 8) only becomes visible when the pilot is in scope — which it is now. |
| NG-S17 | consolidation of security doc §4 | Step 1 listed it as a BLOCKED requirement, not a register row; consolidation registered requirements that block the pilot as findings. |
| NG-F12 | consolidation re-read of `seed.mjs` | The seeded synthetic ratings look fine while the data is all synthetic; the consumer-perception problem appears once *real* users join the same site. |
| NG-F13 | consolidation of the market doc's scope statement | The market doc states its own scope (desk only); the *gap* (no primary research) is a finding only at consolidation, when "what must be true before a pilot" is the question. |
| NG-G08 | consolidation of the e2e harness vs the pilot-env plan (NG-S14) | The suite is healthy *on a demo env*; the coupling only matters once a demo-free env is planned. |
| NG-L07…L25 | consolidation of the LG matrix into the register's namespace | The matrix was a status document, not a register; the 12 gap rows needed permanent IDs, dependency edges, and acceptance criteria. |

## 6. Disposition summary

- **No original ID was deleted, renumbered, or re-purposed.** 56/56 Step-1 IDs carried.
- **17 new IDs issued**, none colliding (NG-S15 = assignment of an explicitly reserved
  slot; NG-G05 still reserved).
- **12 duplicates linked** (4 aliases, 5 LG-links, 1 LG-xref, 1 drawback 3-way), all with
  a single primary per root cause.
- **12 conflicts reconciled** with the code-wins / verified-wins / computed-not-
  manufactured rules; every reconciliation is traceable to a file + date in the register.
- **Sandbox vs production** kept separate in every finding; production remains NOT
  VERIFIED / BLOCKED until the owner's runs (NG-G04) and prod-side items (NG-P02/P06)
  happen.
- **No PMF, legal-compliance, clinical-safety, or ABDM-certification claim** appears in
  any consolidated deliverable.
