import { requireRole, guardSameOrigin } from "@/lib/session";
import { handler, ok, parseBody } from "@/lib/api";
import { one, run, tx, fail } from "@/lib/db";
import { appendAudit } from "@/lib/ledger";
import { z } from "zod";

const StatusSchema = z.object({ status: z.enum(["CHECKED_IN", "COMPLETED", "CANCELLED_BY_DOCTOR", "NO_SHOW"]) });

const ALLOWED: Record<string, string[]> = {
  CONFIRMED: ["CHECKED_IN", "CANCELLED_BY_DOCTOR", "NO_SHOW"],
  CHECKED_IN: ["COMPLETED", "NO_SHOW"],
  PENDING: ["CONFIRMED", "CANCELLED_BY_DOCTOR", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED_BY_PATIENT: [],
  CANCELLED_BY_DOCTOR: [],
  NO_SHOW: [],
  RESCHEDULED: ["CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED_BY_DOCTOR", "NO_SHOW"],
};

export const PATCH = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const v = await requireRole("DOCTOR");
  const { id } = await params;
  const body = parseBody(StatusSchema, await req.json().catch(() => ({})));

  await tx(async (c) => {
    const appt = await one<{ status: string; "patientId": string; "consentId": string | null }>(
      `SELECT status, "patientId", "consentId" FROM "Appointment" WHERE id=$1 AND "doctorId"=$2 FOR UPDATE`,
      [id, v.profileId], c,
    );
    if (!appt) fail(404, "not_found", "appointment not found");
    const okNext = ALLOWED[appt!.status] ?? [];
    if (!okNext.includes(body.status)) {
      fail(409, "bad_transition", `cannot go ${appt!.status} -> ${body.status}`);
    }
    // a cancelled / no-show patient no longer occupies a queue token — release it
    const relToken = body.status === "CANCELLED_BY_DOCTOR" || body.status === "NO_SHOW";
    await run(
      `UPDATE "Appointment" SET status=$2, "tokenNo" = ${relToken ? "NULL" : "\"tokenNo\""}, "updatedAt"=now() WHERE id=$1`,
      [id, body.status], c,
    );
    await appendAudit(v.uid, `APPT_${body.status}`, "Patient", appt!.patientId, { q: c, meta: { appointmentId: id } });

    // auto-revoke the visit consent when the visit ends — patient's own toggle default
    if (body.status === "COMPLETED" && appt.consentId) {
      const p = await one<{ auto: boolean }>(`SELECT "autoRevokeAfterVisit" AS auto FROM "Patient" WHERE id=$1`, [appt!.patientId], c);
      if (p?.auto) {
        const closed = await run(
          `UPDATE "Consent" SET status='REVOKED', "revokedAt"=now(), "revocationReason"='visit completed; auto-revoke is ON (patient setting)'
            WHERE id=$1 AND status='APPROVED'`,
          [appt.consentId], c,
        );
        if (closed > 0) {
          await appendAudit(v.uid, "AUTO_REVOKE_CONSENT", "Consent", appt.consentId, { q: c, consentId: appt.consentId, meta: { note: "patient-set default" } });
        }
      }
    }
  });
  return ok({ status: body.status });
});
