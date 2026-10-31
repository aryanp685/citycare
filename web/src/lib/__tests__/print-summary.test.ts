import { describe, it, expect } from "vitest";
import { buildPrintSummary, type PrintSummaryInput } from "../print-summary";

// F18: the printed summary can end up with another doctor in the room — so what it prints
// must be exactly right: no drafts as medicines, no invented lines, honest timestamps.
const base: PrintSummaryInput = {
  patient: { fullName: "Ramesh K", dateOfBirth: "1968-04-10T00:00:00Z", gender: "M", bloodGroup: "B+", city: "Pune", abhaId: null },
  generatedAt: "2026-11-01T10:00:00Z",
  audience: "patient",
  allergies: [{ allergen: "Penicillin", severity: "CRITICAL" }],
  conditions: [{ name: "Type 2 Diabetes", icd10: "E11" }],
  medications: [{ name: "Metformin", dosage: "500 mg", frequency: "1-0-1", notes: null }],
  observations: [],
  labs: [],
  lastEncounter: null,
};

describe("buildPrintSummary", () => {
  it("identity line carries name, age (as of generatedAt), gender, blood, city", () => {
    const s = buildPrintSummary(base);
    expect(s.identityLines[0]).toBe("Ramesh K · 58 y · M · Blood B+ · Pune");
    expect(s.identityLines).toHaveLength(1); // no ABHA → no second line
  });
  it("ABHA gets its own line when present", () => {
    const s = buildPrintSummary({ ...base, patient: { ...base.patient, abhaId: "1234 5678 9012" } });
    expect(s.identityLines[1]).toBe("ABHA ID: 1234 5678 9012");
  });
  it("age is computed against generatedAt, not 'now' (deterministic)", () => {
    const before = buildPrintSummary({ ...base, generatedAt: "2026-04-09T10:00:00Z" }); // day before 58th birthday
    const after = buildPrintSummary({ ...base, generatedAt: "2026-04-10T10:00:00Z" }); // birthday
    expect(before.identityLines[0]).toContain("57 y");
    expect(after.identityLines[0]).toContain("58 y");
  });
  it("DRAFT medications are never printed as medicines — counted as excluded instead", () => {
    const s = buildPrintSummary({
      ...base,
      medications: [
        { name: "Metformin", dosage: "500 mg", frequency: "1-0-1", notes: null },
        { name: "Some OCR'd pill", dosage: "10 mg", frequency: "0-0-1", notes: "DRAFT:photo-1" },
      ],
    });
    expect(s.medicationLines).toEqual(["Metformin 500 mg · 1-0-1"]);
    expect(s.medicationNote).toBe("1 unconfirmed draft(s) from old paperwork excluded");
  });
  it("all-empty sections print 'None recorded.' — never a filler or an empty gap", () => {
    const s = buildPrintSummary({
      ...base,
      allergies: [],
      conditions: [],
      medications: [],
      lastEncounter: null,
    });
    expect(s.allergyLines).toEqual(["None recorded."]);
    expect(s.conditionLines).toEqual(["None recorded."]);
    expect(s.medicationLines).toEqual(["None recorded."]);
    expect(s.medicationNote).toBeNull();
    expect(s.observationLines).toEqual(["None recorded."]);
    expect(s.labLines).toEqual(["None recorded."]);
    expect(s.encounterLines).toEqual(["None recorded."]);
  });
  it("a series with one reading is printed as 'one reading so far', never with a direction", () => {
    const s = buildPrintSummary({
      ...base,
      observations: [{ name: "Weight", unit: "kg", latest: 78, direction: "insufficient", band: null, points: 1 }],
    });
    expect(s.observationLines).toEqual(["Weight — one reading so far (78 kg)"]);
  });
  it("a trend line carries latest value + direction + band position", () => {
    const s = buildPrintSummary({
      ...base,
      observations: [{ name: "HbA1c", unit: "%", latest: 7.9, direction: "improving", band: "above", points: 6 }],
    });
    expect(s.observationLines).toEqual(["HbA1c — latest 7.9 % · improving, above target range"]);
  });
  it("lab lines carry value, ref range and date; capped at 5", () => {
    const s = buildPrintSummary({
      ...base,
      labs: Array.from({ length: 7 }, (_, i) => ({
        testName: `Test ${i}`,
        value: "1.0",
        unit: "mg/dL",
        refRangeLow: "0.7",
        refRangeHigh: "1.3",
        takenOn: "2026-09-01T00:00:00Z",
      })),
    });
    expect(s.labLines).toHaveLength(5);
    // month abbreviation is ICU-version dependent ("Sep" vs "Sept") — assert structure, not glyphs
    expect(s.labLines[0]).toMatch(/^Test 0 1\.0 mg\/dL \(ref 0\.7–1\.3\) · 01 \w+ 2026$/);
  });
  it("encounter block has date, diagnosis, advice and follow-up when present", () => {
    const s = buildPrintSummary({
      ...base,
      lastEncounter: {
        encounterDate: "2026-09-01T00:00:00Z",
        diagnosisText: "Type 2 Diabetes — controlled",
        doctor: "Dr A",
        advice: "Continue current medicines",
        followUpOn: "2026-10-15T00:00:00Z",
      },
    });
    expect(s.encounterLines).toHaveLength(4);
    expect(s.encounterLines[0]).toMatch(/^01 \w+ 2026 · Dr A$/);
    expect(s.encounterLines[1]).toBe("Type 2 Diabetes — controlled");
    expect(s.encounterLines[2]).toBe("Advice: Continue current medicines");
    expect(s.encounterLines[3]).toMatch(/^Follow-up: 15 \w+ 2026$/);
  });
  it("doctor audience prints the consent scope in the meta line; patient audience prints the ownership line", () => {
    expect(buildPrintSummary(base).metaLine).toContain("from your own CityCare record");
    expect(buildPrintSummary(base).metaLine).not.toContain("consent");
    const doc = buildPrintSummary({ ...base, audience: "doctor", scopeNote: "Last 3 encounter(s) only" });
    expect(doc.metaLine).toContain("shared under consent: Last 3 encounter(s) only");
  });
  it("footer always carries the not-a-diagnosis line", () => {
    const s = buildPrintSummary(base);
    expect(s.footerLines[0]).toMatch(/not a diagnosis/i);
  });
});
