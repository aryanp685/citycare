import { one, run, tx, fail } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { VerifyDoctorSchema } from "@/lib/validate";
import { appendAudit } from "@/lib/ledger";
import { notify } from "@/lib/notify";

/**
 * POST /api/admin/doctors/[id]/verify  { decision: APPROVE|REJECT, note? }
 * F1. The single moment a doctor becomes bookable. Ledger + notification, in one transaction.
 */
export const POST = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const admin = await requireRole("SUPER_ADMIN");
  const { id } = await params;
  const body = parseBody(VerifyDoctorSchema, await req.json().catch(() => ({})));

  const d = await one<{ id: string; userId: string; fullName: string; isVerified: boolean; registrationNo: string | null }>(
    `SELECT id, "userId", "fullName", "isVerified", "registrationNo" FROM "Doctor" WHERE id = $1`,
    [id],
  );
  if (!d) fail(404, "no_doctor", "doctor not found");
  if (body.decision === "REJECT" && !body.note) fail(400, "note_required", "Give the doctor a reason for the rejection");

  await tx(async (c) => {
    if (body.decision === "APPROVE") {
      const attestation = `Checked ${body.register} on ${new Date().toISOString().slice(0, 10)}: name and registration number matched (admin attestation, not an API lookup).${body.note ? " " + body.note : ""}`;
      await run(
        `UPDATE "Doctor" SET "isVerified"=true, "verifiedAt"=now(), "verifiedBy"=$2, "rejectedAt"=NULL, "verificationNote"=$3 WHERE id=$1`,
        [d!.id, admin.uid, attestation], c,
      );
    } else {
      await run(
        `UPDATE "Doctor" SET "isVerified"=false, "verifiedAt"=NULL, "verifiedBy"=$2, "rejectedAt"=now(), "verificationNote"=$3 WHERE id=$1`,
        [d!.id, admin.uid, body.note ?? null], c,
      );
    }
    await appendAudit(admin.uid, body.decision === "APPROVE" ? "DOCTOR_VERIFIED" : "DOCTOR_REJECTED", "Doctor", d!.id, {
      meta: { registrationNo: d!.registrationNo, note: body.note ?? null, register: body.register ?? null, attested: body.attested ?? null }, q: c,
    });
    await notify(d!.userId, body.decision === "APPROVE"
      ? { title: "Registration verified", body: `Your registration ${d!.registrationNo ?? ""} has been verified. Patients can now find and book you.`, href: "/doctor", severity: "INFO" }
      : { title: "Registration not approved", body: body.note ?? "Please contact the CityCare admin.", href: "/doctor", severity: "WARNING" }, c);
  });

  return ok({ doctorId: d!.id, decision: body.decision, isVerified: body.decision === "APPROVE" });
});
