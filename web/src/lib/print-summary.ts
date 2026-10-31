// F18 — the visit summary builder.
//
// Pure: takes the record (the same serializable shape the doctor record API returns —
// ISO strings, numeric values) plus patient meta, and returns the EXACT lines a printed
// summary shows. Both audiences feed it identically:
//   * patient  → their own full record
//   * doctor   → the consent-scoped record (applyScope already filtered) + the scope note
//
// Honesty rules, same as everywhere else in this codebase:
//  * DRAFT medications (unconfirmed OCR rows) are NEVER printed as current medicines —
//    they are listed as excluded, because a printout can end up in a stranger's hands;
//  * "latest value + direction" lines only exist for series with ≥2 readings (the trend
//    module's own contract); a single reading is printed as "one reading so far";
//  * nothing is invented: empty sections print "None recorded", never a filler.

export type PrintPatientMeta = {
  fullName: string;
  dateOfBirth: string | null; // ISO
  gender: string;
  bloodGroup: string;
  city: string;
  abhaId: string | null;
};

export type PrintSummaryInput = {
  patient: PrintPatientMeta;
  generatedAt: string; // ISO
  audience: "patient" | "doctor";
  /** Doctor side only — the consent scope the record was filtered under. */
  scopeNote?: string;
  allergies: { allergen: string; severity: string }[];
  conditions: { name: string; icd10: string | null }[];
  medications: { name: string; dosage: string | null; frequency: string | null; notes: string | null }[];
  /** Pre-computed by lib/trends (the page runs buildSeries) — one line per series. */
  observations: { name: string; unit: string | null; latest: number | null; direction: string; band: string | null; points: number }[];
  labs: { testName: string; value: string; unit: string | null; refRangeLow: string | null; refRangeHigh: string | null; takenOn: string | null }[];
  lastEncounter: { encounterDate: string; diagnosisText: string | null; doctor: string | null; advice: string | null; followUpOn: string | null } | null;
};

export type PrintSummary = {
  title: string;
  metaLine: string;
  identityLines: string[];
  allergyLines: string[];
  conditionLines: string[];
  medicationLines: string[];
  medicationNote: string | null;
  observationLines: string[];
  labLines: string[];
  encounterLines: string[];
  footerLines: string[];
};

const NONE = "None recorded.";

function fmtDate(iso: string | null): string {
  if (!iso) return "date unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "date unknown";
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

function ageFromIso(iso: string | null, asOfIso: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date(asOfIso);
  if (Number.isNaN(d.getTime()) || Number.isNaN(now.getTime())) return null;
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) a -= 1;
  return a >= 0 && a < 130 ? `${a} y` : null;
}

const BAND_TEXT: Record<string, string> = { below: "below target range", in: "in target range", above: "above target range" };

/** Build the exact printed lines. Deterministic: same input → same bytes. */
export function buildPrintSummary(input: PrintSummaryInput): PrintSummary {
  const { patient, generatedAt, audience } = input;

  const identityParts = [patient.fullName];
  const age = ageFromIso(patient.dateOfBirth, generatedAt);
  if (age) identityParts.push(age);
  if (patient.gender) identityParts.push(patient.gender);
  if (patient.bloodGroup) identityParts.push(`Blood ${patient.bloodGroup}`);
  if (patient.city) identityParts.push(patient.city);
  const identityLines = [identityParts.join(" · ")] as string[];
  if (patient.abhaId) identityLines.push(`ABHA ID: ${patient.abhaId}`);

  const allergyLines = input.allergies.length
    ? input.allergies.map((a) => `${a.allergen} — ${a.severity.toLowerCase()}`)
    : [NONE];

  const conditionLines = input.conditions.length
    ? input.conditions.map((c) => `${c.name}${c.icd10 ? ` (ICD-10 ${c.icd10})` : ""}`)
    : [NONE];

  const confirmed = input.medications.filter((m) => !(m.notes ?? "").startsWith("DRAFT:"));
  const drafts = input.medications.length - confirmed.length;
  const medicationLines = confirmed.length
    ? confirmed.map((m) => `${m.name}${m.dosage ? ` ${m.dosage}` : ""}${m.frequency ? ` · ${m.frequency}` : ""}`)
    : [NONE];
  const medicationNote = drafts > 0 ? `${drafts} unconfirmed draft(s) from old paperwork excluded` : null;

  const observationLines = input.observations.length
    ? input.observations.map((o) => {
        if (o.latest === null || o.points < 2) return `${o.name} — one reading so far${o.latest !== null ? ` (${o.latest}${o.unit ? ` ${o.unit}` : ""})` : ""}`;
        const band = o.band ? `, ${BAND_TEXT[o.band] ?? o.band}` : "";
        return `${o.name} — latest ${o.latest}${o.unit ? ` ${o.unit}` : ""} · ${o.direction}${band}`;
      })
    : [NONE];

  const labLines = input.labs.length
    ? input.labs.slice(0, 5).map((l) => {
        const ref = l.refRangeLow || l.refRangeHigh ? ` (ref ${l.refRangeLow ?? "-"}–${l.refRangeHigh ?? "-"})` : "";
        return `${l.testName} ${l.value}${l.unit ? ` ${l.unit}` : ""}${ref} · ${fmtDate(l.takenOn)}`;
      })
    : [NONE];

  const encounterLines = input.lastEncounter
    ? [
        `${fmtDate(input.lastEncounter.encounterDate)}${input.lastEncounter.doctor ? ` · ${input.lastEncounter.doctor}` : ""}`,
        input.lastEncounter.diagnosisText ?? "Consultation",
        ...(input.lastEncounter.advice ? [`Advice: ${input.lastEncounter.advice}`] : []),
        ...(input.lastEncounter.followUpOn ? [`Follow-up: ${fmtDate(input.lastEncounter.followUpOn)}`] : []),
      ]
    : [NONE];

  const metaLine =
    audience === "doctor"
      ? `Generated ${new Date(generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST · shared under consent: ${input.scopeNote ?? "no scope note"}`
      : `Generated ${new Date(generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST · from your own CityCare record`;

  const footerLines = [
    "This summary is a data snapshot of the record as of the timestamp above — it is not a diagnosis and not a substitute for consulting a doctor.",
    audience === "patient" ? "You can share it with any doctor. Your CityCare record keeps the full history." : "Self-reported readings are marked as such in the record and shown here as reported.",
    "CityCare — consent-first personal health record · citycare (demo build)",
  ];

  return {
    title: "CityCare — visit summary",
    metaLine,
    identityLines,
    allergyLines,
    conditionLines,
    medicationLines,
    medicationNote,
    observationLines,
    labLines,
    encounterLines,
    footerLines,
  };
}
