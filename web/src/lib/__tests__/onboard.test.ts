import { describe, it, expect } from "vitest";
import {
  profileTimeSeconds, minimumViableProfile, parsePrescriptionPhoto,
  backfillFromPhotos, dayOneValue, PROFILE_STEPS,
} from "../onboard";

describe("cold start", () => {
  it("the 4 steps take exactly 85 seconds", () => {
    expect(PROFILE_STEPS).toHaveLength(4);
    expect(profileTimeSeconds()).toBe(85);
  });
  it("all four answers -> 100% complete", () => {
    const r = minimumViableProfile({
      allergies: ["Penicillin"],
      chronic_conditions: ["Type 2 Diabetes", "Hypertension"],
      current_medications: ["Metformin 500", "Telmisartan 40"],
      blood_group: "B_POSITIVE",
    });
    expect(r.completenessPct).toBe(100);
    expect(r.missing).toEqual([]);
    expect(r.bloodGroup).toBe("B_POSITIVE");
  });
  it("unknown blood group -> still 75%, blood is the optional one", () => {
    const r = minimumViableProfile({ allergies: ["x"], chronic_conditions: ["y"], current_medications: ["z"], blood_group: null });
    expect(r.completenessPct).toBe(75);
    expect(r.missing).toEqual(["blood_group"]);
  });
  it("empty-string answers count as missing (arrays empty)", () => {
    const r = minimumViableProfile({ allergies: [], chronic_conditions: ["a"], current_medications: ["b"], blood_group: "O_POSITIVE" });
    expect(r.completenessPct).toBe(75);
    expect(r.missing).toEqual(["allergies"]);
  });
  it("day-one value works with zero records", () => {
    expect(dayOneValue(false)).toHaveLength(4);
    expect(dayOneValue(true)).toHaveLength(5);
  });
});

describe("prescription photo parser (matches onboard.py)", () => {
  const ocr = [
    "Tab. Metformin 500 mg  1-0-1  30 days",
    "Tab. Telmisartan 40 mg  0-0-1",
    "Cap. Vitamin D3 60000 IU  weekly",
    "Dr. S. Kulkarni  Reg. 2019/PUNE/4471",
    "Follow up after 6 weeks  FBS + LIPID",
    "%%%% illegible %%%%",
  ].join("\n");

  it("extracts drugs with dose and Indian frequency codes", () => {
    const p = parsePrescriptionPhoto(ocr);
    expect(p.medications.length).toBeGreaterThanOrEqual(2);
    const met = p.medications.find((m) => m.name.toLowerCase().includes("metformin"))!;
    expect(met).toBeDefined();
    expect(met.dosage).toBe("500 mg");
    expect(met.frequency).toBe("1-0-1");
    expect(met.status).toBe("DRAFT");
  });
  it("junk lines go to unparseable, never to meds", () => {
    const p = parsePrescriptionPhoto(ocr);
    expect(p.unparseableLines.some((l) => l.includes("illegible"))).toBe(true);
    expect(p.medications.every((m) => !m.name.includes("%"))).toBe(true);
  });
  it("digit-led garbage is junk; behaviour pinned to onboard.py", () => {
    // python splits the name at the FIRST digit: "12 mg" -> name "" -> junk.
    expect(parsePrescriptionPhoto("12 mg").medications).toEqual([]);
    expect(parsePrescriptionPhoto("12 mg").unparseableLines).toEqual(["12 mg"]);
    // "AB mg" has no digit at all -> python keeps the whole line as the name.
    // It is only a DRAFT (patient must tap confirm), so a wide net is fine:
    // missing a real drug is worse than a draft that gets rejected.
    expect(parsePrescriptionPhoto("AB mg").medications[0]?.name).toBe("AB mg");
  });
  it("bd / hs frequency tokens parse", () => {
    const p = parsePrescriptionPhoto("Syp. Cough 10 ml BD\nTab. Glimecl 1 HS");
    expect(p.medications.map((m) => m.frequency)).toEqual(["BD", "HS"]);
  });
  it("en-dash frequency is matched and kept verbatim (python parity: only spaces are stripped)", () => {
    const p = parsePrescriptionPhoto("Tab. Pan 40 mg 1–0–1");
    expect(p.medications[0].frequency).toBe("1–0–1");
    const q = parsePrescriptionPhoto("Tab. Pan 40 mg 1 - 0 - 1");
    expect(q.medications[0].frequency).toBe("1-0-1"); // ascii with spaces -> spaces removed
  });
  it("confidence is a 0..1 ratio rounded to 2dp; empty input -> 0", () => {
    expect(parsePrescriptionPhoto("").confidence).toBe(0);
    const p = parsePrescriptionPhoto("Tab. Metformin 500 mg\nrandom doctor note");
    expect(p.confidence).toBe(0.5);
  });
});

describe("batch backfill", () => {
  it("de-duplicates by drug name across photos and marks requiresConfirmation", () => {
    const r = backfillFromPhotos([
      "Tab. Metformin 500 mg 1-0-1",
      "Tab. metformin 1 g 1-0-1\nTab. Telmisartan 40 0-0-1",
    ]);
    expect(r.uniqueDrugs).toBe(2);
    expect(r.requiresConfirmation).toBe(true);
    expect(r.draftMedications.length).toBe(2);
  });
});
