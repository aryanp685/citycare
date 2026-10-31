import { one, run, tx, fail } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { HandoverSchema } from "@/lib/validate";
import { hashPassword } from "@/lib/auth";
import { appendAudit } from "@/lib/ledger";
import { notify } from "@/lib/notify";
import { isMinor } from "@/lib/legal";
import { rateLimit, BUCKETS } from "@/lib/ratelimit";

/**
 * POST /api/patient/dependents/[id]/handover {email, phone, password} — D49 / F13-b.
 * When a dependent turns 18 the guardian hands the account over: the young adult's own login is
 * created on the SAME user row (history intact), the guardian link is severed, and — deliberately —
 * no policy acceptance is copied: at first sign-in the L2 gate makes the new adult read and accept
 * the notice personally (DPDP s.6: consent must be theirs, not the parent's, once they are 18).
 */
export const POST = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  if (v.actingFor) fail(403, "no_nesting", "Switch back to your own account first");
  await rateLimit(BUCKETS.dependents, v.uid);
  const { id } = await params;
  const b = parseBody(HandoverSchema, await req.json().catch(() => ({})));
  const dep = await one<{ id: string; userId: string; fullName: string; dateOfBirth: Date | null }>(
    `SELECT d.id, d."userId", d."fullName", d."dateOfBirth" FROM "Patient" d JOIN "Patient" g ON g.id = d."guardianPatientId"
      WHERE d.id = $1 AND g."userId" = $2 AND d."fullName" <> '[REDACTED]'`,
    [id, v.uid],
  );
  if (!dep) fail(404, "not_your_dependent", "no such dependent on your account");
  if (!dep.dateOfBirth || isMinor(dep.dateOfBirth)) fail(409, "still_a_minor", "Handover is possible once the dependent is 18");
  const clash = await one<{ id: string }>(`SELECT id FROM "User" WHERE lower(email) = $1 OR phone = $2`, [b.email, b.phone]);
  if (clash) fail(409, "email_or_phone_taken", "That email or phone is already registered");
  const hash = await hashPassword(b.password);
  await tx(async (c) => {
    await run(`UPDATE "User" SET email = $2, phone = $3, "passwordHash" = $4, "emailVerifiedAt" = NULL, "updatedAt" = now() WHERE id = $1`, [dep.userId, b.email, b.phone, hash], c);
    await run(`UPDATE "Patient" SET "guardianPatientId" = NULL, "guardianRelation" = NULL, "updatedAt" = now() WHERE id = $1`, [dep.id], c);
    await run(`UPDATE "Session" SET "revokedAt" = now() WHERE "actingForPatientId" = $1 AND "revokedAt" IS NULL`, [dep.id], c);
    // The guardian's acceptance was given on behalf of a child (r.10). An adult must read and
    // accept the notice personally — withdrawing it makes their first sign-in a 428 re-consent.
    await run(`UPDATE "PolicyAcceptance" SET "withdrawnAt" = now() WHERE "userId" = $1 AND "withdrawnAt" IS NULL`, [dep.userId], c);
  });
  await appendAudit(v.uid, "DEPENDENT_HANDOVER", "Patient", dep.id, { meta: { toEmail: b.email } }).catch(() => null);
  await notify(dep.userId, { title: "This account is now yours", body: "Your guardian handed over the record. At first sign-in you will be asked to read and accept the privacy notice yourself.", href: "/legal/privacy", severity: "INFO" }).catch(() => null);
  return ok({ id: dep.id, handedOver: true, email: b.email });
});
