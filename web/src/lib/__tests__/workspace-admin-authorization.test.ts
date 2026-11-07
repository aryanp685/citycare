import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ role: "SUPER_ADMIN", writes: 0 }));
vi.mock("@/lib/session", () => ({ guardSameOrigin: async () => {}, requireRole: async (role: string) => { if (state.role !== role) throw Object.assign(new Error("wrong role"), { status: 403 }); return { uid: "admin-synthetic", role }; } }));
vi.mock("@/lib/db", () => ({ ApiError: class ApiError extends Error {}, fail: (status: number, code: string, message: string) => { throw Object.assign(new Error(message), { status, code }); }, one: async () => ({ id: "doctor-synthetic", userId: "user-synthetic", fullName: "Synthetic Doctor", isVerified: false, registrationNo: "TEST1234" }), run: async () => { state.writes++; return 1; }, tx: async (f: (c: object) => Promise<void>) => f({}) }));
vi.mock("@/lib/ledger", () => ({ appendAudit: async () => {} }));
vi.mock("@/lib/notify", () => ({ notify: async () => {} }));
import { POST } from "@/app/api/admin/doctors/[id]/verify/route";
const request = (body: object) => new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: "doctor-synthetic" }) };
describe("doctor verification authorization", () => {
  beforeEach(() => { state.role = "SUPER_ADMIN"; state.writes = 0; });
  it.each(["PATIENT", "DOCTOR", "HOSPITAL_ADMIN"])("denies %s before mutation", async (role) => { state.role = role; expect((await POST(request({ decision: "REJECT", note: "Synthetic reason" }), ctx)).status).toBe(403); expect(state.writes).toBe(0); });
  it("requires attestation before approval", async () => { expect((await POST(request({ decision: "APPROVE" }), ctx)).status).toBe(400); expect(state.writes).toBe(0); });
  it("permits a super admin attested approval through the existing transaction", async () => { expect((await POST(request({ decision: "APPROVE", register: "NMC_IMR", attested: true }), ctx)).status).toBe(200); expect(state.writes).toBe(1); });
});
