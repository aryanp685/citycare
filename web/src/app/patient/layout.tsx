import { redirect } from "next/navigation";
import { homeFor } from "@/lib/roles";
import { getViewer } from "@/lib/session";
import { one } from "@/lib/db";
import { PageTransition } from "@/components/motion/page-transition";
import { consentStatus } from "@/lib/session";
import { PatientHeader, PatientLegalFooter, PatientReacceptBanner } from "@/components/patient-shell";
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

  return (
    <div className="patient-shell workspace-shell">
      {!consent.current && <PatientReacceptBanner current={PRIVACY_NOTICE_VERSION} accepted={consent.accepted} />}
      <PatientHeader name={shell?.name ?? null} actingFor={!!viewer.actingFor} pending={shell?.pending ?? 0} drafts={shell?.drafts ?? 0} unread={shell?.unread ?? 0} />
      <main className="max-w-6xl mx-auto px-4 py-6"><PageTransition>{children}</PageTransition></main>
      <PatientLegalFooter version={PRIVACY_NOTICE_VERSION} />
    </div>
  );
}
