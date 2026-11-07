import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES, missingMessages, translate, type Locale } from "../i18n";
const state = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/use-locale", async () => {
  const { translate } = await import("../i18n");
  return { useLocale: () => ({ locale: state.locale, t: (ns: Parameters<typeof translate>[1], key: string) => translate(state.locale as Locale, ns, key as never) }) };
});
import { PatientRecordCards, PatientRecordsIntro } from "@/components/patient-records-cards";
describe("patient record cards", () => {
  it.each(LOCALES)("%s labels, source data and export link", locale => {
    state.locale = locale;
    const html = renderToStaticMarkup(createElement(PatientRecordCards, {
      medications: [{ id: "draft", name: "SyntheticMedicine", dosage: "12 mg", frequency: "1-0-1", notes: "DRAFT:synthetic source" }, { id: "confirmed", name: "SyntheticConfirmed", dosage: null, frequency: null, notes: null }],
      allergies: [{ id: "a", allergen: "SyntheticAllergen" }], conditions: [{ id: "c", name: "SyntheticCondition", icd10: "Z00" }], alertCount: 2,
    }));
    for (const text of ["SyntheticMedicine", "12 mg", "1-0-1", "synthetic source", "SyntheticAllergen", "SyntheticCondition", translate(locale, "records", "medCorrect"), translate(locale, "records", "medConfirmed")]) expect(html).toContain(text);
    expect(html).toContain(`lang="${locale}"`);
    const intro = renderToStaticMarkup(createElement(PatientRecordsIntro));
    expect(intro).toContain(translate(locale, "records", "exportFhir"));
    expect(missingMessages(locale).filter(k => k.startsWith("records."))).toEqual([]);
  });
  it.each(LOCALES)("%s empty state", locale => {
    state.locale = locale;
    const html = renderToStaticMarkup(createElement(PatientRecordCards, { medications: [], allergies: [], conditions: [], alertCount: 0 }));
    expect(html).toContain(translate(locale, "records", "medEmpty"));
    expect(html).toContain(translate(locale, "records", "noneRecorded"));
  });
});
