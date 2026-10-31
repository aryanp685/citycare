/**
 * Pure same-origin decision for state-changing requests (CSRF defence-in-depth).
 * Kept free of next/headers so it can be unit-tested.
 *
 * Behind a reverse proxy (sandbox preview, nginx, Vercel) the Host header Next sees
 * can be the *internal* one (localhost:3000) while the browser's Origin is the public
 * hostname — comparing those blindly 403s every legitimate login (bug A21). So the
 * first hop of X-Forwarded-Host is accepted alongside Host.
 */
export type OriginVerdict = "ok" | "absent" | "mismatch" | "malformed";

export function checkOrigin(
  origin: string | null,
  host: string | null,
  forwardedHost: string | null,
): OriginVerdict {
  if (!origin) return "absent"; // curl / same-origin fetch that omitted Origin
  const forwarded = forwardedHost?.split(",")[0].trim() || null;
  const accepted = new Set([forwarded, host].filter((h): h is string => !!h));
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return "malformed";
  }
  return accepted.has(originHost) ? "ok" : "mismatch";
}

/**
 * Second belt for CSRF now that the cookie is SameSite=None over HTTPS:
 * an HTML <form> can only POST as urlencoded / multipart / text/plain — and the
 * text/plain trick can smuggle a JSON-looking body. Every mutating route here
 * reads JSON, so a body that declares any other type is refused. A request with
 * NO content-type (fetch without a body, e.g. logout) is fine: forms always send one.
 */
export function contentTypeAcceptable(contentType: string | null, allowMultipart = false): boolean {
  if (!contentType) return true;
  const t = contentType.split(";")[0].trim().toLowerCase();
  return t === "application/json" || (allowMultipart && t === "multipart/form-data");
}

/**
 * D22: second CSRF layer. Modern browsers send Sec-Fetch-Site on every request; a value of
 * `cross-site` on a state-changing request is a forgery attempt even if Origin were spoofable.
 * Absent header (old browsers, curl) falls through to the Origin check — never the only gate.
 */
export function fetchSiteAcceptable(secFetchSite: string | null): boolean {
  if (!secFetchSite) return true;
  return secFetchSite !== "cross-site";
}
