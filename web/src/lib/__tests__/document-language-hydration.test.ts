// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { DEFAULT_LOCALE } from "../i18n";
import { LOCALE_STORAGE_KEY, selectBrowserLocale } from "../locale-preference";
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; localStorage.clear(); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
describe("document language hydration", () => {
  it.each(["en", "hi", "mr"] as const)("hydrates SSR English to saved %s and follows later selection", async saved => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const markup = renderToString(createElement(LanguageSwitcher));
    expect(markup).toContain('lang="en"');
    document.documentElement.lang = DEFAULT_LOCALE;
    document.body.innerHTML = `<div id="root">${markup}</div>`;
    localStorage.setItem(LOCALE_STORAGE_KEY, saved);
    const errors: unknown[] = [];
    await act(async () => { root = hydrateRoot(document.getElementById("root")!, createElement(LanguageSwitcher), { onRecoverableError: e => errors.push(e) }); });
    expect(errors).toEqual([]); expect(document.documentElement.lang).toBe(saved);
    expect((document.querySelector("select") as HTMLSelectElement).value).toBe(saved);
    await act(async () => { selectBrowserLocale("mr"); });
    expect(document.documentElement.lang).toBe("mr"); expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("mr");
    await act(async () => { selectBrowserLocale("en"); });
    expect(document.documentElement.lang).toBe("en");
  });
});
