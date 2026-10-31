import { describe, it, expect } from "vitest";
import { evaluateConsent, type ConsentRow } from "../consent";
import { SignupSchema, EmergencySchema, VerifyDoctorSchema, REG_NO_RE } from "../validate";
import { homeFor } from "../roles";

const base: ConsentRow = {
  id: "c1", patientId: "p", doctorId: "d", status: "APPROVED", scope: "FULL_RECORD", purpose: "EMERGENCY",
  lastNEncounters: null, conditionName: null, expiresAt: new Date("2026-01-01T10:00:00Z"), approvedAt: new Date("2026-01-01T09:00:00Z"),
  revokedAt: null, isEmergencyOverride: true, emergencyReason: "Unconscious after RTA, need allergy history",
};

describe("F2 break-glass consent is an ordinary consent to the verdict engine", () => {
  it("allowed while inside the 60-minute window", () => {
    const v = evaluateConsent(base, new Date("2026-01-01T09:30:00Z"));
    expect(v.allowed).toBe(true);
    if (v.allowed) expect(v.consent.isEmergencyOverride).toBe(true);
  });
  it("expires exactly like any other consent", () => {
    expect(evaluateConsent(base, new Date("2026-01-01T10:00:00Z")).allowed).toBe(false);
  });
  it("patient revocation beats the emergency flag", () => {
    expect(evaluateConsent({ ...base, status: "REVOKED", revokedAt: new Date("2026-01-01T09:10:00Z") }, new Date("2026-01-01T09:20:00Z")).allowed).toBe(false);
  });
});

describe("F2 emergency request validation", () => {
  it("needs a real reason and an explicit confirmation", () => {
    expect(EmergencySchema.safeParse({ reason: "short", confirm: true }).success).toBe(false);
    expect(EmergencySchema.safeParse({ reason: "Unconscious after RTA, need allergy history now", confirm: false }).success).toBe(false);
    expect(EmergencySchema.safeParse({ reason: "Unconscious after RTA, need allergy history now", confirm: true }).success).toBe(true);
  });
});

describe("F1 doctor signup requires a plausible registration number", () => {
  const doc = { role: "DOCTOR", name: "Dr Test", email: "t@x.in", phone: "9999999999", password: "longenough123", qualification: "MBBS", consultationFee: 500, specialty: "General Medicine", acceptPolicy: true, adult: true };
  it("accepts council formats", () => {
    for (const r of ["MMC/2015/12345", "2019/PUNE/1042", "KMC-88231", "DMC.2020.771"]) expect(REG_NO_RE.test(r)).toBe(true);
    expect(SignupSchema.safeParse({ ...doc, registrationNo: "MMC/2015/12345" }).success).toBe(true);
  });
  it("rejects missing, tiny or junk numbers", () => {
    expect(SignupSchema.safeParse(doc).success).toBe(false);
    expect(SignupSchema.safeParse({ ...doc, registrationNo: "12" }).success).toBe(false);
    expect(SignupSchema.safeParse({ ...doc, registrationNo: "<script>" }).success).toBe(false);
  });
  it("HPR id is optional but must be 14 digits when given", () => {
    expect(SignupSchema.safeParse({ ...doc, registrationNo: "MMC/2015/12345", hprId: "" }).success).toBe(true);
    expect(SignupSchema.safeParse({ ...doc, registrationNo: "MMC/2015/12345", hprId: "12345678901234" }).success).toBe(true);
    expect(SignupSchema.safeParse({ ...doc, registrationNo: "MMC/2015/12345", hprId: "1234" }).success).toBe(false);
  });
  it("admin decision schema — D12: approval needs a named register + attestation, rejection does not", () => {
    expect(VerifyDoctorSchema.safeParse({ decision: "APPROVE" }).success).toBe(false);
    expect(VerifyDoctorSchema.safeParse({ decision: "APPROVE", register: "NMC_IMR" }).success).toBe(false);
    expect(VerifyDoctorSchema.safeParse({ decision: "APPROVE", register: "NMC_IMR", attested: true }).success).toBe(true);
    expect(VerifyDoctorSchema.safeParse({ decision: "APPROVE", register: "GOOGLE", attested: true }).success).toBe(false);
    expect(VerifyDoctorSchema.safeParse({ decision: "REJECT", note: "number not found" }).success).toBe(true);
    expect(VerifyDoctorSchema.safeParse({ decision: "MAYBE" }).success).toBe(false);
  });
});

describe("homeFor: one redirect rule for every role (A47)", () => {
  it("routes each role to its own area", () => {
    expect(homeFor("PATIENT")).toBe("/patient");
    expect(homeFor("DOCTOR")).toBe("/doctor");
    expect(homeFor("SUPER_ADMIN")).toBe("/admin");
    expect(homeFor(undefined)).toBe("/login");
  });
});
