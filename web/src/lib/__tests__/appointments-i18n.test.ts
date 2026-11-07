// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALES, missingMessages, translate } from "@/lib/i18n";
import { selectBrowserLocale } from "@/lib/locale-preference";
const mocks = vi.hoisted(() => ({ call: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/api-client", () => ({ callApi: mocks.call }));
import { AppointmentHistory } from "@/components/appointment-history";
import { SlotPicker } from "@/components/slot-picker";
import { CancelAppointment } from "@/components/cancel-appointment";
const row = { id: "appt", scheduledAt: "2026-01-01T04:00:00Z", status: "CONFIRMED", tokenNo: 12, reason: "Synthetic patient text", doctorName: "Synthetic Doctor", doctorId: "doc" };
describe("appointment localization", () => {
 let host: HTMLDivElement; let root: Root;
 beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); window.localStorage.clear(); mocks.call.mockReset(); mocks.refresh.mockReset(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
 afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear(); });
 it.each(LOCALES)("%s has complete strings and displays history with patient-entered text unchanged", async locale => {
  expect(missingMessages(locale).filter(k => k.startsWith("appointments."))).toEqual([]); selectBrowserLocale(locale);
  await act(async () => root.render(createElement(AppointmentHistory, { rows: [row], page: 1, pageSize: 20, hasMore: false })));
  expect(host.textContent).toContain(translate(locale, "appointments", "statusConfirmed")); expect(host.textContent).toContain(translate(locale, "appointments", "cancel")); expect(host.textContent).toContain("Synthetic patient text"); expect(host.textContent).toContain("Synthetic Doctor"); expect(host.firstElementChild?.getAttribute("lang")).toBe(locale);
 });
 it("updates history without reloading when language changes and handles unknown status", async () => {
  await act(async () => root.render(createElement(AppointmentHistory, { rows: [{ ...row, status: "__proto__" }], page: 500, pageSize: 20, hasMore: true })));
  await act(async () => selectBrowserLocale("mr"));
  expect(host.textContent).toContain(translate("mr", "appointments", "statusUnknown")); expect(host.textContent).toContain(translate("mr", "appointments", "limit")); expect(host.querySelector('a[href*="page=501"]')).toBeNull();
 });
 it("localizes booking result after a language change without resubmitting", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ grid: [] }) })));
  mocks.call.mockResolvedValue({ ok: true, status: 201, data: { consentRequested: true } });
  await act(async () => root.render(createElement(SlotPicker, { doctorId: "doc", doctorName: "Synthetic Doctor", fee: 100, grid: [{ date: "2026-09-29", slots: [{ iso: "2026-09-29T04:00:00Z", wall: "09:30", left: 1 }] }] })));
  await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "09:30")!.click());
  await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent?.startsWith("Confirm"))!.click());
  await act(async () => selectBrowserLocale("hi"));
  expect(host.querySelector('[role="status"]')?.textContent).toContain("Synthetic Doctor"); expect(host.textContent).toContain(translate("hi", "appointments", "accessRequested")); expect(host.textContent).toContain(translate("hi", "appointments", "noSlots")); expect(mocks.call).toHaveBeenCalledOnce();
 });
 it("explains uncertain cancellation and blocks repeat until page reload", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true); mocks.call.mockResolvedValue({ ok: false, status: 0, error: "network" }); selectBrowserLocale("hi");
  await act(async () => root.render(createElement(CancelAppointment, { id: "appt" })));
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain(translate("hi", "appointments", "cancelUncertain")); expect(host.querySelector("button")!.disabled).toBe(true); expect(mocks.refresh).toHaveBeenCalledOnce();
 });
});
