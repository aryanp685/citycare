import { describe, it, expect } from "vitest";
import { toFhirBundle } from "../fhir";

const patient = { id: "p1", fullName: "Ramesh Shelar", dateOfBirth: new Date("1968-03-02"), gender: "MALE", bloodGroup: "B_POSITIVE", city: "Pune", abhaId: null };
const sections = {
  allergies: [{ id: "a1", allergen: "Penicillin", severity: "CRITICAL", reaction: "rash + swelling" }],
  conditions: [{ id: "c1", name: "Type 2 diabetes", status: "ACTIVE", icd10: "E11" }],
  medications: [
    { id: "m1", name: "Metformin", dosage: "500 mg", frequency: "BD", notes: null },
    { id: "m2", name: "Draft thing", dosage: null, frequency: null, notes: "DRAFT: pasted" },
  ],
  encounters: [{ id: "e1", encounterDate: new Date("2026-01-05T05:30:00Z"), type: "OUTPATIENT", chiefComplaint: "fever", diagnosisText: "Viral fever", diagnosisCode: "B34.9", advice: "rest", followUpOn: null, doctor: "Dr. Nair" }],
  labs: [{ id: "l1", testName: "HbA1c", value: "7.8", unit: "%", refRangeLow: "4", refRangeHigh: "5.6", takenOn: new Date("2026-01-05"), documentId: "d1", encounterId: "e1" }],
  prescriptions: [],
  documents: [],
} as unknown as Parameters<typeof toFhirBundle>[1];

describe("F4 FHIR R4 bundle", () => {
  const b = toFhirBundle(patient, sections, new Date("2026-09-28T00:00:00Z"));
  it("is a collection Bundle with one resource per clinical fact (drafts excluded)", () => {
    expect(b.resourceType).toBe("Bundle");
    const types = b.entry.map((e) => (e.resource as { resourceType: string }).resourceType);
    expect(types).toEqual(["Patient", "AllergyIntolerance", "Condition", "MedicationStatement", "Encounter", "Observation"]);
    expect(b.total).toBe(6);
  });
  it("maps codes and units correctly", () => {
    const obs = b.entry[5].resource as { valueQuantity: { value: number; unit: string }; referenceRange: { high: { value: number } }[] };
    expect(obs.valueQuantity).toEqual({ value: 7.8, unit: "%" });
    expect(obs.referenceRange[0].high.value).toBe(5.6);
    const cond = b.entry[2].resource as { code: { coding: { code: string }[] } };
    expect(cond.code.coding[0].code).toBe("E11");
    const pat = b.entry[0].resource as { gender: string; birthDate: string };
    expect(pat.gender).toBe("male"); expect(pat.birthDate).toBe("1968-03-02");
  });
  it("contains no null/undefined values anywhere (FHIR JSON rule)", () => {
    const json = JSON.stringify(b);
    expect(json.includes("null")).toBe(false);
  });
});
