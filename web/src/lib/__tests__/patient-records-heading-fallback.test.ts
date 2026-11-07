import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES, translate, type Locale } from "../i18n";

const state = vi.hoisted(() => ({ locale: "en" }));
vi.mock("@/components/use-locale", async () => {
  const { translate } = await import("../i18n");
  return { useLocale: () => ({ locale: state.locale, t: (ns: Parameters<typeof translate>[1], key: string) => translate(state.locale as Locale, ns, key as never) }) };
});
import RecordsLoading from "@/app/patient/records/loading";
import RecordsError from "@/app/patient/records/error";

describe("patient records fallback headings", () => {
  it.each(LOCALES)("%s retains one localized heading in loading and error", locale => {
    state.locale = locale;
    const heading = translate(locale, "records", "shellRecords");
    const loading = renderToStaticMarkup(createElement(RecordsLoading));
    const error = renderToStaticMarkup(createElement(RecordsError, { error: new Error("synthetic"), reset: vi.fn() }));
    for (const html of [loading, error]) {
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).toContain(`>${heading}</h1>`);
    }
    expect(loading).toContain('role="status"');
    expect(loading).toContain(translate(locale, "records", "patientLoading"));
    expect(error).toContain('role="alert"');
    expect(error).toContain(translate(locale, "records", "recordsRenderError"));
    expect(error).toContain(translate(locale, "records", "recordsRetry"));
    expect(error).not.toContain("synthetic");
  });
});
