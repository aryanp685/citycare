import { describe, expect, it } from "vitest";
import { LOCALES, translate } from "../i18n";
import { documentDownloadError } from "../document-download-error";
describe("signed download errors", () => {
  it.each(LOCALES)("%s localizes invalid, forbidden, missing and session errors", async locale => {
    for (const [status, code, key] of [[403, "bad_link", "errorLinkExpired"], [403, "no_consent", "errorDenied"], [403, "not_yours", "errorNotFound"], [404, "not_found", "errorNotFound"], [401, "auth_required", "errorAuth"]] as const) {
      const response = documentDownloadError(status, code, "PRIVATE INTERNAL ERROR", new URL(`http://localhost/api/documents/id?ui_lang=${locale}`));
      const body = await response.text();
      expect(response.status).toBe(status);
      expect(body).toContain(translate(locale, "documents", key));
      expect(body).not.toContain("PRIVATE INTERNAL ERROR");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("keeps the legacy JSON response without opt-in", async () => {
    const r = documentDownloadError(403, "bad_link", "this download link is invalid", new URL("http://localhost/"));
    expect(await r.json()).toEqual({ error: "this download link is invalid", code: "bad_link" });
  });
  it("does not reflect an unsupported language", async () => {
    const r = documentDownloadError(401, "auth_required", "sign in", new URL("http://localhost/?ui_lang=%3Cscript%3E"));
    expect(r.headers.get("content-type")).toContain("application/json");
  });
});
