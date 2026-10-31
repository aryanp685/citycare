import { redirect } from "next/navigation";
import { homeFor } from "@/lib/roles";
import { getViewer } from "@/lib/session";
import { one } from "@/lib/db";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { Tabs } from "@/components/tabs";
import { Badge } from "@/components/ui";
import { PageTransition } from "@/components/motion/page-transition";
import { NotificationBell } from "@/components/notification-bell";
import { LegalFooter } from "@/components/legal-footer";
import { ReacceptBanner } from "@/components/reaccept-banner";
import { SwitchBackButton } from "@/components/dependents-panel";
import { consentStatus } from "@/lib/session";
import { PRIVACY_NOTICE_VERSION } from "@/lib/legal";

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "PATIENT") redirect(homeFor(viewer.role));
  const consent = await consentStatus(viewer.uid); // L2

  // One round-trip instead of three: on a serverless function + remote Postgres every
  // extra query is a full network hop (A41 — layout ran 3 sequential-ish queries per navigation).
  const shell = await one<{ name: string | null; pending: number; drafts: number; unread: number }>(
    `SELECT p."fullName" AS name,
            (SELECT count(*)::int FROM "Consent"    c WHERE c."patientId"=p.id AND c.status='REQUESTED') AS pending,
            (SELECT count(*)::int FROM "Medication" m WHERE m."patientId"=p.id AND m."isActive" AND m.notes LIKE 'DRAFT:%') AS drafts,
            (SELECT count(*)::int FROM "Notification" n WHERE n."userId"=$2 AND NOT n."isRead") AS unread
       FROM "Patient" p WHERE p.id=$1`,
    [viewer.profileId, viewer.uid],
  );
  const who = { name: shell?.name ?? null };
  const pending = { n: String(shell?.pending ?? 0) };
  const drafts = { n: String(shell?.drafts ?? 0) };

  return (
    <div>
      {!consent.current && <ReacceptBanner current={PRIVACY_NOTICE_VERSION} accepted={consent.accepted} />}
      <header className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <Link href="/" className="font-black tracking-tight no-underline text-ink">
                City<span className="text-brand">Care</span>
              </Link>
              <Badge tone="off">{who?.name === "[REDACTED]" ? "erased account" : who?.name ?? "patient"}</Badge>
              {viewer.actingFor && <Badge tone="warn">dependent · managed by you</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {viewer.actingFor && <SwitchBackButton />}
              <NotificationBell initial={shell?.unread ?? 0} href="/patient/notifications" />
              <LogoutButton />
            </div>
          </div>
          <Tabs
            tabs={[
              { href: "/patient", label: "Dashboard", badge: Number(pending?.n ?? 0) },
              { href: "/patient/doctors", label: "Find doctors" },
              { href: "/patient/records", label: "Records", badge: Number(drafts?.n ?? 0) },
              { href: "/patient/access", label: "Access & trust" },
              { href: "/patient/notifications", label: "Inbox", badge: shell?.unread ?? 0 },
            ]}
          />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6"><PageTransition>{children}</PageTransition></main>
      <LegalFooter compact />
    </div>
  );
}
