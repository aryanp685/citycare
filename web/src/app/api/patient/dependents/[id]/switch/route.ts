import { cookies } from "next/headers";
import { one, fail } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { createSession, revokeSession } from "@/lib/sessions";
import { SESSION_COOKIE, sessionCookieOpts } from "@/lib/auth";
import { appendAudit } from "@/lib/ledger";

/** POST /api/patient/dependents/[id]/switch — act as the dependent (new server session; the old one is revoked). */
export const POST = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  const { id } = await params;
  const dep = await one<{ id: string; fullName: string }>(
    `SELECT d.id, d."fullName" FROM "Patient" d JOIN "Patient" g ON g.id = d."guardianPatientId"
      WHERE d.id = $1 AND g."userId" = $2 AND d."fullName" <> '[REDACTED]'`,
    [id, v.uid],
  );
  if (!dep) fail(404, "not_your_dependent", "no such dependent on your account");
  await revokeSession(v.sid);
  const { token } = await createSession({ uid: v.uid, role: "PATIENT", profileId: dep.id, actingFor: dep.id, userAgent: req.headers.get("user-agent") });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOpts(req));
  await appendAudit(v.uid, "DEPENDENT_SWITCH", "Patient", dep.id).catch(() => null);
  return ok({ actingFor: dep.id, name: dep.fullName });
});
