# CityCare — Legal & Regulatory Gap Matrix, India (Step 1)

_Audited 2026-11-01. **This is an engineer's compliance map, not legal advice.** It cross-checks
the repo's own register (`web/LEGAL_COMPLIANCE.md`, verified 28 Sep 2026) against official
commencement data re-verified by web research today, and adds the gaps that only an external
review can close. **Nothing here claims CityCare is "DPDP compliant" or "ABDM certified"** —
both are false as stated, and the product's UI never claims either._

## 1. Regulatory landscape — verified dates (research 2026-11-01)

| Instrument | Status (verified) | Source |
|---|---|---|
| **DPDP Act 2023** (Act 22 of 2023) | Presidential assent 11 Aug 2023; **phased commencement**: Sections 1(2), 2, 18–26 from 13 Nov 2025; substantive obligations (s.5 notice, s.6 consent, s.8 safeguards, s.9 children, s.10 SDF, s.11–14 rights, penalty provisions) from **13 May 2027** | Commencement notification G.S.R. 843(E), 13 Nov 2025 (as reported by 4 consistent secondary sources, incl. consult-ds.com, veritect.ai, infinitq, consentos.in — all agreeing on the three-phase dates) |
| **DPDP Rules 2025** | Notified **13 Nov 2025**, G.S.R. 846(E). Phase 1 (Rules 1, 2, 17–21 — Board provisions): in force. **Rule 4 (Consent Manager registration): 13 Nov 2026.** Rules 3, 5–16, 22, 23 (notice, consent mechanics, rights, breach r.7, retention r.8, grievance r.9, children r.10, SDF r.13, cross-border r.15): **13 May 2027** | dpdp-compliance.in rule-by-rule table (reviewed Sep 2026); consult-ds.com |
| Penalties | Up to **₹250 crore** for specified violations (per violation class) | Act s.28–34 (as cited in plan doc + secondary sources) |
| **IT Act 2000 s.43A + SPDI Rules 2011** | **Remain in force until DPDP's substantive duties commence (13 May 2027)** — so *today*, SPDI (health = sensitive personal data) is the directly operative regime; DPDP duties arrive May 2027 | veritect.ai (explicit statement); plan review doc |
| NMC / MCI Code of Medical Ethics 2002 | Reg 1.3.1: indoor patient records retained **3 years**; Reg 1.3.2: copy of records on request within **72 h** | plan review doc §10 (v2 correction) — **legal review to confirm current numbering** |
| DGHS Hospital Manual | Inpatient case sheets **up to 10 years**; MLC records 10 years; OPD 5 years | plan review doc §10 — **legal review** |
| Telemedicine Practice Guidelines 2020 | **Not applicable** — CityCare does no consultation/video/chat (recorded so nobody adds it casually) | `LEGAL_COMPLIANCE.md` §1 |
| Drugs & Cosmetics / Pharmacy Acts | **Not applicable** — nothing dispensed/sold; medication data is record-keeping only | `LEGAL_COMPLIANCE.md` §1 |
| Clinical Establishments Act 2010 | **Not applicable** — CityCare is not a clinic/hospital | `LEGAL_COMPLIANCE.md` §1 |
| Consumer Protection Act 2019 (misleading claims) | Applies if CityCare is a "service"; product copy already avoids "NMC verified" / "ABDM certified" / medical-device claims | `LEGAL_COMPLIANCE.md` §1; landing "Honest limits" |
| TRAI DLT registration | **Prerequisite for any transactional SMS in India** — SMS not implemented (correctly); e-mail scaffolded (Resend optional) | D3/D56 in DRAWBACKS |
| **ABDM** | Voluntary ecosystem. Certification path: M1→M2→M3 milestones, NHA functional testing, STQC/CERT-IN empanelled OWASP audit, Safe-to-Host — **6–9 months typical, impossible for the academic timeline** (D10). CityCare uses FHIR R4 *format* only; UI says "ABDM format", never "certified" | plan doc §0; `LEGAL_COMPLIANCE.md` §1 |
| Hosting / cross-border | Live: Vercel `sin1` + Neon **Singapore** (disclosed in privacy notice §5). DPDP s.16 + Rule 15 (transfer restrictions) **commence 13 May 2027**; as of 28 Sep 2026 no restricting notification applies — **must be re-checked at commencement; legal review** | `LEGAL_COMPLIANCE.md` §2 (s.16 row) |
| Vercel Hobby ToS / Neon Free | **Non-commercial only** — a paid/commercial pilot must move off Hobby (Pro, or Supabase Mumbai scripted: F21) | `LEGAL_COMPLIANCE.md` §1 |

## 2. Compliance gap matrix

Classification: **NOW** = applies today · **2026-11** = consent-manager framework ·
**2027-05** = DPDP substantive commencement · **ABDM** = only if integration pursued ·
**PRACTICE** = good-practice (not legally required yet) · **LREVIEW** = needs qualified
Indian legal counsel.

| # | Obligation | Status in code (evidence) | Gap | Action · Class |
|---|---|---|---|---|
| LG-01 | Plain-language itemised notice (r.3; s.5) | ✅ `/legal/privacy` rendered from `DATA_INVENTORY` in code; versioned; footer-linked | none for NOW (pre-emptive) | — |
| LG-02 | Notice in an Eighth-Schedule language (s.5(3)) | 🔶 hi/mr **key-points** only, flagged "pending legal-cell review" | full translation of notice + UI (L-G2, D17) | F15-b + legal-cell sign-off · NOW/PRACTICE/LREVIEW |
| LG-03 | Free, specific, informed consent by clear affirmative act (s.6; r.5) | ✅ two mandatory checkboxes, `z.literal(true)` server-side, `PolicyAcceptance` artefact in-tx, per-pair consent with scope/expiry | none for the consent mechanics | — |
| LG-04 | Withdrawal as easy as giving (s.6(4)) | ✅ one-tap per-doctor revoke + full erasure; reads/logout/grievance never gated (428 gate exempts them — by design) | none | — |
| LG-05 | Re-consent on notice change | ✅ banner + 428 `consent_outdated` on mutations until re-acceptance (L2) | none | — |
| LG-06 | Rights: access/portability (s.11) | ✅ FHIR R4 export + print summary + ledger view | FHIR mapping minimal (no ICD-10 codes) — portability is partial, honest | ICD-10 coding (NG-C05) · PRACTICE |
| LG-07 | Correction (s.12) | ✅ editable profile; observation delete = correction; med confirm flow | free-text clinical fields have no correction *trail* beyond ledger events (adequate, review) | LREVIEW |
| LG-08 | Erasure (s.12; r.8) | ✅ real erasure (delete + redact + blob cascade + sessions), ledger retained (deliberate, D15 documented); demo 7-day sweep | tension: erasure vs clinician retention duties is documented but **must be confirmed by counsel** for real (non-demo) data | LREVIEW · NOW |
| LG-09 | Grievance redressal officer + 30-day SLA (s.13; r.9) | ✅ in-app desk, 30-day clock, queue, ledgered | **officer name + monitored mailbox envs unset** (NG-F02) | set envs + appoint named officer · NOW/LREVIEW |
| LG-10 | Nomination (s.14) | ✅ nominee API + form, ledgered, erased with record | none | — |
| LG-11 | Children's data (s.9; r.10) | ✅ minor self-registration refused; guardian dependents flow; handover at 18; **guardian adulthood self-declared** (D48) | verifiable age/identity (DigiLocker token) — **blocked on partner credentials** | F13-b · 2027-05/LREVIEW |
| LG-12 | Reasonable security safeguards + logs ≥1 yr (s.8(5); r.6) | ✅ scrypt 2¹⁷, revocable sessions, rate limits, CSP/XFO, AES-GCM files, hash-chained ledger (trigger-protected), daily verify, anchors | **no backup/DR** (NG-S09) — "reasonable safeguards" for health data plausibly includes recoverability | backup + restore drill · PRACTICE→LREVIEW · NOW (before real data) |
| LG-13 | Breach intimation to Board + principals (r.7, 72 h) | 🔶 incident register + 72-h clock + one-click intimation (in-app) + r.7(2) report | **the e-mail/SMS leg to principals is not live** (no provider) — r.7 implies out-of-band notice where contact exists | Resend key + verified domain; DLT-registered SMS later · 2027-05/NOW-pilot |
| LG-14 | Cross-border transfer (s.16; r.15) | 🔶 Singapore hosting **disclosed**; no restricting notification as of 28 Sep 2026 | **re-check at 13 May 2027** (transfer-restriction notifications can be issued by rule); Supabase Mumbai cutover scripted as the residency lever | LREVIEW · 2027-05 |
| LG-15 | Processor contracts (s.8(2)) | ✅ Vercel/Neon DPAs by ToS, listed in notice | standard; refresh at renewal | — |
| LG-16 | Consent managers (Rule 4, from 13 Nov 2026) | ❌ not integrated | from **Nov 2026**, registered consent managers may give/withdraw consent on users' behalf and fiduciaries must honour; CityCare has no CM API path | decide: register as CM (unlikely for pilot) vs honour CM-initiated withdrawal (design task) · **2026-11**/LREVIEW |
| LG-17 | Significant Data Fiduciary duties (r.13: DPIA, data audit) | n/a at current scale (thresholds not met) | monitor thresholds; pilot with real data may approach them | LREVIEW at scale-up |
| LG-18 | Retention of medical records (NMC 3 yr / DGHS up to 10 yr) | ✅ app never claims a statutory period (A51 fixed false "7 years"); retention is configurable by policy | **the doctor's statutory duty, not the app's** — but CityCare must never *prevent* a doctor from keeping their record (erasure redacts, doesn't destroy clinician shells — D15) | counsel confirmation of the redaction design · LREVIEW |
| LG-19 | Doctor registration verification | 🔶 recorded attestation (register + "matched" + admin + date, ledgered); UI never says "NMC verified" | no official lookup API exists; scraping is deliberately not done (legally grey) | HPR/ABDM verification once credentials exist · ABDM |
| LG-20 | ABDM certification | ❌ deliberately not pursued (6–9 months + STQC audit) | none claimed, none implied (UI wording audited) | only if strategy changes · ABDM |
| LG-21 | Real patient data in a college project | ❌ all data synthetic + banner + 7-day sweep + `@demo.in` reserved | **a controlled pilot with real data needs: ethics clearance (college), informed-consent form beyond the app's, data-processing terms, incident contacts, and a qualified lawyer's sign-off** — none exist yet | pilot governance pack · LREVIEW · before any real data |
| LG-22 | Medical-advice boundary | ✅ no LLM clinical path; rules engine is deterministic + disclaimed ("not a diagnosis"); clinical disclaimers on record views | the rules engine *informs* doctors — ensure disclaimers + clinical review (NG-C06) so alerts are decision-support, not advice | clinical + legal review · NOW (pilot) |
| LG-23 | OSS/licences | ✅ 361 prod packages, no copyleft (gate script), Inter OFL self-hosted, GSAP No-Charge licence | re-run gate after any dep change (CI does) | — |
| LG-24 | Non-commercial hosting (Vercel Hobby) | ✅ Terms §1 states non-commercial | **commercial pilot must move hosting** (Pro / Mumbai) | F21 / Vercel Pro · commercial-launch |
| LG-25 | DLT/SMS | ❌ no SMS (correctly) | before any SMS: DLT registration + registered sender | F9-extended · LREVIEW |

## 3. Separation the brief demands (explicit)

- **Current legal requirements (today, NOW-class)**: SPDI/IT Act duties are the operative
  regime until 13 May 2027 — CityCare's security posture already exceeds them (it was built
  to the DPDP target). Concrete NOW items: LG-09 (officer), LG-12 (backup), LG-13 (breach
  comms leg), LG-21 (pilot governance), LG-22 (clinical boundary).
- **Future commencement**: 13 Nov 2026 — consent-manager framework (LG-16); **13 May 2027 —
  the whole DPDP substantive regime becomes enforceable** (LG-02, LG-08, LG-11, LG-13, LG-14,
  LG-17). The code is pre-built for it; the *legal review* is what's missing.
- **ABDM integration requirements**: LG-19/20 — only if pursued; requires HFR facility
  registration, HPR professional verification, M1–M3 + STQC audit (6–9 months).
- **Good security practice (not yet law)**: backup/DR (LG-12), external monitoring (NG-S10),
  ICD-10 coding (LG-06), 2FA (NG-S13).
- **Requiring qualified Indian legal review**: LG-02 (translations), LG-07/08 (correction &
  erasure design), LG-09 (officer appointment), LG-14 (cross-border at 2027-05), LG-16 (CM
  posture), LG-18 (retention design), LG-21 (pilot data governance), LG-22 (advice boundary).
  **The repo's own rule (LEGAL_COMPLIANCE.md §0) says the same: "Get this reviewed by the
  college's legal cell before any non-demo use."**

## 4. Unresolved legal questions (honest list — do not close without counsel)

1. Does the *redacted-but-retained* doctor shell + retained ledger after patient erasure
   satisfy both DPDP erasure and NMC retention simultaneously? (Design intent says yes;
   counsel must confirm.)
2. At what scale does CityCare approach Significant Data Fiduciary thresholds, and what
   triggers DPIA duties?
3. Is the self-declared guardian DOB defensible under r.10 "due diligence" pre-DigiLocker,
   and what must the notice say? (Current copy says "self-declared" — likely sufficient,
   confirm.)
4. Cross-border: will the 2027-05 transfer-restriction list include Singapore for health
   data? (If yes, F21 Mumbai cutover is mandatory before the date, not after.)
5. Does a patient-owned record used for *consent management* with providers create any
   data-fiduciary chain for the providers (i.e., does the app become a processor for
   them)?
6. Who is the "grievance officer" legally — and does a college project get to appoint one?
7. AbDM: if CityCare ever stores ABHA numbers, what are the ABHA app/API terms of use?
8. Consumer Protection: does a free patient tool with a paid doctor tier still trigger the
   misleading-claim provisions in the current copy? (Probably fine — copy is careful;
   confirm at launch.)
