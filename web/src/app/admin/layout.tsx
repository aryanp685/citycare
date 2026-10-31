import Link from "next/link";
import { viewerForPage } from "@/lib/session";
import { one } from "@/lib/db";
import { LogoutButton } from "@/components/logout-button";
import { Tabs } from "@/components/tabs";
import { Badge } from "@/components/ui";
import { PageTransition } from "@/components/motion/page-transition";
import { NotificationBell } from "@/components/notification-bell";
import { LegalFooter } from "@/components/legal-footer";
import { ReacceptBanner } from "@/components/reaccept-banner";
import { consentStatus } from "@/lib/session";
import { PRIVACY_NOTICE_VERSION } from "@/lib/legal";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const v = await viewerForPage(["SUPER_ADMIN", "HOSPITAL_ADMIN"]);
  const c = await one<{ pending: number; unread: number; grievances: number; emergencies: number; incidents: number }>(
    `SELECT (SELECT count(*)::int FROM "Doctor" WHERE NOT "isVerified" AND "rejectedAt" IS NULL) AS pending,
            (SELECT count(*)::int FROM "Notification" WHERE "userId"=$1 AND NOT "isRead") AS unread,
            (SELECT count(*)::int FROM "Grievance" WHERE status IN ('OPEN','IN_PROGRESS')) AS grievances,
            (SELECT count(*)::int FROM "Consent" WHERE "isEmergencyOverride" AND "reviewedAt" IS NULL) AS emergencies,
            (SELECT count(*)::int FROM "Incident" WHERE status <> 'CLOSED') AS incidents`,
    [v.uid],
  );
  const consent = await consentStatus(v.uid); // L2
  return (
    <div>
      {!consent.current && <ReacceptBanner current={PRIVACY_NOTICE_VERSION} accepted={consent.accepted} />}
      <header className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <Link href="/" className="font-black tracking-tight no-underline text-ink">City<span className="text-brand">Care</span></Link>
              <Badge tone="warn">admin</Badge>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell initial={c?.unread ?? 0} href="/admin/notifications" />
              <LogoutButton />
            </div>
          </div>
          <Tabs tabs={[
            { href: "/admin", label: "Doctor verification", badge: c?.pending ?? 0 },
            { href: "/admin/emergencies", label: "Break-glass review", badge: c?.emergencies ?? 0 },
            { href: "/admin/grievances", label: "Grievances", badge: c?.grievances ?? 0 },
            { href: "/admin/incidents", label: "Incidents", badge: c?.incidents ?? 0 },
            { href: "/admin/system", label: "System" },
            { href: "/admin/notifications", label: "Inbox", badge: c?.unread ?? 0 },
          ]} />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6"><PageTransition>{children}</PageTransition></main>
      <LegalFooter compact />
    </div>
  );
}
