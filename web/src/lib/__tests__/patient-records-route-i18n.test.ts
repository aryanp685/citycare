import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES, translate, type Locale } from "../i18n";
const state = vi.hoisted(() => ({ locale: "en", populated: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/patient/records" }));
vi.mock("@/components/use-locale", async () => {
  const { translate } = await import("../i18n");
  return { useLocale: () => ({ locale: state.locale, t: (ns: Parameters<typeof translate>[1], key: string) => translate(state.locale as Locale, ns, key as never) }) };
});
vi.mock("@/lib/session", () => ({ viewerForPage: vi.fn(async () => ({ profileId: "synthetic-id" })) }));
vi.mock("@/lib/repo", () => ({ recordSections: vi.fn(async () => state.populated ? ({
  medications: [{ id: "med1", name: "Synthetic Medicine", dosage: "10 mg", frequency: "1-0-1", notes: null }, { id: "med2", name: "Synthetic Draft", dosage: null, frequency: null, notes: "DRAFT:Synthetic Source" }],
  observations: [{ id: "o1", name: "Synthetic Reading", category: "other", valueNum: 12, unit: "mg", refLow: 10, refHigh: 20, takenOn: new Date("2026-01-01T12:00:00Z"), encounterId: null }, { id: "o2", name: "Synthetic Reading", category: "other", valueNum: 15, unit: "mg", refLow: 10, refHigh: 20, takenOn: new Date("2026-01-02T12:00:00Z"), encounterId: null }],
  allergies: [{ id: "allergy", allergen: "Synthetic Allergen", severity: "WARNING" }], conditions: [{ id: "condition", name: "Synthetic Condition", icd10: "E11" }],
  labs: Array.from({ length: 8 }, (_, i) => ({ id: `lab${i}`, testName: `Synthetic Lab ${i}`, value: "17.2", unit: "mg", refRangeLow: "1", refRangeHigh: "20", takenOn: new Date("2026-01-02T12:00:00Z") })),
  encounters: [{ id: "visit", encounterDate: new Date("2026-01-01T12:00:00Z"), type: "OUTPATIENT", doctor: "Synthetic Doctor", diagnosisText: "Synthetic Diagnosis", chiefComplaint: null, diagnosisCode: "E11", advice: "Synthetic Advice", followUpOn: null }],
}) : ({ medications: [], observations: [], allergies: [], conditions: [], labs: [], encounters: [] })), patientById: vi.fn(async () => state.populated ? ({ fullName: "Synthetic Patient", dateOfBirth: new Date("2000-01-01T00:00:00Z"), gender: "FEMALE", bloodGroup: "B+", city: "Pune", abhaId: null }) : null), toRuleRecord: vi.fn(() => ({})) }));
vi.mock("@/lib/rules", () => ({ runAllRules: vi.fn(() => []) }));
import RecordsPage from "@/app/patient/records/page";
import PatientLoading from "@/app/patient/loading";
describe("patient records route rendered in each locale", () => {
  it.each(LOCALES)("%s renders actual route sections and loading name", async locale => {
    state.locale = locale; state.populated = false;
    const page = await RecordsPage();
    const html = renderToStaticMarkup(page);
    for (const key of ["exportHeading", "backfillTitle", "trendHeading", "timeline", "medEmpty", "noneRecorded"] as const) expect(html).toContain(translate(locale, "records", key));
    expect(html).toContain(translate(locale, "documents", "heading"));
    const loading = renderToStaticMarkup(createElement(PatientLoading));
    expect(loading).toContain(`aria-label="${translate(locale, "records", "patientLoading")}"`);
  });
  it.each(LOCALES)("%s renders populated synthetic records and print without changing source data", async locale => {
    state.locale = locale; state.populated = true;
    const html = renderToStaticMarkup(await RecordsPage());
    for (const value of ["Synthetic Patient", "Synthetic Medicine", "10 mg", "Synthetic Allergen", "Synthetic Condition", "Synthetic Reading", "Synthetic Lab", "17.2", "Synthetic Doctor", "Synthetic Diagnosis", "Synthetic Advice"]) expect(html).toContain(value);
    for (const key of ["timeline", "outpatient", "trendHeading", "medicines", "medConfirmed", "printMedicines", "printTitle"] as const) expect(html).toContain(translate(locale, "records", key));
    expect(html).toContain('id="print-summary"');
    expect(html).toContain("Synthetic Lab 7");
    const { viewerForPage } = await import("@/lib/session");
    const { recordSections } = await import("@/lib/repo");
    expect(viewerForPage).toHaveBeenCalledWith("PATIENT");
    expect(recordSections).toHaveBeenCalledWith("synthetic-id");
  });

});
