// CityCare demo seed — plain node + pg (no Prisma), so the SQL schema files
// stay the single source of truth. Re-runnable: truncates first.
//   DATABASE_URL default matches schema/.env
import { Client } from "pg";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL ?? "postgresql://citycare:citycare@localhost:5432/citycare";
const c = new Client({ connectionString: url });

// Same cost knob as src/lib/auth.ts: the Cloudflare Workers FREE plan has a 10 ms CPU
// budget, so the deploy script seeds with SCRYPT_N=4096 — otherwise every demo login
// would verify at 2^14 (~80 ms) and trip the limit. The cost is stored in the hash.
function scryptCost() {
  const raw = Number(process.env.SCRYPT_N ?? 16384);
  const ok = Number.isInteger(raw) && raw >= 1024 && raw <= 1 << 20 && (raw & (raw - 1)) === 0;
  return ok ? raw : 16384;
}
function hashPassword(pw) {
  const N = scryptCost(), r = 8, p = 1;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

// next occurrence of IST wall time on "tomorrow" (always > 2h lead)
function tomorrowIst(hh, mm) {
  const now = new Date(Date.now() + 19.5 * 3600e3); // shift to IST-ish calendar
  const y = now.getUTCFullYear(), mo = now.getUTCMonth(), d = now.getUTCDate();
  return new Date(Date.UTC(y, mo, d + 1, hh - 5, mm - 30)).toISOString();
}
function daysAgo(n, hh = 11, mm = 0) {
  return new Date(Date.UTC(2026, 8, 27) - n * 86400000 + (hh - 5) * 3600e3 + (mm - 30) * 60e3).toISOString();
}

await c.connect();
const tables = (
  await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)
).rows.map((r) => `"${r.tablename}"`);
if (tables.length) await c.query(`TRUNCATE ${tables.join(", ")} CASCADE`);

await c.query("BEGIN");
const q = async (sql, params) => (await c.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

// hospitals
const hosp = {};
for (const [name, addr] of [
  ["Sahyadri City Care", "FC Road, Shivajinagar"],
  ["Baner Family Clinic", "Baner Road, Plot 12"],
  ["Deccan Multispeciality", "Kothrud, Paud Road"],
]) {
  hosp[name] = (await one(`INSERT INTO "Hospital" (id,name,address,city,"isEmpanelled",rating,"createdAt")
    VALUES (gen_random_uuid(),$1,$2,'Pune',true,4.3,now()) RETURNING id`, [name, addr])).id;
}

const specId = {};
for (const s of ["General Medicine", "Dermatology", "Cardiology", "Endocrinology", "Diabetology"]) {
  specId[s] = (await one(`INSERT INTO "Specialty" (id,name) VALUES (gen_random_uuid(),$1) RETURNING id`, [s])).id;
}

const PW = hashPassword("city1234");
async function mkUser(email, phone, role) {
  const u = await one(
    `INSERT INTO "User" (id,email,phone,"passwordHash",role,status,"createdAt","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,$3,$4,'ACTIVE',now(),now()) RETURNING id`,
    [email, phone, PW, role],
  );
  return u.id;
}

// doctors: [email, phone, name, qual, exp, fee, specialty, hospital, verified, langs]
const docs = [
  ["dr.kulkarni@demo.in", "9822000001", "Asha Kulkarni", "MBBS, MD (Gen Med)", 12, 500, "General Medicine", "Sahyadri City Care", true, "{en,hi,mr}"],
  ["dr.joshi@demo.in", "9822000002", "Rohit Joshi", "MBBS, MD (Derm)", 8, 700, "Dermatology", "Deccan Multispeciality", true, "{en,hi}"],
  ["dr.rane@demo.in", "9822000003", "Meera Rane", "MBBS, DM (Cardio)", 15, 900, "Cardiology", "Deccan Multispeciality", true, "{en,hi,mr}"],
  ["dr.sheikh@demo.in", "9822000004", "Farhan Sheikh", "MBBS, MD (Endo)", 10, 800, "Endocrinology", "Sahyadri City Care", true, "{en,hi,ur}"],
  ["dr.nair@demo.in", "9822000005", "Priya Nair", "MBBS", 3, 400, "General Medicine", "Baner Family Clinic", false, "{en,ml}"],
];
const docIds = {};
for (const [email, phone, name, qual, exp, fee, sp, hname, verified, langs] of docs) {
  const uid = await mkUser(email, phone, "DOCTOR");
  const d = await one(
    `INSERT INTO "Doctor" (id,"userId","fullName","registrationNo","hospitalId",qualification,"experienceYrs",
                           "consultationFee",bio,languages,"isVerified",rating,"totalReviews","createdAt")
     VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,4.4,$11,now()) RETURNING id`,
    [uid, `Dr. ${name}`, `2019/PUNE/${1000 + phone.slice(-4) / 1}`, hosp[hname], qual, exp, fee,
     `Consults at ${hname}. Accepts CityCare bookings.`, langs, verified, exp * 7],
  );
  docIds[email] = { id: d.id, uid };
  if (verified) await q(`UPDATE "Doctor" SET "verifiedAt"=now() - interval '30 days' WHERE id=$1`, [d.id]);
  await q(`INSERT INTO "DoctorSpecialty" ("doctorId","specialtyId") VALUES ($1,$2)`, [d.id, specId[sp]]);
  if (sp === "General Medicine") await q(`INSERT INTO "DoctorSpecialty" ("doctorId","specialtyId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, [d.id, specId["Diabetology"]]);
  // availability: Mon-Sat, two sessions
  for (const dow of [1, 2, 3, 4, 5, 6]) {
    await q(
      `INSERT INTO "AvailabilitySlot" (id,"doctorId","dayOfWeek","startTime","endTime","slotMinutes","maxPerSlot","isActive")
       VALUES (gen_random_uuid(),$1,$2,'10:00','13:00',15,1,true)`,
      [d.id, dow],
    );
    await q(
      `INSERT INTO "AvailabilitySlot" (id,"doctorId","dayOfWeek","startTime","endTime","slotMinutes","maxPerSlot","isActive")
       VALUES (gen_random_uuid(),$1,$2,'16:00','19:00',20,1,true)`,
      [d.id, dow],
    );
  }
}

// patients: email, phone, name, dob, gender, blood
const pats = [
  ["ramesh@demo.in", "9850000001", "Ramesh Shelar", "1968-03-14", "MALE", "B_POSITIVE"],
  ["anita@demo.in", "9850000002", "Anita Pawar", "1991-11-02", "FEMALE", "O_POSITIVE"],
  ["vikas@demo.in", "9850000003", "Vikas Jadhav", null, "MALE", "UNKNOWN"], // cold-start demo
  ["sunita@demo.in", "9850000004", "Sunita Deshmukh", "1985-06-21", "FEMALE", "A_NEGATIVE"],
];
// F1: an admin who verifies registrations, and one doctor still in the queue (demo of the flow)
const adminUid = await mkUser("admin@demo.in", "9000000001", "SUPER_ADMIN");
void adminUid;
{
  const uid = await mkUser("dr.pending@demo.in", "9000000002", "DOCTOR");
  const d = await one(
    `INSERT INTO "Doctor" (id,"userId","fullName","registrationNo",qualification,"experienceYrs","consultationFee",bio,languages,"isVerified","createdAt")
     VALUES (gen_random_uuid(),$1,'Dr. Neha Kulkarni-Patil','MMC/2024/98765','MBBS',2,400,'New registration — awaiting verification.',ARRAY['en','mr'],false,now()) RETURNING id`,
    [uid],
  );
  await q(`INSERT INTO "DoctorSpecialty" ("doctorId","specialtyId") VALUES ($1,$2)`, [d.id, specId["General Medicine"]]);
}

const patIds = {};
for (const [email, phone, name, dob, gender, blood] of pats) {
  const uid = await mkUser(email, phone, "PATIENT");
  const p = await one(
    `INSERT INTO "Patient" (id,"userId","fullName","dateOfBirth",gender,"bloodGroup",city,"abhaId",
                           "shareDefaultExpiryDays","autoRevokeAfterVisit","createdAt","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,'Pune',$6,7,true,now(),now()) RETURNING id`,
    [uid, name, dob, gender, blood, email === "ramesh@demo.in" ? "12-3456-7890-1234" : null],
  );
  patIds[email] = { id: p.id, uid };
}

// ramesh clinical data
const R = patIds["ramesh@demo.in"];
for (const [al, sev, rx] of [["Penicillin", "CRITICAL", "rash + swelling (childhood)"], ["Sulfa drug", "WARNING", "hives"]]) {
  // A45: the reaction text was built but never inserted — doctor screen showed allergies without reactions
  await q(`INSERT INTO "Allergy" (id,"patientId",allergen,category,severity,reaction,"isActive","reportedBy","createdAt")
           VALUES (gen_random_uuid(),$1,$2,'DRUG',$3,$4,true,'PATIENT',now())`, [R.id, al, sev, rx]);
}
for (const [nm, icd, since] of [["Type 2 Diabetes", "E11", daysAgo(2200)], ["Hypertension", "I10", daysAgo(1500)]]) {
  await q(`INSERT INTO "Condition" (id,"patientId",name,icd10,status,"sinceDate",notes)
           VALUES (gen_random_uuid(),$1,$2,$3,'ACTIVE',$4,'PATIENT_ONBOARD')`, [R.id, nm, icd, since]);
}
for (const [nm, dose, freq] of [["Metformin", "500 mg", "1-0-1"], ["Telmisartan", "40 mg", "0-0-1"], ["Atorvastatin", "10 mg", "0-0-1"]]) {
  await q(`INSERT INTO "Medication" (id,"patientId",name,dosage,frequency,"startDate","isActive","isChronic",notes)
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,true,true,'PATIENT_ONBOARD')`, [R.id, nm, dose, freq, daysAgo(900)]);
}
// anita: asthma only; sunita: NSAID reaction + a DRAFT med awaiting confirmation
await q(`INSERT INTO "Condition" (id,"patientId",name,status,notes) VALUES (gen_random_uuid(),$1,'Asthma','ACTIVE','PATIENT_ONBOARD')`, [patIds["anita@demo.in"].id]);
await q(`INSERT INTO "Allergy" (id,"patientId",allergen,severity,"isActive","reportedBy","createdAt") VALUES (gen_random_uuid(),$1,'Ibuprofen','WARNING',true,'PATIENT',now())`, [patIds["sunita@demo.in"].id]);
await q(`INSERT INTO "Medication" (id,"patientId",name,"isActive",notes) VALUES (gen_random_uuid(),$1,'Tab. Brufen',true,'DRAFT:Tab. Brufen 400 1-0-1')`, [patIds["sunita@demo.in"].id]);

// encounters + prescriptions + labs for ramesh (3 visits, last by Dr. Kulkarni)
for (const [n, docEmail, dx, icd, items] of [
  [150, "dr.kulkarni@demo.in", "Uncontrolled T2D — HbA1c 9.2%", "E11.64", [{ name: "Metformin", dosage: "1 g", frequency: "1-0-1", durationDays: 60 }]],
  [90, "dr.sheikh@demo.in", "T2D review; started statin", "E11", [{ name: "Atorvastatin", dosage: "10 mg", frequency: "0-0-1", durationDays: 90 }]],
  [20, "dr.kulkarni@demo.in", "BP stable, sugar improving", "I10", []],
]) {
  const enc = await one(
    `INSERT INTO "Encounter" (id,"patientId","doctorId","encounterDate",type,"chiefComplaint","diagnosisText","diagnosisCode",advice,"followUpOn","createdAt")
     VALUES (gen_random_uuid(),$1,$2,$3,'OUTPATIENT',$4,$5,$6,$7,$8,now()) RETURNING id`,
    [R.id, docIds[docEmail].id, daysAgo(n), "routine follow-up", dx, icd, "Continue current medicines; low-sugar diet.", daysAgo(n - 45)],
  );
  if (items.length) {
    await q(`INSERT INTO "Prescription" (id,"doctorId","encounterId",items,notes,"issuedOn")
             VALUES (gen_random_uuid(),$1,$2,$3::jsonb,$4,$5)`,
      [docIds[docEmail].id, enc.id, JSON.stringify(items), "Take with food.", daysAgo(n)]);
  }
  // one report document with labs per first visit
  if (n === 150) {
    const doc = await one(
      `INSERT INTO "Document" (id,"patientId","encounterId","uploadedByDoc",type,source,title,"issuedBy","issuedOn",
                               "storageKey","encryptionIv","mimeType","sizeBytes","checksumSha256","ocrStatus","ocrText","isDeleted","createdAt")
       VALUES (gen_random_uuid(),$1,$2,NULL,'LAB_REPORT','PATIENT_UPLOAD','Lipid + HbA1c panel','TrueCare Lab',now(),
               'demo/ramesh-hba1c.pdf','iv-demo','application/pdf',204800,'cafe0000','DONE',$3,false,now()) RETURNING id`,
      [R.id, enc.id, `HbA1c: 9.2 % (ref 4.0-5.6)\nLDL: 96 mg/dL (ref 0-100)\nCreatinine: 1.0 mg/dL (ref 0.7-1.3)`],
    );
    for (const [t, v, u, lo, hi] of [["HbA1c", "9.2", "%", "4.0", "5.6"], ["LDL", "96", "mg/dL", "0", "100"], ["Creatinine", "1.0", "mg/dL", "0.7", "1.3"]]) {
      await q(`INSERT INTO "LabResult" (id,"documentId","testName",value,unit,"refRangeLow","refRangeHigh","isAbnormal","takenOn")
               VALUES (gen_random_uuid(),$1,$2,$3::text,$4,$5::text,$6::text,
                       ($3::text::numeric NOT BETWEEN $5::text::numeric AND $6::text::numeric), now())`,
        [doc.id, t, v, u, lo, hi]);
    }
  }
}

// F5: self-reported readings (the Observation table's first data). Realistic 6-month chronic
// care arcs, all logged at home (encounterId NULL). Ramesh: diabetes + hypertension.
// Anita: asthma (peak flow). Each series ends with 5-6 points so the trends view is alive.
{
  const insertObs = (patientId, category, name, unit, refLow, refHigh, daysBack, value) =>
    q(
      `INSERT INTO "Observation" (id,"patientId","encounterId",category,name,"valueNum",unit,"refLow","refHigh","takenOn")
       VALUES (gen_random_uuid()::text,$1,NULL,$2,$3,$4,$5,$6,$7,$8)`,
      [patientId, category, name, value, unit, refLow, refHigh, daysAgo(daysBack)],
    );
  // ramesh — diabetes arc (HbA1c target ≤ 7%) + fasting glucose (70–110) + BP (target < 130)
  for (const [daysBack, value] of [[180, 9.4], [150, 9.2], [120, 8.8], [90, 8.4], [60, 8.1], [30, 7.9]]) {
    await insertObs(R.id, "lab", "HbA1c", "%", null, 7, daysBack, value);
  }
  for (const [daysBack, value] of [[180, 212], [150, 198], [120, 183], [90, 171], [60, 158], [30, 149]]) {
    await insertObs(R.id, "glucose", "Fasting glucose", "mg/dL", 70, 110, daysBack, value);
  }
  for (const [daysBack, value] of [[150, 162], [120, 156], [90, 149], [60, 145], [30, 141]]) {
    await insertObs(R.id, "blood_pressure", "BP systolic", "mmHg", null, 130, daysBack, value);
  }
  // anita — asthma (peak flow, personal best band 350–420)
  for (const [daysBack, value] of [[75, 300], [45, 318], [15, 334], [3, 358]]) {
    await insertObs(patIds["anita@demo.in"].id, "respiratory", "Peak flow", "L/min", 350, 420, daysBack, value);
  }
}

// appointments: ramesh tomorrow 11:00 IST with Dr. Nair (fresh, consent REQUESTED pending)
const t11 = tomorrowIst(11, 0);
const appt1 = await one(
  `INSERT INTO "Appointment" (id,"patientId","doctorId","scheduledAt","durationMin",status,reason,"notesForDoctor","tokenNo","createdAt","updatedAt")
   VALUES (gen_random_uuid(),$1,$2,$3,15,'CONFIRMED','sugar review','reports uploaded',1,now(),now()) RETURNING id`,
  [R.id, docIds["dr.nair@demo.in"].id, t11],
);
const con1 = await one(
  `INSERT INTO "Consent" (id,"patientId","doctorId",status,scope,purpose,"lastNEncounters","requestedAt","expiresAt")
   VALUES (gen_random_uuid(),$1,$2,'REQUESTED','LAST_N_ENCOUNTERS','TREATMENT',3,now(),now()+interval '7 days') RETURNING id`,
  [R.id, docIds["dr.nair@demo.in"].id],
);
await q(`UPDATE "Appointment" SET "consentId"=$2 WHERE id=$1`, [appt1.id, con1.id]);

// anita: LIVE approved consent with Dr. Sheikh + a visit today-ish (full access until expiry)
const t12 = tomorrowIst(12, 0);
const appt2 = await one(
  `INSERT INTO "Appointment" (id,"patientId","doctorId","scheduledAt","durationMin",status,reason,"tokenNo","createdAt","updatedAt")
   VALUES (gen_random_uuid(),$1,$2,$3,30,'PENDING','thyroid + sugar',1,now(),now()) RETURNING id`,
  [patIds["anita@demo.in"].id, docIds["dr.sheikh@demo.in"].id, t12],
);
const con2 = await one(
  `INSERT INTO "Consent" (id,"patientId","doctorId",status,scope,purpose,"requestedAt","approvedAt","expiresAt")
   VALUES (gen_random_uuid(),$1,$2,'APPROVED','FULL_RECORD','TREATMENT',now(),now(),now()+interval '5 days') RETURNING id`,
  [patIds["anita@demo.in"].id, docIds["dr.sheikh@demo.in"].id],
);
await q(`UPDATE "Appointment" SET "consentId"=$2 WHERE id=$1`, [appt2.id, con2.id]);

// a CLOSED revoked consent for ramesh->Joshi (transparency demo data)
const con3 = await one(
  `INSERT INTO "Consent" (id,"patientId","doctorId",status,scope,purpose,"requestedAt","approvedAt","expiresAt","revokedAt","revocationReason")
   VALUES (gen_random_uuid(),$1,$2,'REVOKED','SUMMARY_ONLY','SECOND_OPINION',$3,$3,$4,now(),'second opinion done, no longer needed') RETURNING id`,
  [R.id, docIds["dr.joshi@demo.in"].id, daysAgo(30), daysAgo(2)],
);

// notifications
await q(`INSERT INTO "Notification" (id,"userId",channel,title,body,"isRead","createdAt")
         VALUES (gen_random_uuid(),$1,'IN_APP','New prescription uploaded','Consultation notes and medicines were added to your CityCare record.',false,now())`,
  [R.uid]);

// ---- the audit chain, through the same SQL function the app uses ----
const evts = [
  [R.uid, "GRANT_CONSENT", "Consent", con3.id, con3.id, { scope: "SUMMARY_ONLY" }],
  [docIds["dr.joshi@demo.in"].uid, "VIEW_RECORD", "Patient", R.id, con3.id, { scope: "SUMMARY_ONLY" }],
  [docIds["dr.joshi@demo.in"].uid, "VIEW_RECORD", "Patient", R.id, con3.id, { scope: "SUMMARY_ONLY" }],
  [R.uid, "REVOKE_CONSENT", "Consent", con3.id, con3.id, { reason: "second opinion done" }],
  [docIds["dr.joshi@demo.in"].uid, "VIEW_DENIED", "Patient", R.id, null, { reason: "consent was revoked" }],
  [docIds["dr.kulkarni@demo.in"].uid, "CREATE_ENCOUNTER", "Patient", R.id, null, { drugs: ["Metformin"] }],
  [docIds["dr.sheikh@demo.in"].uid, "CREATE_ENCOUNTER", "Patient", R.id, null, { drugs: ["Atorvastatin"] }],
  [R.uid, "BOOK_APPOINTMENT", "Patient", R.id, con1.id, { doctor: "Priya Nair" }],
  [patIds["anita@demo.in"].uid, "GRANT_CONSENT", "Consent", con2.id, con2.id, { scope: "FULL_RECORD" }],
];
for (const e of evts) {
  await q(`SELECT * FROM ledger_append($1::uuid,$2,$3,$4,$5::uuid,$6::jsonb)`, e);
}

// L1: seeded identities carry a consent artefact for the CURRENT notice version, read from the
// single source of truth (src/lib/legal.ts) so seed and app can never disagree.
const legalSrc = readFileSync(new URL("../src/lib/legal.ts", import.meta.url), "utf8");
const ver = (k) => legalSrc.match(new RegExp(`${k} = "([0-9-]+)"`))[1];
await q(
  `INSERT INTO "PolicyAcceptance" ("userId","policyKey",version)
     SELECT u.id, 'privacy-notice', $1 FROM "User" u
     UNION ALL SELECT u.id, 'terms', $2 FROM "User" u`,
  [ver("PRIVACY_NOTICE_VERSION"), ver("TERMS_VERSION")],
);
// Ramesh already has a nominee (DPDP s.14) so the demo shows the feature populated
await q(`UPDATE "Patient" SET "nomineeName"='Sunita Shelar', "nomineeRelation"='wife', "nomineePhone"='9822000111' WHERE id=$1`, [R.id]);

await c.query("COMMIT");
const summary = await q(`SELECT
  (SELECT count(*) FROM "Doctor") docs,
  (SELECT count(*) FROM "Patient") pats,
  (SELECT count(*) FROM "Appointment") appts,
  (SELECT count(*) FROM "Consent") consents,
  (SELECT count(*) FROM "AuditLog") ledger_rows,
  (SELECT count(*) FROM ledger_verify()) breaks`);
console.log("seeded:", summary[0]);
if (Number(summary[0].breaks) !== 0) { console.error("FATAL: seed chain not clean"); process.exit(1); }
await c.end();
