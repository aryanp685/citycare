import { describe, it, expect } from "vitest";
import { runAllRules, checkDrugAllergyConflicts, checkAbnormalLabs, checkFollowupsDue, checkStaleTest, listAbnormalLabs, isConfirmedActiveMed } from "../rules";

const rec = (over: object = {}) => ({
  allergies: [], medications: [], labs: [], encounters: [], ...over,
});

describe("drug–allergy conflict", () => {
  it("flags a class member of a penicillin allergy (amoxicillin)", () => {
    const a = checkDrugAllergyConflicts(rec({
      allergies: [{ allergen: "Penicillin", isActive: true }],
      medications: [{ name: "Amoxicillin 500mg" }],
    }));
    expect(a).toHaveLength(1);
    expect(a[0].severity).toBe("CRITICAL");
    expect(a[0].title).toContain("Amoxicillin 500mg");
  });
  it("matches on genericName too", () => {
    const a = checkDrugAllergyConflicts(rec({
      allergies: [{ allergen: "penicillin" }],
      medications: [{ name: "Augmentin", genericName: "co-amoxiclav" }],
    }));
    expect(a).toHaveLength(1);
  });
  it("no allergy -> no alert; unrelated drug -> no alert", () => {
    expect(checkDrugAllergyConflicts(rec({ allergies: [{ allergen: "Dust" }], medications: [{ name: "Paracetamol" }] }))).toEqual([]);
  });
  it("inactive allergy is respected", () => {
    expect(checkDrugAllergyConflicts(rec({
      allergies: [{ allergen: "Penicillin", isActive: false }],
      medications: [{ name: "Ampicillin" }],
    }))).toEqual([]);
  });
});

describe("abnormal labs (recomputed, never trusting stored flags)", () => {
  it("above-range string value flags", () => {
    const a = checkAbnormalLabs(rec({ labs: [{ testName: "HbA1c", value: "9.2", refRangeLow: "4.0", refRangeHigh: "5.6", unit: "%" }] }));
    expect(a).toHaveLength(1);
    expect(a[0].title).toContain("9.2");
  });
  it("weird/empty values are skipped, not coerced to 0", () => {
    expect(checkAbnormalLabs(rec({ labs: [{ testName: "X", value: "", refRangeLow: "1", refRangeHigh: "5" }] }))).toEqual([]);
    expect(checkAbnormalLabs(rec({ labs: [{ testName: "X", value: "9,2", refRangeLow: "1", refRangeHigh: "5" }] }))).toEqual([]);
    expect(checkAbnormalLabs(rec({ labs: [{ testName: "X", value: null as never, refRangeLow: "1", refRangeHigh: "5" }] }))).toEqual([]);
  });
  it("no range -> cannot claim abnormal", () => {
    expect(checkAbnormalLabs(rec({ labs: [{ testName: "X", value: "999999" }] }))).toEqual([]);
  });
  it("listAbnormalLabs gives structured rows for the digest", () => {
    expect(listAbnormalLabs(rec({ labs: [{ testName: "LDL", value: "160", refRangeLow: "0", refRangeHigh: "100", unit: "mg/dL" }] })))
      .toEqual([{ testName: "LDL", value: "160", unit: "mg/dL", range: "0–100" }]);
  });
});

describe("follow-ups / stale tests", () => {
  it("fires on due-today and overdue, not future", () => {
    const a = checkFollowupsDue(rec({ encounters: [{ followUpOn: "2026-09-27T00:00:00Z", diagnosisText: "T2D" }] }), "2026-09-27");
    expect(a).toHaveLength(1);
    expect(a[0].message).toContain("0 day(s) overdue");
    expect(checkFollowupsDue(rec({ encounters: [{ followUpOn: "2026-10-27T00:00:00Z" }] }), "2026-09-27")).toEqual([]);
  });
  it("HbA1c stale after 180 days uses the LATEST test", () => {
    const r = rec({ labs: [
      { testName: "HbA1c", value: "9.2", takenOn: "2026-01-01" },
      { testName: "HbA1c", value: "6.1", takenOn: "2026-06-01" },
    ] });
    expect(checkStaleTest(r, "HbA1c", 180, "2026-09-27")).toHaveLength(0); // latest within 180d
    expect(checkStaleTest(r, "HbA1c", 90, "2026-09-27")).toHaveLength(1);
    expect(checkStaleTest(r, "HbA1c", 90, "2026-09-27")[0].message).toContain("2026-06-01");
  });
});

describe("run_all semantics (must match rules.py)", () => {
  it("dedupes by (type,title) and sorts CRITICAL first", () => {
    const out = runAllRules(rec({
      allergies: [{ allergen: "Penicillin" }],
      medications: [{ name: "Penicillin V" }, { name: "Amoxicillin" }],
      labs: [{ testName: "K", value: "9", refRangeLow: "0", refRangeHigh: "1" }],
    }), "2026-09-27");
    expect(out[0].severity).toBe("CRITICAL");
    const keys = out.map((a) => `${a.type}|${a.title}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("isConfirmedActiveMed: DRAFT rows never count", () => {
    expect(isConfirmedActiveMed({ notes: "DRAFT:Tab X 500mg" })).toBe(false);
    expect(isConfirmedActiveMed({ notes: null, isActive: true })).toBe(true);
    expect(isConfirmedActiveMed({ notes: null, isActive: false })).toBe(false);
  });
});
