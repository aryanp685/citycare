import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES, translate, type Locale } from "../i18n";
import { patientAllergySeverity } from "../records-presentation";
import { buildPatientPrintSummary } from "../patient-print-summary";
import type { PrintSummaryInput } from "../print-summary";
const state = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/use-locale", async () => {
  const { translate } = await import("../i18n");
  return { useLocale: () => ({ locale: state.locale, t: (ns: Parameters<typeof translate>[1], key: string) => translate(state.locale as Locale, ns, key as never) }) };
});
import { TrendsCard, TrendsPanel, TrendDateField, type ObsRow } from "@/components/trends";
import { PatientRecordCards } from "@/components/patient-records-cards";
import RecordsError from "@/app/patient/records/error";
const rows: ObsRow[] = ["2026-01-01", "2026-01-02"].map((d, i) => ({ id: String(i), name: "Fasting glucose", category: "glucose", valueNum: 100 + i, unit: "mg/dL", refLow: 70, refHigh: 110, takenOn: `${d}T12:00:00Z`, encounterId: null }));
const summary: PrintSummaryInput = { patient: { fullName: "Synthetic", dateOfBirth: null, gender: "", bloodGroup: "", city: "", abhaId: null }, generatedAt: "2026-01-01T00:00:00Z", audience: "patient", allergies: [], medications: [], conditions: [], observations: [], labs: [], lastEncounter: null };
describe("records must-fix localization", () => {
  it.each(LOCALES)("%s renders every supported severity on screen and print", locale => {
    state.locale = locale;
    const allergies = ["INFO", "WARNING", "CRITICAL"].map((severity, i) => ({ id: String(i), allergen: `Synthetic${i}`, severity }));
    const html = renderToStaticMarkup(createElement(PatientRecordCards, { medications: [], allergies, conditions: [], alertCount: 0 }));
    const printed = buildPatientPrintSummary({ ...summary, allergies }, locale).allergyLines;
    for (const [i, a] of allergies.entries()) { expect(html).toContain(patientAllergySeverity(a.severity, locale)); expect(printed[i]).toContain(patientAllergySeverity(a.severity, locale)); expect(printed[i]).toContain(a.allergen); }
    expect(patientAllergySeverity("CUSTOM", locale)).toBe("CUSTOM");
  });
  it.each(LOCALES)("%s preserves ambiguous, historical and arbitrary names in chart, recent, accessibility and print", locale => {
    state.locale = locale;
    for (const source of ["Fasting glucose", "Synthetic custom", "unknown clinical name", "fasting glucose"]) {
      // Category/encounter linkage are not provenance, even when matching a selector option.
      const inputRows = rows.map(row => ({ ...row, name: source }));
      const before = structuredClone(inputRows);
      const html = renderToStaticMarkup(createElement(TrendsCard, { rows: inputRows }));
      const expectedChart = translate(locale, "records", "trendChartLabel").replace("{name}", source).replace("{count}", "2");
      const expectedRemove = translate(locale, "records", "trendRemoveLabel").replace("{name}", source).split("{date}")[0];
      expect(html).toContain(expectedChart);
      expect(html).toContain(expectedRemove);
      expect(html).toContain(`${source} <strong>`);
      const output = buildPatientPrintSummary({ ...summary, observations: [{ name: source, unit: "mg/dL", latest: 101, direction: "stable", band: "in", points: 2 }] }, locale);
      expect(output.observationLines[0]).toContain(`${source} —`);
      expect(inputRows).toEqual(before);
    }
  });
  it.each(LOCALES)("%s localizes selector options with known in-memory identifiers without modifying values", locale => {
    state.locale = locale;
    const html = renderToStaticMarkup(createElement(TrendsCard, { rows: [] }));
    for (const [name, key] of [["Fasting glucose", "trendFasting"], ["Post-meal glucose", "trendPostMeal"], ["HbA1c", "trendHba1c"], ["BP systolic", "trendSystolic"], ["BP diastolic", "trendDiastolic"], ["Peak flow", "trendPeakFlow"], ["Weight", "trendWeight"]] as const) {
      expect(html).toContain(`value="${name}"`);
      expect(html).toContain(translate(locale, "records", key));
    }
  });
  it.each(LOCALES)("%s associates invalid date with its localized alert", locale => {
    state.locale = locale;
    const html = renderToStaticMarkup(createElement(TrendDateField, { date: "", invalid: true, onChange: vi.fn() }));
    const id = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy(); expect(html).toContain(`id="${id}"`); expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"'); expect(html).toContain(translate(locale, "records", "trendInvalidDate"));
  });
  it.each(LOCALES)("%s renders a safe localized route error", locale => {
    state.locale = locale;
    const html = renderToStaticMarkup(createElement(RecordsError, { error: new Error("private synthetic stack"), reset: vi.fn() }));
    expect(html).toContain(translate(locale, "records", "recordsRenderError")); expect(html).toContain(translate(locale, "records", "recordsRetry")); expect(html).not.toContain("private synthetic stack");
  });
  it("does not change doctor chart wording", () => {
    state.locale = "hi";
    expect(renderToStaticMarkup(createElement(TrendsPanel, { rows }))).toContain("Fasting glucose trend: 2 readings");
  });
});
