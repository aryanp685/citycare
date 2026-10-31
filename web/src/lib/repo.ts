import { all, one } from "./db";
import { liveConsent, type ConsentVerdict } from "./consent";
import { freeSlotsForDay, istDateRangeTodayPlusN, type SlotRule } from "./slots";

async function slotRulesAndBooked(doctorId: string, dateISO: string) {
  const rules = await all<SlotRule>(
    `SELECT id, "dayOfWeek", "startTime", "endTime", "slotMinutes", "maxPerSlot", "isActive"
       FROM "AvailabilitySlot" WHERE "doctorId" = $1 AND "isActive"`,
    [doctorId],
  );
  const d = new Date(dateISO + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return { rules: [], bookedMs: [] as number[] };
  const dayStartUtcMs = d.getTime() - 12 * 60 * 60_000; // covers the ±12h of tz shifts around the day
  const dayEndUtcMs = dayStartUtcMs + 48 * 60 * 60_000;
  const booked = await all<{ scheduledAt: Date }>(
    `SELECT "scheduledAt" FROM "Appointment"
      WHERE "doctorId"=$1 AND "scheduledAt" >= $2 AND "scheduledAt" < $3
        AND status IN ('PENDING','CONFIRMED','CHECKED_IN','RESCHEDULED')`,
    [doctorId, new Date(dayStartUtcMs), new Date(dayEndUtcMs)],
  );
  return { rules, bookedMs: booked.map((b) => b.scheduledAt.getTime()) }; // duplicates intentional: one per seat (D6)
}

/** Free instants for ONE specific IST date (used to re-validate a booking). */
export async function freeSlotsOneDay(doctorId: string, dateISO: string, nowMs = Date.now()) {
  const { rules, bookedMs } = await slotRulesAndBooked(doctorId, dateISO);
  return freeSlotsForDay(rules, dateISO, bookedMs, nowMs);
}
import type { RuleRecord } from "./rules";

/** All SQL that both pages (RSC) and API routes need, in one honest place. */

const IST = "Asia/Kolkata";

export function fmtIstDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric" }).format(dt);
}
export function fmtIstDateTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return (
    new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(dt) + " IST"
  );
}

export function ageFrom(dob: Date | string | null): number | null {
  if (!dob) return null;
  const d = typeof dob === "string" ? new Date(dob) : dob;
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) a -= 1;
  return a >= 0 && a < 130 ? a : null; // sanity clamp: absurd DOB typo -> treat as unknown
}

// ---------------- doctors ----------------

export type DoctorCard = {
  id: string;
  fullName: string;
  qualification: string;
  experienceYrs: number;
  consultationFee: string | number; // pg numeric arrives as string
  rating: number | null;
  isVerified: boolean;
  hospital: string | null;
  city: string | null;
  specialties: string[];
  languages: string[];
};

export async function searchDoctors(q: string): Promise<DoctorCard[]> {
  const like = `%${q.trim().toLowerCase()}%`;
  return all<DoctorCard>(
    `SELECT d.id, d."fullName", d.qualification, d."experienceYrs", d."consultationFee",
            d.rating, d."isVerified", h.name AS hospital, h.city,
            COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE s.id IS NOT NULL), '{}') AS specialties,
            d.languages
       FROM "Doctor" d
       LEFT JOIN "Hospital" h ON h.id = d."hospitalId"
       LEFT JOIN "DoctorSpecialty" ds ON ds."doctorId" = d.id
       LEFT JOIN "Specialty" s ON s.id = ds."specialtyId"
      WHERE d."isVerified"  -- F1: unverified registrations are invisible to patients
        AND (lower(d."fullName") LIKE $1 OR lower(COALESCE(s.name,'')) LIKE $1 OR lower(COALESCE(h.name,'')) LIKE $1)
      GROUP BY d.id, h.name, h.city
      ORDER BY d."isVerified" DESC, d.rating DESC NULLS LAST, d."fullName"
      LIMIT 40`,
    [like],
  );
}

export async function doctorById(id: string) {
  return one<DoctorCard & { bio: string | null; photoUrl: string | null; registrationNo: string | null }>(
    `SELECT d.id, d."fullName", d.qualification, d."experienceYrs", d."consultationFee",
            d.rating, d."isVerified", d.bio, d."photoUrl", d."registrationNo", d.languages,
            h.name AS hospital, h.city
       FROM "Doctor" d
       LEFT JOIN "Hospital" h ON h.id = d."hospitalId"
      WHERE d.id = $1`,
    [id],
  );
}

export type DaySlots = { date: string; slots: { iso: string; wall: string; left: number }[] };

export async function freeSlotGrid(doctorId: string, days = 14, nowMs = Date.now()): Promise<DaySlots[]> {
  const dates = istDateRangeTodayPlusN(nowMs, days);
  return Promise.all(
    dates.map(async (date) => {
      const free = await freeSlotsOneDay(doctorId, date, nowMs);
      return {
        date,
        slots: free.map((f) => ({
          iso: new Date(f.utcMs).toISOString(),
          wall: `${String(Math.floor(f.wallMinutes / 60)).padStart(2, "0")}:${String(f.wallMinutes % 60).padStart(2, "0")}`,
          left: f.left,
        })),
      };
    }),
  );
}

// ---------------- patient record ----------------

export type PatientTails = {
  patient: {
    id: string;
    fullName: string;
    dateOfBirth: Date | null;
    gender: string;
    bloodGroup: string;
    city: string;
    abhaId: string | null;
    shareDefaultExpiryDays: number;
    autoRevokeAfterVisit: boolean;
  } | null;
};

export async function patientById(id: string) {
  return one(
    `SELECT id, "fullName", "dateOfBirth", gender, "bloodGroup", city, "abhaId",
            "shareDefaultExpiryDays", "autoRevokeAfterVisit"
       FROM "Patient" WHERE id = $1`,
    [id],
  );
}

export async function patientByUserId(userId: string) {
  return one(
    `SELECT id, "fullName", "dateOfBirth", gender, "bloodGroup", city, "abhaId",
            "shareDefaultExpiryDays", "autoRevokeAfterVisit"
       FROM "Patient" WHERE "userId" = $1`,
    [userId],
  );
}

export type RecordSections = {
  allergies: { id: string; allergen: string; severity: string; reaction: string | null }[];
  conditions: { id: string; name: string; status: string; icd10: string | null }[];
  medications: { id: string; name: string; dosage: string | null; frequency: string | null; notes: string | null }[];
  encounters: { id: string; encounterDate: Date; type: string; chiefComplaint: string | null; diagnosisText: string | null; diagnosisCode: string | null; advice: string | null; followUpOn: Date | null; doctor: string | null }[];
  labs: { id: string; testName: string; value: string; unit: string | null; refRangeLow: string | null; refRangeHigh: string | null; takenOn: Date | null; documentId: string; encounterId: string | null }[];
  prescriptions: { id: string; encounterId: string | null; issuedOn: Date; items: unknown; notes: string | null; doctor: string | null }[];
  documents: { id: string; title: string; type: string; source: string; issuedOn: Date | null; ocrStatus: string }[];
};

export async function recordSections(patientId: string): Promise<RecordSections> {
  const [allergies, conditions, medications, encounters, labs, prescriptions, documents] = await Promise.all([
    all(`SELECT id, allergen, severity, reaction FROM "Allergy" WHERE "patientId"=$1 AND "isActive" ORDER BY allergen`, [patientId]),
    all(`SELECT id, name, status, icd10 FROM "Condition" WHERE "patientId"=$1 AND status='ACTIVE' ORDER BY name`, [patientId]),
    all(`SELECT id, name, dosage, frequency, notes FROM "Medication" WHERE "patientId"=$1 AND "isActive" ORDER BY name`, [patientId]),
    all(
      `SELECT e.id, e."encounterDate", e.type, e."chiefComplaint", e."diagnosisText", e."diagnosisCode",
              e.advice, e."followUpOn", d."fullName" AS doctor
         FROM "Encounter" e LEFT JOIN "Doctor" d ON d.id = e."doctorId"
        WHERE e."patientId"=$1 ORDER BY e."encounterDate" DESC LIMIT 50`,
      [patientId],
    ),
    all(
      `SELECT l.id, l."testName", l.value, l.unit, l."refRangeLow", l."refRangeHigh", l."takenOn", l."documentId", doc."encounterId"
         FROM "LabResult" l JOIN "Document" doc ON doc.id = l."documentId"
        WHERE doc."patientId"=$1 AND NOT doc."isDeleted"
        ORDER BY l."takenOn" DESC NULLS LAST LIMIT 200`,
      [patientId],
    ),
    all(
      `SELECT p.id, p."issuedOn", p.items, p.notes, p."encounterId", d."fullName" AS doctor
         FROM "Prescription" p
         JOIN "Encounter" e ON e.id = p."encounterId"
         LEFT JOIN "Doctor" d ON d.id = p."doctorId"
        WHERE e."patientId"=$1 ORDER BY p."issuedOn" DESC LIMIT 50`,
      [patientId],
    ),
    all(
      `SELECT id, title, type, source, "issuedOn", "ocrStatus" FROM "Document"
        WHERE "patientId"=$1 AND NOT "isDeleted" ORDER BY "createdAt" DESC LIMIT 50`,
      [patientId],
    ),
  ]);
  return { allergies, conditions, medications, encounters, labs, prescriptions, documents } as RecordSections;
}

/** Sections filtered by consent scope — the view a DOCTOR receives. */
export async function scopedRecord(patientId: string, verdict: ConsentVerdict): Promise<{ sections: RecordSections; scopeNote: string }> {
  const rec = await recordSections(patientId);
  return applyScope(rec, verdict);
}

/**
 * D19: the scope filter as a PURE function (no DB) so the unit test can prove each scope hides
 * exactly what it must. Safety facts (allergies, conditions, medicines) survive SUMMARY_ONLY on
 * purpose — hiding an allergy kills people.
 */
export function applyScope(rec: RecordSections, verdict: ConsentVerdict): { sections: RecordSections; scopeNote: string } {
  if (!verdict.allowed) return { sections: { ...emptySections() }, scopeNote: "" }; // callers gate on allowed first
  const c = verdict.consent;
  switch (c.scope) {
    case "FULL_RECORD":
      return { sections: rec, scopeNote: "Full record" };
    case "SUMMARY_ONLY": {
      return {
        sections: { ...emptySections(), allergies: rec.allergies, conditions: rec.conditions, medications: rec.medications },
        scopeNote: `Summary only (${c.scope}) — encounters, labs, prescriptions and documents hidden`,
      };
    }
    case "LAST_N_ENCOUNTERS": {
      const n = c.lastNEncounters ?? 3;
      const enc = rec.encounters.slice(0, n);
      const encIds = new Set(enc.map((e) => e.id));
      return {
        sections: {
          ...rec,
          encounters: enc,
          // prescriptions/lab documents belong to encounters OUTSIDE the window — hide those rows.
          prescriptions: rec.prescriptions.filter((p) => p.encounterId === null || encIds.has(p.encounterId)),
          labs: rec.labs.filter((l) => l.encounterId === null || encIds.has(l.encounterId)),
          documents: [], // no file storage in this build; see DRAWBACKS
        },
        scopeNote: `Last ${n} encounter(s) only`,
      };
    }
    case "SPECIFIC_CONDITION": {
      const name = (c.conditionName ?? "").toLowerCase();
      const enc = rec.encounters.filter(
        (e) =>
          (e.diagnosisText ?? "").toLowerCase().includes(name) ||
          (e.chiefComplaint ?? "").toLowerCase().includes(name),
      );
      const encIds = new Set(enc.map((e) => e.id));
      return {
        sections: {
          ...rec,
          encounters: enc,
          // A56-follow-up: labs/prescriptions from unrelated encounters were leaking through this scope.
          prescriptions: rec.prescriptions.filter((p) => p.encounterId !== null && encIds.has(p.encounterId)),
          labs: rec.labs.filter((l) => l.encounterId !== null && encIds.has(l.encounterId)),
          documents: [],
        },
        scopeNote: `Only encounters mentioning “${c.conditionName}”`,
      };
    }
    default:
      return { sections: { ...emptySections() }, scopeNote: "Unknown scope — nothing shared" };
  }
}

function emptySections(): RecordSections {
  return { allergies: [], conditions: [], medications: [], encounters: [], labs: [], prescriptions: [], documents: [] };
}

/** The exact shape rules.ts consumes — built from LIVE rows, not flags. */
export function toRuleRecord(rec: RecordSections, extraMeds: { name: string; genericName?: string | null }[] = []): RuleRecord {
  return {
    allergies: rec.allergies.map((a) => ({ allergen: a.allergen, isActive: true, severity: a.severity })),
    medications: [
      ...rec.medications.filter((m) => !(m.notes ?? "").startsWith("DRAFT:")).map((m) => ({ name: m.name, genericName: null })),
      ...extraMeds,
    ],
    labs: rec.labs.map((l) => ({
      testName: l.testName,
      value: l.value,
      unit: l.unit,
      refRangeLow: l.refRangeLow,
      refRangeHigh: l.refRangeHigh,
      takenOn: l.takenOn ? l.takenOn.toISOString() : null,
    })),
    encounters: rec.encounters.map((e) => ({
      followUpOn: e.followUpOn ? e.followUpOn.toISOString() : null,
      diagnosisText: e.diagnosisText,
    })),
  };
}

// ---------------- appointments / consents ----------------

export async function liveConsentFor(patientId: string, doctorId: string) {
  return liveConsent(patientId, doctorId);
}
