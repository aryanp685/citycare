/**
 * Cold start + prescription-photo backfill.
 * TypeScript port of trust/citycare_trust/onboard.py — semantics must stay
 * identical; test_onboard.ts pins them against the python outputs.
 */

export const CRITICAL_FACTS = ["allergies", "chronic_conditions", "current_medications", "blood_group"] as const;

export type OnboardingStep = {
  key: string;
  question: string;
  field: string;
  inputType: "chips" | "text" | "select";
  optional: boolean;
  seconds: number;
};

export const PROFILE_STEPS: OnboardingStep[] = [
  { key: "s1", question: "Do you have any drug allergy? (penicillin, sulfa...)", field: "allergies", inputType: "chips", optional: false, seconds: 25 },
  { key: "s2", question: "Any long-term condition? (sugar, BP, thyroid...)", field: "chronic_conditions", inputType: "chips", optional: false, seconds: 20 },
  { key: "s3", question: "Which medicines are you taking right now?", field: "current_medications", inputType: "text", optional: false, seconds: 30 },
  { key: "s4", question: "Do you know your blood group?", field: "blood_group", inputType: "select", optional: true, seconds: 10 },
];

export function profileTimeSeconds(): number {
  return PROFILE_STEPS.reduce((s, x) => s + x.seconds, 0); // 85
}

export type ProfileAnswers = {
  allergies: string[];
  chronic_conditions: string[];
  current_medications: string[];
  blood_group: string | null;
};

export function minimumViableProfile(a: ProfileAnswers) {
  const missing = CRITICAL_FACTS.filter((f) => {
    const v = (a as unknown as Record<string, unknown>)[f];
    return Array.isArray(v) ? v.length === 0 : !v;
  });
  return {
    allergies: a.allergies.map((x) => ({ allergen: x, isActive: true, reportedBy: "PATIENT" })),
    conditions: a.chronic_conditions.map((x) => ({ name: x, status: "ACTIVE", reportedBy: "PATIENT" })),
    medications: a.current_medications.map((x) => ({ name: x, isActive: true, reportedBy: "PATIENT" })),
    bloodGroup: a.blood_group ?? "UNKNOWN",
    completenessPct: Math.round((100 * (CRITICAL_FACTS.length - missing.length)) / CRITICAL_FACTS.length),
    missing,
  };
}

// ---------------- prescription photo -> draft rows ----------------

const DRUG_HINTS = ["mg", "mcg", "ml", "iu", "tab", "cap", "syp", "inj"];
const DOSE = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|ml|iu)\b/i;
const FREQUENCY = /\b(\d\s*[-–]\s*\d\s*[-–]\s*\d|od|bd|tds|hs|sos|1-0-1|0-0-1|1-1-1)\b/i;

export type ParsedMed = {
  name: string;
  dosage: string | null;
  frequency: string | null;
  isActive: true;
  reportedBy: "PATIENT";
  status: "DRAFT";
  sourceLine: string;
};

export function parsePrescriptionPhoto(ocrText: string): {
  medications: ParsedMed[];
  unparseableLines: string[];
  confidence: number;
} {
  const meds: ParsedMed[] = [];
  const junk: string[] = [];
  for (const raw of ocrText.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const low = line.toLowerCase();
    const hasSignal = DRUG_HINTS.some((h) => low.includes(h)) || DOSE.test(line);
    if (!hasSignal) {
      junk.push(line);
      continue;
    }
    const name = line.split(/\d/)[0].replace(/^[\s.\-–]+|[\s.\-–]+$/g, "");
    const dose = DOSE.exec(line);
    const freq = FREQUENCY.exec(line);
    if (name.length < 3) {
      junk.push(line);
      continue;
    }
    meds.push({
      name,
      dosage: dose ? dose[0] : null,
      frequency: freq ? freq[1].replace(/\s+/g, "") : null,
      isActive: true,
      reportedBy: "PATIENT",
      status: "DRAFT",
      sourceLine: line,
    });
  }
  const total = meds.length + junk.length;
  return {
    medications: meds,
    unparseableLines: junk,
    confidence: total ? Math.round((meds.length / total) * 100) / 100 : 0,
  };
}

export function backfillFromPhotos(ocrTexts: string[]) {
  const allMeds: ParsedMed[] = [];
  const allJunk: string[] = [];
  for (const t of ocrTexts) {
    const p = parsePrescriptionPhoto(t);
    allMeds.push(...p.medications);
    allJunk.push(...p.unparseableLines);
  }
  const seen = new Map<string, ParsedMed>();
  for (const m of allMeds) {
    const k = m.name.toLowerCase();
    if (!seen.has(k)) seen.set(k, m);
  }
  const total = allMeds.length + allJunk.length;
  return {
    draftMedications: [...seen.values()],
    uniqueDrugs: seen.size,
    unparseableLines: allJunk,
    parseConfidence: total ? Math.round((allMeds.length / total) * 100) / 100 : 0,
    requiresConfirmation: true,
    note: "Drafts are shown to the patient for one-tap confirmation. Nothing enters the record as ACTIVE without that step.",
  };
}

export function dayOneValue(hasRecords: boolean): string[] {
  const base = [
    "Book an appointment without a phone call or a queue",
    "See real fees, timings and ratings before travelling",
    "Get a reminder so you do not miss the slot",
    "Store the prescription you are handed today, so it is not lost",
  ];
  if (hasRecords) base.push("Doctor sees your history in 30 seconds instead of asking again");
  return base;
}
