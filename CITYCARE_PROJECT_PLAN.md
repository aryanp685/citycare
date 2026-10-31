# CityCare — Honest Project Teardown & Build Plan (v2 — corrected 28 Sep 2026)
### Final Year Group Project · G H Raisoni College (Dept. of Science & Technology) · Team of 5

> **v2 note:** ye plan 19 Sep ko system banne se *pehle* likha gaya tha. Jo cheezein galat/stale thin unhe
> yahin inline `[v2: …]` se theek kiya hai; poora plan-vs-built audit, drawback register (39 items) aur
> roadmap **`PLAN_REVIEW_AND_DRAWBACKS.md`** mein hai. Live app: https://citycare-xi.vercel.app
*Prepared 19 Sep 2026. Verified artifacts live in `citycare/schema/`.*

---

## 0. Sabse pehle — sach batao, tumhara idea kaisa hai?

**Achha idea hai. Genuinely achha.** Lekin tumhare plan mein **ek line galat hai**, aur wahi line
project ko viva mein phasa degi:

> ❌ *"it will be available to any doctor he visits"*

Ye technically possible nahi hai, legally allowed nahi hai, aur koi hospital tumhe apna data
dhega bhi nahi. Isse pehle samjho kyun — phir main tumhe **isika behtar version** dunga jo
bana sakte ho.

### Kyun "any doctor" wala model fail hota hai

| Problem | Detail |
|---|---|
| **Legal** | DPDP Act 2023 ke Rules **13 Nov 2025** ko notify ho gaye. Health data pe **explicit, specific, informed consent** zaroori hai — "ek baar sign up kiya, sab doctors ko mil jayega" ye consent nahi hai. Penalty ₹250 crore tak. |
| **Practical** | Har hospital ka apna EMR hai (Practo, Cliniify, MedPlus, custom). Unke paas **zero incentive** hai tumhare student project ke saath integrate hone ka. Hospital IT dept 6 mahine meeting bulaayegi, phir mana kar degi. |
| **Liability** | Galat data ki wajah se kisi patient ko nuksaan hua → hospital + tum dono pe case. Koi hospital ye risk nahi lega. |
| **Existing** | Government ne ye already bana diya hai — **ABDM / Ayushman Bharat (ABHA ID)**. Tum "doosra ABDM" bana rahe ho ye bolke project reject ho sakta hai. |

**ABDM reality check:** ABDM certified hone ke liye M1→M2→M3 milestones, NHA functional testing,
aur STQC/CERT-IN empanelled agency se OWASP audit + "Safe-to-Host" certificate chahiye.
Greenfield build ka typical time **6–9 months** sirf certification ke liye. BCA project ke
8 mahine mein ye possible nahi.

---

## 1. ✅ Reframe — ye karo, project strong ho jayega

> **"CityCare ek patient-owned health record hai. Patient decide karta hai kaunsa doctor,
> kitna record, kitne time ke liye dekh sakta hai — aur patient ko dikhta hai ki kisne kab
> uska data padha."**

Ek line mein: **Doctor data maangta hai → Patient grant karta hai → Access expire hota hai →
Audit log banta hai.**

Ye teen kaam karta hai:

1. **Legally sahi** — DPDP ke consent model se exactly match karta hai.
2. **Ban sakta hai** — kisi hospital ki permission ki zaroorat nahi. Patient khud upload karta hai.
3. **ABDM ka *complement* hai, clone nahi** — tum ABDM ke **sandbox** pe demo karke dikhao
   (`dev.abdm.gov.in`, header `X-CM-ID: sbx`) ki tumhara system ABHA/FHIR-ready hai.
   Ye tumhara **external examiner killer feature** hoga.

**Ek concept jo tumhe samajhna chahiye:** healthcare mein sirf **patient** wo entity hai jo
saare hospitals se guzarta hai. Hospital ek jagah tikta hai, doctor badalta hai, patient hi
sabko jodta hai. Isliye record patient ke naam pe hona chahiye, hospital ke naam pe nahi.
**Ye hi tumhare project ka core insight hai — viva mein yahi bolo.**

---

## 2. Pros (kya genuinely strong hai)

| # | Pro | Kyun matter karta hai |
|---|---|---|
| 1 | **Real problem hai** | Pune jaise city mein 60-saal ka diabetic patient 8 doctors ke paas jaata hai. Har doctor same 12 test dobara likhta hai. Ye waste measurable hai. |
| 2 | **Longitudinal record** = genuine technical depth | 10 alag jagah ke records ko ek timeline mein stitch karna — ye "CRUD app" se clearly upar hai. |
| 3 | **Consent + audit log** = security story | Bahut se student projects mein security ka section hota hi nahi. Tumhara pura ek module hoga. |
| 4 | **AI layer justified hai** | Yahan AI *zaroori* hai, decoration nahi — 15 saal ke unstructured PDFs ko structured summary mein badalna LLM ka legitimate use case hai. |
| 5 | **Multi-role system** | Patient / Doctor / Hospital Admin / Lab — 4 logon ke liye 4 alag kaam easily banta hai. Group project ke liye perfect. |
| 6 | **India-specific** | ABHA, Marathi/Hindi UI, "1-0-1" dosage format, ₹ fees — examiner ko local relevance dikhti hai. |
| 7 | **Measurable KPI** | "Duplicate test reduced", "time-to-first-diagnosis", "record completeness %" — tum numbers dikha sakte ho. |

---

## 3. Cons + unke alternatives (ye section sabse important hai)

| # | Con | Reality | ✅ Alternative |
|---|---|---|---|
| **C1** | **Hospitals integrate nahi honge** | 100% true. | **Patient-upload model.** Patient purani reports ka photo/PDF daalta hai. OCR + AI se structured ban jaata hai. Doctor side se "encounter create" karo jab wo CityCare pe ho. |
| **C2** | **Scope bahut zyada** — 6 features, 4 log, 8 mahine | Ye #1 reason hai projects adhoore reh jaate hain. | **Sirf 3 modules P0 banao** (niche §5 dekho). Baaki sab "Phase 2" slide mein daalo. Ek *complete* 3-module app > 6 aadhe modules. |
| **C3** | **AI hallucinate karega** — galat summary = galat ilaaj | Bahut serious. Doctor pe bharosa karega. | **AI kabhi decision na le.** Rule-engine pehle (deterministic), AI baad mein. Har AI output pe `confidence` + **"AI-generated — verify with records"** badge + doctor ka *Approve/Correct* button. Prompt version DB mein store karo (`AiSummary.promptVersion` — schema mein already hai). |
| **C4** | **OCR handwritten prescriptions pe fail hoga** | Indian doctor handwriting pe OCR ~40-60% accurate. | Do-track: (a) printed lab reports → Tesseract, high accuracy; (b) handwritten → **doctor structured form bhare** (10 fields), ya patient *voice input* kare. OCR ko "assist" banao, "source of truth" nahi. |
| **C5** | **Real patient data nahi mil sakta** | Ethics + DPDP. | **Sirf synthetic data.** 20-25 fake patients ka realistic dataset banao (main schema ke saath demo data daal chuka hoon). Report mein likho: *"no real patient data was used; all records are synthetic."* Ye line tumhe protect karegi. |
| **C6** | **Consent fatigue** — har visit pe patient approve karega? | UX mar jaayegi. | **Smart defaults:** appointment book karte hi 7-day scoped consent auto-request. Patient ek screen pe *Allow / Deny*. Visit khatam → **auto-revoke** (`Patient.autoRevokeAfterVisit` schema mein hai). Emergency ke liye **break-glass** access jo hamesha audit ho. |
| **C7** | **Doctor adoption zero hoga** | Doctor ka time paisa hai. | Doctor ke liye **ek hi screen** banao: timeline + AI summary + allergies. 30 second mein pura history. Ye unka *pitch* hai. Demo mein yahi dikhao. |
| **C8** | **Security ka bojh** | Health data = highest risk. | Project ke liye: argon2id hashing, AES-256-GCM file encryption, JWT httpOnly cookie, append-only audit log (schema mein DB trigger se *enforce* kiya hai — niche proof hai), signed URLs for downloads. **Ye sab implement karo, sirf likhna nahi.** |
| **C9** | **"Blockchain" ka temptation** | Bahut se groups ye karte hain — aur 40% marks khaate hain. | **Blockchain mat lagana.** Append-only audit log + hash chain wahi guarantee deta hai, 1/100th complexity mein. Agar examiner pooche: *"consensus latency aur storage cost clinical workflow mein justify nahi hota."* |
| **C10** | **Payment gateway** | Razorpay sandbox approval + KYC lagta hai. | Appointment **free** rakho ya "pay at clinic" model. Payment ko scope se hata do. |

---

## 4. "Problem solving" kaise banta hai (examiner yahi poochta hai)

Sirf features list karna problem-solving nahi hai. Ye 4 cheezein chahiye:

### 4.1 Problem statement (ek paragraph, report ke liye)
> Ek sheher ka patient apni life mein 8–15 alag healthcare providers ke paas jaata hai. Har
> provider ke paas uska ek isolated record hai. Kisi naye doctor ke paas pehle ka diagnosis,
> allergy, ya chal rahi dawa ka koi access nahi hota. Iska seedha result hai: duplicate lab
> tests (₹ + radiation), drug-allergy conflicts, aur repeated history-taking mein 10–15 minute
> ka waste. CityCare patient ko uske health record ka **owner** banata hai aur consent-based,
> time-limited, audited sharing ke through doctors tak pahunchata hai.

### 4.2 Measurable outcomes (ye sabse zyada marks laata hai)

| KPI | Kaise measure karo | Demo mein kya dikhao |
|---|---|---|
| **History-taking time** | 25 synthetic patients pe manual vs CityCare | *"12 min → 40 sec"* |
| **Duplicate tests avoided** | Same test 90 din ke andar dobara order hua? | Count karo, number dikhao |
| **Record completeness %** | Kitne patients ke paas allergy + current meds + last 3 encounters hai | Gauge chart |
| **Drug-alert catch rate** | Kitne prescriptions pe allergy/interaction pakda gaya | *"23 me se 4 risky prescriptions flagged"* |
| **Consent revocation latency** | Revoke karte hi doctor ka access khatam — seconds mein | Live demo, stopwatch |

**Ye numbers tum synthetic data pe khud generate kar sakte ho** — aur ye tumhare project ko
"banaya hua app" se "research" bana dete hain.

### 4.3 User personas (report mein 3 banao)
- **Ramesh, 58** — Type 2 diabetic, 4 hospitals, records ek plastic file mein.
- **Dr. Kulkarni** — cardiologist, 40 patients/day, 6 min per patient, history repeat sun-ne ka time nahi.
- **Sneha, 26** — apni budhi maa ke liye record manage karti hai (→ *caregiver/proxy access* feature, ye ek extra credit hai).

### 4.4 Ye **nahi** hai (scope out — report mein explicitly likho)
Real hospital integration · real payment · telemedicine video · insurance claims · pharmacy
delivery · real ABDM production certification · medical advice without a doctor.

---

## 5. Features — P0 / P1 / P2 (yahi discipline project bachayegi)

### 🔴 P0 — ye 5 bina inke project nahi hai
1. **Patient onboarding + profile** — ~~OTP login~~ email+password login [v2: OTP ke liye paid SMS gateway + DLT registration chahiye → roadmap R6], demographics, blood group, allergies, chronic conditions, current meds. ✅ built
2. **Longitudinal timeline** — ek screen pe saare encounters, reports, meds, labs, date-wise. **Ye tumhara hero screen hai.**
3. **Appointment booking** — doctor search (specialty/city/fee/rating) → slots → book → confirm/cancel/reschedule → token number.
4. **Consent & scoped sharing** — doctor request kare → patient allow/deny → scope (full / last-N / specific docs) → expiry → revoke → **auto-revoke after visit**.
5. **Append-only audit log + patient transparency screen** — "kisne, kab, kya dekha".

### 🟡 P1 — ye add karo agar 3 mahine bache
6. **Document upload + OCR** — PDF/image → Tesseract → text.
7. **AI clinical summary** — LLM se 3-line headline + active issues + red flags. **Doctor approve kare tabhi "verified" bane.**
8. **Rule-based alerts** — drug-allergy conflict, abnormal lab vs reference range, follow-up due, refill due. *(Ye deterministic hai — AI se zyada reliable, aur viva mein defend karna easy.)*
9. **Doctor encounter form** — complaint, diagnosis (ICD-10 dropdown), prescription, follow-up.
10. **Notifications** — appointment reminder, consent request, report ready.

### 🟢 P2 — sirf presentation slide mein, code mat karo
ABDM sandbox ABHA linking · FHIR R4 export/import · caregiver access · Marathi/Hindi UI ·
dark mode · offline PWA · analytics dashboard for hospital admin · voice input for elderly.

> **Rule:** P0 complete + tested > P0+P1 half done. Examiner *chalta hua demo* dekhta hai,
> feature list nahi.

---

## 6. Tech stack (recommended, aur kyun)

| Layer | Choice | Kyun |
|---|---|---|
| **Frontend** | Next.js 16 [v2] (App Router) + TypeScript + Tailwind + shadcn/ui | Ek hi repo mein UI + API. BCA ke liye fast. Free Vercel deploy. |
| **Backend** | Next.js Route Handlers **ya** NestJS (agar 4 log alag-alag backend pe kaam karna chahein) | Route handlers = simple; NestJS = better separation for group work |
| **DB** | **PostgreSQL** (schema Prisma se generate hua; **runtime pe raw `pg` + `$n` placeholders**, Prisma nahi) | Relational health data ke liye relational DB hi sahi. `pg` isliye: Cloudflare Workers pe bhi chalta hai, zero ORM overhead. [v2] Migrations ke liye `dbmate` adopt karna baaki hai (R13). |
| **Files** | **Supabase Storage** (signed URLs) — **[v2: abhi koi file storage nahi hai; paste-OCR text → DRAFT meds. Roadmap R3.]** | **File kabhi DB mein mat daalo.** Sirf `storageKey` DB mein. |
| **Jobs** | ~~BullMQ + Redis~~ **[v2: hata diya — abhi kuch bhi itna slow nahi hai. OCR/LLM aane par wapas.]** | |
| **OCR** | Tesseract.js (free, offline) | Student budget friendly. |
| **AI** | Gemini API (free tier) **ya** Ollama + Llama 3.1 8B (local, privacy demo) | Local model chala ke dikhao = examiner impress + "data server se bahar nahi gaya" bol sakte ho. |
| **Drug interactions** | ~~RxNav API `interaction.json`~~ **[v2: RxNav Interaction API Jan 2024 se band hai — koi replacement nahi.]** Abhi: curated drug-class ↔ allergy table (`src/lib/rules.ts`). Aage: RxClass export (class membership abhi bhi free), curated top-50 pairs, openFDA label text, DrugBank academic licence | Khud full interaction DB banana impossible; isliye *classes* + curated pairs, aur har alert ke saath source. |
| **FHIR** | `fhir/r4` npm types + ek chhota mapper | ABDM-ready dikhane ke liye. |
| **Auth** | **[v2 built]** scrypt N=2^17 (OWASP bar) + HS256 JWT httpOnly cookie (7 din), 15-min timed lockout. **Nahi bana:** refresh token, TOTP, password reset (roadmap R6/R7) | |
| **Deploy** | **[v2 live]** Vercel Hobby (`sin1`) + Neon Singapore → **Supabase Postgres Mumbai + `bom1`** (scripted, `web/DEPLOY_SUPABASE.md`); Cloudflare Workers path bhi ready | Free tiers — **Hobby non-commercial only**, koi backup nahi: report mein disclose karo. |

**Avoid:** MongoDB (health data relational hai), blockchain, microservices, Kubernetes,
GraphQL (overkill).

---

## 7. Architecture

```
                    ┌─────────────────────────────┐
                    │   Next.js App (Vercel)      │
                    │  /patient  /doctor  /admin  │
                    └──────────┬──────────────────┘
                               │  REST + JWT (httpOnly cookie)
                    ┌──────────▼──────────────────┐
                    │      API Layer (RBAC)       │
                    │  zod validation │ rate limit│
                    └─┬────────┬─────────┬────────┘
                      │        │         │
          ┌───────────▼──┐  ┌──▼──────┐  ┌▼─────────────┐
          │ PostgreSQL   │  │  MinIO  │  │ Redis/BullMQ │
          │ (Prisma)     │  │ (S3)    │  │ job queue    │
          │ 25 tables    │  │ AES-256 │  └──┬───────────┘
          │ audit trigger│  │ -GCM    │     │
          └──────────────┘  └─────────┘  ┌──▼───────────────────┐
                                         │ Workers              │
                                         │ • Tesseract OCR      │
                                         │ • LLM summariser     │
                                         │ • RxNav interaction  │
                                         │ • SMS/Email notify   │
                                         └──┬───────────────────┘
                                            │
                              ┌─────────────▼──────────────┐
                              │ External (read-only, free) │
                              │ ABDM sandbox · RxNav · LLM │
                              └────────────────────────────┘

  EVERY clinical read ──► AuditLog (append-only, DB-trigger protected)
```

### Data flow — consent (ye diagram report mein zaroor daalo)

```
Patient            Doctor            System
  │                  │                 │
  │  book appointment│                 │
  │─────────────────►│                 │
  │                  │  Consent(REQUESTED, scope=LAST_5, 7 days)
  │◄─────────────────┼────────────────►│
  │  "Dr. Kulkarni wants last 5 visits"│
  │  [Allow] [Deny]  │                 │
  │────────────────────────────────────►│ APPROVED, expiresAt=+7d
  │                  │  ◄── access ────│
  │                  │  views timeline │
  │                  │─────────────────►│ AuditLog(VIEW_RECORD)
  │                  │                 │
  │  visit done      │                 │
  │────────────────────────────────────►│ AUTO-REVOKE
  │  "kisne dekha?"  │                 │
  │◄────────────────────────────────────│ transparency screen
```

---

## 8. Database — already built & verified ✅

Main tumhare liye poora schema bana ke **real PostgreSQL 17 pe chala ke verify** kar chuka hoon.
Files: `citycare/schema/`

| File | Kya hai |
|---|---|
| `prisma/schema.prisma` | 25 models, poora ERD-as-code |
| `citycare_init.sql` | Prisma se generated DDL — **698 lines, 25 tables, 42 explicit indexes (71 incl. PK/unique), 38 FKs** [v2 counted] |
| `sql/constraints.sql` | Hand-written guardrails (partial indexes + audit trigger) |
| `smoke_test.sql` | Poora product story end-to-end — patient → consent → doctor access → audit |
| `gap_test.sql` | Safety rules actually hold ya nahi — negative tests |
| `run_tests.sh` | Ek command mein sab: `./run_tests.sh` |

**Verified output (real Postgres 17.11 pe chala ke):**

```
### Q1. Doctor dashboard: live access?
  id   |       scope       |  purpose  |        expiresAt        | access_allowed
 con-1 | LAST_N_ENCOUNTERS | TREATMENT | 2026-09-26 07:06:06     | t

### Q2. Longitudinal timeline (doctor ka hero screen)
    kind    |             detail             |   flag   |  on_date
 ALLERGY    | Penicillin                     | CRITICAL | 2026-09-19
 VITAL      | systolic_bp = 152 mmHg         |          | 2026-09-19
 LAB        | HbA1c = 8.4%                   | ABNORMAL | 2024-02-10
 CONDITION  | Type 2 Diabetes Mellitus (E11) | ACTIVE   | 2019-06-01
 MEDICATION | Metformin 500 1-0-1            | CHRONIC  | 2019-06-01
```

**Testing ke dauran ek asli bug mila — aur ye tumhare viva ka best material hai:**

Pehla schema **double-booking allow kar raha tha** — do patients ne same doctor ka same 09:45
slot book kar liya, database ne kuch nahi kaha. Fix kiya partial unique index se, phir verify
kiya:

```
############ TEST 1: double-booking ############
ERROR: duplicate key value violates unique constraint
       "one_live_appt_per_doctor_per_instant"        ← guard working ✅
--- but the SAME instant is bookable once cancelled ---
INSERT 0 1                                           ← slot correctly freed ✅

############ TEST 3: tampering with audit log ############
UPDATE → ERROR: AuditLog is append-only: UPDATE is not permitted
DELETE → ERROR: AuditLog is append-only: DELETE is not permitted  ← ✅
```

Ye story viva mein sunao — *"humne apna schema test kiya, ek bug mila, aur database level pe
fix kiya"* — ye 10 feature se zyada impressive hai.

---

## 9. 12-week roadmap (team of **5** — [v2] split `PLAN_REVIEW_AND_DRAWBACKS.md` §7 mein)

| Week | Milestone | Kaun | Deliverable |
|---|---|---|---|
| **1–2** | Setup, ERD final, auth | A+B | Next.js + Prisma + Postgres running. OTP login. Roles. **Milestone: login working** |
| **3–4** | Patient profile + timeline UI | A | Allergy/condition/medication forms. Timeline screen. **M: patient apna record dekh sake** |
| **5–6** | Doctor directory + search | B | Filters (specialty/city/fee/rating), doctor profile page. **M: search working** |
| **7–8** | Appointment engine | B | Slots, booking, cancel/reschedule, token, calendar view. **M: booking end-to-end** |
| **9–10** | Documents + OCR + consent | C | Upload, Tesseract, scoped consent flow, revoke, audit log UI. **M: consent demo working** |
| **11** | AI + alerts | D | LLM summary, RxNav interactions, abnormal lab flags, notifications. **M: alerts fire** |
| **12** | Polish + demo + report | All | Seed data, ABDM sandbox mock, 5-min demo script, PPT, report. |

**Har Friday: 30 min demo apne guide ko.** Jo module 2 hafte mein na chale, usko cut karo.

### Team split (4 log) — **[v2: team 5 ki hai; updated split review doc §7 mein: Auth · Consent · Ledger · Rules · Product/Deploy]**
- **A — Frontend lead:** patient app, timeline, UI components
- **B — Backend lead:** API, appointments, search, RBAC
- **C — Data & security:** DB, consent engine, encryption, audit, OCR
- **D — AI & integration:** LLM, RxNav, alerts, notifications, ABDM mock

---

## 10. Security & compliance checklist (report ka ek chapter)

- [x] Passwords: **scrypt N=2^17, r=8, p=1** (OWASP-equivalent to argon2id; pure Node, Workers-compatible) — rehash-on-login se purane hash upgrade [v2 built]
- [ ] JWT in **httpOnly secure cookie**, not localStorage (XSS se bachega)
- [ ] Access token 15 min, refresh token 7 days, rotation on use
- [ ] **RBAC middleware on every route** — `PATIENT` kabhi doosre patient ka record na padh sake (IDOR test karo!)
- [ ] Files: AES-256-GCM at rest, **signed URLs** (5-min expiry) for download, never direct links
- [ ] TLS everywhere; DB connections via `sslmode=require`
- [ ] **Append-only audit log** — DB trigger se enforced (see `sql/constraints.sql`)
- [ ] zod validation on every input; parameterised queries (Prisma gives this free)
- [~] Rate limiting: per-account 5 fails → 15-min sliding lockout [v2 built]; per-IP limit baaki (R9)
- [ ] Consent expiry checked **server-side**, never trusting the frontend
- [ ] **Right to erasure:** soft-delete + 30-day purge job (DPDP requirement)
- [ ] Report mein likho: *"synthetic data only, no real patient records"*
- [ ] Disclaimer on every AI output: *"AI-generated summary — clinical decisions rest with the treating physician."*

**DPDP facts to cite (verified as of Sep 2026):**
- DPDP Rules notified **13 November 2025**
- Breach notification: **immediate** to Data Protection Board + affected patients
- Consent-manager registration framework activates **13 November 2026** (Phase 2)
- Max penalty **₹250 crore**
- Healthcare records retention: ~~7 years~~ **[v2: koi single figure nahi hai.** NMC/MCI Code of Ethics 2002 Reg 1.3.1: indoor records **3 saal**; Reg 1.3.2: request pe **72 ghante** mein copy; DGHS Hospital Manual: inpatient case sheets **10 saal**, MLC 10 saal, OPD 5 saal. Design: configurable policy, default ≥ 10 saal, MLC kabhi delete nahi.]

---

## 11. Demo script (5 minute — isi pe marks milte hain)

1. **(0:30)** Ramesh ki problem — "8 doctors, ek plastic file, 12 duplicate tests."
2. **(1:00)** Ramesh login → timeline dikhao — 2019 se 2026 tak, ek screen.
3. **(1:30)** New chest pain → cardiologist search → ₹800, 4.6★, 23 Sep 09:45 slot → book.
4. **(2:00)** **Consent popup** — "Dr. Kulkarni last 5 visits + allergies dekhna chahte hain, 7 din ke liye" → Allow.
5. **(2:45)** **Doctor side** — ek screen: AI summary (3 lines) + **red flag: PENICILLIN ALLERGY** + active meds + HbA1c 8.4% abnormal. Doctor encounter banata hai, prescription likhta hai.
6. **(3:30)** Doctor Amoxicillin type karta hai → **live alert: "Amoxicillin is penicillin-class. Patient has documented Penicillin allergy."** ← *ye tumhara money shot hai.*
7. **(4:00)** Visit complete → consent **auto-revoke**.
8. **(4:20)** Ramesh ka transparency screen — "Dr. Kulkarni ne 23 Sep 09:47 ko aapka record dekha."
9. **(4:40)** Audit log mein DELETE try karke dikhao → **database refuse karta hai.** *(ye DB trigger hai, tumne banaya hai)*
10. **(5:00)** Numbers slide — history time 12min → 40sec, 4 risky prescriptions caught.

---

## 12. Viva — 18 questions jo pooche jaayenge

| Question | Answer ki direction |
|---|---|
| Hospitals se data kaise aayega? | Nahi aayega — **patient-upload model** + future ABDM integration. Ye conscious design choice hai. |
| ABDM already hai, tum kya naya kar rahe ho? | ABDM infrastructure hai, **UX nahi**. Hum patient-facing consent UX + AI summarisation + longitudinal timeline dete hain, aur ABDM sandbox-compatible hain. |
| AI galat summary de toh? | Rule-engine primary, AI secondary. Confidence score + doctor approval + "AI-generated" badge. **AI kabhi prescribe nahi karta.** |
| Patient ka data kaise safe hai? | **[v2 — sirf jo bana hai:]** scrypt 2^17 password hashing, httpOnly+SameSite cookie, CSRF Origin check, clickjacking headers, 15-min lockout, RBAC + har request pe server-side consent check, append-only hash-chained audit (DB trigger), scoped+expiring consent, immediate erasure. *Files/AES-GCM/signed URLs abhi nahi hain — R3.* |
| Double booking? | Partial unique index `one_live_appt_per_doctor_per_instant` — cancel hone pe slot khud free ho jaata hai. *(ye tumne test karke fix kiya — story sunao)* |
| Audit log koi admin change kare toh? | DB trigger `audit_no_update` UPDATE/DELETE reject karta hai. Prove karke dikhao. |
| Offline chalega? | P2 mein PWA planned. P0 online-first. |
| Scalability? | 25 tables, indexed queries (71 indexes incl. PK/unique), file storage alag, async jobs via queue. 10k patients comfortable. |
| Blockchain kyun nahi? | Consensus latency + storage cost clinical workflow justify nahi karta. Append-only log + hash chain same guarantee deta hai. |
| Consent expire hone ke baad doctor ne page refresh kiya? | Server-side check har request pe. Frontend pe cache nahi. |
| Emergency mein patient behosh hai? | **Break-glass access** — design: `Consent.isEmergencyOverride` + reason + 60-min expiry + ledger `EMERGENCY_ACCESS` + patient notification. **[v2: abhi sirf column hai, route/UI nahi — Seminar-II se pehle R2 banao, warna viva mein ye claim mat karo.]** |
| Multiple doctors ek saath record edit karein? | Encounters immutable hain — naya encounter banega, purana change nahi hoga. |
| Data delete karna ho toh? | Soft-delete + 30-day purge (DPDP right to erasure), lekin audit log retain. |
| Kitna data store ho raha hai per patient? | ~2 MB metadata + ~50 MB documents/year. 10k patients ≈ 500 GB. |
| Testing? | Schema-level negative tests (`gap_test.sql`) + API integration tests + OWASP top-10 manual check. |
| Marathi support? | P2. i18n-ready architecture, strings externalised. |
| Real doctor ne validate kiya? | *(karo!)* 2-3 local doctors se 15-min feedback lo. Report mein quote daalo. Ye ek slide = bahut marks. |
| Business model? | B2C freemium + B2B hospital SaaS. **Project ke liye ye zaroori nahi** — poochein toh hi batao. |

---

## 13. Aage kya karo (aaj se)

1. **Aaj:** `citycare/schema/` ka `run_tests.sh` chalao — DB khud dekh lo, samajh aa jaayega.
2. **Is hafte:** Team ke saath baitho, **P0 ke 5 modules** pe agree karo, baaki sab cut karo.
3. **Week 1:** `npx create-next-app` + Prisma + ye schema import. Login screen banao.
4. **Jaldi:** 2-3 real doctors se 15 min baat karo (Pune mein bahut milenge) — unka feedback report mein daalo.
5. **Report:** §4 ka problem statement, §2-3 ka pros/cons, §8 ka verified schema, §12 ka viva prep — ye sab directly use kar sakte ho.

---

### Ek last baat

Tumhara idea achha hai. Iska sabse bada khatra **idea ki quality nahi, scope ki quantity** hai.
6 features ka aadha bana hua app = average project. 3 features ka **poora, tested, secure**
app = excellent project.

Aur ek cheez: **jo bug maine schema testing mein pakda (double-booking), usko apni report mein
likho.** Projects mein sab kuch perfect dikhana kamzor lagta hai; *"humne test kiya, ye mila,
humne fix kiya"* — ye engineering hai.
