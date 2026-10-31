import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { sniffMime, encryptBlob, decryptBlob, signDownload, verifyDownload, safeFilename, documentKeySource, MAX_FILE_BYTES } from "../storage";

beforeAll(() => {
  process.env.DOCUMENT_KEY = crypto.randomBytes(32).toString("base64");
});

describe("document storage (D4 / L-G8)", () => {
  it("sniffs the real type from magic bytes, not the client's content-type", () => {
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7 xxxx"))).toBe("application/pdf");
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]))).toBe("image/png");
    expect(sniffMime(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull(); // HTML never becomes a stored file
    expect(sniffMime(new Uint8Array([0x25, 0x50]))).toBeNull();
  });
  it("round-trips through AES-256-GCM and refuses a tampered byte", () => {
    const plain = crypto.randomBytes(5000);
    const sealed = encryptBlob(plain);
    expect(sealed.sha256).toBe(crypto.createHash("sha256").update(plain).digest("hex"));
    expect(Buffer.compare(decryptBlob(sealed.data, sealed.iv), Buffer.from(plain))).toBe(0);
    const bad = Buffer.from(sealed.data); bad[10] ^= 0x01;
    expect(() => decryptBlob(bad, sealed.iv)).toThrow();
  });
  it("never reuses a nonce for the same plaintext", () => {
    const p = new TextEncoder().encode("%PDF-same");
    expect(encryptBlob(p).iv).not.toBe(encryptBlob(p).iv);
  });
  it("download links are bound to document + viewer + expiry and die after 60 s", () => {
    const now = Date.UTC(2026, 8, 29, 10, 0, 0);
    const exp = Math.floor(now / 1000) + 60;
    const sig = signDownload("doc1", "u1", exp);
    expect(verifyDownload("doc1", "u1", exp, sig, now)).toBe(true);
    expect(verifyDownload("doc2", "u1", exp, sig, now)).toBe(false);
    expect(verifyDownload("doc1", "u2", exp, sig, now)).toBe(false);
    expect(verifyDownload("doc1", "u1", exp, sig, now + 61_000)).toBe(false);
    expect(verifyDownload("doc1", "u1", exp + 3600, signDownload("doc1", "u1", exp + 3600), now)).toBe(false); // far-future links are rejected even if correctly signed
  });
  it("reports where the key comes from and caps files under Vercel's body limit", () => {
    expect(documentKeySource()).toBe("env");
    expect(MAX_FILE_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
  it("builds a safe Content-Disposition filename from any title", () => {
    expect(safeFilename('../../etc/passwd"; rm -rf', "application/pdf")).toBe("etcpasswd_rm_-rf.pdf");
    expect(safeFilename("   ", "image/png")).toBe("document.png");
  });
});
