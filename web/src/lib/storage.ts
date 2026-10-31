import crypto from "node:crypto";

/**
 * D4 / L-G8 / F12 — encrypted document storage WITHOUT a bucket.
 *
 * Bytes live in Postgres ("DocumentBlob", one row per file) encrypted with AES-256-GCM under a
 * key the database never sees (DOCUMENT_KEY env; derived from SESSION_SECRET when unset — the
 * health endpoint says which). Downloads go through short-lived signed links bound to the viewer.
 *
 * Why Postgres and not S3: the free stack has no bucket, the DB is already encrypted at rest and
 * covered by erasure/backups, and a 3 MB cap × 30 MB per patient keeps the 0.5 GB Neon plan sane.
 * Honest limits: no streaming (files are buffered), no key rotation yet (keyVersion column ready).
 */
export const MAX_FILE_BYTES = 3 * 1024 * 1024;      // Vercel serverless body limit is 4.5 MB
export const PATIENT_QUOTA_BYTES = 30 * 1024 * 1024;
export const LINK_TTL_S = 60;
export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

export function documentKeySource(): "env" | "derived" {
  return process.env.DOCUMENT_KEY ? "env" : "derived";
}

function key(): Buffer {
  const raw = process.env.DOCUMENT_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("DOCUMENT_KEY must be 32 bytes base64");
    return k;
  }
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET missing — cannot derive the document key");
  return Buffer.from(crypto.hkdfSync("sha256", secret, "citycare", "document-key-v1", 32));
}

/** Content sniffing — the declared type is a claim; the first bytes are the fact. */
export function sniffMime(bytes: Uint8Array): AllowedMime | null {
  if (bytes.length < 8) return null;
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf"; // %PDF-
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  return null;
}

export function encryptBlob(plain: Uint8Array): { iv: string; data: Buffer; sha256: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString("base64"), data: Buffer.concat([ct, tag]), sha256: crypto.createHash("sha256").update(plain).digest("hex") };
}

export function decryptBlob(data: Buffer, ivB64: string): Buffer {
  if (data.length < 16) throw new Error("blob too short");
  const ct = data.subarray(0, data.length - 16);
  const tag = data.subarray(data.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]); // throws on tampering
}

/** Signed download link: bound to document, viewer and expiry; nothing stored server-side. */
function linkKey(): Buffer {
  return crypto.createHmac("sha256", key()).update("download-link-v1").digest();
}
export function signDownload(documentId: string, uid: string, expUnix: number): string {
  return crypto.createHmac("sha256", linkKey()).update(`${documentId}.${uid}.${expUnix}`).digest("base64url");
}
export function verifyDownload(documentId: string, uid: string, expUnix: number, sig: string, nowMs = Date.now()): boolean {
  if (!Number.isInteger(expUnix) || expUnix * 1000 < nowMs) return false;
  if (expUnix * 1000 > nowMs + (LINK_TTL_S + 5) * 1000) return false; // a link cannot be minted for the far future
  const want = signDownload(documentId, uid, expUnix);
  const a = Buffer.from(want), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function safeFilename(title: string, mime: AllowedMime): string {
  const ext = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
  const base = title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "document";
  return `${base}.${ext}`;
}
