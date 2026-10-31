import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { anchorDigest, generateSigningKey, signingKeys, verifyAnchorSignature } from "../anchors";

describe("ledger anchors (D13)", () => {
  it("digest commits to seq AND head hash", () => {
    const a = anchorDigest("10", "aa".repeat(32)), b = anchorDigest("11", "aa".repeat(32)), c = anchorDigest("10", "bb".repeat(32));
    expect(a.equals(b)).toBe(false); expect(a.equals(c)).toBe(false); expect(a.length).toBe(32);
  });
  it("a generated key signs and verifies; a foreign key or altered digest fails", () => {
    process.env.ANCHOR_SIGNING_KEY = generateSigningKey();
    const k = signingKeys()!;
    expect(k.pubB64.length).toBeGreaterThan(40);
    const d = anchorDigest("42", "cd".repeat(32));
    const sig = crypto.sign(null, d, k.priv).toString("base64");
    expect(verifyAnchorSignature(d.toString("hex"), sig, k.pubB64)).toBe(true);
    expect(verifyAnchorSignature(anchorDigest("43", "cd".repeat(32)).toString("hex"), sig, k.pubB64)).toBe(false);
    process.env.ANCHOR_SIGNING_KEY = generateSigningKey();
    expect(verifyAnchorSignature(d.toString("hex"), sig, signingKeys()!.pubB64)).toBe(false);
  });
  it("no key configured → null (anchoring still records the head, unsigned)", () => {
    delete process.env.ANCHOR_SIGNING_KEY;
    expect(signingKeys()).toBeNull();
  });
});
