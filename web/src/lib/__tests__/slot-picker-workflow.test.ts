// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ refresh: vi.fn(), call: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/components/api-client", () => ({ callApi: state.call }));
import { SlotPicker } from "@/components/slot-picker";
const grid = [{ date: "2026-09-29", slots: [{ iso: "2026-09-29T04:00:00.000Z", wall: "09:30", left: 1 }] }];
describe("booking picker", () => {
 let host: HTMLDivElement; let root: Root;
 const button = (name: string) => [...host.querySelectorAll("button")].find(b => b.textContent?.includes(name))!;
 beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); state.call.mockReset(); state.refresh.mockReset(); vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ grid }) }))); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
 afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
 async function mount(initial = grid) { await act(async () => root.render(createElement(SlotPicker, { doctorId: "doctor-1", doctorName: "Synthetic", fee: 500, grid: initial }))); }
 async function select() { await act(async () => button("09:30").click()); }
 it("sends the selected instant and confirms the correct IST time only after success", async () => {
  state.call.mockResolvedValue({ ok: true, status: 201, data: { consentRequested: true } }); await mount(); await select();
  expect(button("09:30").getAttribute("aria-pressed")).toBe("true"); expect(host.textContent).toContain("09:30 IST");
  await act(async () => button("Confirm").click());
  expect(state.call).toHaveBeenCalledWith("/api/patient/appointments", { method: "POST", body: { doctorId: "doctor-1", scheduledAt: "2026-09-29T04:00:00.000Z", reason: undefined } });
  expect(host.querySelector('[role="status"]')?.textContent).toContain("09:30 IST"); expect(state.refresh).toHaveBeenCalledOnce();
 });
 it("keeps the success message when the last slot disappears", async () => {
  state.call.mockResolvedValue({ ok: true, status: 201, data: {} }); vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ grid: [] }) })));
  await mount(); await select(); await act(async () => button("Confirm").click());
  expect(host.querySelector('[role="status"]')?.textContent).toContain("Booked with Synthetic"); expect(host.textContent).toContain("No open slots");
 });
 it("prevents duplicate clicks while a request is pending", async () => {
  let resolve!: (v: unknown) => void; state.call.mockReturnValue(new Promise(r => { resolve = r; })); await mount(); await select();
  await act(async () => { button("Confirm").click(); button("Confirm").click(); }); expect(state.call).toHaveBeenCalledOnce();
  await act(async () => resolve({ ok: true, status: 201, data: {} }));
 });
 it("removes a stale selection and reports refresh failure without claiming a refresh", async () => {
  state.call.mockResolvedValue({ ok: false, status: 409, code: "slot_full", error: "full" }); vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  await mount(); await select(); await act(async () => button("Confirm").click());
  expect(host.textContent).toContain("no longer available"); expect(host.textContent).toContain("Could not refresh availability"); expect(button("Pick a slot").disabled).toBe(true); expect(host.textContent).not.toContain("Updated");
 });
 it("stops retries after an unknown booking outcome and offers history", async () => {
  state.call.mockResolvedValue({ ok: false, status: 0, error: "network" }); await mount(); await select(); await act(async () => button("Confirm").click());
  expect(host.textContent).toContain("could not confirm whether the booking succeeded"); expect(button("Confirm").disabled).toBe(true); expect(host.querySelector('a[href="/patient/appointments"]')).not.toBeNull();
 });
 it("keeps a manual retry visible when no slots are available", async () => { await mount([]); expect(host.textContent).toContain("No open slots"); expect(button("Refresh availability")).toBeDefined(); });
});
