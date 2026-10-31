import Link from "next/link";
import { all } from "@/lib/db";
import { viewerForPage } from "@/lib/session";
import { Card, SectionTitle, Badge, EmptyNote } from "@/components/ui";
import { fmtIstDateTime } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Every patient who ever shared with (or booked) this doctor, with the CURRENT consent verdict — computed in SQL, on the DB clock. */
export default async function DoctorPatients({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const v = await viewerForPage("DOCTOR");
  const { q = "" } = await searchParams;
  const like = `%${q.trim().toLowerCase()}%`;
  const rows = await all<{ id: string; fullName: string; phone: string; lastVisit: Date | null; nextAppt: Date | null; consent: string | null; expiresAt: Date | null; emergency: boolean; accesses: number }>(
    `WITH pairs AS (
       SELECT "patientId" FROM "Consent" WHERE "doctorId"=$1
       UNION SELECT "patientId" FROM "Appointment" WHERE "doctorId"=$1
     ), last_consent AS (
       SELECT DISTINCT ON ("patientId") "patientId", status, "expiresAt", "isEmergencyOverride"
         FROM "Consent" WHERE "doctorId"=$1 ORDER BY "patientId", "requestedAt" DESC
     )
     SELECT p.id, p."fullName", u.phone,
            (SELECT max(e."encounterDate") FROM "Encounter" e WHERE e."patientId"=p.id AND e."doctorId"=$1) AS "lastVisit",
            (SELECT min(a."scheduledAt") FROM "Appointment" a WHERE a."patientId"=p.id AND a."doctorId"=$1 AND a."scheduledAt" > now() AND a.status IN ('PENDING','CONFIRMED')) AS "nextAppt",
            CASE WHEN lc.status='APPROVED' AND lc."expiresAt" > now() THEN 'LIVE'
                 WHEN lc.status='APPROVED' THEN 'EXPIRED' ELSE lc.status::text END AS consent,
            lc."expiresAt", COALESCE(lc."isEmergencyOverride", false) AS emergency,
            (SELECT count(*)::int FROM "AuditLog" al WHERE al."actorId"=$2 AND al."entityId"=p.id AND al.action='VIEW_RECORD') AS accesses
       FROM pairs JOIN "Patient" p ON p.id = pairs."patientId" JOIN "User" u ON u.id = p."userId"
       LEFT JOIN last_consent lc ON lc."patientId" = p.id
      WHERE ($3 = '%%' OR lower(p."fullName") LIKE $3 OR u.phone LIKE $3)
      ORDER BY (lc.status='APPROVED' AND lc."expiresAt" > now()) DESC, "nextAppt" NULLS LAST, p."fullName"
      LIMIT 100`,
    [v.profileId, v.uid, like],
  );
  return (
    <Card>
      <SectionTitle right={<Badge tone="off">{rows.length} patients</Badge>}>My patients</SectionTitle>
      <form className="flex gap-2 mb-3" action="/doctor/patients">
        <input name="q" defaultValue={q} placeholder="Search by name or phone" className="border border-line rounded-lg px-3 py-2 text-sm w-full max-w-sm" />
        <button className="btn btn-ghost">Search</button>
      </form>
      {rows.length === 0 ? <EmptyNote>No patients yet — they appear here after a booking or a consent.</EmptyNote> : (
        <table className="data">
          <thead><tr><th>Patient</th><th>Consent now</th><th>Next appointment</th><th>Last visit</th><th>Your reads</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold">{r.fullName}<div className="text-[11px] text-muted">{r.phone}</div></td>
                <td>
                  {r.consent === "LIVE" ? <Badge tone="live">live{r.emergency ? " · emergency" : ""}</Badge>
                    : r.consent === "REQUESTED" ? <Badge tone="warn">requested</Badge>
                    : r.consent ? <Badge tone="off">{r.consent.toLowerCase()}</Badge> : <Badge tone="off">none</Badge>}
                  {r.consent === "LIVE" && r.expiresAt && <div className="text-[11px] text-muted mt-1">until {fmtIstDateTime(String(r.expiresAt))}</div>}
                </td>
                <td className="text-xs">{r.nextAppt ? fmtIstDateTime(String(r.nextAppt)) : "—"}</td>
                <td className="text-xs">{r.lastVisit ? fmtIstDateTime(String(r.lastVisit)).slice(0, 11) : "—"}</td>
                <td>{r.accesses}</td>
                <td><Link className="btn btn-ghost" href={`/doctor/patients/${r.id}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
