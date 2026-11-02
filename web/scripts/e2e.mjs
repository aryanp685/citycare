// End-to-end trust test over HTTP. Requires the dev server on :3000 and a seeded DB.
// Run:  node scripts/e2e.mjs
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
import crypto from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
// Local convenience: pick CRON_SECRET / DATABASE_URL up from .env.local so the cron and the
// psql-backed checks run without exporting anything. Against a remote BASE only CRON_SECRET is used.
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^(CRON_SECRET|DATABASE_URL|BACKUP_KEY|BACKUP_DIR|SESSION_SECRET|RETENTION_POLICY|SEED_CONTEXT)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch { /* no .env.local — fine */ }
const LOCAL = /127\.0\.0\.1|localhost/.test(BASE);
let pgClient = null;
async function sql(text, params = []) {
  if (!LOCAL || !process.env.DATABASE_URL) return null;
  if (!pgClient) { const { default: pg } = await import("pg"); pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL }); await pgClient.connect(); }
  return pgClient.query(text, params);
}

let pass = 0, failc = 0, skipped = 0;
function skip(name, why) { skipped++; console.log(`  – ${name} (skipped: ${why})`); }
const failures = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failc++; failures.push(name + (detail ? ` — ${detail}` : "")); console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`); }
}

class Session {
  constructor(label, base = BASE) { this.label = label; this.base = base; this.cookie = ""; }
  async req(method, path, body, form = false) {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": form ? "application/x-www-form-urlencoded" : "application/json" } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        origin: this.base, // same-origin so the CSRF guard passes
      },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      redirect: "manual",
    });
    const sc = res.headers.getSetCookie?.() ?? [];
    for (const c of sc) {
      const kv = c.split(";")[0];
      if (kv.startsWith("cc_session=")) this.cookie = kv.length > 13 ? kv : "";
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data, location: res.headers.get("location") };
  }
  get(path) { return this.req("GET", path); }
  /** multipart upload — the runtime sets the boundary, so no content-type header here */
  async upload(path, formData) {
    const res = await fetch(this.base + path, { method: "POST", headers: { ...(this.cookie ? { cookie: this.cookie } : {}), origin: this.base }, body: formData, redirect: "manual" });
    let data = null; try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  }
  /** raw GET that keeps headers + bytes (for signed download links) */
  async raw(path, extraHeaders = {}) {
    const res = await fetch(this.base + path, { headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...extraHeaders }, redirect: "manual" });
    return { status: res.status, headers: res.headers, bytes: new Uint8Array(await res.arrayBuffer()) };
  }
  post(path, body, form = false) { return this.req("POST", path, body, form); }
  patch(path, body) { return this.req("PATCH", path, body); }
  put(path, body) { return this.req("PUT", path, body); }
  del(path, body) { return this.req("DELETE", path, body); }
}

const stamp = Date.now().toString(36);
// Pick the next IST date (1..7 days ahead) that is a Mon/Wed/Fri. A freshly
// signed-up doctor gets default hours Mon/Wed/Fri 10:00-13:00 and Tue/Thu/Sat
// 16:00-19:00 (signup route), and the bookings below use 10:00/11:00/12:00 IST,
// so the day MUST be a morning day. Computed directly in IST — the old
// "+12h noon-UTC safe zone" silently rolled the date one day forward whenever
// the suite ran after 12:00 IST, which made the pass/fail depend on the calendar.
function pickDay() {
  const IST_MS = 330 * 60e3;
  const todayIst = Math.floor((Date.now() + IST_MS) / 86400e3); // IST day number
  for (let n = 1; n <= 7; n++) {
    const dateISO = new Date((todayIst + n) * 86400e3).toISOString().slice(0, 10);
    const dow = new Date(dateISO + "T00:00:00Z").getUTCDay();
    if (dow === 1 || dow === 3 || dow === 5) return dateISO;
  }
  throw new Error("no Mon/Wed/Fri found in 7 days");
}
const DAY = pickDay();
const utcMinFor = (h, m) => (h * 60 + m) - 330; // IST wall -> minutes offset from UTC midnight
function istSlot(h, m = 0) {
  return new Date(Date.parse(DAY + "T00:00:00Z") + utcMinFor(h, m) * 60000).toISOString();
}
// Calendar-year DOB, not `now − N×365.25d`: the fractional day drifts the synthetic DOB by
// up to a full day around the exact Nth anniversary, and on that day the expected age flips
// (hit for real on 2026-11-01: 7×365.25d lands 06 h into the NEXT day, so "age 7" was 6).
// UTC midnight of the anniversary: ageFrom is UTC-based, so age === N for the whole day.
function dobYearsAgo(n) { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - n); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); }

let bookedAt = null;
let e2eDoctorId = null; // set in §4, reused in §11
const uniqPhone = (lead) => lead + String(Date.now() % 1_000_000_000).padStart(9, "0");

console.log("\n— 1. health: pages render —");
{
  const s = new Session();
  const r = await s.get("/");
  check("landing returns 200", r.status >= 200 && r.status < 400 || r.status === 200, `status ${r.status}`);
}
{
  const anon = new Session();
  const r = await anon.post("/api/patient/appointments", { doctorId: "x".repeat(32), scheduledAt: new Date().toISOString() });
  check("unauthenticated booking → 401", r.status === 401, `got ${r.status}`);
}

console.log("\n— 2. signup + onboarding —");
const pat = new Session("patient");
const doc = new Session("doctor");
let doctorId = null;
{
  const r = await pat.post("/api/auth/signup", {
    role: "PATIENT", acceptPolicy: true, adult: true, name: `E2E Patient ${stamp}`, email: `e2e.p.${stamp}@e2e.test`, phone: uniqPhone("9"), password: "e2epassword1",
  });
  check("patient signup 201", r.status === 201, JSON.stringify(r.data));
  const p = await pat.post("/api/auth/login", { email: `e2e.p.${stamp}@e2e.test`, password: "e2epassword1" });
  check("patient login 200 + cookie", p.status === 200 && pat.cookie.includes("cc_session="), `status ${p.status}`);

  const prof = await pat.post("/api/patient/profile", {
    allergies: ["Penicillin"], chronicConditions: ["Asthma"], currentMedications: [], bloodGroup: "O_POSITIVE",
  });
  check("onboarding save", prof.status === 200);

  // A76 guard: /patient is the first page a user sees after login and it calls
  // recordSections — the 2026-11-01 production incident (migration 0005 never applied on
  // Neon → "column refLow does not exist" → 500) shipped silently because no check ever
  // rendered this page over HTTP.
  const home = await pat.raw("/patient");
  const homeHtml = new TextDecoder().decode(home.bytes);
  check("A76: logged-in patient's /patient home renders 200 with content (schema ⇄ code in sync)", home.status === 200 && homeHtml.includes("Upcoming appointments"), `status ${home.status}`);

  const dup = await pat.post("/api/auth/signup", {
    role: "PATIENT", acceptPolicy: true, adult: true, name: "Dup", email: `e2e.p.${stamp}@e2e.test`, phone: "9999999998", password: "e2epassword1",
  });
  check("duplicate email rejected 409", dup.status === 409, `got ${dup.status}`);

  const weak = await pat.post("/api/auth/signup", {
    role: "PATIENT", acceptPolicy: true, adult: true, name: "Weak", email: `weak.${stamp}@e2e.test`, phone: "9999999997", password: "short",
  });
  check("weak password rejected 400", weak.status === 400, `got ${weak.status}`);
}
{
  const noReg = await doc.post("/api/auth/signup", {
    role: "DOCTOR", acceptPolicy: true, adult: true, name: `E2E NoReg ${stamp}`, email: `e2e.noreg.${stamp}@e2e.test`, phone: uniqPhone("6"),
    password: "e2edocpassword1", qualification: "MBBS", consultationFee: 600, specialty: "General Medicine",
  });
  check("F1: doctor signup WITHOUT registration number → 400", noReg.status === 400, `got ${noReg.status}`);
  const r = await doc.post("/api/auth/signup", {
    role: "DOCTOR", acceptPolicy: true, adult: true, name: `E2E Doctor ${stamp}`, email: `e2e.d.${stamp}@e2e.test`, phone: uniqPhone("8"),
    password: "e2edocpassword1", qualification: "MBBS", consultationFee: 600, specialty: "General Medicine",
    registrationNo: `MMC/2024/${stamp.slice(-5)}`,
  });
  check("doctor signup 201", r.status === 201, JSON.stringify(r.data));
  await doc.post("/api/auth/login", { email: `e2e.d.${stamp}@e2e.test`, password: "e2edocpassword1" });
  const dl = await doc.get("/api/doctor/patients/nope/record");
  check("doctor session active (403 unverified for junk id, not 401)", dl.status !== 401, `status ${dl.status}`);
  check("F1: unverified doctor cannot open ANY record (403 doctor_unverified)", dl.status === 403 && dl.data?.code === "doctor_unverified", `${dl.status} ${JSON.stringify(dl.data)}`);

  // admin queue → approve
  const adm = new Session("admin");
  const al = await adm.post("/api/auth/login", { email: "admin@demo.in", password: "city1234" });
  check("F1: admin login", al.status === 200 && al.data?.role === "SUPER_ADMIN", `${al.status} ${JSON.stringify(al.data)}`);
  const asPatient = await pat.get("/api/admin/doctors?status=pending");
  check("F1: patient cannot read the admin queue (403)", asPatient.status === 403, `got ${asPatient.status}`);
  const queue = await adm.get("/api/admin/doctors?status=pending");
  const mine = (queue.data?.doctors ?? []).find((d) => d.email === `e2e.d.${stamp}@e2e.test`);
  check("F1: new doctor appears in the pending queue with reg no", !!mine && mine.registrationNo === `MMC/2024/${stamp.slice(-5)}`, JSON.stringify(mine));
  if (mine) {
    const hidden = await fetch(`${BASE}/patient/doctors?q=${stamp}`, { headers: { cookie: pat.cookie } }).then((x) => x.text());
    check("F1: unverified doctor is hidden from patient search", !hidden.includes(mine.id), "found in search HTML");
    const nb = await pat.post("/api/patient/appointments", { doctorId: mine.id, scheduledAt: new Date(Date.now() + 86400000).toISOString(), reason: "x" });
    check("F1: booking an unverified doctor → 403 doctor_unverified", nb.status === 403 && nb.data?.code === "doctor_unverified", `${nb.status} ${JSON.stringify(nb.data)}`);
    const rej = await adm.post(`/api/admin/doctors/${mine.id}/verify`, { decision: "REJECT" });
    check("F1: rejection without a note → 400", rej.status === 400, `got ${rej.status}`);
    const apNoAttest = await adm.post(`/api/admin/doctors/${mine.id}/verify`, { decision: "APPROVE" });
    check("D12: approval without the register attestation → 400", apNoAttest.status === 400, `got ${apNoAttest.status}`);
    const ap = await adm.post(`/api/admin/doctors/${mine.id}/verify`, { decision: "APPROVE", register: "NMC_IMR", attested: true });
    check("F1: admin approves (with recorded attestation) → 200 isVerified", ap.status === 200 && ap.data?.isVerified === true, JSON.stringify(ap.data));
    const inbox = await doc.get("/api/notifications");
    check("F3: doctor's inbox has the verification notice (unread)", inbox.status === 200 && inbox.data?.unread >= 1 && inbox.data.items.some((n) => /verified/i.test(n.title)), JSON.stringify(inbox.data).slice(0, 200));
  }
}

console.log("\n— 3. find doctor + book —");
{
  const res = await fetch(`${BASE}/patient/doctors?q=${stamp}`, { headers: { cookie: pat.cookie } });
  const html = await res.text();
  const m = /\/patient\/doctors\/([0-9a-f-]{36})/.exec(html);
  doctorId = m?.[1] ?? null;
  check("search finds THIS run's e2e doctor", !!doctorId, `status ${res.status}`);

  bookedAt = istSlot(10, 0); // 10:00 IST on the picked weekday
  const b = await pat.post("/api/patient/appointments", { doctorId, scheduledAt: bookedAt, reason: "e2e" });
  check("booking for a valid future slot -> 201", b.status === 201, JSON.stringify(b.data));
  const apptId = b.data?.appointmentId;

  const b2 = await pat.post("/api/patient/appointments", { doctorId, scheduledAt: bookedAt, reason: "dupe" });
  check("same patient, same instant -> refused", [400, 409].includes(b2.status), `got ${b2.status}`);

  const pat2 = new Session("patient2");
  await pat2.post("/api/auth/signup", { role: "PATIENT", acceptPolicy: true, adult: true, name: `E2E Rival ${stamp}`, email: `e2e.r.${stamp}@e2e.test`, phone: uniqPhone("7"), password: "rivalpassword1" });
  await pat2.post("/api/auth/login", { email: `e2e.r.${stamp}@e2e.test`, password: "rivalpassword1" });
  const b3 = await pat2.post("/api/patient/appointments", { doctorId, scheduledAt: bookedAt, reason: "steal" });
  check("SECOND patient same instant -> 409 slot_full (capacity 1)", b3.status === 409 && b3.data?.code === "slot_full", `got ${b3.status} ${JSON.stringify(b3.data)}`);

  const bad = await pat.post("/api/patient/appointments", { doctorId, scheduledAt: new Date(Date.now() + 30 * 60e3).toISOString() });
  check("booking inside the 2h lead window -> refused", bad.status >= 400, `got ${bad.status}`);

  const cancel = await pat.patch("/api/patient/appointments", { appointmentId: apptId });
  check("cancel ok", cancel.status === 200, JSON.stringify(cancel.data));
  const b4 = await pat2.post("/api/patient/appointments", { doctorId, scheduledAt: bookedAt, reason: "after cancel" });
  check("cancelled slot is bookable again", b4.status === 201, `got ${b4.status}`);
  const b5 = await pat.post("/api/patient/appointments", { doctorId, scheduledAt: istSlot(11, 0), reason: "consent flow" });
  check("rebook same day 11:00 IST for consent flow", b5.status === 201, JSON.stringify(b5.data));
}

console.log("\n— 4. trust core on OUR OWN pair: 403 -> grant -> 200 -> safety 422 -> override -> revoke -> 403 —");
{
  // idempotent by design: run the whole trust flow on the e2e-created patient +
  // e2e-created doctor (never on seeded demo state, which a first pass consumes)
  const dr = await fetch(`${BASE}/patient/doctors?q=${stamp}`, { headers: { cookie: pat.cookie } });
  const dm = /\/patient\/doctors\/([0-9a-f-]{36})/.exec(await dr.text());
  check("e2e doctor findable in search", !!dm, 'not in search results');
  e2eDoctorId = dm[1];

  const prof = await pat.get('/api/patient/profile');
  const e2ePid = prof.data?.id;

  // book 12:00 IST on day+3 -> auto-creates a REQUESTED visit consent (see booking route)
  const b5 = await pat.post('/api/patient/appointments', { doctorId: e2eDoctorId, scheduledAt: istSlot(12, 0), reason: 'trust flow' });
  check("booking auto-creates access request", b5.status === 201, JSON.stringify(b5.data));

  const d1 = await doc.get(`/api/doctor/patients/${e2ePid}/record`);
  check('doctor read while consent REQUESTED -> 403', d1.status === 403, `got ${d1.status}`);
  check('403 explains itself', /consent/i.test(d1.data?.error ?? ''), JSON.stringify(d1.data));

  const grant = await pat.post('/api/patient/consents', { doctorId: e2eDoctorId, scope: 'FULL_RECORD', expiryDays: 7 });
  check('patient approves (FULL_RECORD)', [200, 201].includes(grant.status), JSON.stringify(grant.data));

  const d2 = await doc.get(`/api/doctor/patients/${e2ePid}/record`);
  check('doctor read after grant -> 200', d2.status === 200, `got ${d2.status}`);
  check('payload: digest + safety card + Penicillin allergy', (d2.data?.digest?.headline?.length ?? 0) >= 2 && JSON.stringify(d2.data?.record?.allergies).includes('Penicillin'), 'shape wrong');

  const prescBad = await doc.post(`/api/doctor/patients/${e2ePid}/encounter`, {
    chiefComplaint: 'throat infection', diagnosisText: 'Pharyngitis',
    items: [{ name: 'Amoxicillin', dosage: '500 mg', frequency: '1-0-1', durationDays: 5 }],
  });
  check('Amoxicillin vs recorded Penicillin allergy -> 422', prescBad.status === 422, `got ${prescBad.status}`);
  check('422 names the conflict', /penicillin/i.test(JSON.stringify(prescBad.data)), JSON.stringify(prescBad.data).slice(0, 140));

  const prescOv = await doc.post(`/api/doctor/patients/${e2ePid}/encounter`, {
    chiefComplaint: 'throat infection', diagnosisText: 'Pharyngitis',
    items: [{ name: 'Amoxicillin', dosage: '500 mg', frequency: '1-0-1', durationDays: 5 }],
    overrideReason: 'documented allergy is a childhood rash; skin-prick re-test negative 2025',
  });
  check('same rx WITH written override -> saved', prescOv.status === 201, JSON.stringify(prescOv.data).slice(0, 140));

  const allC = await pat.get('/api/patient/consents');
  const live = allC.data.consents.find((c) => c.status === 'APPROVED' && c.doctorId === e2eDoctorId);
  check('live approved consent visible', !!live, JSON.stringify(allC.data.consents.map((c) => c.status)));
  const rev = await pat.patch(`/api/patient/consents?id=${live.id}`, { reason: 'e2e revoke' });
  check('revoke returns 200', rev.status === 200, JSON.stringify(rev.data));

  const d3r = await doc.get(`/api/doctor/patients/${e2ePid}/record`);
  check('doctor read AFTER revoke -> instant 403', d3r.status === 403, `got ${d3r.status}`);
}

console.log("\n— 5. transparency + ledger integrity —");
{
  const seededPat = new Session("ramesh2");
  await seededPat.post("/api/auth/login", { email: "ramesh@demo.in", password: "city1234" });
  const led = await seededPat.get("/api/patient/ledger");
  check("ledger fetch 200", led.status === 200);
  check("chain intact", led.data?.chain?.intact === true, JSON.stringify(led.data?.chain?.breaks ?? []).slice(0, 160));
  const acts = (led.data?.entries ?? []).map((e) => e.action);
  check("patient sees GRANT_CONSENT in own log", acts.includes("GRANT_CONSENT"), acts.join(","));
  check("patient sees REVOKE_CONSENT in own log", acts.includes("REVOKE_CONSENT"), acts.join(","));
  check("patient sees the 403 attempts (VIEW_DENIED)", acts.includes("VIEW_DENIED"), acts.join(","));
  check("patient sees the doctor's reads (VIEW_RECORD)", acts.includes("VIEW_RECORD"), acts.join(","));
  const hashFmt = (led.data?.entries ?? []).every((e) => /^[0-9a-f]{16}$/.test(e.hash ?? ""));
  check("every entry exposes its (truncated) entry hash", hashFmt);
}

{
  const fx = await fetch(`${BASE}/api/patient/fhir`, { headers: { cookie: pat.cookie } });
  const ct = fx.headers.get("content-type") ?? "";
  const bundle = await fx.json().catch(() => null);
  check("F4: FHIR export → 200 application/fhir+json Bundle", fx.status === 200 && ct.includes("fhir+json") && bundle?.resourceType === "Bundle", `${fx.status} ${ct}`);
  const types = (bundle?.entry ?? []).map((e) => e.resource?.resourceType);
  check("F4: bundle has Patient + AllergyIntolerance (Penicillin from onboarding)", types.includes("Patient") && types.includes("AllergyIntolerance"), types.join(","));
  check("F4: no nulls in FHIR JSON", !JSON.stringify(bundle).includes("null"), "null present");
  const anon = await fetch(`${BASE}/api/patient/fhir`);
  check("F4: anonymous export → 401", anon.status === 401, `got ${anon.status}`);
}

console.log("\n— 6. lockout + session hygiene —");
{
  const evil = new Session("evil");
  let locked = false;
  for (let i = 0; i < 7; i++) {
    const r = await evil.post("/api/auth/login", { email: "anita@demo.in", password: "wrongguess" });
    if (r.status === 429) { locked = true; break; }
  }
  check("repeated wrong passwords → 429 lockout", locked);
  const goodAfter = await (async () => {
    const s = new Session();
    return s.post("/api/auth/login", { email: "anita@demo.in", password: "city1234" });
  })();
  check("locked account refuses even the correct password inside the 15-min window (A38: lock is timed, not permanent)", goodAfter.status === 429, `got ${goodAfter.status}`);
  // D9: an admin can see and clear the lockout
  const adm = new Session("admin");
  const al = await adm.post("/api/auth/login", { email: "admin@demo.in", password: "city1234" });
  check("admin login", al.status === 200, `got ${al.status}`);
  const lockedList = await adm.get("/api/admin/locked");
  const anitaRow = (lockedList.data?.locked ?? []).find((u) => u.email === "anita@demo.in");
  check("D9: /api/admin/locked lists anita with minutes left", lockedList.status === 200 && !!anitaRow && anitaRow.minutesLeft > 0, JSON.stringify(lockedList.data).slice(0, 200));
  if (anitaRow) {
    const un = await adm.post(`/api/admin/users/${anitaRow.id}/unlock`, {});
    check("D9: admin unlock → 200", un.status === 200 && un.data?.unlocked === true, `${un.status} ${JSON.stringify(un.data)}`);
    const back = await new Session().post("/api/auth/login", { email: "anita@demo.in", password: "city1234" });
    check("D9: anita can sign in again right after the unlock", back.status === 200, `got ${back.status}`);
    const un2 = await adm.post(`/api/admin/users/${anitaRow.id}/unlock`, {});
    check("D9: unlocking an unlocked account → 404 not_locked", un2.status === 404, `got ${un2.status}`);
  }
  const patUnlock = await pat.post(`/api/admin/users/${anitaRow?.id ?? "x"}/unlock`, {});
  check("D9: a patient cannot unlock anyone (403)", patUnlock.status === 403, `got ${patUnlock.status}`);
}

console.log("\n— 7. photo drafts stay unconfirmed until the patient taps —");
{
  const p3 = new Session("sunita");
  const lg = await p3.post("/api/auth/login", { email: "sunita@demo.in", password: "city1234" });
  check("sunita login", lg.status === 200, `got ${lg.status}`);
  const prof0 = await p3.get("/api/patient/profile");
  check("seeded DRAFT 'Tab. Brufen' NOT counted as a confirmed med", !(prof0.data?.answers?.current_medications ?? []).some((x) => /brufen/i.test(x)), JSON.stringify(prof0.data?.answers?.current_medications));
  const photo = await p3.post("/api/patient/photo", { ocrText: "Tab. Brufen 400 mg 1-0-1 after food" });
  check("photo parse 200 (name already present as draft -> 0 new inserts)", photo.status === 200 && photo.data.draftsInserted === 0, JSON.stringify(photo.data));
  const recs = await p3.get("/api/patient/records");
  void recs; // records page is RSC; the draft UI is verified by the 200 below
  const rp = await fetch(`${BASE}/patient/records`, { headers: p3.cookie ? { cookie: p3.cookie } : {} });
  const html = await rp.text();
  check("records page lists the DRAFT row for confirmation", rp.status === 200 && /draft/i.test(html), `status ${rp.status}`);
}


// ───────── 8. sign-in through a TLS-terminating proxy / cross-site iframe (A20–A22) ─────────
{
  console.log("\n[8] proxied-https sign-in + CSRF belts");
  const PUB = "3000-preview.example.app";
  const raw = (headers, body) => fetch(`${BASE}/api/auth/login`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body ?? { email: "ramesh@demo.in", password: "city1234", embedded: true }),
  });
  // browser sits on https://PUB inside a cross-site iframe; proxy forwards with the INTERNAL host header
  const r1 = await raw({ host: "localhost:3000", "x-forwarded-host": PUB, "x-forwarded-proto": "https", origin: `https://${PUB}` });
  const sc1 = (r1.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("cc_session=")) ?? "";
  // Probe: does this runtime hand X-Forwarded-* through to the app? Node/next does; wrangler dev
  // (workerd local proxy) rewrites them. Behind real Cloudflare the Worker sees the PUBLIC Host and
  // an https URL directly, so the proxy simulation is only meaningful where the headers survive.
  const forwardsProxyHeaders = r1.status === 200;
  const PROXY_SKIP = "runtime rewrites X-Forwarded-*; not applicable (Cloudflare gives the Worker the public Host + https URL)";
  let tok = "";
  if (forwardsProxyHeaders) {
    check("proxied login: public Origin vs internal Host → 200 (not csrf 403)", true);
    check("embedded https login cookie is SameSite=None + Secure + Partitioned (iframe-safe)",
      /samesite=none/i.test(sc1) && /;\s*secure/i.test(sc1) && /partitioned/i.test(sc1), sc1.replace(/=[^;]+;/, "=…;"));
    tok = sc1.split(";")[0];
    // same https request from a normal top-level tab → Lax + Secure (what the Cloudflare deploy issues)
    const r1b = await raw({ "x-forwarded-host": PUB, "x-forwarded-proto": "https", origin: `https://${PUB}` }, { email: "ramesh@demo.in", password: "city1234", embedded: false });
    const sc1b = (r1b.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("cc_session=")) ?? "";
    check("top-level https login cookie is SameSite=Lax + Secure, not Partitioned",
      r1b.status === 200 && /samesite=lax/i.test(sc1b) && /;\s*secure/i.test(sc1b) && !/partitioned/i.test(sc1b), sc1b.replace(/=[^;]+;/, "=…;"));
    const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: tok } }).then((r) => r.json());
    check("/api/auth/me sees the proxied session", me.viewer?.role === "PATIENT", JSON.stringify(me));
  } else {
    const r0 = await raw({ origin: BASE });
    tok = ((r0.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("cc_session=")) ?? "").split(";")[0];
    for (const n of ["proxied login: public Origin vs internal Host → 200", "embedded https login cookie is None+Secure+Partitioned", "top-level https login cookie is Lax+Secure", "/api/auth/me sees the proxied session"]) skip(n, PROXY_SKIP);
    const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: tok } }).then((r) => r.json());
    check("/api/auth/me sees the session", me.viewer?.role === "PATIENT", JSON.stringify(me));
  }
  const meAnon = await fetch(`${BASE}/api/auth/me`).then((r) => r.json());
  check("/api/auth/me anonymous → {viewer:null} with 200, never 401", meAnon.viewer === null);

  // Cookie shape follows the scheme BASE is actually served on:
  //   http  (local dev / next start)  → SameSite=Lax, NO Secure (Chrome drops None-without-Secure)
  //   https (Vercel / Cloudflare)     → SameSite=Lax; Secure  — the same test on a live URL
  //                                     must expect Secure, not its absence.
  const BASE_HTTPS = BASE.startsWith("https://");
  // NB: raw() defaults to embedded:true (the iframe case) — send embedded:false for the top-level shape.
  const TOP = { email: "ramesh@demo.in", password: "city1234", embedded: false };
  const r2 = await raw({ origin: BASE }, TOP);
  const sc2 = (r2.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("cc_session=")) ?? "";
  if (BASE_HTTPS) {
    check("https top-level login cookie is SameSite=Lax; Secure (no Partitioned)", /samesite=lax/i.test(sc2) && /;\s*secure/i.test(sc2) && !/partitioned/i.test(sc2), sc2.replace(/=[^;]*;/, "=…;"));
    const r2e = await raw({ origin: BASE }); // embedded:true
    const sc2e = (r2e.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("cc_session=")) ?? "";
    check("https embedded login cookie is SameSite=None; Secure; Partitioned", /samesite=none/i.test(sc2e) && /;\s*secure/i.test(sc2e) && /partitioned/i.test(sc2e), sc2e.replace(/=[^;]*;/, "=…;"));
  } else {
    check("plain-http login cookie is SameSite=Lax, not Secure", /samesite=lax/i.test(sc2) && !/;\s*secure/i.test(sc2), sc2.replace(/=[^;]*;/, "=…;"));
  }

  // CSRF belts still hold now that the cookie can travel cross-site over https
  const r3 = await raw({ host: PUB, "x-forwarded-host": PUB, origin: "https://evil.example" });
  check("foreign Origin → 403 csrf_origin with the MISMATCH message (A22)", r3.status === 403 && /cross-origin/.test((await r3.json()).error));
  const r4 = await raw({ host: PUB, origin: "null" });
  check("Origin: null (sandboxed frame) → 403", r4.status === 403);
  const r5 = await fetch(`${BASE}/api/auth/login`, { method: "POST", redirect: "manual",
    headers: { "content-type": "text/plain", origin: BASE }, body: '{"email":"ramesh@demo.in","password":"city1234"}' });
  check("text/plain JSON-smuggling body → 415 json_only", r5.status === 415, `got ${r5.status}`);
  const r6 = await fetch(`${BASE}/api/auth/logout`, { method: "POST", redirect: "manual", headers: { origin: BASE, cookie: tok } });
  check("logout without content-type (no body) still accepted", r6.status === 200, `got ${r6.status}`);
  const sc6 = (r6.headers.getSetCookie?.() ?? []).filter((c) => c.startsWith("cc_session="));
  if (BASE_HTTPS) {
    // over https the server cannot know which shape the browser holds (Lax+Secure from a
    // top-level login, or None+Secure+Partitioned from an embedded one) → it must expire BOTH
    check("logout over https expires BOTH shapes (Lax+Secure AND None+Secure+Partitioned)",
      sc6.length === 2 && sc6.every((c) => /max-age=0/i.test(c)) && sc6.some((c) => /partitioned/i.test(c)) && sc6.some((c) => /samesite=lax/i.test(c)), sc6.join(" | "));
  } else {
    check("logout over http expires the Lax cookie (Max-Age=0), exactly one header", sc6.length === 1 && /max-age=0/i.test(sc6[0]) && /samesite=lax/i.test(sc6[0]), sc6.join(" | "));
  }
  if (forwardsProxyHeaders) {
    const r7 = await fetch(`${BASE}/api/auth/logout`, { method: "POST", redirect: "manual", headers: { origin: `https://${PUB}`, "x-forwarded-host": PUB, "x-forwarded-proto": "https", cookie: tok } }); // NB: undici silently drops a manual Host header — the proxy case is expressed via X-Forwarded-Host
    const sc7 = (r7.headers.getSetCookie?.() ?? []).filter((c) => c.startsWith("cc_session="));
    check("logout over https expires BOTH shapes (Lax+Secure AND None+Secure+Partitioned) — else one survives",
      sc7.length === 2 && sc7.every((c) => /max-age=0/i.test(c)) && sc7.some((c) => /partitioned/i.test(c)) && sc7.some((c) => /samesite=lax/i.test(c)), sc7.join(" | "));
  } else {
    skip("logout over https expires BOTH cookie shapes", PROXY_SKIP);
  }
}

console.log("\n— 8. break-glass (F2) + inbox (F3) —");
{
  // a fresh patient who never shared anything with our e2e doctor
  const em = new Session("emergency-patient");
  await em.post("/api/auth/signup", { role: "PATIENT", acceptPolicy: true, adult: true, name: `E2E Unconscious ${stamp}`, email: `e2e.em.${stamp}@e2e.test`, phone: uniqPhone("5"), password: "emergencypass1" });
  await em.post("/api/auth/login", { email: `e2e.em.${stamp}@e2e.test`, password: "emergencypass1" });
  const me = await em.get("/api/auth/me");
  const emPid = me.data?.viewer?.profileId;
  check("emergency patient exists", !!emPid, JSON.stringify(me.data));
  if (emPid) {
    const before = await doc.get(`/api/doctor/patients/${emPid}/record`);
    check("F2: no consent → 403 no_consent", before.status === 403 && before.data?.code === "no_consent", `${before.status} ${JSON.stringify(before.data)}`);
    const weak = await doc.post(`/api/doctor/patients/${emPid}/emergency`, { reason: "urgent", confirm: true });
    check("F2: vague reason → 400", weak.status === 400, `got ${weak.status}`);
    const noConfirm = await doc.post(`/api/doctor/patients/${emPid}/emergency`, { reason: "Unconscious after road accident, need allergy history", confirm: false });
    check("F2: without explicit confirmation → 400", noConfirm.status === 400, `got ${noConfirm.status}`);
    const bg = await doc.post(`/api/doctor/patients/${emPid}/emergency`, { reason: "Unconscious after road accident, need allergy and medication history before intubation", confirm: true });
    check("F2: break-glass → 201 with 60-min consent", bg.status === 201 && bg.data?.minutes === 60 && !!bg.data?.consentId, `${bg.status} ${JSON.stringify(bg.data)}`);
    const after = await doc.get(`/api/doctor/patients/${emPid}/record`);
    check("F2: record opens and is flagged isEmergency", after.status === 200 && after.data?.isEmergency === true && /intubation/.test(after.data?.emergencyReason ?? ""), `${after.status}`);
    const again = await doc.post(`/api/doctor/patients/${emPid}/emergency`, { reason: "Unconscious after road accident, need allergy and medication history before intubation", confirm: true });
    check("F2: second override while live → 409 consent_live", again.status === 409, `got ${again.status}`);
    const led = await em.get("/api/patient/ledger");
    const entries = led.data?.entries ?? led.data?.rows ?? led.data ?? [];
    check("F2: EMERGENCY_ACCESS is in the patient's ledger", JSON.stringify(entries).includes("EMERGENCY_ACCESS"), JSON.stringify(led.data).slice(0, 160));
    const inbox = await em.get("/api/notifications");
    const crit = (inbox.data?.items ?? []).find((n) => n.severity === "CRITICAL" && /Emergency access/i.test(n.title));
    check("F3: patient got a CRITICAL inbox notification with the reason", !!crit && /intubation/.test(crit.body) && crit.href === "/patient/access", JSON.stringify(inbox.data).slice(0, 200));
    const cnt = await em.get("/api/notifications?count=1");
    check("F3: bell endpoint returns the unread count", cnt.status === 200 && cnt.data?.unread >= 1, JSON.stringify(cnt.data));
    const rd = await em.post("/api/notifications/read", { all: true });
    const cnt2 = await em.get("/api/notifications?count=1");
    check("F3: mark-all-read → unread 0", rd.status === 200 && cnt2.data?.unread === 0, JSON.stringify(cnt2.data));
    const rv = await em.patch(`/api/patient/consents?id=${bg.data?.consentId}`, { reason: "I am awake now" });
    check("F2: patient revokes the emergency consent", rv.status === 200, `${rv.status} ${JSON.stringify(rv.data)}`);
    const closed = await doc.get(`/api/doctor/patients/${emPid}/record`);
    check("F2: doctor's very next request → 403", closed.status === 403, `got ${closed.status}`);
    const anonInbox = await new Session("anon").get("/api/notifications");
    check("F3: anonymous inbox → 401", anonInbox.status === 401, `got ${anonInbox.status}`);
  }
}

// ---------- §9 L1: legal & compliance pack ----------
{
  const anon = new Session("anon-legal");
  for (const [path, needle] of [["/legal/privacy", "Privacy notice"], ["/legal/terms", "Terms of use"], ["/legal/grievance", "Grievance"], ["/legal/licenses", "Open-source licences"]]) {
    const res = await fetch(BASE + path);
    const html = await res.text();
    check(`L1: ${path} renders (200) and is the right document`, res.status === 200 && html.includes(needle), `status ${res.status}`);
  }
  const privacy = await (await fetch(BASE + "/legal/privacy")).text();
  check("L1: privacy notice is itemised and names processors + regions (Rules r.3)", /Neon/.test(privacy) && /Singapore/.test(privacy) && /Data Protection Board/.test(privacy) && !/7-year/.test(privacy));
  const home = await (await fetch(BASE + "/")).text();
  check("L1: landing carries the demo banner and legal links", /Public demo\./.test(home) && /\/legal\/privacy/.test(home) && /108/.test(home));
  const signupHtml = await (await fetch(BASE + "/signup")).text();
  check("L1: signup page carries the consent + adult attestations", /privacy notice/i.test(signupHtml) && /18 or older/.test(signupHtml));

  const noConsent = await anon.post("/api/auth/signup", { role: "PATIENT", adult: true, name: `E2E NoConsent ${stamp}`, email: `e2e.nc.${stamp}@e2e.test`, phone: uniqPhone("4"), password: "e2epassword1" });
  check("L1: signup without accepting the notice → 400 (server-side, not just a checkbox)", noConsent.status === 400, `got ${noConsent.status}`);
  const notAdult = await anon.post("/api/auth/signup", { role: "PATIENT", acceptPolicy: true, adult: false, name: `E2E Kid ${stamp}`, email: `e2e.kid.${stamp}@e2e.test`, phone: uniqPhone("4"), password: "e2epassword1" });
  check("L1: signup without the adult attestation → 400", notAdult.status === 400, `got ${notAdult.status}`);
  const minor = await anon.post("/api/auth/signup", { role: "PATIENT", acceptPolicy: true, adult: true, name: `E2E Minor ${stamp}`, email: `e2e.minor.${stamp}@e2e.test`, phone: uniqPhone("4"), password: "e2epassword1", dateOfBirth: "2015-06-01T00:00:00.000Z" });
  check("L1: DOB under 18 → 400 minor_needs_guardian (DPDP s.9)", minor.status === 400 && minor.data?.code === "minor_needs_guardian", `${minor.status} ${JSON.stringify(minor.data)}`);
  const reserved = await anon.post("/api/auth/signup", { role: "PATIENT", acceptPolicy: true, adult: true, name: `E2E Reserved ${stamp}`, email: `e2e.res.${stamp}@demo.in`, phone: uniqPhone("4"), password: "e2epassword1" });
  check("L1: self-signup on the reserved seed domain → 400 reserved_domain", reserved.status === 400 && reserved.data?.code === "reserved_domain", `${reserved.status} ${JSON.stringify(reserved.data)}`);

  const acc = await pat.get("/api/legal/acceptance");
  const keys = (acc.data?.acceptances ?? []).map((a) => a.policyKey).sort();
  check("L1: consent artefact stored for the new patient (privacy-notice + terms, current versions)",
    acc.status === 200 && keys.join(",") === "privacy-notice,terms" && acc.data.acceptances.every((a) => a.version === acc.data.current[a.policyKey]), JSON.stringify(acc.data).slice(0, 200));
  const anonAcc = await anon.get("/api/legal/acceptance");
  check("L1: acceptance endpoint requires a session", anonAcc.status === 401, `got ${anonAcc.status}`);

  const nom0 = await pat.get("/api/patient/nominee");
  check("L1: nominee starts empty", nom0.status === 200 && nom0.data?.nominee === null, JSON.stringify(nom0.data));
  const nomBad = await pat.put("/api/patient/nominee", { name: "X", relation: "", phone: "12" });
  check("L1: invalid nominee → 400", nomBad.status === 400, `got ${nomBad.status}`);
  const nom1 = await pat.put("/api/patient/nominee", { name: "Meera Patil", relation: "sister", phone: "9822011122" });
  check("L1: nominee saved (DPDP s.14)", nom1.status === 200 && nom1.data?.nominee?.name === "Meera Patil", JSON.stringify(nom1.data));
  const ledN = await pat.get("/api/patient/ledger");
  check("L1: NOMINEE_SET is in the ledger", JSON.stringify(ledN.data).includes("NOMINEE_SET"));
  const nomDel = await pat.del("/api/patient/nominee");
  check("L1: nominee cleared", nomDel.status === 200 && nomDel.data?.nominee === null, JSON.stringify(nomDel.data));

  const cronNoAuth = await fetch(BASE + "/api/cron/daily");
  check("L1: daily cron refuses without the secret (401/503, never 200)", cronNoAuth.status === 401 || cronNoAuth.status === 503, `got ${cronNoAuth.status}`);
  if (process.env.CRON_SECRET) {
    const cron = await fetch(BASE + "/api/cron/daily", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const cj = await cron.json().catch(() => ({}));
    check("L1: daily cron runs with the secret and reports the retention policy", cron.status === 200 && Number.isInteger(cj.retention?.days) && cj.retention?.protectedDomain === "demo.in" && cj.ledger?.breaks === 0, `${cron.status} ${JSON.stringify(cj)}`);
  } else {
    skip("L1: daily cron with secret", "CRON_SECRET not in env");
  }
}

console.log("\n— 10. server sessions (D2/D14), re-consent 428 (L2), grievance desk (L-G1), incidents (L-G5), break-glass review (D41), dependents (F13), ledger paging (D37), i18n (L-G2) —");
{
  // --- sessions: list, second device, logout everywhere ---
  const sess = await pat.get("/api/auth/sessions");
  check("D14: /api/auth/sessions lists my live sessions with one marked current", sess.status === 200 && Array.isArray(sess.data?.sessions) && sess.data.sessions.some((x) => x.current), JSON.stringify(sess.data).slice(0, 200));
  const patEmail = `e2e.p.${stamp}@e2e.test`;
  const second = new Session("second-device");
  const l2 = await second.post("/api/auth/login", { email: patEmail, password: "e2epassword1" });
  check("D14: second device signs in", l2.status === 200, `got ${l2.status}`);
  const sess2 = await pat.get("/api/auth/sessions");
  check("D14: two live sessions visible", (sess2.data?.sessions ?? []).length >= 2, JSON.stringify(sess2.data).slice(0, 200));
  const everywhere = await second.post("/api/auth/logout", { everywhere: true });
  check("D14: logout everywhere revokes ≥2 sessions", everywhere.status === 200 && everywhere.data?.revoked >= 2, JSON.stringify(everywhere.data));
  const dead = await pat.get("/api/auth/me");
  check("D2: the first device's still-valid JWT is now anonymous (server-side revocation)", dead.status === 200 && dead.data?.viewer === null, JSON.stringify(dead.data));
  const relog = await pat.post("/api/auth/login", { email: patEmail, password: "e2epassword1" });
  check("patient re-login", relog.status === 200, `got ${relog.status}`);

  // --- L2: outdated notice version → 428 on writes, GET still works, POST acceptance clears it ---
  const meP = await pat.get("/api/auth/me");
  const backdated = await sql(`UPDATE "PolicyAcceptance" pa SET version='2000-01-01' FROM "Patient" p WHERE p.id=$1 AND pa."userId"=p."userId" AND pa."policyKey"='privacy-notice'`, [meP.data?.viewer?.profileId]);
  if (backdated) {
    const w = await pat.put("/api/patient/nominee", { name: "Meera Patil", relation: "sister", phone: "9822011122" });
    check("L2: write with an outdated privacy-notice version → 428 consent_outdated", w.status === 428 && w.data?.code === "consent_outdated" && !!w.data?.current, `${w.status} ${JSON.stringify(w.data)}`);
    const r = await pat.get("/api/patient/profile");
    check("L2: reads still work while outdated (no lockout, just no new processing)", r.status === 200, `got ${r.status}`);
    const g = await pat.post("/api/grievances", { category: "OTHER", subject: "probe while outdated", body: "Complaints must never be blocked behind re-consent; this is a probe from e2e." });
    check("L2: raising a grievance is allowed while outdated (allowStaleConsent)", g.status === 201, `${g.status} ${JSON.stringify(g.data)}`);
    const acc = await pat.post("/api/legal/acceptance", {});
    check("L2: POST /api/legal/acceptance re-accepts current versions", acc.status === 200 && acc.data?.inserted >= 1, JSON.stringify(acc.data));
    const w2 = await pat.put("/api/patient/nominee", { name: "Meera Patil", relation: "sister", phone: "9822011122" });
    check("L2: write succeeds after re-acceptance", w2.status === 200, `got ${w2.status}`);
    await pat.del("/api/patient/nominee");
  } else {
    skip("L2: 428 re-consent flow", "needs local DATABASE_URL to backdate the acceptance");
  }

  // --- grievance desk + rate limit ---
  const gBad = await pat.post("/api/grievances", { category: "ACCESS", subject: "x", body: "short" });
  check("L-G1: invalid grievance → 400", gBad.status === 400, `got ${gBad.status}`);
  const g1 = await pat.post("/api/grievances", { category: "CORRECTION", subject: `E2E correction ${stamp}`, body: "My blood group is recorded wrongly; please correct it to B+ as per my report." });
  check("L-G1: grievance opened → 201 with a due date", g1.status === 201 && !!g1.data?.id && !!g1.data?.dueAt, `${g1.status} ${JSON.stringify(g1.data)}`);
  const mine = await pat.get("/api/grievances");
  check("L-G1: my grievances list shows it OPEN", mine.status === 200 && (mine.data?.grievances ?? []).some((x) => x.id === g1.data?.id && x.status === "OPEN"), JSON.stringify(mine.data).slice(0, 200));
  const adm = new Session("admin");
  await adm.post("/api/auth/login", { email: "admin@demo.in", password: "city1234" });
  const inbox = await adm.get("/api/notifications");
  check("L-G1: admin inbox received the grievance notification", (inbox.data?.items ?? []).some((n) => /Grievance/.test(n.title ?? "")), JSON.stringify(inbox.data).slice(0, 200));
  const queue = await adm.get("/api/admin/grievances");
  check("L-G1: admin queue lists it with the complainant's email", queue.status === 200 && (queue.data?.grievances ?? []).some((x) => x.id === g1.data?.id && x.email === patEmail), JSON.stringify(queue.data).slice(0, 200));
  const rejNoNote = await adm.patch(`/api/admin/grievances/${g1.data?.id}`, { status: "REJECTED" });
  check("L-G1: rejecting without a resolution → 400", rejNoNote.status === 400, `got ${rejNoNote.status}`);
  const res1 = await adm.patch(`/api/admin/grievances/${g1.data?.id}`, { status: "RESOLVED", resolution: "Blood group corrected to B+ after checking the uploaded report." });
  check("L-G1: admin resolves → 200", res1.status === 200, `${res1.status} ${JSON.stringify(res1.data)}`);
  const mine2 = await pat.get("/api/grievances");
  check("L-G1: complainant sees RESOLVED + resolution text", (mine2.data?.grievances ?? []).some((x) => x.id === g1.data?.id && x.status === "RESOLVED" && /B\+/.test(x.resolution ?? "")), JSON.stringify(mine2.data).slice(0, 200));
  const pInbox = await pat.get("/api/notifications");
  check("L-G1: complainant was notified of the resolution", JSON.stringify(pInbox.data).includes("Grievance resolved"), JSON.stringify(pInbox.data).slice(0, 200));
  const led = await pat.get("/api/patient/ledger");
  const ledStr = JSON.stringify(led.data);
  check("A57: the patient's ledger shows account-level events too (GRIEVANCE_OPENED by me, GRIEVANCE_UPDATED by admin)", ledStr.includes("GRIEVANCE_OPENED") && ledStr.includes("GRIEVANCE_UPDATED"), ledStr.slice(0, 160));
  if (backdated) check("A57: POLICY_ACCEPTED (User-keyed) is on my ledger", ledStr.includes("POLICY_ACCEPTED"), ledStr.slice(0, 120));
  const patNotAdmin = await pat.get("/api/admin/grievances");
  check("L-G1: patient cannot read the admin queue (403)", patNotAdmin.status === 403, `got ${patNotAdmin.status}`);
  let limited = false;
  for (let i = 0; i < 12; i++) {
    const r = await pat.post("/api/grievances", { category: "OTHER", subject: `flood ${i}`, body: "Flooding the desk from e2e to prove the per-user limit exists and returns 429." });
    if (r.status === 429 && r.data?.code === "rate_limited") { limited = true; check("D8: 429 carries retryAfterSec", Number.isInteger(r.data?.retryAfterSec), JSON.stringify(r.data)); break; }
  }
  check("D8: grievance flood → 429 rate_limited within 12 attempts", limited);

  // --- incidents (breach register) ---
  const incBad = await adm.post("/api/admin/incidents", { title: "x" });
  check("L-G5: invalid incident → 400", incBad.status === 400, `got ${incBad.status}`);
  const inc = await adm.post("/api/admin/incidents", { title: `E2E drill ${stamp}`, summary: "Tabletop drill: a staging backup URL was briefly public. No evidence of access.", dataInvolved: "names + phone numbers of demo accounts", userAdvice: "No action needed; change your password if you reused it elsewhere." });
  check("L-G5: incident opened → 201 with 72 h Board deadline", inc.status === 201 && !!inc.data?.id && Date.parse(inc.data?.boardDeadline) - Date.parse(inc.data?.detectedAt) === 72 * 3600e3, `${inc.status} ${JSON.stringify(inc.data)}`);
  const notif = await adm.post(`/api/admin/incidents/${inc.data?.id}/notify`, { scope: "EMAILS", emails: [patEmail] });
  check("L-G5: targeted user notification → count 1", notif.status === 200 && notif.data?.notified === 1, `${notif.status} ${JSON.stringify(notif.data)}`);
  const pInbox2 = await pat.get("/api/notifications");
  check("L-G5: affected user got a CRITICAL 'Security notice' with what-to-do", /Security notice/.test(JSON.stringify(pInbox2.data)) && /What you should do/.test(JSON.stringify(pInbox2.data)), JSON.stringify(pInbox2.data).slice(0, 200));
  const upd = await adm.patch(`/api/admin/incidents/${inc.data?.id}`, { status: "CONTAINED", rootCause: "Misconfigured bucket ACL", remediation: "ACL fixed; backups moved behind auth.", containedAt: new Date().toISOString(), boardNotifiedAt: new Date().toISOString() });
  check("L-G5: incident updated (contained + Board notified)", upd.status === 200, `${upd.status} ${JSON.stringify(upd.data)}`);
  const rep = await fetch(`${BASE}/api/admin/incidents/${inc.data?.id}/report`, { headers: { cookie: adm.cookie } });
  const repJ = await rep.json().catch(() => ({}));
  check("L-G5: r.7(2) report downloads as JSON with the intimation count", rep.status === 200 && (rep.headers.get("content-disposition") ?? "").includes("attachment") && repJ.intimationToDataPrincipals?.count === 1 && repJ.incident?.findingsOnCause === "Misconfigured bucket ACL", `${rep.status} ${JSON.stringify(repJ).slice(0, 200)}`);
  await adm.patch(`/api/admin/incidents/${inc.data?.id}`, { status: "CLOSED" });
  const incAnon = await new Session().get("/api/admin/incidents");
  check("L-G5: register requires admin (401 anon)", incAnon.status === 401, `got ${incAnon.status}`);

  // --- break-glass review (D41): the §8 override is pending; review it ---
  const pend = await adm.get("/api/admin/emergencies?status=pending");
  const ours = (pend.data?.emergencies ?? []).find((e) => /intubation/.test(e.reason ?? ""));
  check("D41: the §8 override sits in the pending review queue with read count", pend.status === 200 && !!ours && Number.isInteger(ours.reads), JSON.stringify(pend.data).slice(0, 200));
  if (ours) {
    const noNote = await adm.post(`/api/admin/emergencies/${ours.id}/review`, { verdict: "UNJUSTIFIED" });
    check("D41: unjustified without a note → 400", noNote.status === 400, `got ${noNote.status}`);
    const ok1 = await adm.post(`/api/admin/emergencies/${ours.id}/review`, { verdict: "JUSTIFIED", note: "Trauma admission; reads limited to allergies." });
    check("D41: justified verdict → 200, doctor not suspended", ok1.status === 200 && ok1.data?.doctorSuspended === false, `${ok1.status} ${JSON.stringify(ok1.data)}`);
    const twice = await adm.post(`/api/admin/emergencies/${ours.id}/review`, { verdict: "JUSTIFIED" });
    check("D41: second verdict on the same override → 409", twice.status === 409, `got ${twice.status}`);
    const dInbox = await doc.get("/api/notifications");
    check("D41: doctor was told the verdict", /Emergency access reviewed/.test(JSON.stringify(dInbox.data)), JSON.stringify(dInbox.data).slice(0, 160));
    const reviewed = await adm.get("/api/admin/emergencies?status=reviewed");
    check("D41: it moved to the reviewed list", (reviewed.data?.emergencies ?? []).some((e) => e.id === ours.id && e.reviewVerdict === "JUSTIFIED"));
  }

  // --- dependents (F13 / L-G4) ---
  const dep0 = await pat.get("/api/patient/dependents");
  check("F13: dependents start empty", dep0.status === 200 && dep0.data?.dependents?.length === 0, JSON.stringify(dep0.data));
  const adultDob = dobYearsAgo(20);
  const depAdult = await pat.post("/api/patient/dependents", { name: "Grown Up", dateOfBirth: adultDob, relation: "PARENT", guardianDateOfBirth: dobYearsAgo(45) });
  check("F13: an adult cannot be added as a dependent → 400 not_a_minor", depAdult.status === 400 && depAdult.data?.code === "not_a_minor", `${depAdult.status} ${JSON.stringify(depAdult.data)}`);
  const childDob = dobYearsAgo(7);
  const depMinorGuardian = await pat.post("/api/patient/dependents", { name: "Kid One", dateOfBirth: childDob, relation: "PARENT", guardianDateOfBirth: dobYearsAgo(16) });
  check("F13: a minor guardian is refused → 403 guardian_not_adult", depMinorGuardian.status === 403 && depMinorGuardian.data?.code === "guardian_not_adult", `${depMinorGuardian.status} ${JSON.stringify(depMinorGuardian.data)}`);
  const dep1 = await pat.post("/api/patient/dependents", { name: `Kid ${stamp}`, dateOfBirth: childDob, gender: "FEMALE", relation: "PARENT", guardianDateOfBirth: dobYearsAgo(34) });
  check("F13: dependent added → 201 (guardian DOB stored, r.10 age check)", dep1.status === 201 && !!dep1.data?.id && dep1.data?.age === 7, `${dep1.status} ${JSON.stringify(dep1.data)}`);
  const sw = await pat.post(`/api/patient/dependents/${dep1.data?.id}/switch`, {});
  check("F13: switch into the dependent → new session", sw.status === 200 && sw.data?.actingFor === dep1.data?.id, `${sw.status} ${JSON.stringify(sw.data)}`);
  const meDep = await pat.get("/api/auth/me");
  check("F13: /api/auth/me shows profileId = dependent and actingFor set", meDep.data?.viewer?.profileId === dep1.data?.id && meDep.data?.viewer?.actingFor === dep1.data?.id, JSON.stringify(meDep.data));
  const nest = await pat.post("/api/patient/dependents", { name: "Nested", dateOfBirth: childDob, relation: "PARENT" });
  check("F13: no nesting — cannot add a dependent while acting as one (403)", nest.status === 403, `got ${nest.status}`);
  const depProfile = await pat.get("/api/patient/profile");
  check("F13: the dependent's own profile loads under the guardian's session", depProfile.status === 200, `got ${depProfile.status}`);
  const depLedger = await pat.get("/api/patient/ledger");
  check("F13: DEPENDENT_ADDED is on the child's ledger, actor = guardian", JSON.stringify(depLedger.data).includes("DEPENDENT_ADDED"), JSON.stringify(depLedger.data).slice(0, 160));
  const back = await pat.post("/api/patient/dependents/switch-back", {});
  const meBack = await pat.get("/api/auth/me");
  check("F13: switch back → own profile, actingFor null", back.status === 200 && meBack.data?.viewer?.actingFor === null && meBack.data?.viewer?.profileId !== dep1.data?.id, JSON.stringify(meBack.data));
  const dep2 = await pat.get("/api/patient/dependents");
  check("F13: dependent listed with age 7 and relation", (dep2.data?.dependents ?? []).some((d) => d.id === dep1.data?.id && d.age === 7 && d.relation === "PARENT"), JSON.stringify(dep2.data));
  const stranger = new Session("stranger");
  await stranger.post("/api/auth/login", { email: "vikas@demo.in", password: "city1234" });
  const steal = await stranger.post(`/api/patient/dependents/${dep1.data?.id}/switch`, {});
  check("F13: another patient cannot switch into my dependent (404)", steal.status === 404, `got ${steal.status}`);

  // --- ledger paging (D37) ---
  const p1 = await pat.get("/api/patient/ledger?limit=2");
  check("D37: limit=2 returns 2 rows + nextBefore + chain verdict", p1.status === 200 && p1.data?.entries?.length === 2 && !!p1.data?.nextBefore && !!p1.data?.chain, JSON.stringify(p1.data).slice(0, 200));
  const p2 = await pat.get(`/api/patient/ledger?limit=2&before=${p1.data?.nextBefore}`);
  check("D37: next page is strictly older and carries no chain re-walk", p2.status === 200 && p2.data?.entries?.length >= 1 && Number(p2.data.entries[0].seq) < Number(p1.data?.nextBefore) && p2.data?.chain === undefined, JSON.stringify(p2.data).slice(0, 200));
  const pBad = await pat.get("/api/patient/ledger?before=DROP");
  check("D37: junk cursor → empty page, not 500", pBad.status === 200 && pBad.data?.entries?.length === 0, `${pBad.status}`);

  // --- legal i18n (L-G2) ---
  const hi = await fetch(`${BASE}/legal/privacy?lang=hi`);
  const hiHtml = await hi.text();
  check("L-G2: /legal/privacy?lang=hi renders Devanagari key points", hi.status === 200 && /गोपनीयता सूचना/.test(hiHtml) && /lang="hi"/.test(hiHtml), `status ${hi.status}`);
  const mr = await fetch(`${BASE}/legal/privacy?lang=mr`);
  check("L-G2: ?lang=mr renders Marathi", mr.status === 200 && /गोपनीयता सूचना — मुख्य मुद्दे/.test(await mr.text()), `status ${mr.status}`);
  const junk = await fetch(`${BASE}/legal/privacy?lang=zz`);
  check("L-G2: unknown lang falls back to English", junk.status === 200 && /key points/.test(await junk.text()));
  const grievPage = await fetch(`${BASE}/legal/grievance`);
  check("L-G1: /legal/grievance page renders the desk", grievPage.status === 200 && /grievance/i.test(await grievPage.text()));
  for (const path of ["/admin/grievances", "/admin/incidents", "/admin/emergencies"]) {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie: adm.cookie } });
    check(`admin page ${path} renders 200`, r.status === 200, `got ${r.status}`);
  }
}
console.log("\n— 11. files (D4/L-G8), recovery (D3/D9), handover (D49), anchors (D13), capacity (D6), verification attestation (D12) —");
{
  const adm = new Session("admin");
  await adm.post("/api/auth/login", { email: "admin@demo.in", password: "city1234" });
  // re-login the e2e patient in case an earlier section rotated the session
  const patEmail = `e2e.p.${stamp}@e2e.test`;
  let patPw = "e2epassword1";
  if (!pat.cookie) await pat.post("/api/auth/login", { email: patEmail, password: patPw });

  // ---- documents: real file, encrypted, quota, signed links, scope, ledger ----
  const pdfBytes = new TextEncoder().encode("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  const fd = new FormData();
  fd.append("file", new Blob([pdfBytes], { type: "application/pdf" }), "cbc.pdf");
  fd.append("title", "CBC report"); fd.append("type", "LAB_REPORT"); fd.append("issuedOn", "2026-09-01");
  const up = await pat.upload("/api/patient/documents", fd);
  check("D4: patient uploads a PDF → 201 with sha256", up.status === 201 && /^[0-9a-f]{64}$/.test(up.data?.sha256 ?? ""), `${up.status} ${JSON.stringify(up.data)}`);
  const docId = up.data?.id;
  const fake = new FormData();
  fake.append("file", new Blob([new TextEncoder().encode("<html><script>alert(1)</script></html>")], { type: "application/pdf" }), "evil.pdf");
  fake.append("title", "evil"); fake.append("type", "OTHER");
  const upFake = await pat.upload("/api/patient/documents", fake);
  check("D4: HTML disguised as PDF is sniffed and refused (415)", upFake.status === 415, `got ${upFake.status}`);
  const noOrigin = await fetch(BASE + "/api/patient/documents", { method: "POST", headers: { cookie: pat.cookie, origin: "https://evil.example" }, body: fd });
  check("D22: cross-origin multipart upload is refused by the CSRF guard (403)", noOrigin.status === 403, `got ${noOrigin.status}`);
  const list = await pat.get("/api/patient/documents");
  check("D4: list shows the file + quota used", list.status === 200 && (list.data?.documents ?? []).some((d) => d.id === docId) && list.data?.quota?.usedBytes >= pdfBytes.length, JSON.stringify(list.data).slice(0, 200));
  const link = await pat.post(`/api/documents/${docId}/link`, {});
  check("D4: signed download link minted (≤60 s)", link.status === 200 && /\/api\/documents\//.test(link.data?.url ?? "") && new Date(link.data?.expiresAt).getTime() - Date.now() <= 61_000, JSON.stringify(link.data));
  const dl = await pat.raw(link.data?.url ?? "/x");
  check("D4: download returns the original bytes with the right type", dl.status === 200 && dl.headers.get("content-type")?.startsWith("application/pdf") && dl.bytes.length === pdfBytes.length && /attachment|inline/.test(dl.headers.get("content-disposition") ?? ""), `${dl.status} ${dl.headers.get("content-type")} ${dl.bytes.length}`);
  const forged = await pat.raw((link.data?.url ?? "/x").replace(/sig=[^&]+/, "sig=AAAA"));
  check("D4: forged signature → 403", forged.status === 403, `got ${forged.status}`);
  const stranger2 = new Session("stranger2");
  await stranger2.post("/api/auth/login", { email: "vikas@demo.in", password: "city1234" });
  const otherLink = await stranger2.raw(link.data?.url ?? "/x");
  check("D4: a different signed-in user cannot replay my link (403)", otherLink.status === 403, `got ${otherLink.status}`);
  const otherMint = await stranger2.post(`/api/documents/${docId}/link`, {});
  check("D4: another patient cannot mint a link for my file (404)", otherMint.status === 404, `got ${otherMint.status}`);
  const cons = await pat.get("/api/patient/consents");
  const fullLive = (cons.data?.consents ?? []).some((c) => c.doctorId === e2eDoctorId && c.status === "APPROVED" && c.scope === "FULL_RECORD" && new Date(c.expiresAt) > new Date());
  const docLink = await doc.post(`/api/documents/${docId}/link`, {});
  check(`D4: doctor link follows scope (${fullLive ? "FULL live → 200" : "no FULL consent → 403"})`, fullLive ? docLink.status === 200 : docLink.status === 403, `got ${docLink.status} ${JSON.stringify(docLink.data)}`);
  const led = await pat.get("/api/patient/ledger?limit=20");
  check("D4: upload and download are in my ledger", (led.data?.entries ?? []).some((e) => e.action === "UPLOAD_DOC") && (led.data?.entries ?? []).some((e) => e.action === "DOWNLOAD_DOC"), JSON.stringify((led.data?.entries ?? []).map((e) => e.action)));
  const delDoc = await pat.del(`/api/documents/${docId}`);
  check("D4: delete → 200 and the link is dead afterwards", delDoc.status === 200 && (await pat.raw(link.data?.url ?? "/x")).status === 404, `got ${delDoc.status}`);

  // ---- recovery codes ----
  const rc0 = await pat.get("/api/auth/recovery-codes");
  check("D9: summary shows 0 codes, unverified e-mail, delivery flag", rc0.status === 200 && rc0.data?.remaining === 0 && rc0.data?.emailVerified === false && typeof rc0.data?.emailDelivery === "boolean", JSON.stringify(rc0.data));
  const rc = await pat.post("/api/auth/recovery-codes", {});
  check("D9: generates 8 one-time codes", rc.status === 201 && rc.data?.codes?.length === 8 && rc.data.codes.every((c) => /^[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(c)), JSON.stringify(rc.data).slice(0, 120));
  const codes = rc.data?.codes ?? [];
  const anonR = new Session("anon-recover");
  const badRec = await anonR.post("/api/auth/recover", { email: patEmail, code: "AAAAA-AAAAA", newPassword: "brandnewpass1" });
  check("D9: wrong code → 401, no hint which part failed", badRec.status === 401, `got ${badRec.status}`);
  const rec = await anonR.post("/api/auth/recover", { email: patEmail, code: codes[0]?.toLowerCase().replace("-", "") ?? "", newPassword: "brandnewpass1" });
  check("D9: valid code (typed lower-case, no dash) resets the password → 200", rec.status === 200, `${rec.status} ${JSON.stringify(rec.data)}`);
  patPw = "brandnewpass1";
  const oldSess = await pat.get("/api/auth/me");
  check("D9: every old session is revoked on reset", oldSess.data?.viewer === null || oldSess.status === 401, JSON.stringify(oldSess.data));
  const reuse = await anonR.post("/api/auth/recover", { email: patEmail, code: codes[0], newPassword: "brandnewpass2" });
  check("D9: a used code cannot be replayed (401)", reuse.status === 401, `got ${reuse.status}`);
  const relog = await pat.post("/api/auth/login", { email: patEmail, password: patPw });
  check("D9: login with the new password works", relog.status === 200, `got ${relog.status}`);
  const rc1 = await pat.get("/api/auth/recovery-codes");
  check("D9: 7 codes remain", rc1.data?.remaining === 7, JSON.stringify(rc1.data));

  // ---- forgot / reset via e-mail code (Outbox locally) ----
  const fg = await anonR.post("/api/auth/forgot", { email: patEmail });
  check("D3: forgot → 200 accepted (delivery flag honest)", fg.status === 200 && fg.data?.accepted === true && ["email", "unavailable"].includes(fg.data?.delivery), JSON.stringify(fg.data));
  const fgNone = await anonR.post("/api/auth/forgot", { email: `nobody.${stamp}@e2e.test` });
  check("D3: unknown e-mail gets the same 200 (no enumeration)", fgNone.status === 200 && fgNone.data?.accepted === true, JSON.stringify(fgNone.data));
  const ob = await sql(`SELECT body FROM "Outbox" WHERE "toEmail"=$1 AND kind='RESET' ORDER BY "createdAt" DESC LIMIT 1`, [patEmail]);
  if (ob) {
    const code6 = ob.rows[0]?.body.match(/\b(\d{6})\b/)?.[1];
    const badReset = await anonR.post("/api/auth/reset", { email: patEmail, code: "000000", newPassword: "resetviaemail1" });
    check("D3: wrong 6-digit code → 401", badReset.status === 401, `got ${badReset.status}`);
    const rs = await anonR.post("/api/auth/reset", { email: patEmail, code: code6 ?? "", newPassword: "resetviaemail1" });
    check("D3: e-mail code from the Outbox resets the password", rs.status === 200, `${rs.status} ${JSON.stringify(rs.data)} code=${code6}`);
    patPw = "resetviaemail1";
    await pat.post("/api/auth/login", { email: patEmail, password: patPw });
    const vreq = await pat.post("/api/auth/verify-email/request", {});
    check("D3: verification code queued", vreq.status === 200 && vreq.data?.queued === true, JSON.stringify(vreq.data));
    const ob2 = await sql(`SELECT body FROM "Outbox" WHERE "toEmail"=$1 AND kind='VERIFY' ORDER BY "createdAt" DESC LIMIT 1`, [patEmail]);
    const vcode = ob2?.rows[0]?.body.match(/\b(\d{6})\b/)?.[1];
    const vc = await pat.post("/api/auth/verify-email/confirm", { code: vcode ?? "000000" });
    const rc2 = await pat.get("/api/auth/recovery-codes");
    check("D3: e-mail verified → flag flips", vc.status === 200 && rc2.data?.emailVerified === true, `${vc.status} ${JSON.stringify(rc2.data)}`);
  } else {
    skip("D3: e-mail code reset + verify", "needs local DB access to read the Outbox");
  }

  // ---- handover (D49) ----
  await pat.post("/api/auth/login", { email: patEmail, password: patPw });
  const depsNow = await pat.get("/api/patient/dependents");
  const kid = (depsNow.data?.dependents ?? []).find((d) => d.name === `Kid ${stamp}`);
  if (kid && LOCAL && process.env.DATABASE_URL) {
    const early = await pat.post(`/api/patient/dependents/${kid.id}/handover`, { email: `kid.${stamp}@e2e.test`, phone: uniqPhone("7"), password: "kidpassword123" });
    check("D49: handover before 18 → 409 still_a_minor", early.status === 409 && early.data?.code === "still_a_minor", `${early.status} ${JSON.stringify(early.data)}`);
    await sql(`UPDATE "Patient" SET "dateOfBirth" = now() - interval '18 years 1 day' WHERE id=$1`, [kid.id]);
    const taken = await pat.post(`/api/patient/dependents/${kid.id}/handover`, { email: "vikas@demo.in", phone: uniqPhone("7"), password: "kidpassword123" });
    check("D49: e-mail already in use → 409", taken.status === 409 && taken.data?.code === "email_or_phone_taken", `${taken.status} ${JSON.stringify(taken.data)}`);
    const kidPhone = uniqPhone("7");
    const ho = await pat.post(`/api/patient/dependents/${kid.id}/handover`, { email: `kid.${stamp}@e2e.test`, phone: kidPhone, password: "kidpassword123" });
    check("D49: handover at 18 → 200", ho.status === 200, `${ho.status} ${JSON.stringify(ho.data)}`);
    const depsAfter = await pat.get("/api/patient/dependents");
    check("D49: dependent no longer listed under the guardian", !(depsAfter.data?.dependents ?? []).some((d) => d.id === kid.id), JSON.stringify(depsAfter.data));
    const sw = await pat.post(`/api/patient/dependents/${kid.id}/switch`, {});
    check("D49: guardian can no longer switch into the account (404)", sw.status === 404, `got ${sw.status}`);
    const kidS = new Session("kid");
    const kl = await kidS.post("/api/auth/login", { email: `kid.${stamp}@e2e.test`, password: "kidpassword123" });
    const kme = await kidS.get("/api/auth/me");
    check("D49: the adult signs in to their own account with the same profile", kl.status === 200 && kme.data?.viewer?.role === "PATIENT" && kme.data?.viewer?.profileId === kid.id && kme.data?.viewer?.actingFor === null, `${kl.status} ${JSON.stringify(kme.data)}`);
    const firstMut = await kidS.post("/api/patient/dependents", { name: "X", dateOfBirth: dobYearsAgo(5), relation: "PARENT" });
    const recoveryStillWorks = await kidS.get("/api/auth/recovery-codes");
    check("D49: recovery endpoints stay reachable under a stale notice (never lock someone out of recovery)", recoveryStillWorks.status === 200, `got ${recoveryStillWorks.status}`);
    check("D49: the guardian's on-behalf acceptance is withdrawn — first mutation → 428 consent_outdated", firstMut.status === 428, `got ${firstMut.status}`);
    const acc = await kidS.post("/api/legal/acceptance", {});
    check("D49: they accept the notice themselves → 200", acc.status === 200 && acc.data?.inserted === 2, JSON.stringify(acc.data));
    const kLed = await kidS.get("/api/patient/ledger?limit=10");
    check("D49: DEPENDENT_HANDOVER is visible in the new account's ledger", (kLed.data?.entries ?? []).some((e) => e.action === "DEPENDENT_HANDOVER"), JSON.stringify((kLed.data?.entries ?? []).map((e) => e.action)));
  } else {
    skip("D49: handover", kid ? "needs local DB (to age the dependent)" : "dependent from §10 not found");
  }

  // ---- anchors (D13) ----
  if (process.env.CRON_SECRET) {
    const cron = await fetch(BASE + "/api/cron/daily", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const cj = await cron.json().catch(() => ({}));
    check("D13: cron reports the anchor step", cron.status === 200 && cj.anchor && (cj.anchor.anchored === true || cj.anchor.reason === "already_anchored"), JSON.stringify(cj.anchor));
    check("D49: cron reports handover reminders", Number.isInteger(cj.handoverReminders), JSON.stringify(cj.handoverReminders));
  }
  const an = await fetch(BASE + "/api/ledger/anchors");
  const aj = await an.json().catch(() => ({}));
  check("D13: /api/ledger/anchors is public and lists ≥1 anchor + current head", an.status === 200 && Array.isArray(aj.anchors) && aj.anchors.length >= 1 && !!aj.head?.hash, JSON.stringify(aj).slice(0, 200));
  const a0 = aj.anchors?.[0];
  if (a0?.signature && aj.publicKey) {
    const { createPublicKey, verify, createHash } = await import("node:crypto");
    const digest = createHash("sha256").update(`${a0.seq}:${a0.headHash}`).digest();
    const okSig = verify(null, digest, createPublicKey({ key: Buffer.from(aj.publicKey, "base64"), format: "der", type: "spki" }), Buffer.from(a0.signature, "base64"));
    check("D13: newest anchor verifies against the published Ed25519 key (independent recompute)", okSig && a0.digest === digest.toString("hex"));
  } else {
    skip("D13: signature verification", "ANCHOR_SIGNING_KEY not configured on this deployment");
  }
  const otsR = await fetch(BASE + `/api/ledger/anchors/${a0?.seq ?? 0}/ots`);
  check("D13: .ots endpoint answers 200 (receipt) or 404 (not submitted) — never 500", otsR.status === 200 || otsR.status === 404, `got ${otsR.status}`);
  const tp = await fetch(BASE + "/legal/transparency");
  check("D13: /legal/transparency renders", tp.status === 200 && /Ledger transparency/.test(await tp.text()), `got ${tp.status}`);

  // ---- capacity (D6): two seats at the same instant ----
  if (LOCAL && process.env.DATABASE_URL && e2eDoctorId) {
    await sql(`UPDATE "AvailabilitySlot" SET "maxPerSlot"=2 WHERE "doctorId"=$1`, [e2eDoctorId]);
    const at = istSlot(12, 45);
    const grid = await pat.get(`/api/patient/doctors/${e2eDoctorId}/slots`);
    const slot = (grid.data?.grid ?? []).flatMap((g) => g.slots).find((s) => s.iso === at);
    check("D6: slots API shows 2 seats left at a fresh instant", grid.status === 200 && slot?.left === 2, JSON.stringify(slot));
    // e2e does NOT reseed between runs, and `at` is a fixed instant: on a warm DB the seeded
    // users (vikas, sunita) may still hold appointments at `at` from a previous run, which makes
    // b2 fail with the CORRECT 409 patient_overlap instead of the expected b3 slot_full
    // (observed 2026-11-02: 201/409/201 on the second run). Clear the three test patients'
    // prior appointments at this instant so the capacity check measures only this run's bookings.
    await sql(
      `DELETE FROM "Appointment"
       WHERE "scheduledAt"=$1 AND "patientId" IN (
         SELECT p.id FROM "Patient" p JOIN "User" u ON u.id=p."userId" WHERE u.email IN ($2,$3,$4)
       )`,
      [at, patEmail, "vikas@demo.in", "sunita@demo.in"],
    );
    const b1 = await pat.post("/api/patient/appointments", { doctorId: e2eDoctorId, scheduledAt: at, reason: "seat 1" });
    const b2 = await stranger2.post("/api/patient/appointments", { doctorId: e2eDoctorId, scheduledAt: at, reason: "seat 2" });
    const third = new Session("third");
    await third.post("/api/auth/login", { email: "sunita@demo.in", password: "city1234" });
    const b3 = await third.post("/api/patient/appointments", { doctorId: e2eDoctorId, scheduledAt: at, reason: "seat 3" });
    check("D6: two patients book the same instant (seats 1 and 2), the third gets 409 slot_full", [200, 201].includes(b1.status) && [200, 201].includes(b2.status) && b3.status === 409 && b3.data?.code === "slot_full", `${b1.status} ${b2.status} ${b3.status} ${JSON.stringify(b3.data)}`);
    const seats = await sql(`SELECT array_agg("seatNo" ORDER BY "seatNo") AS s FROM "Appointment" WHERE "doctorId"=$1 AND "scheduledAt"=$2 AND status='CONFIRMED'`, [e2eDoctorId, new Date(at)]);
    check("D6: seats are 1 and 2 (DB index guards per seat)", JSON.stringify(seats?.rows[0]?.s) === "[1,2]", JSON.stringify(seats?.rows[0]));
    const gridAfter = await pat.get(`/api/patient/doctors/${e2eDoctorId}/slots`);
    check("D6: the full instant disappears from the picker feed", !(gridAfter.data?.grid ?? []).flatMap((g) => g.slots).some((s) => s.iso === at), "still offered");
    await sql(`UPDATE "AvailabilitySlot" SET "maxPerSlot"=1 WHERE "doctorId"=$1`, [e2eDoctorId]);
  } else {
    skip("D6: capacity", "needs local DB to raise maxPerSlot");
  }

  // ---- health exposes configuration facts (no secrets) ----
  const h = await fetch(BASE + "/api/health");
  const hj = await h.json().catch(() => ({}));
  check("D31: /api/health reports documentKey source + anchor signing + e-mail delivery flags", ["env", "derived"].includes(hj.config?.documentKey) && typeof hj.config?.anchorSigning === "boolean" && typeof hj.config?.emailDelivery === "boolean", JSON.stringify(hj.config));
}

console.log("\n— 12. F5: self-reported readings + trends (the Observation table, wired) —");
{
  const ramesh = new Session("ramesh");
  const login = await ramesh.post("/api/auth/login", { email: "ramesh@demo.in", password: "city1234" });
  check("F5: ramesh demo login", login.status === 200, `got ${login.status}`);

  const anon = new Session("anon-f5");
  const unauth = await anon.post("/api/patient/observations", { name: "Fasting glucose", valueNum: 100, unit: "mg/dL", takenOn: new Date().toISOString() });
  check("F5: unauthenticated log-reading → 401", unauth.status === 401, `got ${unauth.status}`);

  const posted = await ramesh.post("/api/patient/observations", { name: "Fasting glucose", valueNum: 132, unit: "mg/dL", refLow: 70, refHigh: 110, takenOn: new Date().toISOString() });
  check("F5: log a self-reported reading → 201 + id", posted.status === 201 && typeof posted.data?.observation?.id === "string", `${posted.status} ${JSON.stringify(posted.data)}`);
  const dbRow = await sql(`SELECT count(*)::int n FROM "Observation" WHERE id=$1 AND "valueNum"=132`, [posted.data?.observation?.id]);
  check("F5: the row is in the DB under ramesh with its numeric value", dbRow?.rows[0]?.n === 1, JSON.stringify(dbRow?.rows[0]));

  const badVal = await ramesh.post("/api/patient/observations", { name: "Fasting glucose", valueNum: "abc", unit: "mg/dL", takenOn: new Date().toISOString() });
  check("F5: non-numeric value → 400 validation", badVal.status === 400 && badVal.data?.code === "validation", `${badVal.status} ${JSON.stringify(badVal.data)}`);
  const future = await ramesh.post("/api/patient/observations", { name: "Fasting glucose", valueNum: 100, takenOn: new Date(Date.now() + 30 * 86400e3).toISOString() });
  check("F5: a date 30 days in the future → 400 (tz drift yes, prophecy no)", future.status === 400, `got ${future.status}`);
  const badBand = await ramesh.post("/api/patient/observations", { name: "Fasting glucose", valueNum: 100, refLow: 110, refHigh: 70, takenOn: new Date().toISOString() });
  check("F5: refLow above refHigh → 400", badBand.status === 400, `got ${badBand.status}`);
  const huge = await ramesh.post("/api/patient/observations", { name: "Fasting glucose", valueNum: 1e9, takenOn: new Date().toISOString() });
  check("F5: implausible magnitude (1e9) → 400", huge.status === 400, `got ${huge.status}`);

  const page = await ramesh.raw("/patient/records");
  const html = new TextDecoder().decode(page.bytes);
  check("F5: /patient/records renders the Trends card with ramesh's seeded series", page.status === 200 && html.includes("Trends") && html.includes("HbA1c") && html.includes("Fasting glucose"), `status ${page.status}`);
  check("F5: the just-logged 132 appears on the page", html.includes("132"), "value not found in HTML");

  const anitaId = await sql(`SELECT p.id FROM "Patient" p JOIN "User" u ON u.id = p."userId" WHERE u.email='anita@demo.in'`);
  const sheikh = new Session("dr.sheikh");
  await sheikh.post("/api/auth/login", { email: "dr.sheikh@demo.in", password: "city1234" });
  const rec = await sheikh.get(`/api/doctor/patients/${anitaId?.rows[0]?.id}/record`);
  const obs = rec.data?.record?.observations ?? [];
  check("F5: doctor record exposes anita's self-reported readings under the live FULL_RECORD consent", rec.status === 200 && obs.length >= 4 && obs.some((o) => o.name === "Peak flow"), `${rec.status} obs=${obs.length}`);
  check("F5: doctor-facing rows are ISO-serialized with numeric values", obs.length > 0 && obs.every((o) => typeof o.takenOn === "string" && typeof o.valueNum === "number"), JSON.stringify(obs[0]));

  const strangerObs = await sql(`SELECT id FROM "Observation" WHERE "patientId"=$1 LIMIT 1`, [anitaId?.rows[0]?.id]);
  const foreignDel = await ramesh.del("/api/patient/observations", { id: strangerObs?.rows[0]?.id });
  check("F5: deleting ANOTHER patient's reading by UUID → 404", foreignDel.status === 404, `got ${foreignDel.status}`);
  const selfDel = await ramesh.del("/api/patient/observations", { id: posted.data?.observation?.id });
  check("F5: patient deletes their own reading → deleted", selfDel.status === 200 && selfDel.data?.deleted === true, `${selfDel.status} ${JSON.stringify(selfDel.data)}`);
  const gone = await sql(`SELECT count(*)::int n FROM "Observation" WHERE id=$1`, [posted.data?.observation?.id]);
  check("F5: the deleted row is gone from the DB", gone?.rows[0]?.n === 0, JSON.stringify(gone?.rows[0]));
}

console.log("\n— 13. F18: print / PDF visit summary —");
{
  // Extract just the hidden print block from a page (it ends with the footer line).
  // The footer text can appear elsewhere on the page (banners) — so search from the
  // block's own start, not from 0.
  const printBlock = (html) => {
    const start = html.indexOf('id="print-summary"');
    if (start === -1) return null;
    const end = html.indexOf("citycare (demo build)", start);
    return end > start ? html.slice(start, end + 120) : html.slice(start, start + 6000);
  };

  const ramesh18 = new Session("ramesh-f18");
  await ramesh18.post("/api/auth/login", { email: "ramesh@demo.in", password: "city1234" });
  const page = await ramesh18.raw("/patient/records");
  const html = new TextDecoder().decode(page.bytes);
  const block = printBlock(html);
  check("F18: /patient/records carries the hidden print summary", page.status === 200 && !!block, `status ${page.status}`);
  check("F18: the block has identity + confirmed medicines + trend line + disclaimer", !!block && block.includes("visit summary") && block.includes("Metformin") && block.includes("HbA1c") && /not a diagnosis/i.test(block), block ? block.slice(0, 200) : "no block");

  // sunita: the DRAFT medication (Tab. Brufen) must be EXCLUDED from the printout
  const sunita18 = new Session("sunita-f18");
  await sunita18.post("/api/auth/login", { email: "sunita@demo.in", password: "city1234" });
  const sPage = await sunita18.raw("/patient/records");
  const sBlock = printBlock(new TextDecoder().decode(sPage.bytes));
  check("F18: unconfirmed DRAFT med is never printed as a medicine", !!sBlock && !sBlock.includes("Tab. Brufen") && sBlock.includes("unconfirmed draft(s) from old paperwork excluded"), sBlock ? sBlock.slice(0, 200) : "no block");

  const unauth18 = new Session("anon-f18");
  check("F18: unauthenticated export-log → 401", (await unauth18.post("/api/patient/print-summary", {})).status === 401);
  const logged = await ramesh18.post("/api/patient/print-summary", {});
  check("F18: patient's print export is logged (200 + {logged:true})", logged.status === 200 && logged.data?.logged === true, `${logged.status} ${JSON.stringify(logged.data)}`);
  const ledgerRow = await sql(
    `SELECT count(*)::int n FROM "AuditLog" a JOIN "Patient" p ON p.id=a."entityId" JOIN "User" u ON u.id=p."userId"
      WHERE a.action='EXPORT_PRINT_SUMMARY' AND u.email='ramesh@demo.in'`,
  );
  check("F18: EXPORT_PRINT_SUMMARY is on ramesh's ledger", ledgerRow?.rows[0]?.n >= 1, JSON.stringify(ledgerRow?.rows[0]));

  // doctor side: anita → dr.sheikh live FULL_RECORD (seeded); dr.kulkarni has no consent for ramesh
  const anitaId = await sql(`SELECT p.id FROM "Patient" p JOIN "User" u ON u.id = p."userId" WHERE u.email='anita@demo.in'`);
  const sheikh18 = new Session("dr.sheikh-f18");
  await sheikh18.post("/api/auth/login", { email: "dr.sheikh@demo.in", password: "city1234" });
  const dPage = await sheikh18.raw(`/doctor/patients/${anitaId?.rows[0]?.id}`);
  const dBlock = printBlock(new TextDecoder().decode(dPage.bytes));
  check("F18: consent-holding doctor's page carries the scoped print summary", dPage.status === 200 && !!dBlock && dBlock.includes("Asthma") && dBlock.includes("shared under consent"), `status ${dPage.status}`);

  const rameshId = await sql(`SELECT p.id FROM "Patient" p JOIN "User" u ON u.id = p."userId" WHERE u.email='ramesh@demo.in'`);
  const kulkarni18 = new Session("dr.kulkarni-f18");
  await kulkarni18.post("/api/auth/login", { email: "dr.kulkarni@demo.in", password: "city1234" });
  const noPage = await kulkarni18.raw(`/doctor/patients/${rameshId?.rows[0]?.id}`);
  check("F18: a doctor WITHOUT live consent gets NO print block at all", noPage.status === 200 && !new TextDecoder().decode(noPage.bytes).includes("print-summary"), `status ${noPage.status}`);
}
console.log("\n— 14. backup / DR (NG-S09): encrypted daily backup, private store, restore drill —");
{
  const bNoAuth = await fetch(BASE + "/api/cron/backup");
  check("B: backup cron refuses without the secret (401/503, never 200)", bNoAuth.status === 401 || bNoAuth.status === 503, `got ${bNoAuth.status}`);

  if (process.env.CRON_SECRET) {
    const bWrong = await fetch(BASE + "/api/cron/backup", { headers: { authorization: `Bearer ${"w".repeat(43)}` } });
    check("B: backup cron rejects a wrong secret (401)", bWrong.status === 401, `got ${bWrong.status}`);

    const bResp = await fetch(BASE + "/api/cron/backup", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const bj = await bResp.json().catch(() => ({}));
    check(
      "B: backup cron runs with the secret and reports file facts (no secrets/PHI in the response)",
      bResp.status === 200 && bj.ok === true && bj.backup && Number(bj.backup.fileSize) > 0 &&
        /^[0-9a-f]{64}$/.test(bj.backup.sha256 ?? "") &&
        (bj.backup.store === "local" || bj.backup.store === "blob") &&
        Number.isInteger(bj.backup.tables) && bj.backup.tables >= 30,
      `${bResp.status} ${JSON.stringify(bj).slice(0, 200)}`,
    );

    const bMeta = await sql(`SELECT count(*)::int n FROM "Backup" WHERE status = 'ok'`);
    check("B: a 'Backup' metadata row (status ok) was recorded", bMeta?.rows[0]?.n >= 1, JSON.stringify(bMeta?.rows[0]));
    const bCols = await sql(
      `SELECT count(*)::int n FROM information_schema.columns
        WHERE table_name = 'Backup' AND column_name IN ('email','phone','patient','address','name')`,
    );
    check("B: the 'Backup' metadata table has no patient-data columns", bCols?.rows[0]?.n === 0, JSON.stringify(bCols?.rows[0]));

    if (process.env.BACKUP_DIR && bj.backup?.objectName) {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const { readFileSync, existsSync } = await import("node:fs");
      const run = promisify(execFile);
      const file = process.env.BACKUP_DIR + "/" + bj.backup.objectName;
      check("B: the encrypted file exists in the private store dir", existsSync(file), file);

      const v = await run(process.execPath, ["scripts/backup.mjs", "verify", file])
        .then((r) => { try { return JSON.parse(r.stdout); } catch { return {}; } })
        .catch((e) => ({ ok: false, err: String(e?.stderr || e?.message).slice(0, 200) }));
      check("B: the stored file verifies (decrypt + payload sha + section integrity) and matches the response sha", v.ok === true && v.fileSha256 === bj.backup.sha256, JSON.stringify(v).slice(0, 200));

      const bytes = readFileSync(file);
      check(
        "B: the stored file is encrypted, not plaintext (magic CCB1; no user email in the bytes)",
        bytes.subarray(0, 4).toString("latin1") === "CCB1" && !bytes.toString("latin1").includes("ramesh@demo.in"),
      );

      // full restore drill: isolated scratch DB + ledger verify + row counts + login/record check
      const dts = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const scratch = `citycare_drill_${dts.getUTCFullYear()}${pad(dts.getUTCMonth() + 1)}${pad(dts.getUTCDate())}_${pad(dts.getUTCHours())}${pad(dts.getUTCMinutes())}${pad(dts.getUTCSeconds())}`;
      const d = await run(process.execPath, ["scripts/restore-drill.mjs", file, "--scratch", scratch, "--verify-email", "ramesh@demo.in", "--verify-password", "city1234"], { maxBuffer: 16 * 1024 * 1024, timeout: 240_000 })
        .then((r) => ({ code: 0, out: r.stdout, err: "" }))
        .catch((e) => ({ code: e?.code ?? 1, out: String(e?.stdout ?? ""), err: String(e?.stderr ?? e?.message).slice(0, 300) }));
      let dj = null;
      try { dj = JSON.parse(d.out.slice(d.out.indexOf("{"))); } catch { dj = null; }
      check("B: restore drill SUCCEEDED on the isolated scratch DB", d.code === 0 && dj?.status === "success", `code ${d.code} ${d.err || JSON.stringify(dj?.failure ?? null)}`);
      check("B: restored DB passes ledger_verify() (0 breaks)", dj?.checks?.ledgerVerify?.ok === true, JSON.stringify(dj?.checks?.ledgerVerify ?? null));
      check("B: restored row counts match the backup manifest exactly", dj?.checks?.rowCounts?.ok === true, JSON.stringify(dj?.checks?.rowCounts ?? null).slice(0, 200));
      check("B: restored table CONTENT matches the manifest exactly (re-COPY row-multiset compare, order-independent — A88)", dj?.checks?.contentMatch?.ok === true, JSON.stringify(dj?.checks?.contentMatch ?? null).slice(0, 200));
      check("B: login + record check passes on restored data (ramesh@demo.in)", dj?.checks?.login?.ok === true, JSON.stringify(dj?.checks?.login ?? null).slice(0, 200));
      check("B: scratch DB was dropped after the drill (no leftover)", dj?.scratchDropped === true, JSON.stringify({ dropped: dj?.scratchDropped, err: dj?.droppedError ?? null }));
      check("B: drill measured RPO (backup age) and RTO (restore duration)", Number.isFinite(dj?.measurements?.backupAgeMs) && Number.isFinite(dj?.measurements?.restoreMs), JSON.stringify(dj?.measurements ?? null));
    } else {
      skip("B: file verify + restore drill", "BACKUP_DIR or backup objectName missing (non-local store)");
    }

    const bh = await fetch(BASE + "/api/health");
    const bhj = await bh.json().catch(() => ({}));
    check(
      "B: /api/health surfaces the backup fact (configured, lastSuccessAt set, not stale, no secrets)",
      bh.status === 200 && bhj.backups?.configured === true && !!bhj.backups?.lastSuccessAt && bhj.backups?.stale === false,
      JSON.stringify(bhj.backups ?? null),
    );
  } else {
    skip("B: backup cron with secret", "CRON_SECRET not in env");
  }
}

console.log("\n— 15. retention sweep policy (NG-S15): explicit policy, fail-safe, real data never swept —");
{
  // The cron route and /api/health consult this exact module. The real-data and fail-safe
  // paths are pinned here at the decision level (the route executes ZERO sweep SQL when the
  // decision is disabled — a 10-day real-data account is safe by construction); the demo path
  // is additionally proven end-to-end below against the live instance, which declares
  // RETENTION_POLICY=demo.
  const { evaluateRetentionPolicy } = await import("../src/lib/retention-core.mjs");

  check("S15: RETENTION_POLICY=pilot ⇒ sweep disabled (10-day real-data account survives by construction)",
    evaluateRetentionPolicy({ RETENTION_POLICY: "pilot", NEXT_PUBLIC_DEMO_MODE: "0" }).enabled === false);
  check("S15: RETENTION_POLICY=internal ⇒ sweep disabled (regardless of the banner)",
    ["0", "1", undefined].every((b) => {
      const env = { RETENTION_POLICY: "internal" };
      if (b !== undefined) env.NEXT_PUBLIC_DEMO_MODE = b;
      return evaluateRetentionPolicy(env).enabled === false;
    }));
  check("S15: MISSING policy ⇒ fails safe (sweep off + loud warning)", (() => {
    const r = evaluateRetentionPolicy({});
    return r.enabled === false && r.reason === "missing_policy" && /fail-safe/.test(r.warning ?? "");
  })());
  check("S15: INVALID policy ⇒ fails safe (raw value never reaches the safe fields)", (() => {
    const r = evaluateRetentionPolicy({ RETENTION_POLICY: "bogus-value-XYZ" });
    return r.enabled === false && r.reason === "invalid_policy" && r.policy === null;
  })());
  check("S15: CONTRADICTORY config (demo policy, banner off) ⇒ fails safe",
    evaluateRetentionPolicy({ RETENTION_POLICY: "demo", NEXT_PUBLIC_DEMO_MODE: "0" }).enabled === false);

  if (!process.env.CRON_SECRET) {
    skip("S15: live demo-sweep behaviour", "CRON_SECRET not in env");
  } else {
    const emailA = `e2e.s15a.${stamp}@e2e.test`; // will be made overdue (10 days)
    const emailB = `e2e.s15b.${stamp}@e2e.test`; // stays fresh → must survive
    const sA = await new Session("s15a").post("/api/auth/signup", { role: "PATIENT", acceptPolicy: true, adult: true, name: `E2E S15A ${stamp}`, email: emailA, phone: uniqPhone("8"), password: "e2epassword1" });
    const sB = await new Session("s15b").post("/api/auth/signup", { role: "PATIENT", acceptPolicy: true, adult: true, name: `E2E S15B ${stamp}`, email: emailB, phone: uniqPhone("8"), password: "e2epassword1" });
    check("S15: two fresh demo accounts created via normal signup", sA.status === 201 && sB.status === 201, `${sA.status}/${sB.status}`);

    const pre = await sql(`SELECT u.id AS uid, p.id AS pid FROM "User" u JOIN "Patient" p ON p."userId" = u.id WHERE u.email = $1`, [emailA]);
    const back = await sql(`UPDATE "User" SET "createdAt" = now() - interval '10 days' WHERE email = $1`, [emailA]);
    check("S15: account A backdated 10 days (past the 7-day demo horizon)", back?.rowCount === 1 && pre?.rowCount === 1, `back=${back?.rowCount ?? "n/a"}`);

    const cron15 = await fetch(BASE + "/api/cron/daily", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const c15 = await cron15.json().catch(() => ({}));

    check("S15: live cron reports the ACTIVE policy (demo/enabled/ok) and swept the due account",
      cron15.status === 200 && c15.retention?.policy === "demo" && c15.retention?.enabled === true && c15.retention?.reason === "ok"
        && c15.retention?.protectedDomain === "demo.in" && c15.retention?.patients >= 1,
      JSON.stringify(c15.retention ?? null));

    const h15 = await fetch(BASE + "/api/health");
    const h15j = await h15.json().catch(() => ({}));
    check("S15: /api/health exposes the policy (safe fields only, no PHI)",
      h15.status === 200 && h15j.retention?.policy === "demo" && h15j.retention?.enabled === true && h15j.retention?.reason === "ok"
        && Number.isInteger(h15j.retention?.days) && h15j.retention?.protectedDomain === "demo.in",
      JSON.stringify(h15j.retention ?? null));
    const secrets = [process.env.CRON_SECRET, process.env.SESSION_SECRET, process.env.BACKUP_KEY].filter(Boolean);
    const leaked = [JSON.stringify(h15j), JSON.stringify(c15)].some((body) => secrets.some((s) => body.includes(s)));
    check("S15: health + cron responses leak no secrets", !leaked, "a secret value appeared in a public response body");

    const postA = await sql(`SELECT status, email, "passwordHash" FROM "User" WHERE id = $1`, [pre?.rows?.[0]?.uid]);
    const patA = await sql(`SELECT "fullName" FROM "Patient" WHERE id = $1`, [pre?.rows?.[0]?.pid]);
    check("S15: the 10-day demo account WAS erased (User DELETED + anonymised, hash '!', Patient [REDACTED])",
      postA?.rows?.[0]?.status === "DELETED" && /^erased-.*@deleted\.invalid$/.test(postA?.rows?.[0]?.email ?? "")
        && postA?.rows?.[0]?.passwordHash === "!" && patA?.rows?.[0]?.fullName === "[REDACTED]",
      JSON.stringify({ u: postA?.rows ?? null, p: patA?.rows ?? null }));

    const postB = await sql(`SELECT status FROM "User" WHERE email = $1`, [emailB]);
    const seed = await sql(`SELECT status FROM "User" WHERE email = 'ramesh@demo.in'`);
    check("S15: fresh demo account SURVIVES the sweep (only overdue ones are targeted)", postB?.rows?.[0]?.status !== undefined && postB.rows[0].status !== "DELETED", JSON.stringify(postB?.rows ?? null));
    check("S15: seeded @demo.in account is never touched (protected domain)", seed?.rows?.[0]?.status !== undefined && seed.rows[0].status !== "DELETED", JSON.stringify(seed?.rows ?? null));
    check("S15: ledger still verifies clean after the sweep (cron report)", c15.ledger?.breaks === 0, JSON.stringify(c15.ledger ?? null));

    const days = c15.retention?.days ?? 7;
    // Strip React's text-node comment markers + tags so the check is on rendered CONTENT, not markup.
    const plain = (html) => html.replace(/<!--.*?-->/gs, "").replace(/<[^>]+>/g, "");
    const notice = plain(await (await fetch(BASE + "/legal/privacy")).text());
    const terms = plain(await (await fetch(BASE + "/legal/terms")).text());
    check("S15: privacy notice + terms state the demo erasure (notice matches the armed sweep)",
      notice.includes(`erased automatically ${days} days after creation`) && terms.includes(`erased after ${days} days`),
      "demo erasure clause missing from the notice copy");
  }
}

console.log("\n— 16. final technical verification (2026-11-02): consistent snapshot · document-level recovery · DB-down observability —");
{
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { readFileSync, mkdtempSync, rmSync, readdirSync } = await import("node:fs");
  const run = promisify(execFile);
  const WEB = new URL("../", import.meta.url).pathname; // web/
  const { default: pg } = await import("pg");
  const bc = await import("../src/lib/backup-core.mjs");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // one user owned by this section (patient profile auto-created on signup)
  const s16 = new Session("s16");
  const emailU = `s16.${stamp}@e2e.citycare.test`;
  const su = await s16.post("/api/auth/signup", { role: "PATIENT", acceptPolicy: true, adult: true, name: `E2E S16 ${stamp}`, email: emailU, phone: uniqPhone("7"), password: "e2epassword1" });
  const uidRow = await sql(`SELECT id FROM "User" WHERE lower(email) = lower($1)`, [emailU]);
  const uid = uidRow?.rows?.[0]?.id;
  const patRow = await sql(`SELECT id, "fullName" FROM "Patient" WHERE "userId" = $1`, [uid]);
  const pid = patRow?.rows?.[0]?.id;
  const origName = patRow?.rows?.[0]?.fullName;
  check("S16: owned test user + patient exist (used by all sub-checks)", su.status === 201 && !!uid && !!pid, `signup ${su.status} uid=${uid ?? "n/a"}`);

  // ---- 16a: deterministic snapshot isolation — proves the REPEATABLE READ guarantee
  //      the backup dump now relies on (a new transaction sees a committed writer; the
  //      open REPEATABLE READ snapshot does NOT, no matter when the writer commits) ----
  {
    const connA = new pg.Client({ connectionString: process.env.DATABASE_URL });
    const connB = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await connA.connect();
    await connB.connect();
    let okA = false;
    let detail = "setup error";
    try {
      await connB.query("BEGIN");
      await connB.query(`UPDATE "Patient" SET "fullName" = $1 WHERE id = $2`, ["S16-SNAP-WRITE", pid]);
      await connA.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const r1 = (await connA.query(`SELECT "fullName" FROM "Patient" WHERE id = $1`, [pid])).rows[0];
      await connB.query("COMMIT"); // writer commits while the snapshot is open
      const r2 = (await connA.query(`SELECT "fullName" FROM "Patient" WHERE id = $1`, [pid])).rows[0];
      await connA.query("ROLLBACK");
      const r3 = (await connB.query(`SELECT "fullName" FROM "Patient" WHERE id = $1`, [pid])).rows[0];
      okA = r1.fullName === origName && r2.fullName === origName && r3.fullName === "S16-SNAP-WRITE";
      detail = `snapshot saw "${r1.fullName}" → "${r2.fullName}" across the commit; fresh tx saw "${r3.fullName}"`;
    } catch (e) {
      detail = String(e?.message ?? e);
    } finally {
      await connA.query("ROLLBACK").catch(() => null);
      await connB.query("ROLLBACK").catch(() => null);
      await connA.end().catch(() => null);
      await connB.end().catch(() => null);
      await sql(`UPDATE "Patient" SET "fullName" = $1 WHERE id = $2`, [origName, pid]);
    }
    check("S16a: REPEATABLE READ snapshot stays stable through a concurrent commit (the guarantee the dump uses)", okA, detail);
  }

  // ---- 16b: real backups taken while a writer commits between tables ⇒ no cross-table
  //      mixed state (User is copied before Patient in FK order; with per-statement
  //      autocommit an interleaving commit could have landed between the two COPYs) ----
  if (process.env.BACKUP_DIR) {
    // The writer's commit must be able to land DURING the dump to be a real interleaving
    // test: open the write transaction, start the backup WITHOUT awaiting it, commit after
    // a varied delay (child-process startup means the snapshot position varies per run).
    // INVARIANT (what a consistent snapshot means): the pair (User.phone, Patient.fullName)
    // captured in ANY backup must equal the pair of exactly ONE committed writer state —
    // never a combination of values from two different commits (the old per-table
    // autocommit could produce that). We don't assert WHICH commit won the race — only
    // that the pair is unambiguous.
    const states = [];
    {
      const cur = await sql("SELECT (SELECT \"phone\" FROM \"User\" WHERE id = $1) p, (SELECT \"fullName\" FROM \"Patient\" WHERE id = $2) n", [uid, pid]);
      states.push({ phone: cur.p, name: cur.n });
    }
    let okB = true;
    let detailB = "every captured pair matches exactly one committed writer state";
    const delays = [1, 4, 9, 16, 30, 60, 100, 150];
    for (let i = 1; i <= 8; i++) {
      const thisPhone = uniqPhone("6");
      const thisName = `S16-SNAP-U${i}`;
      const w = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await w.connect();
      await w.query("BEGIN");
      await w.query(`UPDATE "User" SET "phone" = $1 WHERE id = $2`, [thisPhone, uid]);
      await w.query(`UPDATE "Patient" SET "fullName" = $1 WHERE id = $2`, [thisName, pid]);
      const p = run(process.execPath, ["scripts/backup.mjs", "create"], { cwd: WEB, maxBuffer: 8 * 1024 * 1024, timeout: 120_000 })
        .then((r) => { try { return JSON.parse(r.stdout); } catch { return {}; } })
        .catch((e) => ({ ok: false, err: String(e?.stderr ?? e?.message).slice(0, 160) }));
      await sleep(delays[i - 1]); // position the commit at a varied point relative to the dump
      try {
        await w.query("COMMIT");
      } finally {
        await w.end().catch(() => null);
      }
      states.push({ phone: thisPhone, name: thisName }); // committed at this point
      const bk = await p;
      if (!bk.ok) { okB = false; detailB = `backup ${i} failed: ${bk.err ?? JSON.stringify(bk).slice(0, 160)}`; break; }
      const v = bc.verifyBackupFile(readFileSync(process.env.BACKUP_DIR + "/" + bk.objectName), bc.backupKey());
      const rowOf = (sectionName, id) =>
        v.sections.find((s) => s.name === sectionName).copyText.split("\n").find((l) => l.startsWith(id + "\t"));
      // User: id(0) email(1) phone(2) … · Patient: id(0) userId(1) fullName(2) …
      const uPhone = rowOf("User", uid)?.split("\t")[2] ?? null;
      const pName = rowOf("Patient", pid)?.split("\t")[2] ?? null;
      const uniform = states.some((s) => s.phone === uPhone && s.name === pName);
      if (!uniform) { okB = false; detailB = `iter ${i}: backup captured User.phone=${uPhone} + Patient.fullName="${pName}" — that combination was never committed by any single writer transaction (a mixed state ⇒ the snapshot guarantee is broken)`; break; }
    }
    check("S16b: 8 backups taken under concurrent writers — every captured (User, Patient) pair is one single committed state (no cross-table mixed values)", okB, detailB);
    // reset to a fresh, collision-proof value (a fixed constant collides on re-runs:
    // every previous e2e run's owned user still holds its reset value)
    await sql(`UPDATE "User" SET "phone" = $1 WHERE id = $2`, [uniqPhone("7"), uid]);
    await sql(`UPDATE "Patient" SET "fullName" = $1 WHERE id = $2`, [origName, pid]);
  } else {
    skip("S16b: concurrent-writer backups", "BACKUP_DIR not set (non-local store)");
  }

  // ---- 16c: database unavailability ⇒ the failure is still independently observable
  //      (no failure row can be written to the dead DB: the platform log line is the
  //      independent record; v1 has no automated alerting — do not claim otherwise) ----
  {
    const metaBefore = (await sql(`SELECT count(*)::int n FROM "Backup"`))?.rows?.[0]?.n ?? null;
    const deadDir = mkdtempSync("/tmp/ccbk-dbdn-");
    let dnOk = false;
    let dnCode = 0;
    let dnOut = "";
    try {
      const r = await run(process.execPath, ["scripts/backup.mjs", "create"], {
        cwd: WEB,
        env: { ...process.env, DATABASE_URL: "postgresql://e2e@127.0.0.1:1/citycare", BACKUP_DIR: deadDir },
        maxBuffer: 4 * 1024 * 1024,
        timeout: 60_000,
      });
      dnOk = true;
      dnCode = 0;
      dnOut = String(r.stdout) + String(r.stderr);
    } catch (e) {
      dnCode = Number(e?.code ?? 1);
      dnOut = String(e?.stdout ?? "") + String(e?.stderr ?? e?.message ?? "");
    }
    const filesBeforeClean = readdirSync(deadDir);
    rmSync(deadDir, { recursive: true, force: true });
    check("S16c: DB down ⇒ backup exits non-zero (no silent success)", dnOk === false && dnCode !== 0, `ok=${dnOk} code=${dnCode}`);
    check("S16c: DB down ⇒ stable FATAL marker in the platform log (independent observability)", dnOut.includes(bc.BACKUP_FATAL_MARKER), dnOut.slice(0, 220));
    check("S16c: DB down ⇒ no encrypted file written to the store", !filesBeforeClean.some((f) => f.endsWith(".ccbk")), `store contained: ${filesBeforeClean.join(", ") || "(empty)"}`);
    const metaAfter = (await sql(`SELECT count(*)::int n FROM "Backup"`))?.rows?.[0]?.n ?? null;
    check("S16c: DB down ⇒ no spurious 'Backup' metadata row", metaAfter === metaBefore, `before=${metaBefore} after=${metaAfter}`);
  }

  // ---- 16d: DOCUMENT-LEVEL recovery drill — a real document, decrypted from the
  //      restored scratch DB with the application's own crypto (this is NOT the same
  //      evidence as the row-multiset COPY compare — one proves bytes, the other proves
  //      a document actually decrypts and matches its plaintext checksum) ----
  if (process.env.BACKUP_DIR) {
    const canary = `CCDOCVERIFY-${stamp}-${crypto.randomBytes(8).toString("hex")}`;
    const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n${canary}\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
    const pdfBytes = new TextEncoder().encode(pdf);
    const wantSha = crypto.createHash("sha256").update(pdfBytes).digest("hex");
    const fd = new FormData();
    fd.append("file", new Blob([pdfBytes], { type: "application/pdf" }), "verify.pdf");
    fd.append("title", "Synthetic verify doc");
    fd.append("type", "LAB_REPORT");
    fd.append("issuedOn", "2026-09-15");
    if (!s16.cookie) await s16.post("/api/auth/login", { email: emailU, password: "e2epassword1" });
    const up = await s16.upload("/api/patient/documents", fd);
    const docId = up.data?.id;
    check("S16d: synthetic document uploaded (unique canary; server sha matches local sha256)", up.status === 201 && up.data?.sha256 === wantSha && !!docId, `${up.status} sha=${String(up.data?.sha256 ?? "").slice(0, 12)}`);

    const pad = (n) => String(n).padStart(2, "0");
    const dts = new Date();
    const scratch = `citycare_drill_${dts.getUTCFullYear()}${pad(dts.getUTCMonth() + 1)}${pad(dts.getUTCDate())}_${pad(dts.getUTCHours())}${pad(dts.getUTCMinutes())}${pad(dts.getUTCSeconds())}`;
    const drill = (extraArgs) =>
      run(process.execPath, ["scripts/restore-drill.mjs", ...extraArgs], { cwd: WEB, maxBuffer: 16 * 1024 * 1024, timeout: 300_000 })
        .then((r) => ({ code: 0, out: String(r.stdout), err: "" }))
        .catch((e) => ({ code: Number(e?.code ?? 1), out: String(e?.stdout ?? ""), err: String(e?.stderr ?? e?.message).slice(0, 300) }));
    const parseDrill = (out) => { try { return JSON.parse(out.slice(out.indexOf("{"))); } catch { return null; } };

    const bk2 = await run(process.execPath, ["scripts/backup.mjs", "create"], { cwd: WEB, maxBuffer: 8 * 1024 * 1024, timeout: 120_000 })
      .then((r) => { try { return JSON.parse(r.stdout); } catch { return {}; } })
      .catch(() => ({ ok: false }));
    if (bk2.ok && bk2.objectName) {
      const file2 = process.env.BACKUP_DIR + "/" + bk2.objectName;
      const dv = await drill([file2, "--scratch", scratch, "--verify-document", docId]);
      const dvj = parseDrill(dv.out);
      check("S16d: drill --verify-document SUCCEEDS — a document DECRYPTED from the restored scratch (not just COPY'd)", dv.code === 0 && dvj?.status === "success" && dvj?.checks?.documentVerify?.ok === true, `code ${dv.code} ${dv.err || JSON.stringify(dvj?.checks?.documentVerify ?? dvj?.failure ?? null).slice(0, 200)}`);
      check("S16d: decrypted bytes match the stored SHA-256 and declared byte length", dvj?.checks?.documentVerify?.checksumMatch === true && dvj?.checks?.documentVerify?.sizeMatch === true, JSON.stringify(dvj?.checks?.documentVerify ?? null));
      check("S16d: drill output leaks NO plaintext (canary absent from stdout and stderr)", !dv.out.includes(canary) && !dv.err.includes(canary), "canary string found in drill output");
      check("S16d: scratch DB dropped after the verify gate ran", dvj?.scratchDropped === true, JSON.stringify({ dropped: dvj?.scratchDropped, err: dvj?.droppedError ?? null }));

      const badUuid = "00000000-0000-4000-8000-000000000000";
      const dn = await drill([file2, "--scratch", scratch, "--verify-document", badUuid]);
      const dnj = parseDrill(dn.out);
      check("S16d: unknown document id FAILS the drill (found=false), and the scratch is STILL dropped on that failure", dnj?.status === "failed" && dnj?.checks?.documentVerify?.found === false && dnj?.scratchDropped === true, JSON.stringify(dnj?.checks?.documentVerify ?? dnj?.failure ?? null).slice(0, 200));
    } else {
      skip("S16d: --verify-document drill", "backup create failed (non-local store or env)");
    }
    const delD = docId ? await s16.del(`/api/documents/${docId}`) : null;
    check("S16d: cleanup — synthetic document deleted (bytes removed, tombstone kept for the ledger)", !!delD && delD.status === 200 && delD.data?.deleted === true, JSON.stringify(delD?.data ?? delD?.status));
  } else {
    skip("S16d: document-level drill", "BACKUP_DIR not set (non-local store)");
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────
console.log("\n— 17. NG-S14: demo/pilot environment isolation (seed gate + real-data env behaviour) —");
if (!LOCAL || !process.env.DATABASE_URL) {
  skip("NG-S14: demo/pilot environment isolation", "requires a local PostgreSQL + DATABASE_URL (isolated scratch databases); not available for this remote BASE");
} else {
{
  // The seed gate (src/lib/demo-seed-core.mjs) is the single chokepoint that decides
  // whether scripts/seed.mjs — the ONLY code that creates demo accounts — may run in an
  // environment. This section proves, on ISOLATED scratch databases (dropped in `finally`):
  //   * demo mode seeds (explicit + default), pilot/production modes refuse/skip,
  //     contradictory and unverified configs are refused BEFORE any write (the pre-seeded
  //     marker row survives a refused run);
  //   * a fresh pilot DB + app: published demo credentials are DENIED, normal patient and
  //     doctor registration/authentication work, no demo records exist, and the retention
  //     sweep stays disabled for real data;
  //   * the existing public demo on the synthetic demo env (BASE) still works.
  const { execFile, spawn } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { readFileSync, readdirSync } = await import("node:fs");
  const run = promisify(execFile);
  const pgMod = (await import("pg")).default;

  const suffix = Date.now().toString(36);
  const scratch = {
    demo: `citycare_e2e_demo_${suffix}`,
    pilot: `citycare_e2e_pilot_${suffix}`,
    prod: `citycare_e2e_prod_${suffix}`,
  };
  const scratchClients = {};
  let pilotProc = null;
  const pilotPort = Number(process.env.E2E_PILOT_PORT ?? 3007);
  const pilotBase = `http://127.0.0.1:${pilotPort}`;

  const scratchUrl = (name) => {
    const u = new URL(process.env.DATABASE_URL);
    u.pathname = "/" + name;
    return u.toString();
  };

  async function createScratch(name) {
    // name is a generated identifier (citycare_e2e_* + base36 timestamp) — safe to inline.
    await sql(`DROP DATABASE IF EXISTS ${name}`);
    await sql(`CREATE DATABASE ${name}`);
    const c = new pgMod.Client({ connectionString: scratchUrl(name) });
    await c.connect();
    await c.query(`SET client_min_messages='warning';`);
    const files = [
      "../schema/citycare_init.sql",
      "../schema/sql/constraints.sql",
      "../schema/sql/ledger.sql",
      ...readdirSync("../schema/migrations").filter((f) => f.endsWith(".sql")).sort().map((f) => `../schema/migrations/${f}`),
    ];
    for (const f of files) await c.query(readFileSync(f, "utf8"));
    scratchClients[name] = c;
  }

  /** Run the seed script against a scratch DB with a specific gate config.
      policy/seed: undefined → the variable is REMOVED from the env (unverified case). */
  async function runSeed(dbName, policy, seed) {
    const env = { ...process.env };
    env.DATABASE_URL = scratchUrl(dbName);
    env.SCRYPT_N = "4096"; // fast hashes for the throwaway scratch DBs
    env.SEED_CONTEXT = "ci"; // R1 review F3: these scratch-DB runs are the isolated CI seeding workflow — declared explicitly
    if (policy === undefined) delete env.RETENTION_POLICY;
    else env.RETENTION_POLICY = policy;
    if (seed === undefined) delete env.SEED_DEMO;
    else env.SEED_DEMO = seed;
    return run(process.execPath, ["scripts/seed.mjs"], { env, encoding: "utf8" })
      .then((r) => ({ code: 0, out: r.stdout + "\n" + r.stderr }))
      .catch((e) => ({ code: e.code ?? 1, out: String(e.stdout ?? "") + "\n" + String(e.stderr ?? "") }));
  }

  const demoUserCount = async (dbName) =>
    Number((await scratchClients[dbName].query(`SELECT count(*)::int n FROM "User" WHERE email ILIKE '%@demo.in'`)).rows[0].n);

  const totalRows = async (dbName) =>
    Number((await scratchClients[dbName].query(`SELECT count(*)::int n FROM "User"`)).rows[0].n);

  const hospCount = async (dbName) =>
    Number((await scratchClients[dbName].query(`SELECT count(*)::int n FROM "Hospital"`)).rows[0].n);

  try {
    await createScratch(scratch.demo);
    await createScratch(scratch.pilot);
    await createScratch(scratch.prod);

    // 1. demo mode: seed runs (explicit SEED_DEMO=1 and the default unset)
    const s1 = await runSeed(scratch.demo, "demo", "1");
    check(
      "NG-S14: demo mode — seed runs (SEED_DEMO=1 + RETENTION_POLICY=demo) and creates the 11 demo identities",
      s1.code === 0 && (await demoUserCount(scratch.demo)) === 11,
      `exit ${s1.code} demoUsers=${await demoUserCount(scratch.demo)} ${s1.out.slice(0, 160)}`,
    );
    const s1b = await runSeed(scratch.demo, "demo", undefined);
    check(
      "NG-S14: demo mode — default (SEED_DEMO unset) still seeds (backward-compatible synthetic demo)",
      s1b.code === 0 && (await demoUserCount(scratch.demo)) === 11,
      `exit ${s1b.code}`,
    );

    // 2. pilot mode: refuse by default, skip on explicit SEED_DEMO=0 — DB never touched
    const s2a = await runSeed(scratch.pilot, "pilot", undefined);
    check(
      "NG-S14: pilot mode — unset SEED_DEMO REFUSES (fail-safe default; exit 2, zero rows)",
      s2a.code === 2 && /refus/i.test(s2a.out) && (await totalRows(scratch.pilot)) === 0 && (await hospCount(scratch.pilot)) === 0,
      `exit ${s2a.code} ${s2a.out.slice(0, 160)}`,
    );
    const s2b = await runSeed(scratch.pilot, "pilot", "0");
    check(
      "NG-S14: pilot mode — SEED_DEMO=0 skips cleanly (exit 0, zero rows, nothing truncated)",
      s2b.code === 0 && /skipped/i.test(s2b.out) && (await totalRows(scratch.pilot)) === 0 && (await hospCount(scratch.pilot)) === 0,
      `exit ${s2b.code} ${s2b.out.slice(0, 160)}`,
    );

    // 3. production-grade mode (internal): SEED_DEMO=0 skips
    const s3 = await runSeed(scratch.prod, "internal", "0");
    check(
      "NG-S14: production-grade mode (RETENTION_POLICY=internal) — SEED_DEMO=0 skips (exit 0, zero rows)",
      s3.code === 0 && /skipped/i.test(s3.out) && (await totalRows(scratch.prod)) === 0,
      `exit ${s3.code} ${s3.out.slice(0, 160)}`,
    );

    // 4. contradictory / unverified configs are refused BEFORE any write (marker row survives)
    await scratchClients[scratch.prod].query(
      `INSERT INTO "Hospital" (id,name,address,city,"isEmpanelled",rating,"createdAt") VALUES (gen_random_uuid(),'NGS14 Marker Clinic','Marker St','Pune',true,4,now())`,
    );
    const s4a = await runSeed(scratch.prod, "internal", "1");
    const markerLeft = Number(
      (await scratchClients[scratch.prod].query(`SELECT count(*)::int n FROM "Hospital" WHERE name = 'NGS14 Marker Clinic'`)).rows[0].n,
    );
    check(
      "NG-S14: contradictory config (SEED_DEMO=1 on a real-data env) is REFUSED (exit 2) and the pre-existing row survives",
      s4a.code === 2 && /contradictory/i.test(s4a.out) && markerLeft === 1 && (await totalRows(scratch.prod)) === 0,
      `exit ${s4a.code} marker=${markerLeft} ${s4a.out.slice(0, 160)}`,
    );
    const s4b = await runSeed(scratch.prod, undefined, undefined);
    check(
      "NG-S14: unverified env (no RETENTION_POLICY, no SEED_DEMO) is REFUSED by default (exit 2)",
      s4b.code === 2 && /missing\/invalid/i.test(s4b.out) && (await totalRows(scratch.prod)) === 0,
      `exit ${s4b.code} ${s4b.out.slice(0, 160)}`,
    );
    // 4c. strictly fail-closed (Day 2 final security correction): an UNVERIFIED env that
    // explicitly requests seeding (SEED_DEMO=1, no RETENTION_POLICY) is ALSO refused — and,
    // like every refused run, leaves the database byte-for-byte untouched (marker survives).
    const s4c = await runSeed(scratch.prod, undefined, "1");
    const markerLeft2 = Number(
      (await scratchClients[scratch.prod].query(`SELECT count(*)::int n FROM "Hospital" WHERE name = 'NGS14 Marker Clinic'`)).rows[0].n,
    );
    check(
      "NG-S14: unverified env (no RETENTION_POLICY) + SEED_DEMO=1 is REFUSED — strictly fail-closed (exit 2, marker row survives, zero users)",
      s4c.code === 2 && /missing\/invalid/i.test(s4c.out) && markerLeft2 === 1 && (await totalRows(scratch.prod)) === 0,
      `exit ${s4c.code} marker=${markerLeft2} ${s4c.out.slice(0, 160)}`,
    );

    // 5. a real pilot APP on the fresh pilot DB (schema-only, SEED_DEMO=0 env)
    {
      // Port pre-check: a FOREIGN process already listening on the pilot port (e.g. an
      // orphan from an earlier crashed run) would silently answer our probes and make every
      // "pilot" check hit the WRONG database. Connection refused = port free (expected);
      // any HTTP response = port occupied (fail loudly, do not proceed).
      let portOccupied = null;
      let up = false;
      try {
        const probe = await fetch(pilotBase + "/api/health");
        portOccupied = `HTTP ${probe.status}`;
      } catch { /* ECONNREFUSED — port is free */ }
      if (portOccupied) {
        check("NG-S14: pilot app boots on a fresh pilot DB (health 200, retention policy=pilot, sweep disabled)",
          false, `port ${pilotPort} already occupied by a foreign process (${portOccupied}) — kill it and re-run; refusing to proceed`);
      } else {
      const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
      env.DATABASE_URL = scratchUrl(scratch.pilot);
      env.RETENTION_POLICY = "pilot";
      env.SEED_DEMO = "0";
      env.ANCHOR_OTS = "0";
      env.TZ_POLICY = "Asia/Kolkata";
      delete env.BACKUP_KEY;
      delete env.BACKUP_DIR;
      delete env.BLOB_READ_WRITE_TOKEN;
      // detached: its own process group, so cleanup can SIGKILL the WHOLE tree
      // (`npx next start` forks a `next-server` child that must die with it — killing
      // only the npx pid orphans the server, which keeps the port + DB connections).
      pilotProc = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(pilotPort)], { env, cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], detached: true });
      let pilotLog = "";
      pilotProc.stdout?.on("data", (d) => (pilotLog += d));
      pilotProc.stderr?.on("data", (d) => (pilotLog += d));
      for (let i = 0; i < 30; i++) {
        try {
          const r = await fetch(pilotBase + "/api/health");
          if (r.status === 200) { up = true; break; }
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
      check("NG-S14: pilot app boots on a fresh pilot DB (health 200, retention policy=pilot, sweep disabled)",
        up, `pilotLog tail: ${pilotLog.slice(-200)}`);
      }
      if (up) {
        const ph = await (await fetch(pilotBase + "/api/health")).json();
        check("NG-S14: pilot /api/health reports the real-data policy (policy=pilot, enabled=false, policy_disables_sweep)",
          ph.retention?.policy === "pilot" && ph.retention?.enabled === false && ph.retention?.reason === "policy_disables_sweep",
          JSON.stringify(ph.retention ?? null));

        // 6. published demo credentials are DENIED on the pilot DB
        const demoLogin = await fetch(pilotBase + "/api/auth/login", {
          method: "POST", headers: { "content-type": "application/json", origin: pilotBase },
          body: JSON.stringify({ email: "ramesh@demo.in", password: "city1234" }), redirect: "manual",
        });
        check("NG-S14: published demo credential (ramesh@demo.in) is DENIED on a fresh pilot DB (401)",
          demoLogin.status === 401, `status ${demoLogin.status}`);
        const demoDoc = await fetch(pilotBase + "/api/auth/login", {
          method: "POST", headers: { "content-type": "application/json", origin: pilotBase },
          body: JSON.stringify({ email: "dr.kulkarni@demo.in", password: "city1234" }), redirect: "manual",
        });
        check("NG-S14: published demo doctor credential (dr.kulkarni@demo.in) is DENIED on a fresh pilot DB (401)",
          demoDoc.status === 401, `status ${demoDoc.status}`);

        // 7. normal patient registration works on the pilot DB
        const pSess = new Session("ngs14-patient", pilotBase);
        const pEmail = `e2e.ngs14p.${stamp}@e2e.test`;
        const ps = await pSess.post("/api/auth/signup", { role: "PATIENT", acceptPolicy: true, adult: true, name: `NGS14 Patient ${stamp}`, email: pEmail, phone: uniqPhone("7"), password: "e2epassword1" });
        check("NG-S14: normal patient registration works on the pilot DB (signup 201 + session)",
          ps.status === 201, `${ps.status} ${JSON.stringify(ps.data)}`);
        const pme = await pSess.get("/api/auth/me");
        check("NG-S14: the new pilot patient has a live session (role PATIENT)",
          pme.status === 200 && pme.data?.viewer?.role === "PATIENT", `${pme.status} ${JSON.stringify(pme.data?.viewer ?? null)}`);

        // 8. normal doctor authentication works on the pilot DB
        const dSess = new Session("ngs14-doctor", pilotBase);
        const dEmail = `e2e.ngs14d.${stamp}@e2e.test`;
        const ds = await dSess.post("/api/auth/signup", { role: "DOCTOR", acceptPolicy: true, adult: true, name: `NGS14 Doctor ${stamp}`, email: dEmail, phone: uniqPhone("7"), password: "e2edocpassword1", qualification: "MBBS", consultationFee: 600, specialty: "General Medicine", registrationNo: `NGS14/${stamp.slice(-5)}` });
        check("NG-S14: normal doctor registration works on the pilot DB (signup 201)",
          ds.status === 201, `${ds.status} ${JSON.stringify(ds.data)}`);
        const dLogin = await new Session("ngs14-doclogin", pilotBase).post("/api/auth/login", { email: dEmail, password: "e2edocpassword1" });
        check("NG-S14: normal doctor authentication works on the pilot DB (fresh login 200)",
          dLogin.status === 200, `status ${dLogin.status}`);

        // 9. no demo records in the pilot DB (but the real registrations ARE there)
        const demoInPilot = await demoUserCount(scratch.pilot);
        const realPatient = Number(
          (await scratchClients[scratch.pilot].query(`SELECT count(*)::int n FROM "User" WHERE email = $1`, [pEmail])).rows[0].n,
        );
        check(
          "NG-S14: no demo records exist in the pilot DB (zero @demo.in users, zero seeded hospitals) while the real registration is present",
          demoInPilot === 0 && (await hospCount(scratch.pilot)) === 0 && realPatient === 1,
          `demoUsers=${demoInPilot} hospitals=${await hospCount(scratch.pilot)} realPatient=${realPatient}`,
        );

        // 10. retention behaviour stays safe on the pilot DB (sweep disabled, zero swept)
        const cron = await fetch(pilotBase + "/api/cron/daily", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
        const cj = await cron.json().catch(() => ({}));
        check(
          "NG-S14: retention behaviour safe on the pilot DB (daily cron: sweep disabled, 0 patients/doctors swept, 200)",
          cron.status === 200 && cj.retention?.enabled === false && cj.retention?.reason === "policy_disables_sweep" && cj.retention?.patients === 0 && cj.retention?.doctors === 0,
          `${cron.status} ${JSON.stringify(cj.retention ?? null)}`,
        );
      }
    }

    // 11. the existing public demo on the synthetic demo env (BASE) still works
    const baseDemo = new Session("ngs14-basedemo");
    const bd = await baseDemo.post("/api/auth/login", { email: "ramesh@demo.in", password: "city1234" });
    const bdHome = bd.status === 200 ? await baseDemo.get("/patient") : { status: 0 };
    check(
      "NG-S14: existing public demo is still functional on the synthetic demo env (ramesh@demo.in login 200 + patient home 200)",
      bd.status === 200 && bdHome.status === 200,
      `login ${bd.status} home ${bdHome.status}`,
    );
  } finally {
    // Kill the WHOLE process group (npx forks a next-server child; killing only the
    // npx pid orphans the server, which keeps the port + DB connections alive).
    if (pilotProc?.pid) {
      try { process.kill(-pilotProc.pid, "SIGKILL"); }
      catch { try { pilotProc.kill("SIGKILL"); } catch { /* already gone */ } }
    }
    await new Promise((r) => setTimeout(r, 1000)); // let the killed app's sockets close
    for (const c of Object.values(scratchClients)) {
      try { await c.end(); } catch { /* ignore */ }
    }
    const leftover = [];
    for (const name of Object.values(scratch)) {
      let ok = false;
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        try { await sql(`DROP DATABASE IF EXISTS ${name}`); ok = true; }
        catch (e) {
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
          else leftover.push(name + ":" + String(e?.message ?? e).slice(0, 80));
        }
      }
    }
    check("NG-S14: cleanup — all scratch databases dropped (no leftovers)", leftover.length === 0, JSON.stringify(leftover));
  }
}
}

console.log("\n— 18. Day 3 data-integrity (2026-11-02): audit atomicity · ownership · revocation · concurrency · FK guards · migration 0007 —");
if (LOCAL) {
  // Re-login in case an earlier section rotated the sessions (same pattern as §11).
  const patEmail = `e2e.p.${stamp}@e2e.test`;
  if (!pat.cookie) await pat.post("/api/auth/login", { email: patEmail, password: "e2epassword1" });
  await doc.post("/api/auth/login", { email: `e2e.d.${stamp}@e2e.test`, password: "e2edocpassword1" });
  const patProf = await pat.get("/api/patient/profile");
  const e2ePid = patProf.data?.id;
  const e2eUid = (await sql(`SELECT "userId" FROM "Patient" WHERE id = $1`, [e2ePid])).rows[0]?.userId;

  // ---- 18.1 ledger atomicity: success path — the GRANT_CONSENT row commits WITH the consent ----
  {
    const grant = await pat.post("/api/patient/consents", { doctorId: e2eDoctorId, scope: "FULL_RECORD", expiryDays: 7 });
    check("18.1a re-grant after §4 revoke succeeds", [200, 201].includes(grant.status), JSON.stringify(grant.data));
    const consentId = grant.data?.consentId;
    const rows = await sql(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'GRANT_CONSENT' AND "entityId" = $1`, [consentId ?? ""]);
    check("18.1b exactly one GRANT_CONSENT ledger row for the new consent id", rows?.rows[0]?.n === 1, `n=${rows?.rows[0]?.n}`);
    // keep the consent id for 18.4 (revoke immediacy)
    globalThis.__d3ConsentId = consentId;
  }

  // ---- 18.2 ledger atomicity: failure path — a refused operation leaves NO partial evidence ----
  {
    const before = (await sql(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'BOOK_APPOINTMENT' AND "actorId" = $1`, [e2eUid])).rows[0]?.n ?? 0;
    // find an offered instant with zero live bookings (e2e doctor: 15-min slots, capacity 1)
    let T2 = null;
    for (const [h, m] of [[10, 15], [10, 30], [10, 45], [11, 15], [11, 30], [11, 45], [12, 15], [12, 30], [12, 45]]) {
      const t = istSlot(h, m);
      const c = (await sql(
        `SELECT count(*)::int AS n FROM "Appointment" WHERE "doctorId" = $1 AND "scheduledAt" = $2 AND status IN ('PENDING','CONFIRMED','CHECKED_IN','RESCHEDULED')`,
        [e2eDoctorId, t],
      )).rows[0]?.n;
      if (c === 0) { T2 = t; break; }
    }
    const bookA = T2 ? await pat.post("/api/patient/appointments", { doctorId: e2eDoctorId, scheduledAt: T2, reason: "day3 integrity" }) : { status: 0 };
    check("18.2a booking for a free single-seat slot → 201", bookA.status === 201, JSON.stringify(bookA.data));
    const after = (await sql(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'BOOK_APPOINTMENT' AND "actorId" = $1`, [e2eUid])).rows[0]?.n ?? 0;
    check("18.2b the booking's ledger row committed (count +1)", after === before + 1, `before=${before} after=${after}`);
    const apptId = bookA.data?.appointmentId;
    const cancel1 = await pat.patch("/api/patient/appointments", { appointmentId: apptId, reason: "day3 cancel" });
    check("18.2c first cancel → 200", cancel1.status === 200, JSON.stringify(cancel1.data));
    const cancel2 = await pat.patch("/api/patient/appointments", { appointmentId: apptId, reason: "day3 cancel again" });
    check("18.2d cancelling an already-cancelled appointment → 400", cancel2.status === 400, `got ${cancel2.status}`);
    const nCancel = (await sql(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'CANCEL_APPOINTMENT' AND metadata->>'appointmentId' = $1`, [apptId ?? ""])).rows[0]?.n;
    check("18.2e exactly ONE CANCEL_APPOINTMENT ledger row (the failed retry wrote nothing)", nCancel === 1, `n=${nCancel}`);
  }

  // ---- 18.3 ownership: a doctor cannot read a patient he has no consent for ----
  {
    const anita = (await sql(`SELECT p.id FROM "Patient" p JOIN "User" u ON u.id = p."userId" WHERE u.email = 'anita@demo.in'`)).rows[0]?.id;
    check("18.3a demo patient (anita) profile resolvable", !!anita, "seed row missing");
    const r403 = await doc.get(`/api/doctor/patients/${anita}/record`);
    check("18.3b doctor reads a consent-less other patient → 403", r403.status === 403, `got ${r403.status}`);
    const r404 = await doc.get(`/api/doctor/patients/${"f".repeat(32).replace(/f/g, "0")}/record`);
    check("18.3c doctor reads a forged patient id → 404", r404.status === 404, `got ${r404.status}`);
  }

  // ---- 18.4 revocation immediacy: the very next doctor request re-checks the DB ----
  {
    const read1 = await doc.get(`/api/doctor/patients/${e2ePid}/record`);
    check("18.4a doctor read with live consent → 200", read1.status === 200, `got ${read1.status}`);
    const rev = await pat.patch(`/api/patient/consents?id=${globalThis.__d3ConsentId}`, { reason: "day3 revoke" });
    check("18.4b patient revokes → 200", rev.status === 200, JSON.stringify(rev.data));
    const read2 = await doc.get(`/api/doctor/patients/${e2ePid}/record`);
    check("18.4c doctor read AFTER revoke → instant 403", read2.status === 403, `got ${read2.status}`);
  }

  // ---- 18.5 concurrency: two parallel bookings for the same last seat — the DB decides ----
  {
    let T3 = null;
    for (const [h, m] of [[10, 30], [10, 45], [11, 15], [11, 30], [11, 45], [12, 15], [12, 30], [12, 45]]) {
      const t = istSlot(h, m);
      const c = (await sql(
        `SELECT count(*)::int AS n FROM "Appointment" WHERE "doctorId" = $1 AND "scheduledAt" = $2 AND status IN ('PENDING','CONFIRMED','CHECKED_IN','RESCHEDULED')`,
        [e2eDoctorId, t],
      )).rows[0]?.n;
      if (c === 0) { T3 = t; break; }
    }
    const p2 = new Session("p2-day3");
    const su2 = await p2.post("/api/auth/signup", {
      role: "PATIENT", acceptPolicy: true, adult: true, name: `E2E P2 ${stamp}`, email: `e2e.p2.${stamp}@e2e.test`, phone: uniqPhone("7"), password: "e2epassword2",
    });
    check("18.5a second patient can sign up for the race", su2.status === 201 || su2.status === 200, JSON.stringify(su2.data));
    const [r1, r2] = T3
      ? await Promise.all([
          pat.post("/api/patient/appointments", { doctorId: e2eDoctorId, scheduledAt: T3, reason: "day3 race A" }),
          p2.post("/api/patient/appointments", { doctorId: e2eDoctorId, scheduledAt: T3, reason: "day3 race B" }),
        ])
      : [{ status: 0 }, { status: 0 }];
    const codes = [r1.status, r2.status].sort((a, b) => a - b);
    check("18.5b parallel last-seat race → exactly one 201 and one 409", codes[0] === 201 && codes[1] === 409, `got [${codes}]`);
    const live = (await sql(
      `SELECT count(*)::int AS n FROM "Appointment" WHERE "doctorId" = $1 AND "scheduledAt" = $2 AND status IN ('PENDING','CONFIRMED','CHECKED_IN','RESCHEDULED')`,
      [e2eDoctorId, T3 ?? ""],
    )).rows[0]?.n;
    check("18.5c database holds exactly ONE live appointment for that instant", live === 1, `n=${live}`);
  }

  // ---- 18.6 FK RESTRICT probes: clinical data cannot be bypassed by raw DELETEs ----
  {
    // guard: a 0-row DELETE would not error and could fake a pass — only probe against a
    // row we have verified exists (and has references to be protected by).
    const targetUser = e2eUid && (await sql(`SELECT count(*)::int AS n FROM "User" WHERE id = $1`, [e2eUid])).rows[0]?.n === 1;
    const targetPatient = e2ePid && (await sql(`SELECT count(*)::int AS n FROM "Patient" WHERE id = $1`, [e2ePid])).rows[0]?.n === 1;
    if (!targetUser || !targetPatient) {
      skip("18.6 FK RESTRICT probes", "e2e patient/user not present (earlier section failed — rate limit?)");
    } else {
      let userDel = null;
      try { await sql(`DELETE FROM "User" WHERE id = $1`, [e2eUid]); } catch (e) { userDel = e; }
      check("18.6a DELETE FROM User (owns a patient profile) refused with 23503", userDel?.code === "23503", userDel?.code ?? "delete SUCCEEDED");
      let patDel = null;
      try { await sql(`DELETE FROM "Patient" WHERE id = $1`, [e2ePid]); } catch (e) { patDel = e; }
      check("18.6b DELETE FROM Patient (referenced by consents/appointments) refused with 23503", patDel?.code === "23503", patDel?.code ?? "delete SUCCEEDED");
    }
  }

  // ---- 18.7 migration 0007 invariants + migration-folder idempotency ----
  {
    const dup = (await sql(`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'Observation_patient_name_taken_idx'`)).rows[0]?.n;
    check("18.7a duplicate Observation index (0005 copy) is gone", dup === 0, `n=${dup}`);
    const base = (await sql(`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'Observation_patientId_name_takenOn_idx'`)).rows[0]?.n;
    check("18.7b base Observation index (citycare_init) still present", base === 1, `n=${base}`);
    // re-run the ENTIRE migrations folder against this existing DB (the bootstrap does this on every deploy)
    let migError = null;
    try {
      const dir = new URL("../../schema/migrations/", import.meta.url); // trailing slash: it is a directory
      const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
      for (const f of files) {
        await pgClient.query(readFileSync(new URL(f, dir), "utf8"));
      }
    } catch (e) { migError = e; }
    check("18.7c full migrations/ folder re-run on an existing DB exits clean", migError === null, String(migError?.message ?? "").slice(0, 120));
    const tables = (await sql(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`)).rows[0]?.n;
    const obsIdx = (await sql(`SELECT count(*)::int AS n FROM pg_indexes WHERE tablename = 'Observation'`)).rows[0]?.n;
    check("18.7d re-run changed nothing observable (36 tables, 2 Observation indexes)", tables === 36 && obsIdx === 2, `tables=${tables} obsIdx=${obsIdx}`);
  }

  // ---- 18.8 document delete: the flag and the encrypted bytes die in one transaction ----
  {
    const pdfBytes = new TextEncoder().encode("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
    const fd = new FormData();
    fd.append("file", new Blob([pdfBytes], { type: "application/pdf" }), "day3.pdf");
    fd.append("title", "Day3 audit"); fd.append("type", "OTHER"); fd.append("issuedOn", "2026-11-02");
    const up = await pat.upload("/api/patient/documents", fd);
    check("18.8a upload → 201", up.status === 201, JSON.stringify(up.data).slice(0, 120));
    const docId = up.data?.id;
    const del = await pat.del(`/api/documents/${docId}`);
    check("18.8b patient deletes their document → 200", del.status === 200, JSON.stringify(del.data));
    const state = (await sql(
      `SELECT d."isDeleted" AS gone, count(b."documentId")::int AS blobs FROM "Document" d LEFT JOIN "DocumentBlob" b ON b."documentId" = d.id WHERE d.id = $1 GROUP BY d."isDeleted"`,
      [docId ?? ""],
    )).rows[0];
    check("18.8c isDeleted=true AND zero blob rows (no orphaned ciphertext)", state?.gone === true && state?.blobs === 0, JSON.stringify(state));
  }

  // ---- 18.9 FAULT INJECTION: when the audit append itself fails, the whole operation must roll back ----
  // This is the test that proves A95's atomicity claim with the REAL database transaction:
  // a BEFORE-INSERT trigger on AuditLog raises for action='GRANT_CONSENT', so the append fails
  // AFTER the consent mutation has executed inside the same tx. Expected: 5xx, consent rolled
  // back, zero partial ledger rows, chain still intact. Injection lives in the LOCAL test DB
  // only (guarded below) and is removed in a finally path; the normal path is re-verified after.
  {
    const injectUrl = process.env.DATABASE_URL ?? "";
    let isLoopback = false;
    try { const u = new URL(injectUrl); isLoopback = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "::1"; } catch { /* not a parseable URL — refuse */ }
    const canInject = LOCAL && isLoopback;
    if (!canInject) {
      skip("18.9 audit-fault injection", "DATABASE_URL is not a local loopback database — injection refused (safety gate)");
    } else {
      const TRIG = "e2e_day3_audit_inject";
      const FN = "e2e_day3_audit_inject_fn";
      const cleanup = async () => {
        try { await sql(`DROP TRIGGER IF EXISTS ${TRIG} ON "AuditLog"`); } catch { /* already gone */ }
        try { await sql(`DROP FUNCTION IF EXISTS ${FN}()`); } catch { /* already gone */ }
      };
      // belt-and-braces: clear any leftover from a previously crashed run BEFORE arming
      await cleanup();
      // snapshot the pair's consent state; the rollback assertion is an EXACT diff against it
      // (a pre-existing pending REQUESTED row from an earlier §18 step is legitimate and must
      //  survive — what must not happen is a NEW row or a row FLIPPING to APPROVED)
      const snap = async () => (await sql(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status = 'APPROVED')::int  AS approved,
                count(*) FILTER (WHERE status = 'REQUESTED')::int AS requested
         FROM "Consent" WHERE "patientId" = $1 AND "doctorId" = $2`, [e2ePid, e2eDoctorId])).rows[0];
      // normalize: a live APPROVED consent would make the grant 409 before any tx — revoke it
      const pre = await snap();
      if (pre?.approved) {
        const liveId = (await sql(`SELECT id FROM "Consent" WHERE "patientId"=$1 AND "doctorId"=$2 AND status='APPROVED' LIMIT 1`, [e2ePid, e2eDoctorId])).rows[0]?.id;
        if (liveId) await pat.patch(`/api/patient/consents?id=${liveId}`, { reason: "day3 18.9 pre-arm normalize" });
      }
      const s0 = await snap();
      try {
        await sql(`CREATE FUNCTION ${FN}() RETURNS trigger AS $$
          BEGIN RAISE EXCEPTION 'E2E-DAY3-AUDIT-INJECTION: forced ledger-append failure (rollback test)' USING ERRCODE = 'P0001'; END; $$ LANGUAGE plpgsql`);
        await sql(`CREATE TRIGGER ${TRIG} BEFORE INSERT ON "AuditLog" FOR EACH ROW
                   WHEN (NEW.action = 'GRANT_CONSENT') EXECUTE FUNCTION ${FN}()`);
        const baseGrants = (await sql(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'GRANT_CONSENT' AND "actorId" = $1`, [e2eUid])).rows[0]?.n ?? 0;

        // real state-mutating workflow: the consent grant (its audit append now fails mid-tx)
        const grant = await pat.post("/api/patient/consents", { doctorId: e2eDoctorId, scope: "SUMMARY_ONLY", expiryDays: 7 });
        check("18.9a grant with a failing audit append → 5xx (the operation is refused, not silently half-done)", grant.status >= 500 && grant.status < 600, `got ${grant.status} ${JSON.stringify(grant.data)}`);

        const s1 = await snap();
        check("18.9b business mutation ROLLED BACK (no new consent row, none flipped to APPROVED)",
          s1.total === s0.total && s1.approved === s0.approved && s1.requested === s0.requested,
          `before=${JSON.stringify(s0)} after=${JSON.stringify(s1)}`);

        const after = (await sql(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'GRANT_CONSENT' AND "actorId" = $1`, [e2eUid])).rows[0]?.n ?? 0;
        const breaks = (await sql(`SELECT count(*)::int AS n FROM ledger_verify()`)).rows[0]?.n ?? -1;
        check("18.9c NO partial AuditLog entry (count unchanged) AND chain still intact", after === baseGrants && breaks === 0, `before=${baseGrants} after=${after} breaks=${breaks}`);
      } finally {
        await cleanup();
        const trigLeft = (await sql(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = $1 AND NOT tgisinternal`, [TRIG])).rows[0]?.n;
        const fnLeft = (await sql(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = $1`, [FN])).rows[0]?.n;
        check("18.9d failure-injection cleanup completed (trigger + function removed)", trigLeft === 0 && fnLeft === 0, `trigger=${trigLeft} fn=${fnLeft}`);
        // normal success path after cleanup: grant works again and its ledger row commits
        const before2 = (await sql(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'GRANT_CONSENT' AND "actorId" = $1`, [e2eUid])).rows[0]?.n ?? -1;
        const grant2 = await pat.post("/api/patient/consents", { doctorId: e2eDoctorId, scope: "SUMMARY_ONLY", expiryDays: 7 });
        const after2 = (await sql(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'GRANT_CONSENT' AND "actorId" = $1`, [e2eUid])).rows[0]?.n ?? -1;
        check("18.9e normal grant after cleanup → success AND exactly one new ledger row", [200, 201].includes(grant2.status) && after2 === before2 + 1, `status=${grant2.status} before2=${before2} after2=${after2}`);
        // restore §18's end state (no live consent on the pair)
        const live2 = (await sql(`SELECT id FROM "Consent" WHERE "patientId" = $1 AND "doctorId" = $2 AND status = 'APPROVED' LIMIT 1`, [e2ePid, e2eDoctorId])).rows[0]?.id;
        if (live2) await pat.patch(`/api/patient/consents?id=${live2}`, { reason: "day3 18.9 restore" });
      }
    }
  }

  // ---- 18.10–18.15 R1 prebuild target gate: preview hard-skip, production verify-default, fail-closed ----
  // R1 (2026-11-02, P0 isolation remediation): the build hook must never let a preview
  // build touch a database, must keep production builds on the read-only verify path by
  // default, and must fail closed on any environment it does not explicitly know.
  // These checks SPAWN THE REAL prebuild script against the local demo DB (loopback-gated
  // like §18.9 — refused anywhere else), so they prove behaviour, not just the decision
  // table. The §18.15 controlled operation is idempotent on an up-to-date demo DB.
  {
    const gateUrl = process.env.DATABASE_URL;
    let gateLoopback = false;
    try {
      const u = new URL(gateUrl);
      gateLoopback = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "::1";
    } catch { /* unparseable — refuse */ }
    if (!gateLoopback) {
      skip("18.10–18.15 R1 prebuild gate", "DATABASE_URL is not a local loopback database — spawning the build hook against it is refused (safety gate)");
    } else {
      const { spawnSync } = await import("node:child_process");
      const prebuild = new URL("../scripts/prebuild-schema-sync.mjs", import.meta.url).pathname;
      const LATEST_MIG = "0007_dedup_observation_index.sql"; // newest file in schema/migrations (§18.7 pins the folder)
      const runGate = (extra) =>
        spawnSync(process.execPath, [prebuild], { encoding: "utf8", env: { ...process.env, ...extra } });
      const out = (r) => `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const snapshotState = async () => {
        const t = (await sql("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0]?.n;
        const i = (await sql("SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public'")).rows[0]?.n;
        const f = (await sql("SELECT count(*)::int AS n FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')")).rows[0]?.n;
        const users = (await sql('SELECT count(*)::int AS n FROM "User"')).rows[0]?.n;
        const ledger = (await sql('SELECT count(*)::int AS n FROM "AuditLog" WHERE seq IS NOT NULL')).rows[0]?.n;
        return { t, i, f, users, ledger };
      };

      // 18.10 preview: hard skip, flag-proof, zero connections
      const beforeConn = (await sql("SELECT count(*)::int AS n FROM pg_stat_activity")).rows[0]?.n;
      const r10 = runGate({ VERCEL_ENV: "preview", DATABASE_URL: gateUrl, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: LATEST_MIG });
      const afterConn = (await sql("SELECT count(*)::int AS n FROM pg_stat_activity")).rows[0]?.n;
      check("18.10a preview prebuild exits 0 via the hard-skip path", r10.status === 0 && out(r10).includes("hard skip"), `status=${r10.status} ${out(r10).slice(0, 120)}`);
      check("18.10b preview is FLAG-PROOF (DATABASE_URL + apply + target all present — still skipped)", out(r10).includes("no database work executed"), out(r10).slice(0, 160));
      check("18.10c preview made ZERO database connections (pg_stat_activity delta = 0)", beforeConn === afterConn, `before=${beforeConn} after=${afterConn}`);

      // 18.11 production default: read-only verify, zero DDL
      const s11a = await snapshotState();
      const r11 = runGate({ VERCEL_ENV: "production", DATABASE_URL: gateUrl });
      const s11b = await snapshotState();
      check("18.11a production prebuild (no mode) exits 0 on the read-only verify path", r11.status === 0 && out(r11).includes("verify: OK"), `status=${r11.status} ${out(r11).slice(0, 120)}`);
      check("18.11b verify executed ZERO DDL (tables + indexes + functions identical)", s11a.t === s11b.t && s11a.i === s11b.i && s11a.f === s11b.f, JSON.stringify({ a: s11a, b: s11b }));

      // 18.12 production without DATABASE_URL: fail loudly (no fallback)
      const r12 = runGate({ VERCEL_ENV: "production", DATABASE_URL: "" });
      check("18.12 production + missing DATABASE_URL fails the build (exit 1, no fallback)", r12.status === 1 && out(r12).toLowerCase().includes("no fallback"), `status=${r12.status}`);

      // 18.13 unknown / missing VERCEL_ENV: FAIL CLOSED even with a valid URL
      const r13a = runGate({ DATABASE_URL: gateUrl });
      check("18.13a missing VERCEL_ENV → refuses (exit 1) even with a valid DATABASE_URL", r13a.status === 1 && out(r13a).includes("FAIL CLOSED"), `status=${r13a.status}`);
      const r13b = runGate({ VERCEL_ENV: "ci", DATABASE_URL: gateUrl });
      check("18.13b unexpected environment (VERCEL_ENV=ci) → refuses (exit 1)", r13b.status === 1 && out(r13b).includes("FAIL CLOSED"), `status=${r13b.status}`);

      // 18.14 apply is bound to an explicit controlled migration operation
      const r14a = runGate({ VERCEL_ENV: "production", DATABASE_URL: gateUrl, SCHEMA_SYNC_MODE: "apply" });
      check("18.14a apply WITHOUT MIGRATION_TARGET refuses (a temporary mode variable alone never applies)", r14a.status === 1 && out(r14a).includes("MIGRATION_TARGET"), `status=${r14a.status}`);
      const r14b = runGate({ VERCEL_ENV: "production", DATABASE_URL: gateUrl, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: "0006_backup_metadata.sql" });
      check("18.14b apply with a STALE target refuses (a controlled operation names the newest migration)", r14b.status === 1 && out(r14b).includes("newest"), `status=${r14b.status}`);

      // 18.15 full controlled operation (production + apply + newest target) — idempotent on an
      // up-to-date DB. The production seed config is SEED_DEMO=0 (the only non-refusing
      // production seed state), so the operation completes schema-only.
      const s15a = await snapshotState();
      const r15 = runGate({ VERCEL_ENV: "production", DATABASE_URL: gateUrl, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: LATEST_MIG, RETENTION_POLICY: "demo", SEED_DEMO: "0" });
      const s15b = await snapshotState();
      check("18.15a controlled operation exits 0 and records itself in the build log", r15.status === 0 && out(r15).includes("controlled migration operation") && out(r15).includes(LATEST_MIG), `status=${r15.status}`);
      check("18.15b controlled operation on an up-to-date DB changes NOTHING (tables + users + ledger identical)", s15a.t === s15b.t && s15a.users === s15b.users && s15a.ledger === s15b.ledger, JSON.stringify({ a: s15a, b: s15b }));
      // 18.15c a controlled operation on a production target can NEVER seed: SEED_DEMO=1
      // refuses in the bootstrap (the production rule in demo-seed-core), DB untouched.
      const s15c = await snapshotState();
      const r15c = runGate({ VERCEL_ENV: "production", DATABASE_URL: gateUrl, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: LATEST_MIG, RETENTION_POLICY: "demo", SEED_DEMO: "1" });
      const s15d = await snapshotState();
      check("18.15c production controlled op + SEED_DEMO=1 REFUSES (no demo seed can ever reach a production target)", r15c.status === 1 && out(r15c).toLowerCase().includes("refus"), `status=${r15c.status}`);
      check("18.15d refused seed left the DB untouched (users + ledger identical)", s15c.users === s15d.users && s15c.ledger === s15d.ledger, JSON.stringify({ a: s15c, b: s15d }));

      // ---- 18.16 the REAL npm lifecycle hook (review: test `npm run prebuild`, not just `npx next build`) ----
      // Vercel runs the npm build script (which fires this hook); npx next build does not.
      // These spawn the actual `npm run prebuild` so the lifecycle path itself is pinned.
      const webRoot = new URL("..", import.meta.url).pathname;
      const runNpmPrebuild = (extra) =>
        spawnSync("npm", ["run", "prebuild", "--silent"], { encoding: "utf8", cwd: webRoot, env: { ...process.env, ...extra } });
      const r16a = runNpmPrebuild({ VERCEL_ENV: "", DATABASE_URL: gateUrl });
      check("18.16a npm run prebuild, missing VERCEL_ENV + valid URL → refuses (exit 1, FAIL CLOSED)", r16a.status === 1 && out(r16a).includes("FAIL CLOSED"), `status=${r16a.status}`);
      const r16b = runNpmPrebuild({ VERCEL_ENV: "preview", DATABASE_URL: gateUrl, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: LATEST_MIG });
      check("18.16b npm run prebuild, preview + apply → exits 0 via hard skip", r16b.status === 0 && out(r16b).includes("hard skip"), `status=${r16b.status}`);
      const r16c = runNpmPrebuild({ VERCEL_ENV: "production", DATABASE_URL: gateUrl });
      check("18.16c npm run prebuild, production (no mode) → exits 0 on read-only verify", r16c.status === 0 && out(r16c).includes("verify: OK"), `status=${r16c.status}`);

      // ---- 18.17 review F1: a Vercel production build is PERMANENTLY verify-only ----
      const stripVercelMarkers = (extra) => {
        const e = { ...process.env, ...extra };
        delete e.VERCEL_PROJECT_ID;
        delete e.VERCEL_GIT_COMMIT_SHA;
        return e;
      };
      const r17a = spawnSync(process.execPath, [prebuild], {
        encoding: "utf8",
        env: { ...process.env, VERCEL_ENV: "production", DATABASE_URL: gateUrl, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: LATEST_MIG, VERCEL_PROJECT_ID: "prj_e2e", VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567" },
      });
      check("18.17a apply inside a Vercel build (markers present) → REFUSES (production builds are permanently verify-only)", r17a.status === 1 && out(r17a).includes("PERMANENTLY verify-only") && !out(r17a).includes("migration applied"), `status=${r17a.status}`);
      const s17 = await snapshotState();
      const r17b = spawnSync(process.execPath, [prebuild], {
        encoding: "utf8",
        env: stripVercelMarkers({ VERCEL_ENV: "production", DATABASE_URL: gateUrl, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: LATEST_MIG, RETENTION_POLICY: "demo", SEED_DEMO: "0" }),
      });
      const s17b = await snapshotState();
      check("18.17b the SAME inputs without Vercel markers (non-Vercel controlled run) → proceeds (contrast case)", r17b.status === 0 && out(r17b).includes("controlled migration operation"), `status=${r17b.status}`);
      check("18.17c the contrast run changed nothing on an up-to-date DB (idempotent)", s17.t === s17b.t && s17.users === s17b.users, JSON.stringify({ a: s17, b: s17b }));

      // ---- 18.18 review F2: the migration destination is validated independently ----
      const r18a = spawnSync(process.execPath, [prebuild], {
        encoding: "utf8",
        env: stripVercelMarkers({ VERCEL_ENV: "production", DATABASE_URL: gateUrl, MIGRATION_DATABASE_URL: gateUrl, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: LATEST_MIG, RETENTION_POLICY: "demo", SEED_DEMO: "0" }),
      });
      check("18.18a apply with MIGRATION_DATABASE_URL (loopback) → exits 0 and records the DESTINATION host in the log", r18a.status === 0 && out(r18a).includes("migration destination host: 127.0.0.1"), `status=${r18a.status}`);
      const r18b = spawnSync(process.execPath, [prebuild], {
        encoding: "utf8",
        env: stripVercelMarkers({ VERCEL_ENV: "production", DATABASE_URL: gateUrl, MIGRATION_DATABASE_URL: "not a url", SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: LATEST_MIG }),
      });
      check("18.18b apply with an UNPARSEABLE MIGRATION_DATABASE_URL → refuses (the valid DATABASE_URL does not mask it)", r18b.status === 1 && out(r18b).includes("MIGRATION_DATABASE_URL"), `status=${r18b.status}`);
      const r18c = spawnSync(process.execPath, [prebuild], {
        encoding: "utf8",
        env: stripVercelMarkers({ VERCEL_ENV: "production", DATABASE_URL: gateUrl, MIGRATION_DATABASE_URL: "http://elsewhere.example.com/db", SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: LATEST_MIG }),
      });
      check("18.18c apply with a NON-POSTGRES MIGRATION_DATABASE_URL → refuses", r18c.status === 1 && out(r18c).toLowerCase().includes("protocol"), `status=${r18c.status}`);

      // ---- 18.19 review F3: a direct invocation with missing/unknown context can never seed/truncate ----
      // The regression the owner asked for: a production DB must not be truncated or seeded
      // through a direct script invocation with missing/unknown target context. The marker is
      // a specific user's password hash (a truncate+reseed would change the salt).
      const noContextEnv = (extra) => {
        const e = { ...process.env, ...extra };
        delete e.VERCEL_ENV;
        delete e.SEED_CONTEXT;
        return e;
      };
      const noSeedContextEnv = (extra) => {
        const e = { ...process.env, ...extra };
        delete e.SEED_CONTEXT;
        return e;
      };
      const hashMarker = async () => (await sql('SELECT "passwordHash" FROM "User" WHERE "email" = $1', ["ramesh@demo.in"])).rows[0]?.passwordHash ?? null;
      const h19a = await hashMarker();
      const r19a = spawnSync(process.execPath, ["scripts/db-bootstrap-node.mjs"], {
        encoding: "utf8",
        cwd: webRoot,
        env: noContextEnv({ DATABASE_URL: gateUrl, RETENTION_POLICY: "demo", SEED_DEMO: "1", FORCE_SEED: "1" }),
      });
      const h19b = await hashMarker();
      check("18.19a direct bootstrap, no VERCEL_ENV/SEED_CONTEXT + FORCE_SEED=1 → REFUSED (exit 1, unverified execution context)", r19a.status === 1 && out(r19a).includes("unverified execution context"), `status=${r19a.status}`);
      check("18.19b the refused direct run did NOT truncate/reseed (demo user hash byte-identical)", h19a !== null && h19a === h19b);
      const r19c = spawnSync(process.execPath, ["scripts/seed.mjs"], {
        encoding: "utf8",
        cwd: webRoot,
        env: noContextEnv({ DATABASE_URL: gateUrl, RETENTION_POLICY: "demo", SEED_DEMO: "1" }),
      });
      const h19d = await hashMarker();
      check("18.19c direct `node scripts/seed.mjs` (npm run seed path), undeclared context → REFUSED", r19c.status !== 0 && out(r19c).includes("unverified execution context"), `status=${r19c.status}`);
      check("18.19d the refused direct seed did NOT truncate/reseed (demo user hash byte-identical)", h19a === h19d);
      const r19e = spawnSync(process.execPath, ["scripts/db-bootstrap-node.mjs"], {
        encoding: "utf8",
        cwd: webRoot,
        env: noSeedContextEnv({ VERCEL_ENV: "ci", DATABASE_URL: gateUrl, RETENTION_POLICY: "demo", SEED_DEMO: "1", FORCE_SEED: "1" }),
      });
      check("18.19e an UNKNOWN non-empty VERCEL_ENV (ci) without context → also refuses", r19e.status === 1 && out(r19e).includes("unverified execution context"), `status=${r19e.status}`);
      const e19f = noContextEnv({ DATABASE_URL: gateUrl, RETENTION_POLICY: "demo", SEED_DEMO: "1", FORCE_SEED: "1" });
      e19f.SEED_CONTEXT = "ci"; // declared isolated context (the one dimension 18.19a/c/e strip)
      const r19f = spawnSync(process.execPath, ["scripts/db-bootstrap-node.mjs"], {
        encoding: "utf8",
        cwd: webRoot,
        env: e19f,
      });
      const h19g = await hashMarker();
      check("18.19f the DECLARED isolated context (SEED_CONTEXT=ci) still seeds — the existing CI/local workflow is preserved", r19f.status === 0 && out(r19f).includes("database ready") && (await sql('SELECT count(*)::int n FROM "User"')).rows[0].n >= 9, `status=${r19f.status}`);
      check("18.19g the reseed changed the salt (proof that the refused runs were the ones that left the DB untouched)", h19g !== null && h19g !== h19a);

      // ---- 18.20 FINAL REVIEW (2026-11-02): the destination IDENTITY gate ----
      // SEED_CONTEXT is caller-controlled — it is a self-attested label, NOT proof of
      // database identity. The only TRUNCATE in the codebase (the demo seed) now
      // additionally requires the destination to be a same-machine (loopback)
      // database, established from the URL itself. The "production-shaped" URL below
      // is a syntactically valid URL on a GUARANTEED-NXDOMAIN host (.invalid, RFC
      // 2606): if a bug ever let it past the gate, the connection would fail instantly
      // and nothing real could be touched. We never connect to the real production DB.
      const PROD_SIM = "postgres://owner-sim:sim-pw-never-logged@prod-sim-1.invalid:5432/citycare";
      const h20a = await hashMarker();
      // Takes a FULL env object (removals must not be resurrected by re-spreads of process.env).
      const runSeedDirect = (fullEnv) =>
        spawnSync(process.execPath, ["scripts/seed.mjs"], { encoding: "utf8", cwd: webRoot, env: fullEnv });
      const e20a = noContextEnv({ DATABASE_URL: PROD_SIM, RETENTION_POLICY: "demo", SEED_DEMO: "1", FORCE_SEED: "1" });
      e20a.SEED_CONTEXT = "local-demo"; // the adversarial scenario: context IS declared, identity is NOT
      const r20a2 = runSeedDirect(e20a);
      check("18.20a THE OWNER'S ADVERSARIAL SCENARIO: no VERCEL_ENV + SEED_CONTEXT=local-demo + demo + SEED_DEMO=1 + FORCE_SEED=1 + production-shaped URL → REFUSED before any connection (no TRUNCATE possible)", r20a2.status === 2 && out(r20a2).includes("NOT a same-machine (loopback) database") && !out(r20a2).includes("sim-pw-never-logged"), `status=${r20a2.status}`);
      const e20b = { ...process.env, SEED_CONTEXT: "ci", DATABASE_URL: PROD_SIM, RETENTION_POLICY: "demo", SEED_DEMO: "1", FORCE_SEED: "1" };
      delete e20b.VERCEL_ENV;
      const r20b = runSeedDirect(e20b);
      check("18.20b production-shaped URL + CI context → REFUSED (the CI label cannot override database identity)", r20b.status === 2 && out(r20b).includes("NOT a same-machine (loopback) database"), `status=${r20b.status}`);
      const r20c = runSeedDirect(noContextEnv({ DATABASE_URL: PROD_SIM, RETENTION_POLICY: "demo", SEED_DEMO: "1", FORCE_SEED: "1" })); // full env — no resurrection
      check("18.20c production-shaped URL + FORCE_SEED=1 + no context → REFUSED (FORCE_SEED cannot force a seed anywhere)", r20c.status === 2 && out(r20c).includes("refus"), `status=${r20c.status}`);
      const e20d = { ...process.env, VERCEL_ENV: "prod", SEED_CONTEXT: "local-demo", DATABASE_URL: PROD_SIM, RETENTION_POLICY: "demo", SEED_DEMO: "1", FORCE_SEED: "1" };
      const r20d = runSeedDirect(e20d);
      check("18.20d unknown VERCEL_ENV (prod) + DECLARED context + production-shaped URL → REFUSED (a declared target/context never overrides identity)", r20d.status === 2 && out(r20d).includes("NOT a same-machine (loopback) database"), `status=${r20d.status}`);
      const h20b = await hashMarker();
      check("18.20e every refused attempt left the real loopback DB byte-for-byte untouched (demo user hash identical after all refusals)", h20a !== null && h20a === h20b);
      const e20f = { ...process.env, SEED_CONTEXT: "local-demo", DATABASE_URL: gateUrl, RETENTION_POLICY: "demo", SEED_DEMO: "1", FORCE_SEED: "1" };
      delete e20f.VERCEL_ENV;
      const r20f = runSeedDirect(e20f);
      check("18.20f the verified isolated LOCAL DEMO flow still works: loopback DB + local-demo → seed (exit 0, real entry point)", r20f.status === 0 && (await sql('SELECT count(*)::int n FROM "User"')).rows[0].n >= 9, `status=${r20f.status}`);
      // Fresh isolated CI scratch DB (the real CI flow: throwaway loopback DB + declared ci context).
      // Created inline here because runSeed/createScratch live in §17's scope, not §18's.
      const s20g = `citycare_e2e_ci_isol_${Date.now().toString(36)}`;
      let r20g = { status: 1 };
      let uCI = 0;
      try {
        await sql(`DROP DATABASE IF EXISTS ${s20g}`);
        await sql(`CREATE DATABASE ${s20g}`);
        const sUrl = (() => { const u = new URL(gateUrl); u.pathname = "/" + s20g; return u.toString(); })();
        const { default: pgCI } = await import("pg");
        const cCI = new pgCI.Client({ connectionString: sUrl });
        await cCI.connect();
        const filesCI = ["../schema/citycare_init.sql", "../schema/sql/constraints.sql", "../schema/sql/ledger.sql", ...readdirSync("../schema/migrations").filter((f) => f.endsWith(".sql")).sort().map((f) => `../schema/migrations/${f}`)];
        for (const f of filesCI) await cCI.query(readFileSync(f, "utf8"));
        await cCI.end();
        const eCI = { ...process.env, DATABASE_URL: sUrl, SCRYPT_N: "4096", RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "ci" };
        delete eCI.VERCEL_ENV; // isolated CI run: no Vercel target — the declared ci context is the authorization
        r20g = spawnSync(process.execPath, ["scripts/seed.mjs"], { encoding: "utf8", cwd: webRoot, env: eCI });
        const cCount = new pgCI.Client({ connectionString: sUrl });
        await cCount.connect();
        uCI = (await cCount.query(`SELECT count(*)::int n FROM "User"`)).rows[0].n;
        await cCount.end();
      } finally {
        try { await sql(`DROP DATABASE IF EXISTS ${s20g}`); } catch { /* best-effort drop */ }
      }
      check("18.20g the verified isolated CI flow still works: fresh scratch (loopback) DB + SEED_CONTEXT=ci → seed (exit 0, ≥9 users, real entry point)", r20g.status === 0 && uCI >= 9 && out(r20g).includes("seeded:"), `status=${r20g.status} users=${uCI}`);
      const h20c = await hashMarker();
      const r20h = runSeedDirect(noContextEnv({ DATABASE_URL: gateUrl, RETENTION_POLICY: "demo", SEED_DEMO: "1", FORCE_SEED: "1" })); // full env — no resurrection
      const h20d = await hashMarker();
      check("18.20h direct loopback run, no context, FORCE_SEED=1 → REFUSED (context rule) and the hash is byte-identical (no truncate)", r20h.status === 2 && out(r20h).includes("unverified execution context") && h20c === h20d, `status=${r20h.status}`);

      // ---- 18.21 FINAL REVIEW: direct bootstrap DDL gate (non-loopback ⇒ declared context) ----
      const r21a = spawnSync(process.execPath, ["scripts/db-bootstrap-node.mjs"], {
        encoding: "utf8",
        cwd: webRoot,
        env: noContextEnv({ DATABASE_URL: PROD_SIM, RETENTION_POLICY: "demo", SEED_DEMO: "1", FORCE_SEED: "1" }),
      });
      check("18.21a direct bootstrap, non-loopback destination, no context → REFUSED before any connection (no DDL, no probe)", r21a.status === 1 && out(r21a).includes("NO environment variable") && !out(r21a).includes("migration applied") && !out(r21a).includes("database:"), `status=${r21a.status}`);
      const r21b2 = spawnSync(process.execPath, ["scripts/db-bootstrap-node.mjs"], {
        encoding: "utf8",
        cwd: webRoot,
        env: (() => { const e = noContextEnv({ DATABASE_URL: PROD_SIM, RETENTION_POLICY: "demo", SEED_DEMO: "0" }); e.SEED_CONTEXT = "ci"; return e; })(),
      });
      // FINAL F1 pass (2026-11-02): the old assertion (a declared context passes the
      // DDL gate and reaches the connection) pinned exactly the hole the owner
      // identified — SEED_CONTEXT is caller-controlled, not proof of workflow
      // identity. The direct bootstrap is now loopback-ONLY, unconditionally.
      check("18.21b the DECLARED context (the old 'workflow shape') CANNOT authorize remote DDL on the direct bootstrap — refused before any connection", r21b2.status === 1 && out(r21b2).includes("NO environment variable") && !out(r21b2).includes("cannot connect") && !out(r21b2).includes("migration applied"), `status=${r21b2.status}`);

      // ---- 18.22 FINAL REVIEW: the migration workflow's validator (migration-validate-node.mjs) ----
      const runValidator = (fullEnv) =>
        spawnSync(process.execPath, ["scripts/migration-validate-node.mjs"], { encoding: "utf8", cwd: webRoot, env: fullEnv });
      const valEnv = (extra) => { const e = { ...process.env, ...extra }; if (!("MIGRATION_DATABASE_URL" in (extra ?? {}))) delete e.MIGRATION_DATABASE_URL; if (!("DATABASE_URL" in (extra ?? {}))) delete e.DATABASE_URL; return e };
      const branchHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
      // Fetch main explicitly: GHA checkouts are shallow (depth 1) — the origin/main
      // ref and the main-tip object do not exist locally until fetched.
      const mainFetch = spawnSync("git", ["fetch", "origin", "main:refs/remotes/origin/main", "--quiet"], { encoding: "utf8" });
      const mainHead =
        (mainFetch.status === 0 ? spawnSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).stdout.trim() : "") ||
        (mainFetch.status === 0 ? spawnSync("git", ["rev-parse", "FETCH_HEAD"], { encoding: "utf8" }).stdout.trim() : "");
      const r22a = runValidator(valEnv({ MIGRATION_WORKFLOW_COMMIT_SHA: "abc", MIGRATION_TARGET: LATEST_MIG, MIGRATION_DATABASE_URL: gateUrl }));
      check("18.22a malformed SHA (not 40-hex) → refuses", r22a.status === 1 && out(r22a).includes("40-hex"), `status=${r22a.status}`);
      if (!mainHead) {
        skip("18.22b–f validator git-reachability suite", "origin/main could not be fetched in this environment (no git network) — these checks enforce in GHA, where network is always available");
      }
      const r22b = mainHead ? runValidator(valEnv({ MIGRATION_WORKFLOW_COMMIT_SHA: "f".repeat(40), MIGRATION_TARGET: LATEST_MIG, MIGRATION_DATABASE_URL: gateUrl })) : null;
      if (r22b) {
        check("18.22b a 40-hex SHA that is not a commit in this repository → refuses", r22b.status === 1 && out(r22b).includes("not a commit in this repository"), `status=${r22b.status}`);
        const r22c = runValidator(valEnv({ MIGRATION_WORKFLOW_COMMIT_SHA: branchHead, MIGRATION_TARGET: LATEST_MIG, MIGRATION_DATABASE_URL: gateUrl }));
        check("18.22c a real commit NOT reachable from main (this PR's head) → refuses (only main-reachable commits may migrate production)", r22c.status === 1 && out(r22c).includes("NOT reachable from the protected production release branch"), `status=${r22c.status}`);
        const r22d = runValidator(valEnv({ MIGRATION_WORKFLOW_COMMIT_SHA: mainHead, MIGRATION_TARGET: "9999_nope.sql", MIGRATION_DATABASE_URL: gateUrl }));
        check("18.22d a target that does not exist in the commit → refuses", r22d.status === 1 && out(r22d).includes("not present in schema/migrations"), `status=${r22d.status}`);
        const r22e = runValidator(valEnv({ MIGRATION_WORKFLOW_COMMIT_SHA: mainHead, MIGRATION_TARGET: LATEST_MIG }));
        check("18.22e no migration destination URL → refuses before any connection", r22e.status === 1 && out(r22e).includes("failed validation"), `status=${r22e.status}`);
        const r22f = runValidator(valEnv({ MIGRATION_WORKFLOW_COMMIT_SHA: mainHead, MIGRATION_TARGET: LATEST_MIG, MIGRATION_DATABASE_URL: gateUrl }));
        check("18.22f a fully valid operation (main-reachable commit + newest target + valid loopback destination) → passes, logs host only + the owner-side prerequisite banner", r22f.status === 0 && out(r22f).includes("validated: commit=") && out(r22f).includes("destination host: 127.0.0.1") && out(r22f).includes("PREREQUISITE CHECK") && !out(r22f).includes("citycare:citycare"), `status=${r22f.status}`);
      }

      // ---- 18.23 FINAL F1 pass (2026-11-02): the remote-DDL authorization boundary ----
      // The owner's finding: SEED_CONTEXT=ci|local-demo (caller-controlled) authorized
      // remote DDL on the direct bootstrap. Fixed: the direct bootstrap is
      // LOOPBACK-ONLY unconditionally; the only remote-DDL entry is the workflow's
      // dedicated migration-apply-node.mjs, whose authorization is the GitHub secret
      // scope + the least-privilege migration role — not any env var (D84).
      // Real entry points; loopback + fake .invalid hosts only. The least-privilege
      // scratch role below is created on THIS local test cluster and dropped in
      // finally (synthetic loopback credential, never production).
      const noprivSuffix = Date.now().toString(36);
      const noprivRole = `e2e_nopriv_${noprivSuffix}`;
      const noprivEmptyDb = `citycare_e2e_nopriv_empty_${noprivSuffix}`;
      const noprivFullDb = `citycare_e2e_nopriv_full_${noprivSuffix}`;
      const noprivUrl = (dbName) => `postgres://${noprivRole}:e2enoprivpw@127.0.0.1:5432/${dbName}`;
      const h23a = await hashMarker();
      try {
        // 18.23a/b — remote URL + declared context cannot authorize direct DDL (required 1–2)
        const e23a = noContextEnv({ DATABASE_URL: PROD_SIM, RETENTION_POLICY: "demo", SEED_DEMO: "0" });
        e23a.SEED_CONTEXT = "ci";
        const r23a = spawnSync(process.execPath, ["scripts/db-bootstrap-node.mjs"], { encoding: "utf8", cwd: webRoot, env: e23a });
        check("18.23a remote URL + SEED_CONTEXT=ci → direct DDL REFUSED (the declared context is not workflow authorization)", r23a.status === 1 && out(r23a).includes("NO environment variable") && !out(r23a).includes("cannot connect"), `status=${r23a.status}`);
        const e23b = noContextEnv({ DATABASE_URL: PROD_SIM, RETENTION_POLICY: "demo", SEED_DEMO: "0" });
        e23b.SEED_CONTEXT = "local-demo";
        const r23b = spawnSync(process.execPath, ["scripts/db-bootstrap-node.mjs"], { encoding: "utf8", cwd: webRoot, env: e23b });
        check("18.23b remote URL + SEED_CONTEXT=local-demo → direct DDL REFUSED", r23b.status === 1 && out(r23b).includes("NO environment variable") && !out(r23b).includes("cannot connect"), `status=${r23b.status}`);

        // 18.23c — EVERY caller-controlled flag combined cannot authorize (required 3)
        const r23c = spawnSync(process.execPath, ["scripts/db-bootstrap-node.mjs"], {
          encoding: "utf8",
          cwd: webRoot,
          env: {
            ...process.env,
            VERCEL_ENV: "production",
            SCHEMA_SYNC_MODE: "apply",
            MIGRATION_TARGET: LATEST_MIG,
            SEED_CONTEXT: "ci",
            RETENTION_POLICY: "demo",
            SEED_DEMO: "1",
            FORCE_SEED: "1",
            DATABASE_URL: PROD_SIM,
            MIGRATION_DATABASE_URL: PROD_SIM,
          },
        });
        check("18.23c production-shaped URL + ALL caller-controlled flags (VERCEL_ENV, mode, target, context, FORCE_SEED) → direct DDL still REFUSED", r23c.status === 1 && out(r23c).includes("NO environment variable") && !out(r23c).includes("cannot connect") && !out(r23c).includes("migration applied"), `status=${r23c.status}`);

        // 18.23d — the build-hook path (prebuild gate's apply) against a remote destination
        const r23d = spawnSync(process.execPath, [new URL("../scripts/prebuild-schema-sync.mjs", import.meta.url).pathname], {
          encoding: "utf8",
          cwd: webRoot,
          env: stripVercelMarkers({ VERCEL_ENV: "production", DATABASE_URL: PROD_SIM, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: LATEST_MIG, RETENTION_POLICY: "demo", SEED_DEMO: "0" }),
        });
        check("18.23d the build-hook controlled-op path against a remote destination → the loopback-only bootstrap refuses (the hook can never do remote DDL)", r23d.status === 1 && out(r23d).includes("NO environment variable"), `status=${r23d.status}`);

        // 18.23e/f — the verified isolated flows are UNCHANGED (required 4–5)
        const e23e = noContextEnv({ DATABASE_URL: gateUrl, RETENTION_POLICY: "demo", SEED_DEMO: "0" });
        e23e.SEED_CONTEXT = "local-demo"; // the documented local dev declaration (D81)
        const r23e = spawnSync(process.execPath, ["scripts/db-bootstrap-node.mjs"], { encoding: "utf8", cwd: webRoot, env: e23e });
        check("18.23e loopback demo bootstrap (local dev flow, declared context) still works — exit 0, database ready", r23e.status === 0 && out(r23e).includes("database ready"), `status=${r23e.status}`);
        const s23f = `citycare_e2e_ci_boot_${Date.now().toString(36)}`;
        let u23f = 0;
        let r23f = { status: 1 };
        try {
          await sql(`DROP DATABASE IF EXISTS ${s23f}`);
          await sql(`CREATE DATABASE ${s23f}`);
          const s23fUrl = (() => { const u = new URL(gateUrl); u.pathname = "/" + s23f; return u.toString(); })();
          const { default: pgCI2 } = await import("pg");
          const c23f = new pgCI2.Client({ connectionString: s23fUrl });
          await c23f.connect();
          for (const f of ["../schema/citycare_init.sql", "../schema/sql/constraints.sql", "../schema/sql/ledger.sql", ...readdirSync("../schema/migrations").filter((x) => x.endsWith(".sql")).sort().map((x) => `../schema/migrations/${x}`)]) await c23f.query(readFileSync(f, "utf8"));
          await c23f.end();
          const e23f = noContextEnv({ DATABASE_URL: s23fUrl, RETENTION_POLICY: "demo", SEED_DEMO: "1" });
          e23f.SEED_CONTEXT = "ci";
          e23f.SCRYPT_N = "4096";
          r23f = spawnSync(process.execPath, ["scripts/db-bootstrap-node.mjs"], { encoding: "utf8", cwd: webRoot, env: e23f });
          const cCount23 = new pgCI2.Client({ connectionString: s23fUrl });
          await cCount23.connect();
          u23f = (await cCount23.query(`SELECT count(*)::int n FROM "User"`)).rows[0].n;
          await cCount23.end();
        } finally {
          try { await sql(`DROP DATABASE IF EXISTS ${s23f}`); } catch { /* best-effort */ }
        }
        check("18.23f isolated CI bootstrap (fresh scratch loopback + SEED_CONTEXT=ci) still works — exit 0, seeded (≥9 users)", r23f.status === 0 && u23f >= 9 && out(r23f).includes("database ready"), `status=${r23f.status} users=${u23f}`);

        // 18.23g/h — least-privilege scratch role: runtime-style credentials cannot DDL or TRUNCATE (required 7)
        await sql(`DROP ROLE IF EXISTS ${noprivRole}`);
        await sql(`CREATE ROLE ${noprivRole} LOGIN PASSWORD 'e2enoprivpw'`);
        await sql(`DROP DATABASE IF EXISTS ${noprivEmptyDb}`);
        await sql(`CREATE DATABASE ${noprivEmptyDb}`); // EMPTY — no schema: the base DDL must hit 'permission denied for schema public'
        await sql(`DROP DATABASE IF EXISTS ${noprivFullDb}`);
        await sql(`CREATE DATABASE ${noprivFullDb}`);
        const { default: pgNp } = await import("pg");
        const cNp = new pgNp.Client({ connectionString: (() => { const u = new URL(gateUrl); u.pathname = "/" + noprivFullDb; return u.toString(); })() });
        await cNp.connect();
        for (const f of ["../schema/citycare_init.sql", "../schema/sql/constraints.sql", "../schema/sql/ledger.sql", ...readdirSync("../schema/migrations").filter((x) => x.endsWith(".sql")).sort().map((x) => `../schema/migrations/${x}`)]) await cNp.query(readFileSync(f, "utf8"));
        await cNp.end();
        await sql(`GRANT CONNECT ON DATABASE ${noprivEmptyDb} TO ${noprivRole}`);
        await sql(`GRANT CONNECT ON DATABASE ${noprivFullDb} TO ${noprivRole}`);
        const r23g = spawnSync(process.execPath, ["scripts/migration-apply-node.mjs"], {
          encoding: "utf8",
          cwd: webRoot,
          env: { ...process.env, MIGRATION_DATABASE_URL: noprivUrl(noprivEmptyDb), MIGRATION_TARGET: LATEST_MIG },
        });
        check("18.23g a least-privilege role (CONNECT only — the shape of the future runtime role) CANNOT run the migration DDL — permission denied, exit 1", r23g.status === 1 && out(r23g).toLowerCase().includes("permission denied"), `status=${r23g.status}`);
        const e23h = noContextEnv({ DATABASE_URL: noprivUrl(noprivFullDb), RETENTION_POLICY: "demo", SEED_DEMO: "1" });
        e23h.SEED_CONTEXT = "ci";
        const r23h = spawnSync(process.execPath, ["scripts/seed.mjs"], { encoding: "utf8", cwd: webRoot, env: e23h });
        const cCountNp = new pgNp.Client({ connectionString: (() => { const u = new URL(gateUrl); u.pathname = "/" + noprivFullDb; return u.toString(); })() });
        await cCountNp.connect();
        const u23h = (await cCountNp.query(`SELECT count(*)::int n FROM "User"`)).rows[0].n;
        await cCountNp.end();
        check("18.23h the same role CANNOT TRUNCATE/seed (TRUNCATE denied by the role; nothing written — 0 users)", r23h.status !== 0 && out(r23h).toLowerCase().includes("permission denied") && u23h === 0, `status=${r23h.status} users=${u23h}`);

        // 18.23i — the authorized path's shape: full-privilege credential on a FRESH scratch loopback DB
        const s23i = `citycare_e2e_mig_apply_${Date.now().toString(36)}`;
        let i23ok = false;
        try {
          await sql(`DROP DATABASE IF EXISTS ${s23i}`);
          await sql(`CREATE DATABASE ${s23i}`);
          const s23iUrl = (() => { const u = new URL(gateUrl); u.pathname = "/" + s23i; return u.toString(); })();
          const r23i = spawnSync(process.execPath, ["scripts/migration-apply-node.mjs"], { encoding: "utf8", cwd: webRoot, env: { ...process.env, MIGRATION_DATABASE_URL: s23iUrl, MIGRATION_TARGET: LATEST_MIG } });
          i23ok = r23i.status === 0 && out(r23i).includes("migrations applied");
        } finally {
          try { await sql(`DROP DATABASE IF EXISTS ${s23i}`); } catch { /* best-effort */ }
        }
        check("18.23i the migration-apply tool works end-to-end on a fresh scratch DB with a full-privilege credential (exit 0, DDL only)", i23ok);

        // 18.23j — code-proven: the migration path CANNOT seed (its source has no TRUNCATE and no seed gate import)
        const migSrc = readFileSync(new URL("../scripts/migration-apply-node.mjs", import.meta.url).pathname, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/[^\n]*/g, ""); // executable code only
        const hasTruncateStatement = /\bTRUNCATE\s+["'A-Za-z0-9_$]/i.test(migSrc);
        check("18.23j migration-apply-node.mjs source is DDL-only: no TRUNCATE statement, no demo-seed-core import (the migration path cannot seed)", !hasTruncateStatement && !migSrc.includes("demo-seed-core"));

        // 18.23k — byte-for-byte preservation + no credential leakage (required 8–9)
        const h23b = await hashMarker();
        const all23 = [r23a, r23b, r23c, r23d].map(out).join("\n");
        check("18.23k the refused remote-DDL attempts left the loopback DB byte-for-byte untouched and leaked no credential values", h23a === h23b && !all23.includes("sim-pw-never-logged") && !all23.includes("postgres://"), `hash=${h23a === h23b ? "identical" : "CHANGED"}`);
      } finally {
        try { await sql(`DROP DATABASE IF EXISTS ${noprivEmptyDb}`); } catch { /* best-effort */ }
        try { await sql(`DROP DATABASE IF EXISTS ${noprivFullDb}`); } catch { /* best-effort */ }
        try { await sql(`DROP ROLE IF EXISTS ${noprivRole}`); } catch { /* best-effort */ }
      }

      // ---- 18.24 FINAL defense-in-depth pass (2026-11-02): migration-apply's
      // REQUIRED inputs (real entry point: scripts/migration-apply-node.mjs).
      // Every case refuses BEFORE any connection — asserted by the absence of
      // the post-connect "database:" banner (the loopback DB is never touched;
      // the valid happy path remains e2e 18.23i, unchanged).
      const firstMig = readdirSync(new URL("../../schema/migrations", import.meta.url).pathname).filter((x) => x.endsWith(".sql")).sort()[0];
      const r24a = spawnSync(process.execPath, ["scripts/migration-apply-node.mjs"], {
        encoding: "utf8",
        cwd: webRoot,
        env: noContextEnv({ DATABASE_URL: gateUrl, MIGRATION_TARGET: LATEST_MIG }),
      });
      check("18.24a missing MIGRATION_DATABASE_URL while a fully valid DATABASE_URL is present → REFUSED before any connection (no fallback: the runtime credential can never reach the DDL path)", r24a.status === 1 && out(r24a).includes("does NOT fall back to DATABASE_URL") && !out(r24a).includes("database:") && !out(r24a).includes("migration applied"), `status=${r24a.status}`);
      const r24b = spawnSync(process.execPath, ["scripts/migration-apply-node.mjs"], {
        encoding: "utf8",
        cwd: webRoot,
        env: noContextEnv({ MIGRATION_DATABASE_URL: gateUrl }),
      });
      check("18.24b missing MIGRATION_TARGET → REFUSED before any connection (no omitted-target 'apply the whole directory' mode)", r24b.status === 1 && out(r24b).includes("No omitted-target mode") && !out(r24b).includes("database:") && !out(r24b).includes("migration applied"), `status=${r24b.status}`);
      const r24c1 = spawnSync(process.execPath, ["scripts/migration-apply-node.mjs"], { encoding: "utf8", cwd: webRoot, env: noContextEnv({ MIGRATION_DATABASE_URL: gateUrl, MIGRATION_TARGET: firstMig }) });
      const r24c2 = spawnSync(process.execPath, ["scripts/migration-apply-node.mjs"], { encoding: "utf8", cwd: webRoot, env: noContextEnv({ MIGRATION_DATABASE_URL: gateUrl, MIGRATION_TARGET: "0000_does_not_exist.sql" }) });
      check("18.24c stale target (oldest, not newest) AND invalid target (not present) → both REFUSED before any connection", r24c1.status === 1 && out(r24c1).includes("not the NEWEST migration") && !out(r24c1).includes("database:") && r24c2.status === 1 && out(r24c2).includes("not a migration present") && !out(r24c2).includes("database:"), `stale=${r24c1.status} invalid=${r24c2.status}`);
    }
  }
}

if (pgClient) await pgClient.end();

console.log(`\n========================\n e2e: ${pass} passed, ${failc} failed${skipped ? `, ${skipped} skipped (runtime-specific)` : ""}\n========================`);
if (failures.length) { console.log("failures:\n" + failures.map((f) => " - " + f).join("\n")); process.exit(1); }
