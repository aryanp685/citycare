import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ scope: "FULL_RECORD", conditionName: null as string | null, lastNEncounters: null as number | null, reads: 0, writes: 0 }));
vi.mock("@/lib/session", () => ({ requireRole: async () => ({ uid: "doctor-user", profileId: "doctor", role: "DOCTOR" }), requireVerifiedDoctor: async () => {}, guardSameOrigin: async () => {} }));
vi.mock("@/lib/db", () => ({ ApiError: class ApiError extends Error {}, one: vi.fn(), run: vi.fn(), tx: async () => { state.writes++; }, fail: (status: number, code: string, message: string) => { throw Object.assign(new Error(message), { status, code }); } }));
vi.mock("@/lib/ledger", () => ({ appendAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/repo", async () => {
  const { evaluateConsent } = await import("@/lib/consent");
  return {
    patientById: async () => ({ id: "patient" }),
    liveConsentFor: async () => ({ verdict: evaluateConsent({ id: "consent", patientId: "patient", doctorId: "doctor", status: "APPROVED", scope: state.scope, purpose: "TREATMENT", conditionName: state.conditionName, lastNEncounters: state.lastNEncounters, expiresAt: new Date("2099-01-01"), approvedAt: null, revokedAt: null } as import("@/lib/consent").ConsentRow, new Date("2026-01-01")), now: new Date("2026-01-01") }),
    scopedRecord: async () => { state.reads++; throw new Error("unexpected clinical read"); },
    recordSections: async () => { state.reads++; throw new Error("unexpected clinical read"); },
    toRuleRecord: vi.fn(), ageFrom: vi.fn(),
  };
});
import { GET } from "@/app/api/doctor/patients/[id]/record/route";
import { POST } from "@/app/api/doctor/patients/[id]/encounter/route";
const ctx = { params: Promise.resolve({ id: "patient" }) };
const body = { chiefComplaint: "synthetic complaint", diagnosisText: "synthetic diagnosis", items: [{ name: "test medicine" }] };
describe("invalid legacy scopes stop clinical access before clinical retrieval", () => {
  beforeEach(() => { state.reads = 0; state.writes = 0; state.conditionName = null; state.lastNEncounters = null; });
  it.each(["SPECIFIC_DOCUMENTS", "UNKNOWN", "SPECIFIC_CONDITION", "LAST_N_ENCOUNTERS"])("denies %s on record and encounter", async scope => {
    state.scope = scope; if (scope === "LAST_N_ENCOUNTERS") state.lastNEncounters = -1;
    expect((await GET(new Request("http://localhost/record"), ctx)).status).toBe(403);
    expect((await POST(new Request("http://localhost/encounter", { method: "POST", body: JSON.stringify(body) }), ctx)).status).toBe(403);
    expect(state.reads).toBe(0); expect(state.writes).toBe(0);
  });
});
