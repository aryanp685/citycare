import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES, translate, type Locale } from "../i18n";
const state = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/patient/records", useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/use-locale", async () => {
  const { translate } = await import("../i18n");
  return { useLocale: () => ({ locale: state.locale, t: (ns: Parameters<typeof translate>[1], key: string) => translate(state.locale as Locale, ns, key as never) }) };
});
import { PatientHeader, PatientLegalFooter, PatientReacceptBanner } from "@/components/patient-shell";
import { Tabs } from "@/components/tabs";
import { ReacceptBanner } from "@/components/reaccept-banner";
import { LogoutButton } from "@/components/logout-button";
import { NotificationBell } from "@/components/notification-bell";

describe("patient shell localization", () => {
  it.each(LOCALES)("%s renders routes, conditional labels and unchanged name", locale => {
    state.locale = locale;
    const html = renderToStaticMarkup(createElement(PatientHeader, { name: "Synthetic Name", actingFor: true, pending: 2, drafts: 1, unread: 3 }));
    for (const path of ["/patient", "/patient/doctors", "/patient/records", "/patient/access", "/patient/notifications"]) expect(html).toContain(`href="${path}"`);
    expect(html).toContain("Synthetic Name");
    for (const key of ["shellRecords", "shellBack", "shellDependent", "shellSignOut"] as const) expect(html).toContain(translate(locale, "records", key));
    expect(html).toContain(translate(locale, "records", "shellUnread").replace("{count}", "3"));
    const footer = renderToStaticMarkup(createElement(PatientLegalFooter, { version: "v-test" }));
    expect(footer).toContain(translate(locale, "records", "shellGrievance").replaceAll("&", "&amp;"));
    const banner = renderToStaticMarkup(createElement(PatientReacceptBanner, { current: "test-v2", accepted: "test-v1" }));
    expect(banner).toContain(translate(locale, "records", "shellPrivacyChanged"));
    expect(banner).toContain("test-v1"); expect(banner).toContain("test-v2");
  });
  it("preserves English defaults of shared doctor components", () => {
    state.locale = "hi";
    expect(renderToStaticMarkup(createElement(Tabs, { tabs: [{ href: "/doctor", label: "Today" }] }))).toContain('aria-label="Sections"');
    expect(renderToStaticMarkup(createElement(LogoutButton))).toContain("Sign out");
    expect(renderToStaticMarkup(createElement(NotificationBell, { initial: 2, href: "/doctor/notifications" }))).toContain("Inbox, 2 unread");
    expect(renderToStaticMarkup(createElement(ReacceptBanner, { current: "x", accepted: null }))).toContain("Our privacy notice changed");
  });
});
