import { all, one, run, tx, fail } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { appendAudit } from "@/lib/ledger";
import { rateLimit, BUCKETS } from "@/lib/ratelimit";
import { MAX_FILE_BYTES, PATIENT_QUOTA_BYTES, encryptBlob, sniffMime } from "@/lib/storage";

const TYPES = new Set(["PRESCRIPTION", "LAB_REPORT", "DISCHARGE_SUMMARY", "XRAY", "MRI", "CT_SCAN", "ULTRASOUND", "ECG", "VACCINATION_CARD", "BILL", "OTHER"]);

/** Patient-owned document list, with bounded filters and quota across all active files. */
export const GET = handler(async (req) => {
  const v = await requireRole("PATIENT");
  const sp = new URL(req.url).searchParams;
  let q = sp.get("q") ?? "";
  const searchHeader = req.headers.get("X-Document-Search");
  if (searchHeader !== null) {
    try { q = decodeURIComponent(searchHeader); } catch { fail(400, "bad_filter", "Invalid document filters."); }
  }
  const type = sp.get("type") ?? "";
  const pageRaw = sp.get("page") ?? "1";
  const limitRaw = sp.get("limit") ?? "100"; // preserve the previous default limit
  if (q.length > 140 || (type && !TYPES.has(type)) || !/^[1-9]\d*$/.test(pageRaw) || !/^[1-9]\d*$/.test(limitRaw)) fail(400, "bad_filter", "Invalid document filters.");
  const page = Number(pageRaw), limit = Number(limitRaw);
  if (!Number.isSafeInteger(page) || page > 500 || !Number.isSafeInteger(limit) || limit > 100) fail(400, "bad_filter", "Invalid document filters.");
  const [rows, quota] = await Promise.all([
    all<{ id: string; title: string; type: string; source: string; mimeType: string; sizeBytes: number; issuedOn: Date | null; createdAt: Date; sha: string }>(
      `SELECT id, title, type::text AS type, source::text AS source, "mimeType", "sizeBytes", "issuedOn", "createdAt", "checksumSha256" AS sha
         FROM "Document" WHERE "patientId"=$1 AND NOT "isDeleted"
          AND ($2 = '' OR strpos(lower(title), lower($2)) > 0)
          AND ($3 = '' OR type::text = $3)
        ORDER BY "createdAt" DESC, id DESC LIMIT $4 OFFSET $5`,
      [v.profileId, q.trim(), type, limit + 1, (page - 1) * limit],
    ),
    one<{ used: string }>(`SELECT COALESCE(sum("sizeBytes"), 0)::text AS used FROM "Document" WHERE "patientId"=$1 AND NOT "isDeleted"`, [v.profileId]),
  ]);
  const response = ok({
    documents: rows.slice(0, limit).map((r) => ({ ...r, issuedOn: r.issuedOn?.toISOString().slice(0, 10) ?? null, createdAt: r.createdAt.toISOString(), sha: r.sha.slice(0, 16) })),
    page, hasMore: rows.length > limit,
    quota: { usedBytes: Number(quota?.used ?? 0), maxBytes: PATIENT_QUOTA_BYTES, maxFileBytes: MAX_FILE_BYTES },
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});

/**
 * POST /api/patient/documents  (multipart: file, title, type, issuedOn?)
 * Sniffed type wins over the declared one; bytes are AES-256-GCM encrypted before they touch the
 * database; the sha-256 of the plaintext is stored so a download can be checked against it.
 */
export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowMultipart: true });
  const v = await requireRole("PATIENT");
  await rateLimit(BUCKETS.upload, v.uid);
  const form = await req.formData().catch(() => null);
  if (!form) fail(400, "bad_form", "multipart/form-data expected");
  const file = form.get("file");
  if (!(file instanceof File)) fail(400, "file_required", "attach a file");
  if (file.size === 0) fail(400, "empty_file", "the file is empty");
  if (file.size > MAX_FILE_BYTES) fail(413, "file_too_large", `max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB per file`);
  const title = String(form.get("title") ?? file.name ?? "").trim().slice(0, 140);
  if (title.length < 2) fail(400, "title_required", "give the document a title");
  const type = String(form.get("type") ?? "OTHER");
  if (!TYPES.has(type)) fail(400, "bad_type", "unknown document type");
  const issuedOnRaw = String(form.get("issuedOn") ?? "").trim();
  const issuedOn = issuedOnRaw ? new Date(issuedOnRaw) : null;
  if (issuedOn && (Number.isNaN(issuedOn.getTime()) || issuedOn > new Date())) fail(400, "bad_date", "issue date must be a past date");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) fail(415, "unsupported_type", "only PDF, JPEG and PNG files are accepted (checked by content, not by name)");

  const used = await one<{ n: number }>(`SELECT COALESCE(sum("sizeBytes"), 0)::int AS n FROM "Document" WHERE "patientId" = $1 AND NOT "isDeleted"`, [v.profileId]);
  if ((used?.n ?? 0) + bytes.length > PATIENT_QUOTA_BYTES) fail(413, "quota_exceeded", `storage limit is ${Math.round(PATIENT_QUOTA_BYTES / 1024 / 1024)} MB per patient — delete something first`);

  const enc = encryptBlob(bytes);
  const id = await tx(async (c) => {
    const d = await one<{ id: string }>(
      `INSERT INTO "Document" (id, "patientId", type, source, title, "issuedOn", "storageKey", "encryptionIv", "mimeType", "sizeBytes", "checksumSha256", "ocrStatus", "uploadedByUserId", "createdAt")
       VALUES (gen_random_uuid()::text, $1, $2::"DocumentType", 'PATIENT_UPLOAD', $3, $4, 'pg', $5, $6, $7, $8, 'SKIPPED', $9, now()) RETURNING id`,
      [v.profileId, type, title, issuedOn, enc.iv, mime, bytes.length, enc.sha256, v.uid], c,
    );
    await run(`INSERT INTO "DocumentBlob" ("documentId", data) VALUES ($1, $2)`, [d!.id, enc.data], c);
    return d!.id;
  });
  await appendAudit(v.uid, "UPLOAD_DOC", "Patient", v.profileId, { meta: { documentId: id, type, mime, bytes: bytes.length, sha256: enc.sha256.slice(0, 16) } }).catch(() => null);
  return ok({ id, title, type, mimeType: mime, sizeBytes: bytes.length, sha256: enc.sha256 }, 201);
});
