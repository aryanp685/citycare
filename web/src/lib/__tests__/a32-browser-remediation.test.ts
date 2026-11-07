import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { LOCALES, translate, type Locale } from "../i18n";

const state = vi.hoisted(() => ({ path: "/patient/records", locale: "en" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/use-locale", async () => {
  const { translate } = await import("../i18n");
  return { useLocale: () => ({ locale: state.locale, t: (ns: Parameters<typeof translate>[1], key: string) => translate(state.locale as Locale, ns, key as never) }) };
});
import { PatientNoticeRegion } from "@/components/patient-notice-region";
import { PatientRecordsIntro } from "@/components/patient-records-cards";

describe("A-3.2 patient browser remediation", () => {
  it.each(LOCALES)("%s renders a localized page heading and named notices landmark", locale => {
    state.path = "/patient/records"; state.locale = locale;
    expect(renderToStaticMarkup(createElement(PatientRecordsIntro))).toContain(`<h1 class="text-xl font-bold">${translate(locale, "records", "shellRecords")}</h1>`);
    const region = renderToStaticMarkup(createElement(PatientNoticeRegion, null, "synthetic notice"));
    expect(region).toContain(`<section lang="${locale}" aria-label="${translate(locale, "records", "shellNoticesLanguage")}">`);
    expect(region).toContain("synthetic notice");
  });
  it.each(["/doctor", "/doctor/patients/test", "/legal/privacy", "/patientish"])("does not add a landmark on %s", path => {
    state.path = path;
    expect(renderToStaticMarkup(createElement(PatientNoticeRegion, null, "notice"))).toBe("notice");
  });
  it("limits the print-flow override to the patient records summary", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("body:has(.patient-shell #patient-records #print-summary) #print-summary { position: static; width: auto; }");
    expect(css).toContain("body:has(.patient-shell #patient-records #print-summary) #patient-records > :not(#print-summary) { display: none; }");
    expect(css).toContain("body:has(#print-summary) #print-summary {"); // unchanged doctor base
  });
});
