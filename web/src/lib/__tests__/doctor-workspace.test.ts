import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GrantSchema, RevokeSchema } from "../validate";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { ConsentActions } from "@/components/consent-actions";
import { RequestAccess } from "@/components/request-access";

const doctorId = "e8e30959-987d-4b3c-94b8-ec2296d06675";
const consentId = "a5d90630-d73e-4c47-a23c-8441e83282c7";
describe("doctor workspace access decisions", () => {
  it("accepts a targeted pending request and rejects malformed ids", () => {
    expect(GrantSchema.safeParse({ doctorId, consentId, scope: "SUMMARY_ONLY", expiryDays: 7 }).success).toBe(true);
    expect(GrantSchema.safeParse({ doctorId, consentId: "not-an-id", scope: "SUMMARY_ONLY", expiryDays: 7 }).success).toBe(false);
  });
  it("restricts decision values and retains legacy revocation", () => {
    expect(RevokeSchema.safeParse({ decision: "DENY" }).success).toBe(true);
    expect(RevokeSchema.safeParse({ decision: "REVOKE" }).success).toBe(true);
    expect(RevokeSchema.safeParse({ reason: "patient request" }).success).toBe(true);
    expect(RevokeSchema.safeParse({ decision: "APPROVE" }).success).toBe(false);
  });
  it("renders an explicit request form and honest approval controls", () => {
    const form = renderToStaticMarkup(createElement(RequestAccess, { patientId: consentId }));
    expect(form).toContain("Requested scope");
    expect(form).toContain("Second opinion");
    expect(form).toContain("patient decides");
    const approval = renderToStaticMarkup(createElement(ConsentActions, { consent: { id: consentId, doctorId, doctorName: "Synthetic Doctor", status: "REQUESTED", scope: "SUMMARY_ONLY", expiresAt: null } }));
    expect(approval).toContain("Review &amp; approve");
    expect(approval).toContain("Deny");
    expect(approval).not.toContain("Revoke now");
  });
});
