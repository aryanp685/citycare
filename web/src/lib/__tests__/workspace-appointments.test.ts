// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ refresh: vi.fn(), call: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/components/api-client", () => ({ callApi: state.call }));
import { CancelAppointment } from "@/components/cancel-appointment";
import { ApptStatusButtons } from "@/components/appt-status";

describe("appointment actions", () => {
  let host: HTMLDivElement; let root: Root;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    state.refresh.mockReset(); state.call.mockReset();
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it("does not cancel if confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => root.render(createElement(CancelAppointment, { id: "synthetic" })));
    await act(async () => host.querySelector("button")!.click());
    expect(state.call).not.toHaveBeenCalled();
  });
  it("cancels only on server success and refreshes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true); state.call.mockResolvedValue({ ok: true, data: { cancelled: true }, status: 200 });
    await act(async () => root.render(createElement(CancelAppointment, { id: "synthetic" })));
    await act(async () => host.querySelector("button")!.click());
    expect(state.call).toHaveBeenCalledWith("/api/patient/appointments", { method: "PATCH", body: { appointmentId: "synthetic" } });
    expect(host.textContent).toContain("Appointment cancelled."); expect(state.refresh).toHaveBeenCalledOnce();
  });
  it("shows a cancellation error and does not report success", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true); state.call.mockResolvedValue({ ok: false, error: "Request failed", status: 409 });
    await act(async () => root.render(createElement(CancelAppointment, { id: "synthetic" })));
    await act(async () => host.querySelector("button")!.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Request failed"); expect(state.refresh).not.toHaveBeenCalled();
  });
  it("requires confirmation for doctor cancellation and sends the supported status", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    state.call.mockResolvedValue({ ok: true, data: { status: "CANCELLED_BY_DOCTOR" }, status: 200 });
    await act(async () => root.render(createElement(ApptStatusButtons, { id: "synthetic", status: "CONFIRMED" })));
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!;
    await act(async () => button.click()); expect(state.call).not.toHaveBeenCalled();
    confirm.mockReturnValue(true); await act(async () => button.click());
    expect(state.call).toHaveBeenCalledWith("/api/doctor/appointments/synthetic/status", { method: "PATCH", body: { status: "CANCELLED_BY_DOCTOR" } });
    expect(state.refresh).toHaveBeenCalledOnce();
  });
  it("requires confirmation before completing a visit", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => root.render(createElement(ApptStatusButtons, { id: "synthetic", status: "CHECKED_IN" })));
    await act(async () => host.querySelector("button")!.click());
    expect(state.call).not.toHaveBeenCalled();
  });
});
