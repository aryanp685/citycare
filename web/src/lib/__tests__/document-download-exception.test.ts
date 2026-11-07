import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALES, translate } from "../i18n";
const state = vi.hoisted(() => ({ fail: true, status: 0 }));
vi.mock("@/lib/session", () => ({ getViewer: async () => { if (state.fail) { const e = new Error("PRIVATE-SYNTHETIC-STACK") as Error & { status?: number }; if (state.status) e.status = state.status; throw e; } return null; }, requireRole: vi.fn(), guardSameOrigin: vi.fn() }));
import { GET } from "@/app/api/documents/[id]/route";
const ctx = { params: Promise.resolve({ id: "synthetic" }) };
describe("unexpected document download exception", () => {
  beforeEach(() => { state.fail = true; state.status = 0; vi.spyOn(console, "error").mockImplementation(() => {}); });
  it.each(LOCALES)("%s returns safe localized fallback with original 500 status", async locale => {
    const res = await GET(new Request(`http://localhost/api/documents/synthetic?ui_lang=${locale}`), ctx);
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain(translate(locale, "documents", "errorGeneric"));
    expect(html).not.toContain("PRIVATE-SYNTHETIC-STACK");
  });
  it("localizes status-bearing server errors without reflecting details", async () => {
    state.status = 503;
    const res = await GET(new Request("http://localhost/api/documents/synthetic?ui_lang=mr"), ctx);
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toContain(translate("mr", "documents", "errorGeneric"));
    expect(body).not.toContain("PRIVATE-SYNTHETIC-STACK");
  });
  it("keeps default doctor/API JSON status and safe body", async () => {
    const res = await GET(new Request("http://localhost/api/documents/synthetic"), ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Something broke on our side. Try again.", code: "internal" });
  });
  it("does not turn expected authorization failures into a 500", async () => {
    state.fail = false;
    const res = await GET(new Request("http://localhost/api/documents/synthetic?ui_lang=hi"), ctx);
    expect(res.status).toBe(401);
    expect(await res.text()).toContain(translate("hi", "documents", "errorAuth"));
  });
});
