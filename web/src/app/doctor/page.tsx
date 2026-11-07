import Link from "next/link";
import { viewerForPage } from "@/lib/session";
import { all, one } from "@/lib/db";
import { Card, EmptyNote, Badge } from "@/components/ui";
import { fmtIstDateTime } from "@/lib/repo";
import { ApptStatusButtons } from "@/components/appt-status";
import { SecurityPanel } from "@/components/security-panel";
import { WorkspaceHeading } from "@/components/workspace-heading";

export const dynamic = "force-dynamic";
export default async function DoctorToday() {
  const v = await viewerForPage("DOCTOR");
  const [stats, rows, upcoming] = await Promise.all([
    one<{ today: number; upcoming: number; connected: number; pending: number }>(`SELECT
      (SELECT count(*)::int FROM "Appointment" a WHERE a."doctorId"=$1 AND a."scheduledAt" >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' AND a."scheduledAt" < (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + interval '1 day') AT TIME ZONE 'Asia/Kolkata' AND a.status NOT IN ('CANCELLED_BY_PATIENT','CANCELLED_BY_DOCTOR')) AS today,
      (SELECT count(*)::int FROM "Appointment" a WHERE a."doctorId"=$1 AND a."scheduledAt">now() AND a.status IN ('PENDING','CONFIRMED','CHECKED_IN','RESCHEDULED')) AS upcoming,
      (SELECT count(*)::int FROM (SELECT "patientId" FROM "Appointment" WHERE "doctorId"=$1 UNION SELECT "patientId" FROM "Consent" WHERE "doctorId"=$1) p) AS connected,
      (SELECT count(*)::int FROM "Consent" c WHERE c."doctorId"=$1 AND c.status='REQUESTED' AND c."expiresAt">now()) AS pending`, [v.profileId]),
    all<{ id: string; scheduledAt: Date; status: string; tokenNo: number | null; reason: string | null; patientId: string; patientName: string; consentStatus: string | null }>(
      `SELECT a.id, a."scheduledAt", a.status, a."tokenNo", a.reason, a."patientId", p."fullName" AS "patientName",
        (SELECT c.status FROM "Consent" c WHERE c."doctorId"=a."doctorId" AND c."patientId"=a."patientId" AND c."expiresAt">now() ORDER BY c."requestedAt" DESC LIMIT 1) AS "consentStatus"
       FROM "Appointment" a JOIN "Patient" p ON p.id=a."patientId" WHERE a."doctorId"=$1
       AND a."scheduledAt" >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
       AND a."scheduledAt" < (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + interval '1 day') AT TIME ZONE 'Asia/Kolkata'
       AND a.status NOT IN ('CANCELLED_BY_PATIENT','CANCELLED_BY_DOCTOR') ORDER BY a."scheduledAt" LIMIT 40`, [v.profileId]),
    all<{ id: string; scheduledAt: Date; patientName: string; status: string }>(`SELECT a.id, a."scheduledAt", p."fullName" AS "patientName", a.status FROM "Appointment" a JOIN "Patient" p ON p.id=a."patientId" WHERE a."doctorId"=$1 AND a."scheduledAt">now() AND a.status IN ('PENDING','CONFIRMED','CHECKED_IN','RESCHEDULED') ORDER BY a."scheduledAt" LIMIT 5`, [v.profileId]),
  ]);
  const cards = [{ label: "Today's appointments", value: stats?.today ?? 0, note: "India Standard Time" }, { label: "Upcoming bookings", value: stats?.upcoming ?? 0, note: "From now onwards" }, { label: "Connected patients", value: stats?.connected ?? 0, note: "Through bookings or sharing" }, { label: "Awaiting patient decision", value: stats?.pending ?? 0, note: "Unexpired access requests" }];
  return <div className="space-y-6">
    <WorkspaceHeading eyebrow="Doctor workspace" title="Your day, at a glance" description="Your appointments and patient connections, in one place." actions={<Link href="/doctor/patients" className="btn btn-primary">View patients →</Link>} />
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{cards.map(c => <div key={c.label} className="workspace-metric min-w-0"><p className="text-xs font-semibold text-muted">{c.label}</p><p className="text-3xl font-bold tracking-tight mt-3">{c.value}</p><p className="text-xs text-muted mt-2">{c.note}</p></div>)}</div>
    <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start"><Card className="min-w-0"><div className="flex justify-between items-start gap-3 mb-4"><div><h2 className="font-bold text-lg">Today&apos;s schedule</h2><p className="text-xs text-muted mt-1">Showing up to 40 appointments · IST</p></div><Badge tone="off">{stats?.today ?? 0} today</Badge></div>
      {rows.length === 0 ? <EmptyNote>No appointments today. New patient bookings will appear here.</EmptyNote> : <div className="divide-y divide-line">{rows.map(r => <div key={r.id} className="py-4 first:pt-0 flex flex-wrap justify-between items-start gap-3"><div className="min-w-0"><p className="font-semibold break-words">{r.patientName}</p><p className="text-sm text-muted mt-1">{fmtIstDateTime(String(r.scheduledAt))} {r.tokenNo != null ? `· Token ${r.tokenNo}` : ""}</p><p className="text-xs text-muted mt-1 break-words">{r.reason || "No reason provided"} · {r.consentStatus === "APPROVED" ? "Active sharing" : "Record not shared"}</p></div><div className="flex flex-wrap gap-2 items-center"><Badge tone={r.status === "COMPLETED" ? "off" : r.status === "CHECKED_IN" ? "live" : "warn"}>{r.status.replaceAll("_", " ")}</Badge>{r.consentStatus === "APPROVED" && <Link className="btn btn-ghost" href={`/doctor/patients/${r.patientId}`}>Open</Link>}<ApptStatusButtons id={r.id} status={r.status} /></div></div>)}</div>}
    </Card><div className="space-y-4"><Card><h2 className="font-bold text-lg">Coming up</h2><p className="text-xs text-muted mt-1">Next five active bookings</p>{upcoming.length === 0 ? <EmptyNote>No upcoming appointments.</EmptyNote> : <ul className="mt-3 divide-y divide-line">{upcoming.map(a => <li key={a.id} className="py-3"><p className="text-sm font-semibold break-words">{a.patientName}</p><p className="text-xs text-muted mt-1">{fmtIstDateTime(String(a.scheduledAt))} · {a.status.replaceAll("_", " ")}</p></li>)}</ul>}</Card><Card><h2 className="font-bold text-lg">Account security</h2><p className="text-xs text-muted mt-1 mb-3">Manage recovery codes, email verification and active sessions.</p><SecurityPanel /></Card></div></div>
  </div>;
}
