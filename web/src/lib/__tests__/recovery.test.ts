import { describe, it, expect } from "vitest";
import { newRecoveryCode, normaliseRecoveryCode, hashCode, newEmailCode, RECOVERY_SET_SIZE } from "../recovery";

describe("account recovery (D3 / D9)", () => {
  it("codes are Crockford base32 XXXXX-XXXXX with no ambiguous letters", () => {
    for (let i = 0; i < 50; i++) expect(newRecoveryCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(RECOVERY_SET_SIZE).toBe(8);
  });
  it("normalises what people actually type (lower-case, no dash, O for 0, I/L for 1)", () => {
    expect(normaliseRecoveryCode("abcde-fghjk")).toBe("ABCDE-FGHJK");
    expect(normaliseRecoveryCode("ABCDEFGHJK")).toBe("ABCDE-FGHJK");
    expect(normaliseRecoveryCode("oOiIl-12345")).toBe("00111-12345");
    expect(normaliseRecoveryCode(" ab cd e fg hj k ")).toBe("ABCDE-FGHJK");
    expect(normaliseRecoveryCode("short")).toBe("SH0RT"); // wrong length is left for the DB lookup to reject
  });
  it("hashes are per-user, so a leaked table cannot be replayed across accounts", () => {
    expect(hashCode("ABCDE-FGHJK", "u1")).not.toBe(hashCode("ABCDE-FGHJK", "u2"));
    expect(hashCode("ABCDE-FGHJK", "u1")).toHaveLength(64);
  });
  it("e-mail codes are 6 digits, zero-padded", () => {
    for (let i = 0; i < 50; i++) expect(newEmailCode()).toMatch(/^\d{6}$/);
  });
});
