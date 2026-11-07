import { resolveLocale, translate, LOCALES } from "./i18n";
import { documentErrorKey } from "./document-i18n";

/** Optional browser error page; the signed URL and status remain unchanged. */
export function documentDownloadError(status: number, code: string, message: string, url: URL): Response {
  const requested = url.searchParams.get("ui_lang");
  if (!requested || !(LOCALES as readonly string[]).includes(requested)) {
    return Response.json({ error: message, code }, { status });
  }
  const locale = resolveLocale(requested);
  const key = code === "not_yours" ? "errorNotFound" : documentErrorKey(code);
  const text = translate(locale, "documents", key);
  // Fixed catalog strings are escaped, and no URL, filename, patient data or server error is reflected.
  const safe = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  return new Response(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safe}</title></head><body><main><p role="alert">${safe}</p></main></body></html>`, {
    status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'", "referrer-policy": "no-referrer" },
  });
}
