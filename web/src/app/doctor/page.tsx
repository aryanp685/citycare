import { viewerForPage } from "@/lib/session";
import { all } from "@/lib/db";
import { Card, SectionTitle, EmptyNote, Badge } from "@/components/ui";
import { fmtIstDateTime } from "@/lib/repo";
import { ApptStatusButtons } from "@/components/appt-status";
import { SecurityPanel } from "@/components/security-panel";

export default async function DoctorToday() {
  const v = await viewerForPage("DOCTOR");
  const rows = await all<Record<string, unknown>>(
    `SELECT a.id, a."scheduledAt", a.status, a."tokenNo", a.reason, a."notesForDoctor",
            a."patientId", p."fullName" AS "patientName", p.gender,
            (SELECT c.status FROM "Consent" c WHERE c."doctorId"=a."doctorId" AND c."patientId"=a."patientId"
              AND c."expiresAt" > now() ORDER BY c."requestedAt" DESC LIMIT 1) AS "consentStatus"
       FROM "Appointment" a
       JOIN "Patient" p ON p.id = a."patientId"
      WHERE a."doctorId" = $1
        AND a."scheduledAt" >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
        AND a."scheduledAt" < (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + interval '1 day') AT TIME ZONE 'Asia/Kolkata'
        AND a.status <> 'CANCELLED_BY_PATIENT'
      ORDER BY a."scheduledAt" LIMIT 40`,
    [v.profileId],
  );

  return (
    <>
    <Card>
      <SectionTitle right={<span className="text-xs text-muted">date window is in Asia/Kolkata, server-side</span>}>
        Today&apos;s list
      </SectionTitle>
      {rows.length === 0 ? (
        <EmptyNote>No appointments today. Bookings from patients appear here the moment they are made.</EmptyNote>
      ) : (
        <table className="data">
          <thead>
            <tr><th>Token</th><th>Time</th><th>Patient</th><th>Reason</th><th>Status</th><th>Record</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td className="kbd">#{String(r.tokenNo ?? "—")}</td>
                <td className="whitespace-nowrap">{fmtIstDateTime(String(r.scheduledAt))}</td>
                <td>
                  <span className="font-semibold">{String(r.patientName)}</span>
                  <span className="text-muted text-xs"> · {String(r.gender).toLowerCase()}</span>
                </td>
                <td className="text-xs text-muted max-w-56 truncate" title={String(r.notesForDoctor ?? "")}>{String(r.reason ?? "—")}</td>
                <td><Badge tone={r.status === "COMPLETED" ? "off" : r.status === "CHECKED_IN" ? "live" : "warn"}>{String(r.status)}</Badge></td>
                <td>
                  {r.consentStatus === "APPROVED" ? (
                    <a className="text-brand text-sm font-semibold" href={`/doctor/patients/${String(r.patientId)}`}>open →</a>
                  ) : (
                    <span className="text-xs text-muted">consent {String(r.consentStatus ?? "none").toLowerCase()}</span>
                  )}
                </td>
                <td><ApptStatusButtons id={String(r.id)} status={String(r.status)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
    <Card className="mt-4">
      <SectionTitle>Account security</SectionTitle>
      <p className="text-xs text-muted mb-2">Recovery codes, e-mail verification and your active sessions — doctors are the higher-value account, so keep the codes somewhere safe.</p>
      <SecurityPanel />
    </Card>
    </>
  );
}
