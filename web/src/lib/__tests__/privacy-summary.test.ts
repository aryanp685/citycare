import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrivacySummary, privacySummaryLocale } from "@/components/privacy-summary";

describe("privacy summary locale selection", () => {
  it.each(["en", "hi", "mr"] as const)("uses %s preference when no explicit query", (locale) => {
    expect(privacySummaryLocale(undefined, locale)).toBe(locale);
  });
  it("gives explicit query precedence, and invalid queries fall back to English", () => {
    expect(privacySummaryLocale("hi", "mr")).toBe("hi");
    expect(privacySummaryLocale("en", "mr")).toBe("en");
    expect(privacySummaryLocale("zz", "mr")).toBe("en");
    expect(privacySummaryLocale("", "hi")).toBe("en");
  });
  it.each(["hi", "mr"] as const)("renders %s explicitly with policy-sensitive retention and review warning", (locale) => {
    const render = (retentionEnabled: boolean) => renderToStaticMarkup(createElement(PrivacySummary, { requestedLang: locale, retentionEnabled, retentionDays: 19 }));
    const enabled = render(true), disabled = render(false);
    expect(enabled).toContain(`lang="${locale}"`);
    expect(enabled).toContain("19");
    expect(disabled).not.toContain("19");
    expect(enabled).toMatch(/लंबित|प्रलंबित/);
    expect(enabled).toContain('/legal/privacy?lang=en');
  });
});
