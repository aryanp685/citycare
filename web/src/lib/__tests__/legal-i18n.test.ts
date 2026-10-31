import { describe, it, expect } from "vitest";
import { LEGAL_LANGS, LEGAL_SUMMARY, pickLang } from "../legal-i18n";
import { GRIEVANCE, DEMO_RETENTION_DAYS } from "../legal";

describe("legal summaries in hi/mr (L-G2, DPDP s.5(3))", () => {
  it("every language carries the same point structure as English", () => {
    const en = LEGAL_SUMMARY.en;
    for (const l of LEGAL_LANGS) {
      const t = LEGAL_SUMMARY[l];
      expect(t.points.length).toBe(en.points.length);
      for (const k of ["title", "operativeNote", "rights", "grievance", "children", "langName"] as const) expect(t[k].length).toBeGreaterThan(0);
      for (const p of t.points) { expect(p.heading.length).toBeGreaterThan(0); expect(p.body.length).toBeGreaterThan(20); }
    }
  });
  it("non-English summaries are flagged as pending legal review; English is not", () => {
    expect(LEGAL_SUMMARY.en.reviewNote).toBe("");
    expect(LEGAL_SUMMARY.hi.reviewNote.length).toBeGreaterThan(0);
    expect(LEGAL_SUMMARY.mr.reviewNote.length).toBeGreaterThan(0);
  });
  it("numbers quoted in the summaries match the code constants (no drift)", () => {
    for (const l of LEGAL_LANGS) {
      const t = LEGAL_SUMMARY[l];
      expect(t.grievance).toContain(String(GRIEVANCE.responseDays));
      expect(t.points.some((p) => p.body.includes(String(DEMO_RETENTION_DAYS)))).toBe(true);
      expect(t.points.some((p) => p.body.includes("60"))).toBe(true); // break-glass minutes
    }
  });
  it("hi/mr are actually Devanagari, not English placeholders", () => {
    for (const l of ["hi", "mr"] as const) expect(/[\u0900-\u097F]/.test(LEGAL_SUMMARY[l].title)).toBe(true);
  });
  it("pickLang falls back to English for junk", () => {
    expect(pickLang("mr")).toBe("mr");
    expect(pickLang("fr")).toBe("en");
    expect(pickLang(null)).toBe("en");
  });
});
