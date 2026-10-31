import type { RecordSections } from "./repo";

/**
 * F4 — FHIR R4 export (the interoperability format ABDM mandates). Pure mapping, no I/O, unit-tested.
 * Resources: Patient, AllergyIntolerance, Condition, MedicationStatement, Encounter, Observation (labs),
 * bundled as a `document`-style collection so any FHIR validator / HAPI server can ingest it.
 * Drafts (unconfirmed medicines) are deliberately excluded — they are not part of the record yet.
 */
type PatientRow = { id: string; fullName: string; dateOfBirth: Date | null; gender: string | null; bloodGroup: string | null; city: string | null; abhaId: string | null };

const GENDER: Record<string, string> = { MALE: "male", FEMALE: "female", OTHER: "other", UNDISCLOSED: "unknown" };
const SEVERITY: Record<string, string> = { CRITICAL: "severe", WARNING: "moderate", INFO: "mild" };
const ENC_CLASS: Record<string, { code: string; display: string }> = {
  OUTPATIENT: { code: "AMB", display: "ambulatory" }, INPATIENT: { code: "IMP", display: "inpatient encounter" },
  EMERGENCY: { code: "EMER", display: "emergency" }, TELECONSULT: { code: "VR", display: "virtual" },
};

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : undefined);
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);
const num = (s: string | null | undefined) => (s != null && s !== "" && !Number.isNaN(Number(s)) ? Number(s) : undefined);

export function toFhirBundle(p: PatientRow, s: RecordSections, generatedAt = new Date()) {
  const pref = `Patient/${p.id}`;
  const entries: { fullUrl: string; resource: Record<string, unknown> }[] = [];
  const add = (type: string, id: string, resource: Record<string, unknown>) =>
    entries.push({ fullUrl: `urn:citycare:${type}/${id}`, resource: { resourceType: type, id, ...resource } });

  add("Patient", p.id, {
    identifier: p.abhaId ? [{ system: "https://healthid.ndhm.gov.in", value: p.abhaId }] : undefined,
    name: [{ text: p.fullName }],
    gender: GENDER[p.gender ?? ""] ?? "unknown",
    birthDate: day(p.dateOfBirth),
    address: p.city ? [{ city: p.city, country: "IN" }] : undefined,
    extension: p.bloodGroup && p.bloodGroup !== "UNKNOWN" ? [{ url: "urn:citycare:bloodGroup", valueString: p.bloodGroup.replace("_POSITIVE", "+").replace("_NEGATIVE", "-") }] : undefined,
  });

  for (const a of s.allergies) {
    add("AllergyIntolerance", a.id, {
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active" }] },
      category: ["medication"], criticality: a.severity === "CRITICAL" ? "high" : "low",
      code: { text: a.allergen }, patient: { reference: pref },
      reaction: a.reaction ? [{ description: a.reaction, severity: SEVERITY[a.severity] ?? "mild" }] : undefined,
    });
  }
  for (const c of s.conditions) {
    add("Condition", c.id, {
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: c.status === "RESOLVED" ? "resolved" : "active" }] },
      code: { text: c.name, coding: c.icd10 ? [{ system: "http://hl7.org/fhir/sid/icd-10", code: c.icd10 }] : undefined },
      subject: { reference: pref },
    });
  }
  for (const m of s.medications.filter((x) => !(x.notes ?? "").startsWith("DRAFT:"))) {
    add("MedicationStatement", m.id, {
      status: "active", subject: { reference: pref },
      medicationCodeableConcept: { text: m.name },
      dosage: m.dosage || m.frequency ? [{ text: [m.dosage, m.frequency].filter(Boolean).join(" · ") }] : undefined,
      note: m.notes ? [{ text: m.notes }] : undefined,
    });
  }
  for (const e of s.encounters) {
    const cls = ENC_CLASS[e.type] ?? { code: "AMB", display: "ambulatory" };
    add("Encounter", e.id, {
      status: "finished",
      class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", ...cls },
      subject: { reference: pref },
      period: { start: iso(e.encounterDate), end: iso(e.encounterDate) },
      reasonCode: e.chiefComplaint ? [{ text: e.chiefComplaint }] : undefined,
      diagnosis: e.diagnosisText ? [{ condition: { display: e.diagnosisText, ...(e.diagnosisCode ? { identifier: { system: "http://hl7.org/fhir/sid/icd-10", value: e.diagnosisCode } } : {}) } }] : undefined,
      participant: e.doctor ? [{ individual: { display: e.doctor } }] : undefined,
      extension: e.advice ? [{ url: "urn:citycare:advice", valueString: e.advice }] : undefined,
    });
  }
  for (const l of s.labs) {
    const v = num(l.value);
    add("Observation", l.id, {
      status: "final", category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }] }],
      code: { text: l.testName }, subject: { reference: pref }, effectiveDateTime: iso(l.takenOn),
      ...(v !== undefined ? { valueQuantity: { value: v, unit: l.unit ?? undefined } } : { valueString: l.value }),
      referenceRange: l.refRangeLow != null || l.refRangeHigh != null
        ? [{ low: num(l.refRangeLow) !== undefined ? { value: num(l.refRangeLow), unit: l.unit ?? undefined } : undefined, high: num(l.refRangeHigh) !== undefined ? { value: num(l.refRangeHigh), unit: l.unit ?? undefined } : undefined }]
        : undefined,
      encounter: l.encounterId ? { reference: `urn:citycare:Encounter/${l.encounterId}` } : undefined,
    });
  }

  return {
    resourceType: "Bundle", type: "collection", timestamp: generatedAt.toISOString(),
    meta: { source: "urn:citycare", tag: [{ system: "urn:citycare:export", code: "patient-self-export" }] },
    total: entries.length,
    entry: entries.map((e) => ({ ...e, resource: prune(e.resource) })),
  };
}

/** FHIR forbids explicit nulls/undefined — strip them recursively. */
function prune<T>(v: T): T {
  if (Array.isArray(v)) return v.map(prune).filter((x) => x !== undefined) as unknown as T;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const pv = prune(val);
      if (pv !== undefined && pv !== null) out[k] = pv;
    }
    return out as T;
  }
  return v;
}
