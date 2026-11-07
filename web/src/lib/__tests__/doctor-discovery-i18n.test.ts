// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LOCALES, missingMessages, translate } from "@/lib/i18n";
import { selectBrowserLocale } from "@/lib/locale-preference";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { DoctorDiscovery } from "@/components/doctor-discovery";
import { DoctorProfile } from "@/components/doctor-profile";
const doctor = { id: "synthetic", fullName: "Synthetic Name", qualification: "Synthetic Degree", hospital: "Synthetic Clinic", city: "Pune", specialties: ["Synthetic specialty"], languages: ["Source language"], consultationFee: "499.50", rating: null, isVerified: true, experienceYrs: 5, bio: "Synthetic biography" };
describe("doctor discovery localization", () => {
 let root: Root; let host: HTMLDivElement;
 beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); window.localStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
 afterEach(async () => { await act(async () => root.unmount()); host.remove(); window.localStorage.clear(); vi.unstubAllGlobals(); });
 it.each(LOCALES)("%s translates discovery and keeps source data unchanged", async locale => {
  expect(missingMessages(locale).filter(x => x.startsWith("discovery."))).toEqual([]); selectBrowserLocale(locale);
  await act(async () => root.render(createElement(DoctorDiscovery, { filters: { q: "synthetic", city: "", specialty: "" }, doctors: [doctor] })));
  expect(host.textContent).toContain(translate(locale, "discovery", "approved")); expect(host.textContent).toContain(translate(locale, "discovery", "ratingUnavailable"));
  for (const value of ["Synthetic Name", "Synthetic Degree", "Synthetic Clinic", "Synthetic specialty"]) expect(host.textContent).toContain(value);
  expect(host.querySelector('form[role="search"] input')?.getAttribute("name")).toBe("q"); expect(host.querySelector('a[href="/patient/doctors/synthetic"]')).not.toBeNull();
 });
 it.each(LOCALES)("%s shows an unapproved profile without booking or false rating", async locale => {
  selectBrowserLocale(locale); await act(async () => root.render(createElement(DoctorProfile, { doctor: { ...doctor, isVerified: false, languages: [] }, grid: [] })));
  expect(host.textContent).toContain(translate(locale, "discovery", "notBookable")); expect(host.textContent).toContain(translate(locale, "discovery", "notProvided")); expect(host.textContent).toContain("Synthetic biography"); expect(host.textContent).not.toContain(translate(locale, "appointments", "refresh"));
 });
 it("updates language without changing query or values and displays rating 0 as a value", async () => {
  await act(async () => root.render(createElement(DoctorDiscovery, { filters: { q: "original", city: "Pune", specialty: "Cardiology" }, doctors: [{ ...doctor, rating: 0 }] })));
  const input = host.querySelector("input")!; expect(input.value).toBe("original"); expect(host.querySelector<HTMLInputElement>('input[name="city"]')?.value).toBe("Pune"); expect(host.querySelector<HTMLInputElement>('input[name="specialty"]')?.value).toBe("Cardiology"); expect(host.querySelector('a[href="/patient/doctors"]')).not.toBeNull(); expect(host.textContent).toContain("★ 0.0");
  await act(async () => selectBrowserLocale("mr")); expect(input.value).toBe("original"); expect(host.textContent).toContain(translate("mr", "discovery", "search"));
 });
 it("updates form values when applied filters are cleared", async () => {
  await act(async () => root.render(createElement(DoctorDiscovery, { filters: { q: "", city: "Pune", specialty: "" }, doctors: [] })));
  expect(host.textContent).toContain(translate("en", "discovery", "noResults"));
  await act(async () => root.render(createElement(DoctorDiscovery, { filters: { q: "", city: "", specialty: "" }, doctors: [] })));
  expect(host.querySelector<HTMLInputElement>('input[name="city"]')?.value).toBe(""); expect(host.textContent).toContain(translate("en", "discovery", "noDoctors"));
 });
 it("distinguishes no doctors from no matching search", async () => {
  selectBrowserLocale("hi"); await act(async () => root.render(createElement(DoctorDiscovery, { filters: { q: "", city: "", specialty: "" }, doctors: [] }))); expect(host.textContent).toContain(translate("hi", "discovery", "noDoctors"));
  await act(async () => root.render(createElement(DoctorDiscovery, { filters: { q: "not found", city: "", specialty: "" }, doctors: [] }))); expect(host.textContent).toContain(translate("hi", "discovery", "noResults"));
 });
});
