import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE, type SessionPayload } from "./auth";
import { one, fail } from "./db";
import { checkOrigin, contentTypeAcceptable, fetchSiteAcceptable } from "./origin";
import { homeFor, type Role } from "./roles";
import { PRIVACY_NOTICE_VERSION } from "./legal";
import { SESSION_DAYS, SESSION_MAX_DAYS } from "./sessions";

/**
 * WHO is making this request — verified server-side, on every call.
 * The cookie tells us who they claim to be; the DB says whether they still
 * exist and are ACTIVE (a purged/suspended user's old cookie must not work).
 */
async function loadViewer(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;

  // One round trip: is the user still ACTIVE *and* is this particular session still live (D21)?
  // D52: the same statement slides the idle deadline forward at most once an hour (a data-modifying
  // CTE runs even though nothing reads from it), capped at createdAt + SESSION_MAX_DAYS.
  const row = await one<{ status: string; live: boolean }>(
    `WITH touched AS (
       UPDATE "Session" SET "lastSeenAt" = now(),
              "expiresAt" = LEAST("createdAt" + make_interval(days => $4), GREATEST("expiresAt", now() + make_interval(days => $3)))
        WHERE id = $2::uuid AND "userId" = $1 AND "revokedAt" IS NULL AND "expiresAt" > now()
          AND "lastSeenAt" < now() - interval '1 hour'
        RETURNING id)
     SELECT u.status,
            (s.id IS NOT NULL AND s."revokedAt" IS NULL AND s."expiresAt" > now()) AS live
       FROM "User" u
       LEFT JOIN "Session" s ON s.id = $2::uuid AND s."userId" = u.id
      WHERE u.id = $1`,
    [session.uid, session.sid, SESSION_DAYS, SESSION_MAX_DAYS],
  );
  if (!row || row.status !== "ACTIVE" || !row.live) return null;
  return session;
}
/** Memoised per request (React cache): layouts, guards and handlers share one lookup. */
export const getViewer = cache(loadViewer);

/**
 * L2 (DPDP s.6 — consent must be informed for the CURRENT notice): has this user accepted the
 * notice version that is live right now? Memoised per request like getViewer.
 */
export const consentStatus = cache(async (uid: string): Promise<{ current: boolean; accepted: string | null }> => {
  const r = await one<{ v: string | null }>(
    `SELECT max(version) AS v FROM "PolicyAcceptance" WHERE "userId" = $1 AND "policyKey" = 'privacy-notice' AND "withdrawnAt" IS NULL`,
    [uid],
  );
  const accepted = r?.v ?? null;
  return { current: accepted !== null && accepted >= PRIVACY_NOTICE_VERSION, accepted };
});

export async function requireRole(role: Role | Role[]): Promise<SessionPayload> {
  const v = await getViewer();
  if (!v) fail(401, "auth_required", "Sign in first");
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(v.role)) fail(403, "wrong_role", `This action is for ${allowed.join("/")} accounts only`);
  return v;
}

/**
 * F1: a doctor account exists the moment it signs up, but it can do nothing clinical until an
 * admin has checked the registration number. Booking, consent, record access and break-glass
 * all pass through here, so a rejected/pending doctor gets 403 everywhere at once.
 */
export async function requireVerifiedDoctor(v: SessionPayload): Promise<void> {
  const d = await one<{ isVerified: boolean; rejectedAt: Date | null }>(
    `SELECT "isVerified", "rejectedAt" FROM "Doctor" WHERE id = $1`,
    [v.profileId],
  );
  if (!d) fail(404, "no_profile", "doctor profile missing");
  if (!d.isVerified) {
    fail(403, "doctor_unverified", d.rejectedAt
      ? "Your registration was not approved. Contact the CityCare admin."
      : "Your registration is pending verification. Patients cannot book you yet.");
  }
}

/**
 * CSRF posture (updated with A20): over HTTPS the session cookie is now
 * SameSite=None (it has to be, for the app to work inside a cross-site iframe),
 * so the browser WILL attach it to a cross-site POST. That makes this check
 * load-bearing, not defence-in-depth:
 *   1. Origin must match Host / X-Forwarded-Host (browsers always send Origin on
 *      cross-site POSTs; "Origin: null" parses as malformed → 403).
 *   2. A request body must be application/json — HTML forms cannot send that,
 *      which also closes the text/plain JSON-smuggling trick.
 * Over plain http (local dev) the cookie is still Lax, so both belts apply on top.
 * A production deploy would add per-form CSRF tokens as a third layer (D-list).
 */
export async function guardSameOrigin(req: Request, opts: { allowStaleConsent?: boolean; allowMultipart?: boolean } = {}): Promise<void> {
  if (!fetchSiteAcceptable(req.headers.get("sec-fetch-site"))) fail(403, "csrf_fetch_site", "cross-site request refused");
  const verdict = checkOrigin(
    req.headers.get("origin"),
    req.headers.get("host"),
    req.headers.get("x-forwarded-host"),
  );
  if (verdict === "mismatch") fail(403, "csrf_origin", "cross-origin form submission refused");
  if (verdict === "malformed") fail(403, "csrf_origin", "malformed Origin header");
  if (!contentTypeAcceptable(req.headers.get("content-type"), opts.allowMultipart)) {
    fail(415, "json_only", opts.allowMultipart ? "request body must be application/json or multipart/form-data" : "request body must be application/json");
  }
  // L2: state-changing requests by a signed-in user require consent to the CURRENT notice.
  // Exempt by design (withdrawal must stay as easy as consent — DPDP s.6(4)): logout, erasure,
  // and the acceptance endpoint itself. Reads are never blocked (access is a right, s.11).
  if (!opts.allowStaleConsent) {
    const v = await getViewer();
    if (v) {
      const c = await consentStatus(v.uid);
      if (!c.current) {
        fail(428, "consent_outdated", "The privacy notice has changed. Please review and accept the current version to continue.", {
          current: PRIVACY_NOTICE_VERSION,
          accepted: c.accepted,
          href: "/legal/privacy",
        });
      }
    }
  }
}

export function clientMeta(req: Request) {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    ua: req.headers.get("user-agent")?.slice(0, 200) ?? null,
  };
}

export function requestUrl(req: Request): string {
  return new URL(req.url).pathname;
}

export const _headersHelper = headers; // keep import used if extended later

/** For RSC pages: never throw API-style errors — redirect instead.
 *  Typed to return non-null because redirect() is `never` for the compiler. */
export async function viewerForPage(role: Role | Role[]): Promise<NonNullable<Awaited<ReturnType<typeof getViewer>>>> {
  const v = await getViewer();
  if (!v) {
    redirect("/login");
    throw new Error("unreachable"); // helps no one at runtime, satisfies strict flow analysis anyway
  }
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(v.role)) {
    redirect(homeFor(v.role));
    throw new Error("unreachable");
  }
  return v;
}
