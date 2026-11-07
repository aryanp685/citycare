import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ verified: true, owns: true, status: "PENDING", updates: 0 }));
vi.mock("@/lib/session", () => ({ guardSameOrigin: async () => {}, requireRole: async () => ({ uid: "synthetic-user", profileId: "synthetic-doctor", role: "DOCTOR" }), requireVerifiedDoctor: async () => { if (!state.verified) throw Object.assign(new Error("unverified"), { status: 403 }); } }));
vi.mock("@/lib/db", () => ({ ApiError: class ApiError extends Error {},
  fail: (status: number, code: string, message: string) => { throw Object.assign(new Error(message), { status, code }); },
  one: async (sql: string) => sql.includes('FROM "Appointment"') && state.owns ? { status: state.status, patientId: "synthetic-patient", consentId: null } : null,
  run: async () => { state.updates++; return 1; }, tx: async (fn: (c: object) => Promise<void>) => fn({}),
}));
vi.mock("@/lib/ledger", () => ({ appendAudit: async () => {} }));
import { PATCH } from "@/app/api/doctor/appointments/[id]/status/route";
const req = (status: string) => new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status }) });
const ctx = { params: Promise.resolve({ id: "synthetic-appointment" }) };
describe("doctor appointment status route", () => {
  beforeEach(() => { state.verified = true; state.owns = true; state.status = "PENDING"; state.updates = 0; });
  it("allows the existing PENDING to CONFIRMED transition", async () => { expect((await PATCH(req("CONFIRMED"), ctx)).status).toBe(200); expect(state.updates).toBe(1); });
  it("denies an unverified doctor before a write", async () => { state.verified = false; expect((await PATCH(req("CONFIRMED"), ctx)).status).toBe(403); expect(state.updates).toBe(0); });
  it("denies another doctor's appointment", async () => { state.owns = false; expect((await PATCH(req("CONFIRMED"), ctx)).status).toBe(404); expect(state.updates).toBe(0); });
  it("rejects invalid status transitions", async () => { state.status = "COMPLETED"; expect((await PATCH(req("CONFIRMED"), ctx)).status).toBe(409); expect(state.updates).toBe(0); });
});
