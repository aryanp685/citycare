import { viewerForPage } from "@/lib/session";
import { all } from "@/lib/db";
import { fmtIstDateTime } from "@/lib/dates";
import { Card, EmptyNote, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function DoctorActivity() {
  const v = await viewerForPage("DOCTOR");
  const events = await all<{ seq: string; when: Date; patientName: string; action: string }>(
    `SELECT a."seq"::text, a."createdAt" AS "when", p."fullName" AS "patientName", a.action
       FROM "AuditLog" a JOIN "Patient" p ON p.id=a."entityId"
      WHERE a."actorId"=$1 AND a."entityType"='Patient'
        AND a.action IN ('VIEW_RECORD','VIEW_DENIED','CREATE_ENCOUNTER','WRITE_DENIED','REQUEST_CONSENT','EMERGENCY_ACCESS')
        AND (EXISTS (SELECT 1 FROM "Appointment" ap WHERE ap."doctorId"=$2 AND ap."patientId"=p.id)
          OR EXISTS (SELECT 1 FROM "Consent" c WHERE c."doctorId"=$2 AND c."patientId"=p.id))
      ORDER BY a."seq" DESC LIMIT 100`, [v.uid, v.profileId]);
  return <div className="space-y-5"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-brand">Doctor workspace</p><h1 className="text-3xl font-bold tracking-tight mt-2">Your activity</h1><p className="text-sm text-muted mt-2">Your recorded actions for connected patients. This is a view of the existing audit ledger, not a separate log.</p></div><Card>
    <div className="flex flex-wrap justify-between gap-2 mb-3"><h2 className="font-bold text-lg">Recent record activity</h2><Badge tone="off">Last 100 events</Badge></div>
    {events.length === 0 ? <EmptyNote>No matching recorded activity yet.</EmptyNote> : <ol className="divide-y divide-line">{events.map(e => <li key={e.seq} className="py-3 flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold break-words">{e.patientName}</p><p className="text-xs text-muted mt-1">{fmtIstDateTime(String(e.when))} · ledger #{e.seq}</p></div><Badge tone={e.action.includes("DENIED") ? "warn" : "off"}>{e.action.replaceAll("_", " ").toLowerCase()}</Badge></li>)}</ol>}
  </Card><p className="text-xs text-muted">Shows only your actions for connected patients. Consent decisions and events by other actors are available to the patient in their access history.</p></div>;
}
