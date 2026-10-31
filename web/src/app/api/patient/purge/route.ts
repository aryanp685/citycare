import { requireRole, guardSameOrigin } from "@/lib/session";
import { handler, ok, parseBody } from "@/lib/api";
import { PurgeSchema } from "@/lib/validate";
import { tx, one, fail } from "@/lib/db";
import { revokeAllSessions, createSession } from "@/lib/sessions";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionCookieOpts } from "@/lib/auth";
import { erasePatientData } from "@/lib/erasure";
import { appendAudit } from "@/lib/ledger";
import { appendSessionExpiry } from "@/lib/auth";
import { fmtIstDateTime } from "@/lib/repo";

/**
 * DPDP "right to erasure", implemented the way it can honestly be done on a
 * platform that is NOT the treating hospital:
 *   - everything the PATIENT contributed to CityCare is deleted,
 *   - clinical prose the DOCTOR wrote on CityCare is redacted,
 *   - rows that must exist for the doctor's own statutory record-keeping stay
 *     but become anonymous shells,
 *   - the AUDIT LEDGER SURVIVES, because it is the patient's own evidence of
 *     who held their data and when it was destroyed. Deleting the proof would
 *     defeat the purpose.
 * The hospital's own copies were never in CityCare's hands (documented, not
 * pretend-deleted).
 */
const CONFIRM = "DELETE MY CITYCARE DATA";

export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowStaleConsent: true }); // erasure = withdrawal; never gated behind re-consent (DPDP s.6(4))
  const v = await requireRole("PATIENT");
  const body = parseBody(PurgeSchema, await req.json().catch(() => ({})));
  if (body.confirmPhrase !== CONFIRM) {
    return ok({ error: `Type the confirmation phrase exactly: "${CONFIRM}"`, code: "confirm_mismatch" }, 400);
  }
  const pid = v.profileId;

  // F13: when a guardian erases a dependent, the dependent's own (login-less) user is anonymised,
  // the guardian's account is untouched and the guardian is switched back to their own profile.
  const owner = await one<{ userId: string }>(`SELECT "userId" FROM "Patient" WHERE id = $1`, [pid]);
  if (!owner) fail(404, "no_profile", "patient profile missing");
  const report = await tx(async (c) => {
    const r = await erasePatientData(c, pid, owner.userId);
    await revokeAllSessions(owner.userId, c);
    return r;
  });

  // AFTER anonymisation: the ledger entry is the patient's receipt.
  const doneAt = new Date();
  await appendAudit(v.uid, "DATA_ERASED", "Patient", pid, { meta: { at: doneAt.toISOString() } }).catch(() => null);

  const res = ok({
    erased: true,
    at: doneAt.toISOString(),
    atLocal: fmtIstDateTime(doneAt),
    deletedRows: report,
    retained: {
      auditLedger: "kept deliberately — it is your proof of who accessed your record and when it was destroyed",
      anonymousShells: "doctor-side encounter stubs kept for the clinician's own statutory record (NMC/MCI Ethics Reg. 1.3.1: 3 years; DGHS manual: up to 10 years); they no longer identify you",
    },
  });
  if (v.actingFor) {
    // guardian stays signed in as themself
    const own = await one<{ id: string }>(`SELECT id FROM "Patient" WHERE "userId" = $1 AND "guardianPatientId" IS NULL`, [v.uid]);
    if (own) {
      const { token } = await createSession({ uid: v.uid, role: "PATIENT", profileId: own.id, userAgent: req.headers.get("user-agent") });
      (await cookies()).set(SESSION_COOKIE, token, sessionCookieOpts(req));
      await appendAudit(v.uid, "DEPENDENT_ERASED", "Patient", pid).catch(() => null);
      return res;
    }
  }
  appendSessionExpiry(res, req); // their own cookie dies with their account
  return res;
});
