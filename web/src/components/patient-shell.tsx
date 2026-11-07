"use client";
import Link from "next/link";
import { useLocale } from "./use-locale";
import { Badge } from "./ui";
import { Tabs } from "./tabs";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";
import { SwitchBackButton } from "./dependents-panel";
import { ReacceptBanner } from "./reaccept-banner";

export function PatientHeader({ name, actingFor, pending, drafts, unread }: { name: string | null; actingFor: boolean; pending: number; drafts: number; unread: number }) {
  const { locale, t } = useLocale();
  return <header lang={locale} className="workspace-header"><div className="max-w-6xl mx-auto px-4">
    <div className="flex flex-wrap items-center justify-between min-h-14 gap-2 py-2">
      <div className="flex flex-wrap items-center gap-4"><Link href="/" className="workspace-brand"><span className="workspace-brand-mark" aria-hidden="true">+</span><span>City<span className="text-brand">Care</span></span></Link>
        <Badge tone="off">{name === "[REDACTED]" ? t("records", "shellErased") : name ? <bdi lang="">{name}</bdi> : t("records", "shellPatient")}</Badge>
        {actingFor && <Badge tone="warn">{t("records", "shellDependent")}</Badge>}
      </div><div className="flex flex-wrap items-center gap-2">
        {actingFor && <SwitchBackButton label={t("records", "shellBack")} />}
        <NotificationBell initial={unread} href="/patient/notifications" unreadLabel={t("records", "shellUnread")} />
        <LogoutButton label={t("records", "shellSignOut")} />
      </div>
    </div>
    <Tabs ariaLabel={t("records", "shellSections")} tabs={[
      { href: "/patient", label: t("records", "shellDashboard"), badge: pending },
      { href: "/patient/appointments", label: t("records", "shellAppointments") },
      { href: "/patient/doctors", label: t("records", "shellDoctors") },
      { href: "/patient/records", label: t("records", "shellRecords"), badge: drafts },
      { href: "/patient/access", label: t("records", "shellAccess") },
      { href: "/patient/notifications", label: t("records", "shellInbox"), badge: unread },
    ]} />
  </div></header>;
}
export function PatientLegalFooter({ version }: { version: string }) {
  const { locale, t } = useLocale();
  return <footer lang={locale} className="text-xs text-muted py-6"><div className="max-w-6xl mx-auto px-4 flex flex-wrap items-center gap-x-4 gap-y-2">
    <span>{t("records", "shellFooterProject").replace("{year}", String(new Date().getFullYear()))}</span>
    <Link href="/legal/privacy" className="hover:text-ink">{t("records", "shellPrivacy").replace("{version}", version)}</Link>
    <Link href="/legal/terms" className="hover:text-ink">{t("records", "shellTerms")}</Link>
    <Link href="/legal/grievance" className="hover:text-ink">{t("records", "shellGrievance")}</Link>
    <Link href="/legal/licenses" className="hover:text-ink">{t("records", "shellLicenses")}</Link>
    <span className="ml-auto">{t("records", "shellEmergency")}</span>
  </div></footer>;
}
export function PatientReacceptBanner({ current, accepted }: { current: string; accepted: string | null }) {
  const { locale, t } = useLocale();
  return <ReacceptBanner current={current} accepted={accepted} labels={{ lang: locale,
    changed: t("records", "shellPrivacyChanged"), version: t("records", "shellVersion"), accepted: t("records", "shellAccepted"),
    please: t("records", "shellPlease"), read: t("records", "shellReadChanges"), help: t("records", "shellAcceptHelp"),
    saving: t("records", "shellSaving"), accept: t("records", "shellAccept"), error: t("records", "shellAcceptError"),
  }} />;
}
