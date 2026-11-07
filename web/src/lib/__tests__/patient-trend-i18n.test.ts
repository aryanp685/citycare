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
import { TrendsCard, TrendsPanel, type ObsRow } from "@/components/trends";
const rows: ObsRow[] = [
  { id: "a", name: "Synthetic reading", category: "other", valueNum: 12, unit: "mg", refLow: 10, refHigh: 20, takenOn: "2026-01-01T12:00:00Z", encounterId: null },
  { id: "b", name: "Synthetic reading", category: "other", valueNum: 15, unit: "mg", refLow: 10, refHigh: 20, takenOn: "2026-01-02T12:00:00Z", encounterId: null },
];
describe("patient chart localization", () => {
  it.each(LOCALES)("%s preserves values and localizes chart label and heading", locale => {
    state.locale = locale;
    const html = renderToStaticMarkup(createElement(TrendsCard, { rows }));
    expect(html).toContain(translate(locale, "records", "trendHeading"));
    expect(html).toContain(translate(locale, "records", "trendChartLabel").replace("{name}", "Synthetic reading").replace("{count}", "2"));
    expect(html).toContain("15mg");
    expect(missingMessages(locale).filter(k => k.startsWith("records.trend"))).toEqual([]);
  });
  it("wraps long patient reading names without changing the doctor chart", () => {
    const longName = "SyntheticLongReading" + "Z".repeat(40);
    const longRows = rows.map(row => ({ ...row, name: longName }));
    const patient = renderToStaticMarkup(createElement(TrendsPanel, { rows: longRows, interactive: true }));
    const doctor = renderToStaticMarkup(createElement(TrendsPanel, { rows: longRows }));
    expect(patient).toContain(`class="font-semibold text-sm min-w-0 [overflow-wrap:anywhere]">${longName}</span>`);
    expect(patient).toContain(`class="min-w-0 [overflow-wrap:anywhere]"`);
    expect(doctor).toContain(`class="font-semibold text-sm">${longName}</span>`);
    expect(doctor).not.toContain("[overflow-wrap:anywhere]");
  });
  it("leaves the doctor chart in English with non-English preference", () => {
    state.locale = "hi";
    const html = renderToStaticMarkup(createElement(TrendsPanel, { rows }));
    expect(html).toContain("Synthetic reading trend: 2 readings");
  });
});

describe("patient reading form localization", () => {
  it.each(LOCALES)("%s renders labels without changing submitted known values", locale => {
    state.locale = locale;
    const html = renderToStaticMarkup(createElement(TrendsCard, { rows: [] }));
    for (const key of ["trendLog", "trendPick", "trendValue", "trendUnit", "trendDate", "trendSave", "trendEmpty", "trendFasting"] as const) {
      expect(html).toContain(translate(locale, "records", key));
    }
    expect(html).toContain('value="Fasting glucose"');
  });
  it.each(LOCALES)("%s renders localized summary without changing values", locale => {
    state.locale = locale;
    const html = renderToStaticMarkup(createElement(TrendsCard, { rows }));
    expect(html).toContain(translate(locale, "records", "trendChange"));
    expect(html).toContain(translate(locale, "records", "trendLatest"));
    expect(html).toContain("15mg");
  });
});
