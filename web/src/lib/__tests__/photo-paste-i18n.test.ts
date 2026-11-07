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
import { PhotoPaste } from "@/components/photo-paste";

describe("prescription backfill localization", () => {
  it.each(LOCALES)("renders %s labels and keeps the sample in its source language", (locale) => {
    state.locale = locale;
    const html = renderToStaticMarkup(createElement(PhotoPaste));
    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain(translate(locale, "records", "backfillTitle"));
    expect(html).toContain(translate(locale, "records", "backfillInput"));
    expect(html).toContain(translate(locale, "records", "backfillSave"));
    expect(html).toContain("Amox 500mg 1-0-1");
    expect(missingMessages(locale).filter(k => k.startsWith("records.backfill"))).toEqual([]);
    expect(translate(locale, "records", "backfillStored")).toContain("{count}");
  });
});
