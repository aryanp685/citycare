import { one, fail } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { liveConsent } from "@/lib/consent";
import { appendAudit } from "@/lib/ledger";
import { LINK_TTL_S, signDownload } from "@/lib/storage";

/**
 * POST /api/documents/[id]/link → { url, expiresAt }  (60-second signed link, bound to the caller)
 *   patient: own (or managed dependent's) file
 *   doctor : only under a live FULL_RECORD consent or a break-glass override — the scope filter that
 *            hides documents from SUMMARY/LAST_N/SPECIFIC views is enforced here too, and the
 *            issuance is ledgered as DOWNLOAD_DOC against the consent.
 */
export const POST = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const v = await requireRole(["PATIENT", "DOCTOR"]);
  const { id } = await params;
  const d = await one<{ id: string; patientId: string }>(`SELECT id, "patientId" FROM "Document" WHERE id = $1 AND NOT "isDeleted"`, [id]);
  if (!d) fail(404, "not_found", "no such document");
  let consentId: string | null = null;
  if (v.role === "PATIENT") {
    if (d.patientId !== v.profileId) fail(404, "not_found", "no such document"); // same answer as "does not exist": no existence oracle across patients
  } else {
    const { verdict } = await liveConsent(d.patientId, v.profileId);
    if (!verdict.allowed) {
      await appendAudit(v.uid, "VIEW_DENIED", "Patient", d.patientId, { meta: { what: "document", documentId: id, reason: verdict.reason } }).catch(() => null);
      fail(403, "no_consent", `No live consent: ${verdict.reason}`);
    }
    if (verdict.consent.scope !== "FULL_RECORD") fail(403, "scope_excludes_documents", `Consent scope ${verdict.consent.scope} does not include documents`);
    consentId = verdict.consent.id;
  }
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_S;
  const sig = signDownload(d.id, v.uid, exp);
  await appendAudit(v.uid, "DOWNLOAD_DOC", "Patient", d.patientId, { consentId, meta: { documentId: d.id } }).catch(() => null);
  return ok({ url: `/api/documents/${d.id}?exp=${exp}&sig=${sig}`, expiresAt: new Date(exp * 1000).toISOString() });
});
