import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CATALOGS, DEFAULT_LOCALE, LOCALES, NAMESPACES, NAMESPACE_STATUS, missingMessages, resolveLocale, translate } from "../i18n";
import { LOCALE_STORAGE_KEY, browserLocale, readLocale, selectBrowserLocale, subscribeLocale, writeLocale } from "../locale-preference";
import { LanguageSwitcher } from "../../components/language-switcher";
import { LEGAL_LANGS, pickLang, howLongBody } from "../legal-i18n";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("locale foundation", () => {
  it("defaults to English and shares the privacy summary locale set", () => {
    expect(DEFAULT_LOCALE).toBe("en"); expect(LEGAL_LANGS).toEqual(LOCALES);
    expect(resolveLocale(undefined)).toBe("en"); expect(pickLang("hi")).toBe("hi");
    expect(translate("en", "common", "language")).toBe("Language preference");
  });
  it.each(["hi", "mr"] as const)("supports %s for the preference control", (locale) => {
    expect(resolveLocale(locale)).toBe(locale);
    expect(translate(locale, "common", "language")).toMatch(/[\u0900-\u097f]/);
    expect(translate(locale, "common", "incomplete")).toMatch(/[\u0900-\u097f]/);
  });
  it.each([null, "", "fr", "HI", "hi-IN", {}, 0])("rejects unsupported locale %s", (raw) => {
    expect(resolveLocale(raw)).toBe("en");
  });
  it("lists missing keys and does not claim starter namespaces complete", () => {
    expect(missingMessages("en")).toEqual([]);
    for (const locale of ["hi", "mr"] as const) {
      expect(missingMessages(locale)).toContain("auth.signIn");
      expect(missingMessages(locale)).not.toContain("common.language");
    }
    for (const namespace of NAMESPACES) expect(NAMESPACE_STATUS[namespace]).not.toBeUndefined();
    expect(NAMESPACE_STATUS.patient).toBe("not-started");
    expect(NAMESPACE_STATUS.doctor).toBe("not-started");
    expect(CATALOGS.hi.patient).toEqual({});
  });
  it("warns on a missing translation, returns English, and rejects unknown keys", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(translate("hi", "auth", "signIn")).toBe("Sign in");
    expect(warn).toHaveBeenCalledWith("Missing translation: hi.auth.signIn");
    expect(() => translate("hi", "auth", "unknown" as "signIn")).toThrow("Unknown translation key");
  });
  it("stores and reloads only a locale, defaults for invalid data and survives denied storage", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(readLocale(storage)).toBe("en");
    expect(writeLocale(storage, "hi")).toBe("hi"); expect(readLocale(storage)).toBe("hi");
    expect(writeLocale(storage, "mr")).toBe("mr"); expect(readLocale(storage)).toBe("mr");
    expect([...values.keys()]).toEqual([LOCALE_STORAGE_KEY]);
    expect(writeLocale(storage, "invalid")).toBe("en");
    expect(readLocale({ getItem: () => { throw new Error("denied"); } })).toBe("en");
    expect(writeLocale({ setItem: () => { throw new Error("denied"); } }, "hi")).toBe("hi");
  });
  it("switching notifies subscribers without network, session, role or consent writes", () => {
    const values = new Map<string, string>();
    const target = new EventTarget();
    const win = Object.assign(target, { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } } });
    vi.stubGlobal("window", win);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const changed = vi.fn(); const unsubscribe = subscribeLocale(changed);
    selectBrowserLocale("hi"); expect(browserLocale()).toBe("hi");
    selectBrowserLocale("mr"); expect(browserLocale()).toBe("mr");
    expect(changed).toHaveBeenCalledTimes(2); expect(fetchSpy).not.toHaveBeenCalled();
    expect([...values.entries()]).toEqual([[LOCALE_STORAGE_KEY, "mr"]]);
    unsubscribe(); selectBrowserLocale("en"); expect(changed).toHaveBeenCalledTimes(2);
  });
  it("renders a labelled keyboard-native selector and a disclosure of incomplete translations", () => {
    const html = renderToStaticMarkup(createElement(LanguageSwitcher));
    expect(html).toContain('for="citycare-language"'); expect(html).toContain("<select");
    expect(html).toContain('aria-describedby="citycare-language-status"');
    expect(html).toContain("Most pages are still in English");
    expect(html).toContain('lang="hi"'); expect(html).toContain('lang="mr"');
  });
  it("preserves policy-aware privacy summary text in both languages", () => {
    for (const locale of ["hi", "mr"] as const) {
      expect(howLongBody(true, 19, locale)).toContain("19");
      expect(howLongBody(false, 19, locale)).not.toContain("19");
    }
  });
});
