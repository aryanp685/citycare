import { cookies } from "next/headers";
import { one, fail } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { createSession, revokeSession } from "@/lib/sessions";
import { SESSION_COOKIE, sessionCookieOpts } from "@/lib/auth";

/** POST /api/patient/dependents/switch-back — return to the guardian's own profile. */
export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowStaleConsent: true });
  const v = await requireRole("PATIENT");
  if (!v.actingFor) return ok({ actingFor: null, unchanged: true });
  const own = await one<{ id: string }>(`SELECT id FROM "Patient" WHERE "userId" = $1 AND "guardianPatientId" IS NULL`, [v.uid]);
  if (!own) fail(404, "no_profile", "guardian profile missing");
  await revokeSession(v.sid);
  const { token } = await createSession({ uid: v.uid, role: "PATIENT", profileId: own.id, userAgent: req.headers.get("user-agent") });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOpts(req));
  return ok({ actingFor: null });
});
