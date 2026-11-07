import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CATALOGS, LOCALES, missingMessages, translate, type Locale } from "../i18n";
const state = vi.hoisted(() => ({ locale: "en" }));
vi.mock("@/components/use-locale", async () => {
  const { translate } = await import("../i18n");
  return { useLocale: () => ({ locale: state.locale, t: (ns: Parameters<typeof translate>[1], key: string) => translate(state.locale as Locale, ns, key as never) }) };
});
import { RecordsTimeline, encounterTypeKey, formatTimelineDate } from "@/components/records-timeline";

describe("records timeline translations", () => {
  it.each(LOCALES)("%s provides all timeline keys", (locale) => {
    expect(missingMessages(locale).filter((key) => key.startsWith("records."))).toEqual([]);
    for (const value of Object.values(CATALOGS[locale].records)) expect(value?.trim()).toBeTruthy();
    state.locale = locale;
    const html = renderToStaticMarkup(createElement(RecordsTimeline, { encounters: [], labs: [] }));
    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain(translate(locale, "records", "emptyTimeline"));
  });
  it.each(LOCALES)("%s displays clinical source text unchanged", (locale) => {
    state.locale = locale;
    const html = renderToStaticMarkup(createElement(RecordsTimeline, {
      encounters: [{ id: "synthetic", date: "2026-01-01T12:00:00Z", type: "OUTPATIENT", doctor: "Dr Synthetic", diagnosis: "Synthetic diagnosis", complaint: null, code: "E11", advice: "Synthetic advice", followUp: null }],
      labs: [{ id: "lab", takenOn: null, name: "Synthetic test", value: "12", unit: "mg", low: "0", high: "15" }],
    }));
    expect(html).toContain("Synthetic diagnosis"); expect(html).toContain("Synthetic advice");
    expect(html).toContain("Synthetic test"); expect(html).toContain(translate(locale, "records", "outpatient"));
    expect(html).toContain(translate(locale, "records", "dateUnknown"));
    expect(html).toContain(translate(locale, "records", "reference"));
  });
  it("maps known encounter types and safely handles unknown types", () => {
    for (const value of ["OUTPATIENT", "INPATIENT", "EMERGENCY", "TELECONSULT", "LAB_TEST", "SURGERY", "SELF_REPORTED"]) expect(encounterTypeKey(value)).not.toBe("otherEncounter");
    expect(encounterTypeKey("__proto__")).toBe("otherEncounter");
  });
  it("uses IST and handles invalid dates without throwing", () => {
    expect(formatTimelineDate("2026-01-01T20:00:00Z", "en")).toContain("02");
    expect(formatTimelineDate("bad", "hi")).toBe("bad");
  });
});
