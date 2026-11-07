import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CATALOGS, LOCALES, missingMessages, translate, type Locale } from "../i18n";
import { DOCUMENT_TYPES, documentDate, documentErrorKey, documentSize, documentTypeKey, documentSourceKey, interpolate } from "../document-i18n";
const state = vi.hoisted(() => ({ locale: "en" }));
vi.mock("@/components/use-locale", async () => {
  const { translate } = await import("../i18n");
  return { useLocale: () => ({ locale: state.locale, setLocale: vi.fn(), t: (ns: Parameters<typeof translate>[1], key: string) => translate(state.locale as Locale, ns, key as never) }) };
});
import { DocumentManager } from "@/components/document-manager";

describe("patient document localization", () => {
  it.each(LOCALES)("%s document catalog contains every key with matching placeholders", (locale) => {
    expect(missingMessages(locale).filter((key) => key.startsWith("documents."))).toEqual([]);
    for (const [key, source] of Object.entries(CATALOGS.en.documents)) {
      const translated = (CATALOGS[locale].documents as Record<string, string>)[key];
      expect(translated.trim()).not.toBe("");
      expect((translated.match(/\{\w+\}/g) ?? []).sort()).toEqual((source!.match(/\{\w+\}/g) ?? []).sort());
    }
  });
  it.each(LOCALES)("%s renders a labelled form, loading state and full-record and emergency disclosure", (locale) => {
    state.locale = locale;
    const html = renderToStaticMarkup(createElement(DocumentManager));
    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain(translate(locale, "documents", "fileLabel"));
    expect(html).toContain(translate(locale, "documents", "typeLabel"));
    expect(html).toContain(translate(locale, "documents", "dateLabel"));
    expect(html).toContain(translate(locale, "documents", "loading"));
    expect(html).toContain(translate(locale, "documents", "searchLabel"));
    expect(html).toContain(translate(locale, "documents", "filterLabel"));
    expect(html).toContain('role="status"');
    expect(html).toContain('accept="application/pdf,image/jpeg,image/png"');
  });
  it("maps document types and safe failure codes with fallback", () => {
    expect(DOCUMENT_TYPES).toHaveLength(11);
    expect(documentTypeKey("DISCHARGE_SUMMARY")).toBe("typeDischarge");
    expect(documentTypeKey("new type")).toBe("typeOther");
    expect(documentSourceKey("PATIENT_UPLOAD")).toBe("sourcePatient");
    expect(documentSourceKey("LAB_UPLOAD")).toBe("sourceLab");
    expect(documentSourceKey("__proto__")).toBe("sourceUnknown");
    expect(documentErrorKey("quota_exceeded")).toBe("errorQuota");
    expect(documentErrorKey("auth_required")).toBe("errorAuth");
    expect(documentErrorKey("consent_outdated")).toBe("errorConsent");
    expect(documentErrorKey("not_found")).toBe("errorNotFound");
    expect(documentErrorKey("no_consent")).toBe("errorDenied");
    expect(documentErrorKey("bad_link")).toBe("errorLinkExpired");
    expect(documentErrorKey("__proto__")).toBe("errorGeneric");
    expect(documentErrorKey(null)).toBe("errorGeneric");
  });
  it("formats bytes and dates without changing the original calendar date", () => {
    expect(documentSize(0, "en")).toBe("0 KB");
    expect(documentSize(3 * 1024 * 1024, "en")).toBe("3 MB");
    expect(documentDate("2026-01-01", "en")).toContain("2026");
    expect(documentDate("not-a-date", "hi")).toBe("not-a-date");
    expect(documentDate("2026-02-31", "mr")).toBe("2026-02-31");
    expect(interpolate("{size} / {size}", { size: "3 MB" })).toBe("3 MB / 3 MB");
  });
});
