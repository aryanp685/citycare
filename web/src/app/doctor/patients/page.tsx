import Link from "next/link";
import { all } from "@/lib/db";
import { viewerForPage } from "@/lib/session";
import { Card, Badge, EmptyNote } from "@/components/ui";
import { fmtIstDateTime } from "@/lib/repo";
import { RequestAccess } from "@/components/request-access";

export const dynamic = "force-dynamic";

/** Only patients already connected by a booking or consent are discoverable. */
export default async function DoctorPatients({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const v = await viewerForPage("DOCTOR");
  const { q = "" } = await searchParams;
  const query = q.slice(0, 100);
  const like = `%${query.trim().toLowerCase()}%`;
  const rows = await all<{ id: string; fullName: string; lastVisit: Date | null; nextAppt: Date | null; consent: string | null; expiresAt: Date | null; emergency: boolean; accesses: number; hasAppointment: boolean }>(
    `WITH pairs AS (
       SELECT "patientId" FROM "Consent" WHERE "doctorId"=$1
       UNION SELECT "patientId" FROM "Appointment" WHERE "doctorId"=$1
     ), last_consent AS (
       SELECT DISTINCT ON ("patientId") "patientId", status, "expiresAt", "isEmergencyOverride"
         FROM "Consent" WHERE "doctorId"=$1 ORDER BY "patientId", "requestedAt" DESC
     )
     SELECT p.id, p."fullName",
            (SELECT max(e."encounterDate") FROM "Encounter" e WHERE e."patientId"=p.id AND e."doctorId"=$1) AS "lastVisit",
            (SELECT min(a."scheduledAt") FROM "Appointment" a WHERE a."patientId"=p.id AND a."doctorId"=$1 AND a."scheduledAt" > now() AND a.status IN ('PENDING','CONFIRMED')) AS "nextAppt",
            EXISTS(SELECT 1 FROM "Appointment" a WHERE a."patientId"=p.id AND a."doctorId"=$1) AS "hasAppointment",
            CASE WHEN lc.status='APPROVED' AND lc."expiresAt" > now() THEN 'LIVE'
                 WHEN lc.status IN ('APPROVED','REQUESTED') AND lc."expiresAt" <= now() THEN 'EXPIRED' ELSE lc.status::text END AS consent,
            lc."expiresAt", COALESCE(lc."isEmergencyOverride", false) AS emergency,
            (SELECT count(*)::int FROM "AuditLog" al WHERE al."actorId"=$2 AND al."entityId"=p.id AND al.action='VIEW_RECORD') AS accesses
       FROM pairs JOIN "Patient" p ON p.id = pairs."patientId" JOIN "User" u ON u.id = p."userId"
       LEFT JOIN last_consent lc ON lc."patientId" = p.id
      WHERE ($3 = '%%' OR lower(p."fullName") LIKE $3 OR u.phone LIKE $3)
      ORDER BY (lc.status='APPROVED' AND lc."expiresAt" > now()) DESC NULLS LAST, "nextAppt" NULLS LAST, p."fullName"
      LIMIT 100`, [v.profileId, v.uid, like],
  );
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-brand">Doctor workspace</p><h1 className="text-3xl font-bold tracking-tight mt-2">Your patients</h1><p className="text-sm text-muted mt-2">People connected through appointments or sharing. Clinical records stay closed until consent is active.</p></div><Badge tone="off">{rows.length} shown · up to 100</Badge></div>
    <form className="flex flex-wrap gap-2" action="/doctor/patients"><label htmlFor="patient-search" className="sr-only">Search connected patients by name or phone</label><input id="patient-search" name="q" defaultValue={query} maxLength={100} placeholder="Search connected patients" className="border border-line rounded-xl px-4 py-3 text-sm w-full sm:max-w-sm bg-white" /><button className="btn btn-primary">Search</button></form>
    {rows.length === 0 ? <Card><EmptyNote>{query ? "No connected patients match this search." : "No connected patients yet. Patients appear after a booking or sharing consent."}</EmptyNote></Card> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{rows.map(r => <Card key={r.id} className="min-w-0 flex flex-col">
      <div className="flex justify-between gap-3 items-start"><div className="min-w-0"><h2 className="font-bold text-lg break-words">{r.fullName}</h2><p className="text-xs text-muted mt-1">{r.hasAppointment ? "Appointment relationship" : "Sharing relationship"}</p></div><Badge tone={r.consent === "LIVE" ? "live" : r.consent === "REQUESTED" ? "warn" : "off"}>{r.consent === "LIVE" ? `Active${r.emergency ? " · emergency" : ""}` : (r.consent ?? "no consent").toLowerCase()}</Badge></div>
      <dl className="grid grid-cols-2 gap-3 mt-5 text-sm"><div><dt className="text-xs text-muted">Next appointment</dt><dd className="mt-1">{r.nextAppt ? fmtIstDateTime(String(r.nextAppt)) : "None scheduled"}</dd></div><div><dt className="text-xs text-muted">Last consultation</dt><dd className="mt-1">{r.lastVisit ? fmtIstDateTime(String(r.lastVisit)) : "None recorded"}</dd></div><div><dt className="text-xs text-muted">Your recorded reads</dt><dd className="mt-1">{r.accesses}</dd></div><div><dt className="text-xs text-muted">Access until</dt><dd className="mt-1">{r.consent === "LIVE" && r.expiresAt ? fmtIstDateTime(String(r.expiresAt)) : "—"}</dd></div></dl>
      <Link className="btn btn-ghost mt-4 self-start" href={`/doctor/patients/${r.id}`}>Open workspace →</Link>
      {r.hasAppointment && r.consent !== "LIVE" && r.consent !== "REQUESTED" && <RequestAccess patientId={r.id} />}
    </Card>)}</div>}
    {rows.length === 100 && <p className="text-sm text-muted">Showing the first 100 matches. Refine your search to find a patient.</p>}
  </div>;
}
