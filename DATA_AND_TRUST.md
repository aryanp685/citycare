# Data kaha se laayenge, aur log trust kyun karenge?

*CityCare — cold start aur trust ka jawab*
*Runnable proof: `citycare/trust/` → `python3 cold_start_demo.py` (25 tests pass)*

---

# PART 1 — Data kaha se laao?

## Short answer: **kahin se nahi. Zaroorat hi nahi hai.**

Tumhara project ek galat assumption pe atka hai: *"pehle patient ka 10 saal ka history chahiye."*

Nahi chahiye.

**Appointment booking ko history ki zaroorat nahi hoti.** App day 1 pe useful hai — patient
slot book karta hai, fees aur timing pehle dekh leta hai, SMS reminder paata hai, aaj mili
parchi save kar leta hai. Record **baad mein banta jaata hai** — pehle se load nahi hota.

---

## Data ke 3 source, is order mein

### 1. Patient khud — **85 second**

Sirf 4 cheezein poochho. Bas. Purana history mat maango.

| # | Sawaal | Time |
|---|---|---|
| 1 | Kya aapko kisi dawa se allergy hai? | 25s |
| 2 | Koi lambi bimari chal rahi hai? (sugar, BP, thyroid) | 20s |
| 3 | Abhi kaunsi dawaiyan chal rahi hain? | 30s |
| 4 | Blood group pata hai? *(skippable)* | 10s |

**Total: 85 seconds** — aur doctor ke paas itna aa gaya:

```
allergies ........... ['Penicillin']
conditions .......... ['Type 2 Diabetes', 'Hypertension']
medications ......... ['Metformin 500', 'Telmisartan 40']
blood group ......... B+
completeness ........ 100%
```

> **Ye already ek walk-in patient se behtar hai.** Naya patient doctor ko allergy aksar
> batata hi nahi, ya galat batata hai. 85 second ka profile usse aage nikal jaata hai.

### 2. Purani parchiyan — **phone photo**

Patient ke paas plastic file mein 10 purani parchiyan hain. Wo maangna nahi, **photo khinchwana**.

OCR chalega → dawaiyon ke **DRAFT** rows banenge → patient ek tap mein confirm karega.

Real output (maine chalaya, 3 parchiyon se):

```
unique drugs found ..... 7
parse confidence ....... 47%
lines it could not read  8

Draft rows (status=DRAFT, patient confirms each with one tap):
  - Tab Metformin          500 mg   1-0-1   [DRAFT]
  - Tab Telmisartan        40 mg    1-0-0   [DRAFT]
  - Cap Pantoprazole       40 mg    0-1-0   [DRAFT]
  - Tab Atorvastatin       10 mg    0-0-1   [DRAFT]
  - Tab Aspirin            75 mg    0-0-1   [DRAFT]
  - Tab Cetirizine         10 mg    sos     [DRAFT]
  - Tab Glimepiride        1 mg     1-0-0   [DRAFT]

Could not parse (goes to manual entry, never guessed):
  ! handwritten note illegible here
```

**20 minute typing → 60 second tapping.** Aur jo line padh nahi aayi wo **guess nahi hoti** —
wo manual entry mein jaata hai. Ye detail viva mein bolna.

### 3. Aage se apne aap

Har visit ka record judta jaata hai. 6 mahine mein record khud substantial ho jaata hai.
Ye **compounding** hai — jitna use, utna value, utna lock-in.

---

## Jo tumhe **nahi** karna

| ❌ | Kyun nahi |
|---|---|
| Hospitals se data maangna | Nahi denge. Zero incentive, IT dept 6 mahine meeting bulayegi. |
| Pehle database bharne ki koshish | Product ruk jaayega. Cold start pe hi mar jaayega. |
| ABDM production integration | 6-9 mahine sirf certification ka. BCA scope se bahar. |
| Real patient data (project ke liye) | Ethics + DPDP. **25 synthetic patients banao.** |

> **Hospital integration ki zaroorat nahi. Kisi se data maangna nahi.**
> Ye poora problem hi cancel ho jaata hai.

---

# PART 2 — Trust kyun karenge?

## Short answer: **karne ki zaroorat nahi. System aisa banao ki trust ki zaroorat hi na pade.**

"Trust me" bolne se koi trust nahi karta. Jo kaam karta hai wo hai — **patient khud test kar sake.**

---

## 4 cheezein jo patient verify kar sakta hai

### (a) Revoke kiya → agla request **turant** 403

```
doc-kulkarni -> scope=LAST_N_ENCOUNTERS, expires in 7 days
VIEW_RECORD written to the ledger
patient revokes...
HTTP 403 — consent was revoked by the patient at 05:26:56
```

"Jaldi hi band ho jaayega" nahi. **Abhi. Isi request pe.**

### (b) "Kisne dekha?" — transparency screen

```
05:26:56  pat-ramesh      GRANT_CONSENT   Consent:doc-kulkarni:pat-ramesh
05:26:56  doc-kulkarni    VIEW_RECORD     Patient:pat-ramesh
05:26:56  pat-ramesh      REVOKE_CONSENT  Consent:doc-kulkarni:pat-ramesh
ledger intact: True (3 entries, hash-chained)
```

Naam, time, action. Chhupa hua kuch nahi.

### (c) Log **tum** edit nahi kar sakte — hash chain

Har entry pichhli entry se judi hai:

```
entry_hash = sha256(prev_hash | time | actor | action | entity)
```

Koi row badli → chain toot jaata hai, exact row number ke saath.

```
Now simulate an admin quietly editing one row in psql:
  UPDATE AuditLog SET action='NOTHING_HAPPENED' WHERE seq=2;

Tampering detected: True
  seq 2: entry_hash does not match its contents (a row was edited in place)
    expected 82e5b6cffa5977840b228e3e...
    found    993022956f5d8b602c10258c...
```

> **Ye sabse strong point hai.** Patient ko tum pe bharosa karne ki zaroorat nahi —
> wo log khud verify kar sakta hai.
>
> Aur yahi cheez log **blockchain** se paane ki koshish karte hain. Tumhe ek extra column
> se mil gayi, bina consensus protocol ke. Viva mein koi blockchain pooche toh yahi bolo.

### (d) Delete = sach mein delete (DPDP right to erasure)

```
soft-deleted:
  - encounters: 3 row(s)      - labs: 2 row(s)
  - medications: 4 row(s)     - conditions: 2 row(s)
  - allergies: 1 row(s)       - observations: 3 row(s)
  - documents: 5 row(s)
files shredded ......... 5
retained for audit ..... access ledger (proof of what was held and when destroyed)
```

Data gaya. **Proof** ki kya rakha tha aur kab delete kiya — wo patient ke paas raha.

---

## Asli baat: koi anjaan aadmi tumhe data nahi dega

Aur ye **bilkul sahi hai**. Ek BCA student ko koi apna health data nahi dega. Isse ladna nahi,
**isme se rasta nikalna** hai.

### Trust ladder — seedha hospital pe mat jaao

| Stage | Kaun | Kyun trust karenge | Difficulty |
|---|---|---|---|
| **1** | Tumhara parivaar + 15-20 dost | Tumhe personally jaante hain | ⭐ Easy |
| **2** | Apna college — students, staff, unke parents | College sanction kare toh **institution ka trust** tum pe transfer hota hai. Guide ko saath rakho, "department pilot" bolo. | ⭐⭐ Medium |
| **3** | Ek local GP / family doctor | **Sabse strong rasta.** Doctor already trusted hai — wo bolega toh patient maanega. Pune mein ₹500-2000 fees wale clinic milenge jo digital dikhna chahte hain. | ⭐⭐⭐ Hard but highest value |
| **4** | Diagnostic lab ya medical store | Yahan patient **already** data deta hai bina sochke — barrier sabse kam. Lab report auto-upload + pharmacy purchase history = instantly rich record, **patient ko kuch karna nahi.** | ⭐⭐⭐⭐ Partnership |

**Stage 1 hi tumhara project pilot hai.** 15-20 log kaafi hain demo aur screenshots ke liye.

---

## Framing change — ye sabse zyada matter karta hai

> ❌ *"Mujhe apna data dijiye"*
>
> ✅ *"Ye **aapka** health locker hai. Aap decide karo kaun dekhe, kitna dekhe, kitni der
>     dekhe. Kabhi bhi band kar do."*

**Data mangna nahi — ownership dena.** Isse hi log haan bolte hain.

Pehla sawaal hamesha ye puchwao: *"Aapki purani reports aaj kahan hain?"* — jab wo bolega
"plastic file mein, kho jaati hain", tab tumhara pitch apne aap bik jaata hai.

---

# Chalake dikhao

```bash
cd citycare/trust
python3 cold_start_demo.py                    # poora 6-step demo
python3 -m unittest discover -s trust -v      # 25 regression tests
```

Demo 6 steps mein chalata hai: zero record → 85-second profile → shoebox backfill →
consent/revoke/403 → tamper detection → erasure.

**Viva mein bolke jaane se zyada asar chale ke dikhane ka hoga.**

---

## Do line ka jawab

**Data kaha se?** Kahin se nahi. Day 1 pe zero record ke saath app useful hai, kyunki booking
ko history nahi chahiye. Record khud banta hai — 85 second profile + purani parchiyon ki
photos + har visit.

**Trust kyun?** Kyunki trust yahan ek **behaviour** hai jo patient test kar sakta hai, claim
nahi: scoped consent, instant revocation, hash-chained log jo bina tum pe bharosa kiye verify
ho jaata hai, aur erasure jo sach mein erase karta hai.

---

## Update (same day, later)

The ledger described above is **no longer a Python demo only** — the hash chain now
lives in the live Postgres database itself (`schema/sql/ledger.sql`: `ledger_append()`
/ `ledger_verify()`, exercised by the running website in `web/`), including two bugs
found while porting it (millisecond-rounding and a naive-timestamp/timezone trap) —
their full story is in `web/DRAWBACKS_AND_BUGFIXES.md` §A6–A8. The patient-facing
proof screen is now a real page: `/patient/access` on the running app.
