import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ viewer: { uid: "user-synthetic", profileId: "doctor-synthetic", role: "DOCTOR" }, verified: true, exists: true, scope: "FULL_RECORD", status: "APPROVED", queries: [] as string[] }));
vi.mock("@/lib/session", () => ({ getViewer: async () => state.viewer, requireRole: async () => state.viewer, requireVerifiedDoctor: async () => { if (!state.verified) throw Object.assign(new Error("unverified"), { status: 403, code: "doctor_unverified" }); }, guardSameOrigin: async () => {} }));
vi.mock("@/lib/db", () => ({ ApiError: class ApiError extends Error {},
  one: async (sql: string) => {
    state.queries.push(sql);
    if (sql.includes('FROM "Consent"')) return { id: "consent-synthetic", patientId: "patient-synthetic", doctorId: "doctor-synthetic", status: state.status, scope: state.scope, lastNEncounters: null, conditionName: null, expiresAt: new Date("2099-01-01"), dbnow: new Date("2026-01-01") };
    if (sql.includes('JOIN "DocumentBlob"')) return state.exists ? { title: "synthetic", mimeType: "application/pdf", encryptionIv: "iv", checksumSha256: "sum", data: Buffer.from("cipher") } : null;
    if (sql.includes('FROM "Document"')) return state.exists ? { id: "doc-synthetic", patientId: "patient-synthetic" } : null;
    throw new Error("unexpected SQL");
  },
  fail: (status: number, code: string, message: string) => { throw Object.assign(new Error(message), { status, code }); }, run: vi.fn(), tx: vi.fn(),
}));
vi.mock("@/lib/ledger", () => ({ appendAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/storage", () => ({ LINK_TTL_S: 60, signDownload: () => "synthetic-signature", verifyDownload: () => true, decryptBlob: () => Buffer.from("synthetic-bytes"), safeFilename: () => "synthetic.pdf" }));
import { POST } from "@/app/api/documents/[id]/link/route";
import { GET } from "@/app/api/documents/[id]/route";
const ctx = { params: Promise.resolve({ id: "doc-synthetic" }) };
const link = () => POST(new Request("http://localhost/api/documents/doc-synthetic/link", { method: "POST" }), ctx);
const download = () => GET(new Request("http://localhost/api/documents/doc-synthetic?exp=1&sig=synthetic"), ctx);
const blobRead = () => state.queries.some((q) => q.includes('JOIN "DocumentBlob"'));
describe("document authorization, synthetic sequential route tests", () => {
  beforeEach(() => { state.viewer = { uid: "user-synthetic", profileId: "doctor-synthetic", role: "DOCTOR" }; state.verified = true; state.exists = true; state.scope = "FULL_RECORD"; state.status = "APPROVED"; state.queries = []; });
  it("verified doctor with live FULL can mint and download, with consent before blob", async () => {
    expect((await link()).status).toBe(200); state.queries = [];
    const res = await download(); expect(res.status).toBe(200); expect(await res.text()).toBe("synthetic-bytes");
    expect(state.queries.findIndex((q) => q.includes('FROM "Consent"'))).toBeLessThan(state.queries.findIndex((q) => q.includes('JOIN "DocumentBlob"')));
  });
  it("unverified doctor denied before document lookup on both paths", async () => {
    state.verified = false; expect((await link()).status).toBe(403); expect((await download()).status).toBe(403); expect(state.queries).toEqual([]);
  });
  it.each(["SUMMARY_ONLY", "LAST_N_ENCOUNTERS", "SPECIFIC_DOCUMENTS", "UNKNOWN"])("denies scope %s without blob read", async scope => {
    state.scope = scope; expect((await link()).status).toBe(404); expect((await download()).status).toBe(404); expect(blobRead()).toBe(false);
  });
  it("rechecks revoked consent on download of a previously minted link", async () => {
    expect((await link()).status).toBe(200); state.status = "REVOKED"; state.queries = [];
    expect((await download()).status).toBe(404); expect(blobRead()).toBe(false);
  });
  it("makes missing and unauthorized document responses identical", async () => {
    state.scope = "SUMMARY_ONLY"; const deniedLink = await link(); const deniedGet = await download();
    state.exists = false; const missingLink = await link(); const missingGet = await download();
    expect([deniedLink.status, await deniedLink.text()]).toEqual([missingLink.status, await missingLink.text()]);
    expect([deniedGet.status, await deniedGet.text()]).toEqual([missingGet.status, await missingGet.text()]);
  });
  it("patient owner can mint and download without doctor/consent checks", async () => {
    state.viewer = { uid: "patient-user", profileId: "patient-synthetic", role: "PATIENT" }; state.verified = false;
    expect((await link()).status).toBe(200); expect((await download()).status).toBe(200);
    expect(state.queries.some((q) => q.includes('FROM "Consent"'))).toBe(false);
  });
  it("other patient denied without blob read", async () => {
    state.viewer = { uid: "other", profileId: "other-patient", role: "PATIENT" };
    expect((await link()).status).toBe(404); expect((await download()).status).toBe(404); expect(blobRead()).toBe(false);
  });
});
