// End-to-end trust test over HTTP. Requires the dev server on :3000 and a seeded DB.
// Run:  node scripts/e2e.mjs
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
import { readFileSync } from "node:fs";
// Local convenience: pick CRON_SECRET / DATABASE_URL up from .env.local so the cron and the
// psql-backed checks run without exporting anything. Against a remote BASE only CRON_SECRET is used.
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^(CRON_SECRET|DATABASE_URL)=(.*)$/);
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
  constructor(label) { this.label = label; this.cookie = ""; }
  async req(method, path, body, form = false) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": form ? "application/x-www-form-urlencoded" : "application/json" } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        origin: BASE, // same-origin so the CSRF guard passes
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
    const res = await fetch(BASE + path, { method: "POST", headers: { ...(this.cookie ? { cookie: this.cookie } : {}), origin: BASE }, body: formData, redirect: "manual" });
    let data = null; try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  }
  /** raw GET that keeps headers + bytes (for signed download links) */
  async raw(path, extraHeaders = {}) {
    const res = await fetch(BASE + path, { headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...extraHeaders }, redirect: "manual" });
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
if (pgClient) await pgClient.end();

console.log(`\n========================\n e2e: ${pass} passed, ${failc} failed${skipped ? `, ${skipped} skipped (runtime-specific)` : ""}\n========================`);
if (failures.length) { console.log("failures:\n" + failures.map((f) => " - " + f).join("\n")); process.exit(1); }
