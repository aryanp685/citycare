import { redirect } from "next/navigation";
import { homeFor } from "@/lib/roles";
import Link from "next/link";
import { getViewer } from "@/lib/session";
import { one } from "@/lib/db";
import { LogoutButton } from "@/components/logout-button";
import { Tabs } from "@/components/tabs";
import { PageTransition } from "@/components/motion/page-transition";
import { NotificationBell } from "@/components/notification-bell";
import { LegalFooter } from "@/components/legal-footer";
import { ReacceptBanner } from "@/components/reaccept-banner";
import { consentStatus } from "@/lib/session";
import { PRIVACY_NOTICE_VERSION } from "@/lib/legal";
import { Badge } from "@/components/ui";

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "DOCTOR") redirect(homeFor(viewer.role));
  const consent = await consentStatus(viewer.uid); // L2

  const who = await one<{ name: string; isVerified: boolean; rejectedAt: Date | null; registrationNo: string | null; note: string | null; unread: number }>(
    `SELECT d."fullName" AS name, d."isVerified", d."rejectedAt", d."registrationNo", d."verificationNote" AS note,
            (SELECT count(*)::int FROM "Notification" n WHERE n."userId"=$2 AND NOT n."isRead") AS unread
       FROM "Doctor" d WHERE d.id=$1`,
    [viewer.profileId, viewer.uid],
  );

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
              <span className="text-sm font-semibold">Dr. {who?.name?.replace(/^Dr\.?\s+/i, "") ?? "you"}</span>
            </div>
            <div className="flex items-center gap-2">
              {who?.isVerified ? <Badge tone="live">verified</Badge> : <Badge tone={who?.rejectedAt ? "crit" : "warn"}>{who?.rejectedAt ? "not approved" : "verification pending"}</Badge>}
              <NotificationBell initial={who?.unread ?? 0} href="/doctor/notifications" />
              <LogoutButton />
            </div>
          </div>
          <Tabs tabs={[
            { href: "/doctor", label: "Today" },
            { href: "/doctor/patients", label: "Patients" },
            { href: "/doctor/notifications", label: "Inbox", badge: who?.unread ?? 0 },
          ]} />
        </div>
      </header>
      {!who?.isVerified && (
        <div className={`border-b ${who?.rejectedAt ? "bg-[#fef2f2] border-[#fecaca]" : "bg-[#fffbeb] border-[#fde68a]"}`}>
          <div className="max-w-6xl mx-auto px-4 py-2.5 text-sm">
            {who?.rejectedAt ? (
              <><strong>Registration not approved.</strong> {who.note ?? "Contact the CityCare admin."} Patients cannot see or book you, and records stay closed.</>
            ) : (
              <><strong>Verification pending</strong> for registration <span className="kbd">{who?.registrationNo ?? "—"}</span>. An admin checks it against the medical register; until then patients cannot find or book you, and no record can be opened.</>
            )}
          </div>
        </div>
      )}
      <main className="max-w-6xl mx-auto px-4 py-6"><PageTransition>{children}</PageTransition></main>
      <LegalFooter compact />
    </div>
  );
}
