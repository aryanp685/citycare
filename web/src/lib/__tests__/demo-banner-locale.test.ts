import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES, translate, type Locale } from "../i18n";
const state = vi.hoisted(() => ({ locale: "en", path: "/patient/records" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@/components/use-locale", async () => {
  const { translate } = await import("../i18n");
  return { useLocale: () => ({ locale: state.locale, t: (ns: Parameters<typeof translate>[1], key: string) => translate(state.locale as Locale, ns, key as never) }) };
});
import { DemoBannerContent } from "@/components/demo-banner-content";
describe("patient demo banner", () => {
  it.each(LOCALES)("%s respects enabled and disabled server retention", locale => {
    state.locale = locale; state.path = "/patient/records";
    const enabled = renderToStaticMarkup(createElement(DemoBannerContent, { enabled: true, days: 19 }));
    const disabled = renderToStaticMarkup(createElement(DemoBannerContent, { enabled: false, days: 19 }));
    expect(enabled).toContain(translate(locale, "records", "demoRetention").replace("{days}", "19"));
    expect(disabled).toContain(translate(locale, "records", "demoNoRetention").replaceAll("&", "&amp;"));
  });
  it("keeps doctor banner in English despite Hindi preference", () => {
    state.locale = "hi"; state.path = "/doctor";
    expect(renderToStaticMarkup(createElement(DemoBannerContent, { enabled: true, days: 19 }))).toContain("Accounts you create are erased automatically after 19 days.");
  });
});
