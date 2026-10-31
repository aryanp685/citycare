import { requireRole } from "@/lib/session";
import { patientById, recordSections } from "@/lib/repo";
import { toFhirBundle } from "@/lib/fhir";
import { appendAudit } from "@/lib/ledger";
import { handler } from "@/lib/api";
import { fail } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/patient/fhir — the patient downloads their own record as a FHIR R4 Bundle (DPDP right to portability; ABDM format). */
export const GET = handler(async () => {
  const v = await requireRole("PATIENT");
  const p = await patientById(v.profileId);
  if (!p) fail(404, "no_profile", "patient profile missing");
  const sections = await recordSections(v.profileId);
  const bundle = toFhirBundle(p as Parameters<typeof toFhirBundle>[0], sections);
  await appendAudit(v.uid, "EXPORT_FHIR", "Patient", v.profileId, { meta: { resources: bundle.total } });
  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/fhir+json; charset=utf-8",
      "content-disposition": `attachment; filename="citycare-${v.profileId.slice(0, 8)}-fhir-r4.json"`,
      "cache-control": "no-store",
    },
  });
});
