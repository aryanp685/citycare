import { describe, it, expect } from "vitest";
import { applyScope, type RecordSections } from "../repo";
import type { ConsentRow, ConsentVerdict } from "../consent";

// D19: the consent-scope filter is the one piece of code standing between a doctor and data the
// patient did not share. It must be provable without a database.
const d = (s: string) => new Date(s);
const rec: RecordSections = {
  allergies: [{ id: "a1", allergen: "Penicillin", severity: "CRITICAL", reaction: "anaphylaxis" }],
  conditions: [{ id: "c1", name: "Type 2 diabetes", status: "ACTIVE", icd10: "E11" }],
  medications: [{ id: "m1", name: "Metformin", dosage: "500 mg", frequency: "BD", notes: null }],
  encounters: [
    { id: "e3", encounterDate: d("2026-09-01"), type: "OPD", chiefComplaint: "fever", diagnosisText: "viral fever", diagnosisCode: null, advice: null, followUpOn: null, doctor: "Dr A" },
    { id: "e2", encounterDate: d("2026-06-01"), type: "OPD", chiefComplaint: "sugar review", diagnosisText: "Type 2 Diabetes — controlled", diagnosisCode: "E11", advice: null, followUpOn: null, doctor: "Dr B" },
    { id: "e1", encounterDate: d("2026-01-01"), type: "OPD", chiefComplaint: "knee pain", diagnosisText: "osteoarthritis", diagnosisCode: null, advice: null, followUpOn: null, doctor: "Dr C" },
  ],
  labs: [
    { id: "l1", testName: "HbA1c", value: "7.1", unit: "%", refRangeLow: null, refRangeHigh: "6.5", takenOn: null, documentId: "doc1", encounterId: "e2" },
    { id: "l2", testName: "CRP", value: "12", unit: "mg/L", refRangeLow: null, refRangeHigh: "5", takenOn: null, documentId: "doc2", encounterId: "e3" },
    { id: "l0", testName: "Vitamin D", value: "18", unit: "ng/mL", refRangeLow: "30", refRangeHigh: null, takenOn: null, documentId: "doc0", encounterId: null },
  ],
  observations: [
    // o1: logged during the diabetes review (e2) · o2: logged during the fever visit (e3) ·
    // o0: self-logged at home, never tied to an encounter
    { id: "o1", name: "HbA1c", category: "lab", valueNum: 7.1, unit: "%", refLow: null, refHigh: 7, takenOn: d("2026-06-01"), encounterId: "e2" },
    { id: "o2", name: "BP Systolic", category: "blood_pressure", valueNum: 150, unit: "mmHg", refLow: null, refHigh: 130, takenOn: d("2026-09-01"), encounterId: "e3" },
    { id: "o0", name: "Weight", category: "weight", valueNum: 78, unit: "kg", refLow: null, refHigh: null, takenOn: d("2026-09-15"), encounterId: null },
  ],
  prescriptions: [
    { id: "p1", encounterId: "e1", issuedOn: d("2026-01-01"), items: [], notes: null, doctor: "Dr C" },
    { id: "p2", encounterId: "e3", issuedOn: d("2026-09-01"), items: [], notes: null, doctor: "Dr A" },
  ],
  documents: [{ id: "doc1", title: "HbA1c report", type: "LAB", source: "UPLOAD", issuedOn: null, ocrStatus: "DONE" }],
};
const base: ConsentRow = { id: "k", patientId: "p", doctorId: "d", status: "APPROVED", scope: "FULL_RECORD", purpose: "TREATMENT", lastNEncounters: null, conditionName: null, expiresAt: d("2027-01-01"), approvedAt: d("2026-09-01"), revokedAt: null };
const allow = (o: Partial<ConsentRow>): ConsentVerdict => ({ allowed: true, consent: { ...base, ...o } });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("applyScope (D19)", () => {
  it("denied verdict → every section empty, whatever the record holds", () => {
    const { sections } = applyScope(rec, { allowed: false, reason: "expired" });
    expect(Object.values(sections).every((s) => (s as unknown[]).length === 0)).toBe(true);
  });
  it("FULL_RECORD passes the record through untouched", () => {
    expect(applyScope(rec, allow({ scope: "FULL_RECORD" })).sections).toBe(rec);
  });
  it("SUMMARY_ONLY keeps safety facts and hides everything episodic", () => {
    const { sections } = applyScope(rec, allow({ scope: "SUMMARY_ONLY" }));
    expect(ids(sections.allergies)).toEqual(["a1"]);
    expect(ids(sections.conditions)).toEqual(["c1"]);
    expect(ids(sections.medications)).toEqual(["m1"]);
    expect(sections.encounters).toEqual([]);
    expect(sections.labs).toEqual([]);
    expect(sections.observations).toEqual([]); // F5: readings are episodic clinical data, hidden like labs
    expect(sections.prescriptions).toEqual([]);
    expect(sections.documents).toEqual([]);
  });
  it("LAST_N_ENCOUNTERS=1 keeps the newest encounter and only its labs/prescriptions (+ unlinked labs)", () => {
    const { sections } = applyScope(rec, allow({ scope: "LAST_N_ENCOUNTERS", lastNEncounters: 1 }));
    expect(ids(sections.encounters)).toEqual(["e3"]);
    expect(ids(sections.labs).sort()).toEqual(["l0", "l2"]);
    expect(ids(sections.prescriptions)).toEqual(["p2"]);
    expect(ids(sections.observations).sort()).toEqual(["o0", "o2"]); // unlinked o0 stays; o1 (e2, outside window) hidden
    expect(sections.documents).toEqual([]);
    expect(ids(sections.allergies)).toEqual(["a1"]); // safety facts never hidden
  });
  it("LAST_N_ENCOUNTERS defaults to 3 when n is null", () => {
    expect(applyScope(rec, allow({ scope: "LAST_N_ENCOUNTERS", lastNEncounters: null })).sections.encounters.length).toBe(3);
  });
  it("SPECIFIC_CONDITION matches case-insensitively on diagnosis or complaint and drops unrelated labs/prescriptions", () => {
    const { sections, scopeNote } = applyScope(rec, allow({ scope: "SPECIFIC_CONDITION", conditionName: "diabetes" }));
    expect(ids(sections.encounters)).toEqual(["e2"]);
    expect(ids(sections.labs)).toEqual(["l1"]); // the HbA1c linked to e2; CRP (e3) and unlinked Vitamin D are hidden
    expect(ids(sections.observations)).toEqual(["o1"]); // same rule: only the reading taken during the diabetes review
    expect(sections.prescriptions).toEqual([]);
    expect(sections.documents).toEqual([]);
    expect(scopeNote).toContain("diabetes");
  });
  it("SPECIFIC_CONDITION with no matching encounter shares nothing episodic", () => {
    const { sections } = applyScope(rec, allow({ scope: "SPECIFIC_CONDITION", conditionName: "asthma" }));
    expect(sections.encounters).toEqual([]);
    expect(sections.labs).toEqual([]);
    expect(sections.observations).toEqual([]); // unlinked o0 does NOT leak through a condition scope (labs rule)
    expect(sections.prescriptions).toEqual([]);
  });
  it("unknown scope (e.g. SPECIFIC_DOCUMENTS without file storage) shares nothing", () => {
    const { sections, scopeNote } = applyScope(rec, allow({ scope: "SPECIFIC_DOCUMENTS" }));
    expect(Object.values(sections).every((s) => (s as unknown[]).length === 0)).toBe(true);
    expect(scopeNote).toMatch(/nothing shared/i);
  });
});
