import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ rows: [] as Array<{ id: string; scheduledAt: Date; status: string; tokenNo: number | null; reason: string | null; doctorName: string; doctorId: string }>, calls: [] as Array<{ sql: string; params: unknown[] }> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/session", () => ({ viewerForPage: async (role: string) => { expect(role).toBe("PATIENT"); return { profileId: "patient-synthetic" }; } }));
vi.mock("@/lib/db", () => ({ all: async (sql: string, params: unknown[]) => { state.calls.push({ sql, params }); return state.rows; } }));
import PatientAppointments from "@/app/patient/appointments/page";
const row = (n: number) => ({ id: `appt-${n}`, scheduledAt: new Date("2026-11-07T10:00:00Z"), status: "CONFIRMED", tokenNo: n, reason: "Synthetic reason", doctorName: "Synthetic Doctor", doctorId: "doctor-synthetic" });
describe("patient appointment history", () => {
  beforeEach(() => { state.calls = []; state.rows = []; });
  it("selects by server-side patient ID and renders an honest empty state", async () => {
    const html = renderToStaticMarkup(await PatientAppointments({ searchParams: Promise.resolve({}) }));
    expect(state.calls[0].params).toEqual(["patient-synthetic", 21, 0]); expect(state.calls[0].sql).toContain('a."patientId"=$1');
    expect(html).toContain("No appointments yet");
  });
  it("renders details and cancellation for an owned row", async () => {
    state.rows = [row(1)]; const html = renderToStaticMarkup(await PatientAppointments({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Synthetic Doctor"); expect(html).toContain("Synthetic reason"); expect(html).toContain("Cancel appointment"); expect(html).toContain('href="/patient/doctors/doctor-synthetic"');
  });
  it("bounds page numbers and shows next only when another row exists", async () => {
    state.rows = Array.from({ length: 21 }, (_, i) => row(i));
    const html = renderToStaticMarkup(await PatientAppointments({ searchParams: Promise.resolve({ page: "2" }) }));
    expect(state.calls[0].params).toEqual(["patient-synthetic", 21, 20]); expect(html).toContain("page=3"); expect(html).toContain("page=1"); expect(html).not.toContain("Token #20");
    state.calls = []; await PatientAppointments({ searchParams: Promise.resolve({ page: "999999999999999999999999" }) }); expect(state.calls[0].params[2]).toBe(0);
  });
  it("does not expose a cancellation control for a completed visit", async () => {
    state.rows = [{ ...row(1), status: "COMPLETED" }]; const html = renderToStaticMarkup(await PatientAppointments({ searchParams: Promise.resolve({}) })); expect(html).not.toContain("Cancel appointment");
  });
});
