import { describe, it, expect } from "vitest";
import { evaluateConsent, type ConsentRow } from "../consent";
import { hashPassword, verifyPassword, passwordLooksUsable } from "../auth";

const base = {
  id: "c1", patientId: "p1", doctorId: "d1", status: "APPROVED",
  scope: "FULL_RECORD", purpose: "TREATMENT", lastNEncounters: null, conditionName: null,
  approvedAt: new Date("2026-09-01"), revokedAt: null,
} as unknown as ConsentRow;
const at = (s: string) => new Date(s);

describe("consent verdicts", () => {
  it("no consent ever -> refused", () => {
    expect(evaluateConsent(null, at("2026-09-27T10:00:00Z")).allowed).toBe(false);
  });
  it("approved, unexpired -> allowed", () => {
    const r = evaluateConsent({ ...base, expiresAt: at("2026-10-01T00:00:00Z") }, at("2026-09-27T10:00:00Z"));
    expect(r.allowed).toBe(true);
  });
  it("revoked -> denied with a human reason (checked BEFORE expiry)", () => {
    const r = evaluateConsent(
      { ...base, status: "REVOKED", revokedAt: at("2026-09-26T05:00:00Z"), expiresAt: at("2026-10-01T00:00:00Z") },
      at("2026-09-27T10:00:00Z"),
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("revoked");
  });
  it("expired approved consent -> expiry reason, even though status still says APPROVED", () => {
    // (a DB sweep may not have marked it EXPIRED yet; the clock is the truth)
    const r = evaluateConsent({ ...base, expiresAt: at("2026-09-27T09:00:00Z") }, at("2026-09-27T10:00:00Z"));
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("expired");
  });
  it("REQUESTED that lapsed -> 'expired', not 'requested'", () => {
    const r = evaluateConsent(
      { ...base, status: "REQUESTED", expiresAt: at("2026-09-20T00:00:00Z"), approvedAt: null },
      at("2026-09-27T10:00:00Z"),
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("expired");
  });
  it("pending REQUESTED (not yet approved) -> refused", () => {
    const r = evaluateConsent(
      { ...base, status: "REQUESTED", approvedAt: null, expiresAt: at("2026-10-01T00:00:00Z") },
      at("2026-09-27T10:00:00Z"),
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("requested");
  });
});

describe("password hashing", () => {
  it("round-trips and rejects wrong passwords", async () => {
    const h = await hashPassword("city1234abcd");
    expect(await verifyPassword("city1234abcd", h)).toBe(true);
    expect(await verifyPassword("city1234abcX", h)).toBe(false);
  });
  it("malformed stored hash -> false, never a crash", async () => {
    expect(await verifyPassword("x", "bcrypt$whatever")).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "scrypt$a$b$c$d$e")).toBe(false);
  });
  it("usable password policy", () => {
    expect(passwordLooksUsable("city1234ab")).toBe(true); // 10+ chars
    expect(passwordLooksUsable("city1234")).toBe(false); // policy is for NEW passwords only; login never re-runs it
    expect(passwordLooksUsable("short1")).toBe(false);
    expect(passwordLooksUsable("allletters")).toBe(false);
  });
});
