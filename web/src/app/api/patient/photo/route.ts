import { requireRole, guardSameOrigin } from "@/lib/session";
import { handler, ok, parseBody } from "@/lib/api";
import { PhotoSchema } from "@/lib/validate";
import { backfillFromPhotos } from "@/lib/onboard";
import { one, all, run, tx } from "@/lib/db";
import { patientById } from "@/lib/repo";
import { appendAudit } from "@/lib/ledger";

/**
 * Paste-OCR path for old prescriptions. Everything lands as a DRAFT
 * (notes = 'DRAFT:<line>') — drafts are excluded from the rule engine and
 * from the doctor's view until the patient confirms, one row at a time.
 */
export const POST = handler(async (req) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  const body = parseBody(PhotoSchema, await req.json().catch(() => ({})));
  const p = await patientById(v.profileId);
  if (!p) return ok({ error: "profile missing", code: "no_profile" }, 404);

  const parsed = backfillFromPhotos([body.ocrText]);

  const existing = await all<{ k: string }>(
    `SELECT lower(name) AS k FROM "Medication" WHERE "patientId"=$1 AND "isActive"`,
    [p.id],
  );
  const have = new Set(existing.map((x) => x.k));

  let inserted = 0;
  const skippedExisting: string[] = [];
  await tx(async (c) => {
    for (const m of parsed.draftMedications) {
      if (have.has(m.name.toLowerCase())) {
        skippedExisting.push(m.name);
        continue;
      }
      const dup = await one(
        `SELECT id FROM "Medication" WHERE "patientId"=$1 AND "isActive" AND lower(name)=lower($2) AND notes LIKE 'DRAFT:%'`,
        [p.id, m.name],
        c,
      );
      if (dup) { skippedExisting.push(m.name); continue; }
      await run(
        `INSERT INTO "Medication" (id, "patientId", name, dosage, frequency, "isActive", notes)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5)`,
        [p.id, m.name, m.dosage ?? null, m.frequency ?? null, `DRAFT:${m.sourceLine}`],
        c,
      );
      inserted++;
    }
    if (inserted > 0) {
      await run(
        `INSERT INTO "Notification" (id, "userId", channel, title, body, "isRead", "createdAt")
         VALUES (gen_random_uuid(), $1, 'IN_APP', 'Prescription drafts ready to confirm',
                 $2, false, now())`,
        [v.uid, `${inserted} medication draft(s) from your photo need one-tap confirmation.`],
        c,
      );
    }
  });

  await appendAudit(v.uid, "MEDS_DRAFTED_FROM_PHOTO", "Patient", p.id, { meta: { inserted, confidence: parsed.parseConfidence } });

  return ok({
    draftsInserted: inserted,
    skippedAlreadyPresent: skippedExisting,
    unparseableLines: parsed.unparseableLines,
    parseConfidence: parsed.parseConfidence,
    requiresConfirmation: true,
    note: parsed.note,
  });
});
