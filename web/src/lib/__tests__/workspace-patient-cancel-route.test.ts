import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ role: "PATIENT", owns: true, status: "CONFIRMED", writes: 0 }));
vi.mock("@/lib/session", () => ({ guardSameOrigin: async () => {}, requireRole: async (role: string) => { if (state.role !== role) throw Object.assign(new Error("wrong role"), { status: 403 }); return { uid: "patient-user", profileId: "patient-synthetic", role }; } }));
vi.mock("@/lib/db", () => ({ ApiError: class ApiError extends Error {}, fail: (status: number, code: string, message: string) => { throw Object.assign(new Error(message), { status, code }); }, one: async () => state.owns ? { id: "appt-synthetic", status: state.status, consentId: null } : null, all: vi.fn(), pgErrorCode: vi.fn(), run: async () => { state.writes++; return 1; }, tx: async (f: (c: object) => Promise<void>) => f({}) }));
vi.mock("@/lib/ledger", () => ({ appendAudit: async () => {} }));
vi.mock("@/lib/repo", () => ({ patientById: vi.fn(), freeSlotsOneDay: vi.fn() }));
import { PATCH } from "@/app/api/patient/appointments/route";
const req = () => new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ appointmentId: "00000000-0000-4000-8000-000000000001" }) });
const ctx = { params: Promise.resolve({}) };
describe("patient cancellation ownership", () => {
  beforeEach(() => { state.role = "PATIENT"; state.owns = true; state.status = "CONFIRMED"; state.writes = 0; });
  it("cancels a confirmed owned appointment", async () => { expect((await PATCH(req(), ctx)).status).toBe(200); expect(state.writes).toBe(1); });
  it("denies an appointment not owned by the patient", async () => { state.owns = false; expect((await PATCH(req(), ctx)).status).toBe(404); expect(state.writes).toBe(0); });
  it("denies cancellation of a completed appointment", async () => { state.status = "COMPLETED"; expect((await PATCH(req(), ctx)).status).toBe(400); expect(state.writes).toBe(0); });
  it("denies another role", async () => { state.role = "DOCTOR"; expect((await PATCH(req(), ctx)).status).toBe(403); expect(state.writes).toBe(0); });
});
