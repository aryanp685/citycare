import { requireRole, guardSameOrigin } from "@/lib/session";
import { handler, ok } from "@/lib/api";
import { one, run } from "@/lib/db";
import { appendAudit } from "@/lib/ledger";

/** One-tap confirmation: DRAFT -> real record row. Patient-owned action. */
export const PATCH = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  const { id } = await params;

  const row = await one<{ id: string; notes: string | null }>(
    `SELECT id, notes FROM "Medication" WHERE id = $1 AND "patientId" = $2`,
    [id, v.profileId],
  );
  if (!row) return ok({ error: "medication not found", code: "not_found" }, 404);
  if (!row.notes?.startsWith("DRAFT:")) {
    return ok({ error: "this row is not a draft — nothing to confirm", code: "not_draft" }, 400);
  }

  await run(`UPDATE "Medication" SET notes = NULL WHERE id = $1`, [row.id]);
  await appendAudit(v.uid, "CONFIRM_MED_DRAFT", "Patient", v.profileId, { meta: { medicationId: row.id } });
  return ok({ confirmed: true });
});
