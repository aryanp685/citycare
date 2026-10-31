import { requireRole, guardSameOrigin } from "@/lib/session";
import { handler, ok } from "@/lib/api";
import { recordSections } from "@/lib/repo";
import { buildSeries } from "@/lib/trends";
import { appendAudit } from "@/lib/ledger";

/**
 * F18 — logs the patient's print/PDF export of their own visit summary.
 * The summary itself is rendered by the page (RSC) from the same recordSections data;
 * this endpoint exists so the EXPORT ACT is on the tamper-evident ledger, exactly like
 * EXPORT_FHIR. The doctor's side needs no endpoint: their read is already logged
 * (VIEW_RECORD with the consent scope) on every record fetch.
 */
export const POST = handler(async (req) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  const rec = await recordSections(v.profileId);
  const series = buildSeries(
    rec.observations.map((o) => ({ name: o.name, valueNum: o.valueNum, unit: o.unit, refLow: o.refLow, refHigh: o.refHigh, takenOn: o.takenOn })),
  );
  await appendAudit(v.uid, "EXPORT_PRINT_SUMMARY", "Patient", v.profileId, {
    meta: { series: series.length, labs: rec.labs.length, allergies: rec.allergies.length },
  }).catch(() => null);
  return ok({ logged: true });
});
