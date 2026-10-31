import { describe, it, expect } from "vitest";
import { ageOn, isMinor, isSeedEmail, PRIVACY_NOTICE_VERSION, TERMS_VERSION, DEMO_RETENTION_DAYS, DATA_INVENTORY, POLICY_KEYS } from "@/lib/legal";
import { SignupSchema, NomineeSchema } from "@/lib/validate";

const base = { name: "Asha Kulkarni", email: "asha@e2e.test", phone: "9822011122", password: "longpassword1" };

describe("L1 legal helpers", () => {
  it("ageOn is calendar-correct around birthdays (no 365.25 drift)", () => {
    const dob = new Date("2008-09-28T00:00:00Z");
    expect(ageOn(dob, new Date("2026-09-27T23:59:59Z"))).toBe(17); // day before 18th birthday
    expect(ageOn(dob, new Date("2026-09-28T00:00:00Z"))).toBe(18); // birthday
    expect(ageOn(new Date("2000-02-29T00:00:00Z"), new Date("2024-02-28T00:00:00Z"))).toBe(23); // leap-day birthday not yet reached
  });
  it("isMinor draws the DPDP s.9 line at 18 completed years", () => {
    const now = new Date("2026-09-28T12:00:00Z");
    expect(isMinor(new Date("2008-09-29T00:00:00Z"), now)).toBe(true);
    expect(isMinor(new Date("2008-09-28T00:00:00Z"), now)).toBe(false);
    expect(isMinor(new Date("1990-01-01T00:00:00Z"), now)).toBe(false);
  });
  it("seed domain detection is case/space tolerant and exact on the domain", () => {
    expect(isSeedEmail("Ramesh@Demo.IN ")).toBe(true);
    expect(isSeedEmail("x@notdemo.in")).toBe(false);
    expect(isSeedEmail("x@demo.in.evil.com")).toBe(false);
  });
  it("policy versions are ISO dates and the retention window is sane", () => {
    expect(PRIVACY_NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(DEMO_RETENTION_DAYS).toBeGreaterThanOrEqual(1);
    expect(DEMO_RETENTION_DAYS).toBeLessThanOrEqual(365);
    expect(POLICY_KEYS).toEqual(["privacy-notice", "terms"]);
  });
  it("the itemised data inventory covers every category the schema stores", () => {
    const text = DATA_INVENTORY.map((d) => d.item.toLowerCase()).join(" ");
    for (const must of ["password", "date of birth", "allergies", "medications", "prescriptions", "ledger", "nominee", "cookie"]) expect(text).toContain(must);
  });
});

describe("L1 signup attestations are enforced by the schema, not the checkbox", () => {
  it("patient signup needs acceptPolicy=true and adult=true", () => {
    expect(SignupSchema.safeParse({ role: "PATIENT", ...base }).success).toBe(false);
    expect(SignupSchema.safeParse({ role: "PATIENT", ...base, acceptPolicy: true }).success).toBe(false);
    expect(SignupSchema.safeParse({ role: "PATIENT", ...base, acceptPolicy: true, adult: false }).success).toBe(false);
    expect(SignupSchema.safeParse({ role: "PATIENT", ...base, acceptPolicy: "true", adult: true }).success).toBe(false); // string "true" is not consent
    expect(SignupSchema.safeParse({ role: "PATIENT", ...base, acceptPolicy: true, adult: true }).success).toBe(true);
  });
  it("doctor signup needs the same attestations plus the registration number", () => {
    const doc = { role: "DOCTOR", ...base, qualification: "MBBS", consultationFee: 500, specialty: "General Physician", registrationNo: "MMC/2015/12345" };
    expect(SignupSchema.safeParse(doc).success).toBe(false);
    expect(SignupSchema.safeParse({ ...doc, acceptPolicy: true, adult: true }).success).toBe(true);
  });
  it("nominee schema: 10-digit phone, non-empty relation", () => {
    expect(NomineeSchema.safeParse({ name: "Meera", relation: "sister", phone: "9822011122" }).success).toBe(true);
    expect(NomineeSchema.safeParse({ name: "M", relation: "sister", phone: "9822011122" }).success).toBe(false);
    expect(NomineeSchema.safeParse({ name: "Meera", relation: "", phone: "9822011122" }).success).toBe(false);
    expect(NomineeSchema.safeParse({ name: "Meera", relation: "sister", phone: "+919822011122" }).success).toBe(false);
  });
});
