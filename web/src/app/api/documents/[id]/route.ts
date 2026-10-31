import { one, run, fail } from "@/lib/db";
import { handler, ok, err } from "@/lib/api";
import { getViewer, requireRole, guardSameOrigin } from "@/lib/session";
import { liveConsent } from "@/lib/consent";
import { appendAudit } from "@/lib/ledger";
import { decryptBlob, safeFilename, verifyDownload, type AllowedMime } from "@/lib/storage";

/**
 * GET /api/documents/[id]?exp=&sig= — the signed download. The link alone is not enough: the
 * session must belong to the user the link was minted for, and a doctor's consent is re-checked
 * at download time (a consent revoked 10 s after the link was issued means 403).
 */
export const GET = handler(async (req, { params }) => {
  const v = await getViewer();
  if (!v) return err(401, "auth_required", "sign in to download");
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const exp = Number(sp.get("exp"));
  const sig = sp.get("sig") ?? "";
  if (!verifyDownload(id, v.uid, exp, sig)) return err(403, "bad_link", "this download link is invalid or has expired — request a new one");
  const d = await one<{ patientId: string; title: string; mimeType: AllowedMime; encryptionIv: string; checksumSha256: string; data: Buffer }>(
    `SELECT d."patientId", d.title, d."mimeType", d."encryptionIv", d."checksumSha256", b.data
       FROM "Document" d JOIN "DocumentBlob" b ON b."documentId" = d.id WHERE d.id = $1 AND NOT d."isDeleted"`,
    [id],
  );
  if (!d) return err(404, "not_found", "no such document");
  if (v.role === "PATIENT") {
    if (d.patientId !== v.profileId) return err(403, "not_yours", "not your document");
  } else if (v.role === "DOCTOR") {
    const { verdict } = await liveConsent(d.patientId, v.profileId);
    if (!verdict.allowed || verdict.consent.scope !== "FULL_RECORD") return err(403, "no_consent", "consent is no longer live for this document");
  } else {
    return err(403, "wrong_role", "administrators cannot download patient files");
  }
  let plain: Buffer;
  try { plain = decryptBlob(d.data, d.encryptionIv); } catch { return err(500, "integrity_failure", "stored bytes failed authentication — the file was not served"); }
  const inline = d.mimeType !== "application/pdf" || sp.get("inline") === "1";
  return new Response(new Uint8Array(plain), {
    status: 200,
    headers: {
      "content-type": d.mimeType,
      "content-length": String(plain.length),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${safeFilename(d.title, d.mimeType)}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      "x-checksum-sha256": d.checksumSha256,
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});

/** DELETE /api/documents/[id] — owner only; bytes go immediately, the row is tombstoned for the ledger. */
export const DELETE = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  const { id } = await params;
  const d = await one<{ id: string }>(`UPDATE "Document" SET "isDeleted" = true WHERE id = $1 AND "patientId" = $2 AND NOT "isDeleted" RETURNING id`, [id, v.profileId]);
  if (!d) fail(404, "not_found", "no such document");
  await run(`DELETE FROM "DocumentBlob" WHERE "documentId" = $1`, [id]);
  await appendAudit(v.uid, "DELETE_DOC", "Patient", v.profileId, { meta: { documentId: id } }).catch(() => null);
  return ok({ id, deleted: true });
});
