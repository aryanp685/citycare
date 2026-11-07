import { DEFAULT_LOCALE, resolveLocale, type Locale } from "./i18n";

/** A non-sensitive, browser-local presentation preference; never a session cookie. */
export const LOCALE_STORAGE_KEY = "citycare.locale";
export const LOCALE_EVENT = "citycare:locale";
let transient: Locale = DEFAULT_LOCALE;
let storageUnavailable = false;

export function readLocale(storage?: Pick<Storage, "getItem"> | null): Locale {
  try { return resolveLocale(storage?.getItem(LOCALE_STORAGE_KEY)); }
  catch { return DEFAULT_LOCALE; }
}
export function writeLocale(storage: Pick<Storage, "setItem"> | null | undefined, value: unknown): Locale {
  const locale = resolveLocale(value);
  try { storage?.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* browser may deny storage */ }
  return locale;
}

export function browserLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  if (storageUnavailable) return transient;
  try { return resolveLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)); }
  catch { return transient; }
}
export function selectBrowserLocale(value: unknown): void {
  if (typeof window === "undefined") return;
  transient = resolveLocale(value);
  try { window.localStorage.setItem(LOCALE_STORAGE_KEY, transient); storageUnavailable = false; }
  catch { storageUnavailable = true; }
  window.dispatchEvent(new Event(LOCALE_EVENT));
}
export function subscribeLocale(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCALE_STORAGE_KEY || event.key === null) { storageUnavailable = false; callback(); }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(LOCALE_EVENT, callback);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(LOCALE_EVENT, callback); };
}
