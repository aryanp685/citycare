import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES, translate, type Locale } from "../i18n";
import { buildPrintSummary, type PrintSummaryInput } from "../print-summary";
import { buildPatientPrintSummary } from "../patient-print-summary";
const state = vi.hoisted(() => ({ locale: "en" }));
vi.mock("@/components/use-locale", async () => {
  const { translate } = await import("../i18n");
  return { useLocale: () => ({ locale: state.locale, t: (ns: Parameters<typeof translate>[1], key: string) => translate(state.locale as Locale, ns, key as never) }) };
});
import { PatientPrintSummary } from "@/components/patient-print-summary";
const input: PrintSummaryInput = {
  patient: { fullName: "Synthetic Patient", dateOfBirth: "2000-01-01T00:00:00Z", gender: "X", bloodGroup: "B+", city: "Pune", abhaId: null }, generatedAt: "2026-01-02T12:00:00Z", audience: "patient",
  allergies: [{ allergen: "SyntheticAllergen", severity: "HIGH" }], conditions: [{ name: "SyntheticCondition", icd10: "E11" }],
  medications: [{ name: "SyntheticMedicine", dosage: "10 mg", frequency: "1-0-1", notes: null }, { name: "ExcludedDraft", dosage: null, frequency: null, notes: "DRAFT:" }],
  observations: [{ name: "SyntheticReading", unit: "mg", latest: 12.3, direction: "improving", band: "in", points: 2 }],
  labs: [{ testName: "SyntheticLab", value: "17.2", unit: "mg", refRangeLow: "1", refRangeHigh: "20", takenOn: null }],
  lastEncounter: { encounterDate: "2026-01-01T00:00:00Z", diagnosisText: "SyntheticDiagnosis", doctor: "SyntheticDoctor", advice: "SyntheticAdvice", followUpOn: null },
};
describe("patient print localization", () => {
  it.each(LOCALES)("%s prints localized headings and unmodified clinical data", locale => {
    state.locale = locale;
    const s = buildPatientPrintSummary(input, locale);
    const html = renderToStaticMarkup(createElement(PatientPrintSummary, { input }));
    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain(translate(locale, "records", "printMedicines"));
    for (const value of ["Synthetic Patient", "SyntheticAllergen", "SyntheticCondition", "SyntheticMedicine", "10 mg", "1-0-1", "SyntheticReading", "12.3", "SyntheticLab", "17.2", "SyntheticDiagnosis", "SyntheticAdvice"]) expect(html).toContain(value);
    expect(html).not.toContain("ExcludedDraft");
    expect(s.medicationNote).toBeTruthy();
  });
  it.each(LOCALES)("%s prints localized empty sections", locale => {
    const s = buildPatientPrintSummary({ ...input, allergies: [], conditions: [], medications: [], observations: [], labs: [], lastEncounter: null }, locale);
    expect(s.medicationLines).toEqual([translate(locale, "records", "noneRecorded")]);
    expect(s.labLines).toEqual([translate(locale, "records", "noneRecorded")]);
  });
  it("preserves English builder output and doctor behavior", () => {
    expect(buildPatientPrintSummary(input, "en")).toEqual(buildPrintSummary(input));
    const doctor = { ...input, audience: "doctor" as const, scopeNote: "Synthetic scope" };
    expect(buildPrintSummary(doctor).metaLine).toContain("shared under consent: Synthetic scope");
  });
});

describe("print enum labels", () => {
  it.each(["hi", "mr"] as const)("%s translates known presentation enums without changing source names", locale => {
    const s = buildPatientPrintSummary({ ...input, patient: { ...input.patient, gender: "FEMALE" }, allergies: [{ allergen: "SyntheticAllergen", severity: "CRITICAL" }, { allergen: "SyntheticOther", severity: "WARNING" }] }, locale);
    expect(s.identityLines[0]).toContain(translate(locale, "records", "printGenderFemale"));
    expect(s.allergyLines[0]).toContain(translate(locale, "records", "printSeverityCritical"));
    expect(s.allergyLines[0]).toContain("SyntheticAllergen");
    expect(s.allergyLines[1]).toContain(translate(locale, "records", "printSeverityWarning"));
  });
});
