import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ role: "SUPER_ADMIN" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/session", () => ({ viewerForPage: async () => ({ role: state.role }) }));
vi.mock("@/lib/db", () => ({ one: async () => ({ pending: 7, approved: 3, rejected: 1 }), all: async () => [{ id: "doctor-synthetic", fullName: "Synthetic Doctor", email: "test@example.invalid", phone: "0000000000", qualification: "Test", registrationNo: null, hprId: null, specialties: [], createdAt: new Date("2026-01-01"), isVerified: false, verifiedAt: null, rejectedAt: null, verificationNote: null }] }));
import AdminHome from "@/app/admin/page";
describe("admin workspace", () => {
  it("uses the separately queried totals and labels the bounded list", async () => {
    state.role = "SUPER_ADMIN"; const html = renderToStaticMarkup(await AdminHome());
    expect(html).toContain("Awaiting review"); expect(html).toContain(">7<"); expect(html).toContain("1 pending in this list"); expect(html).toContain("Approve");
  });
  it("does not show verification controls to hospital admins", async () => {
    state.role = "HOSPITAL_ADMIN"; const html = renderToStaticMarkup(await AdminHome()); expect(html).not.toContain("Approve…"); expect(html).toContain("Super admin decision required");
  });
});
