import { viewerForPage } from "@/lib/session";
import { all } from "@/lib/db";
import { SectionTitle } from "@/components/ui";
import { GrievanceAdmin } from "@/components/grievance-admin";
import { GRIEVANCE } from "@/lib/legal";

type Row = { id: string; category: string; subject: string; body: string; status: string; resolution: string | null; createdAt: Date; dueAt: Date; email: string; role: string; overdue: boolean };

export default async function AdminGrievances() {
  await viewerForPage("SUPER_ADMIN");
  const rows = await all<Row>(
    `SELECT g.id, g.category, g.subject, g.body, g.status, g.resolution, g."createdAt", g."dueAt",
            u.email, u.role::text AS role, (g."dueAt" < now() AND g.status IN ('OPEN','IN_PROGRESS')) AS overdue
       FROM "Grievance" g JOIN "User" u ON u.id = g."userId"
      WHERE g.status IN ('OPEN','IN_PROGRESS')
      ORDER BY overdue DESC, g."dueAt" ASC LIMIT 200`,
  );
  const closed = await all<Row>(
    `SELECT g.id, g.category, g.subject, g.body, g.status, g.resolution, g."createdAt", g."dueAt",
            u.email, u.role::text AS role, false AS overdue
       FROM "Grievance" g JOIN "User" u ON u.id = g."userId"
      WHERE g.status IN ('RESOLVED','REJECTED') ORDER BY g."resolvedAt" DESC LIMIT 20`,
  );
  const ser = (r: Row) => ({ ...r, createdAt: r.createdAt.toISOString(), dueAt: r.dueAt.toISOString() });
  return (
    <div className="grid gap-6">
      <div>
        <SectionTitle>Grievance desk</SectionTitle>
        <p className="text-sm text-muted mb-3">DPDP Act s.13 channel. Published response time: {GRIEVANCE.responseDays} days (overdue tickets turn red). Every status change is ledgered and the complainant is notified in their inbox.</p>
        <GrievanceAdmin rows={rows.map(ser)} />
      </div>
      {closed.length > 0 && (
        <div>
          <SectionTitle>Recently closed</SectionTitle>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th>Closed</th><th>Subject</th><th>Status</th><th>Resolution</th></tr></thead>
            <tbody>{closed.map((g) => <tr key={g.id} className="border-t border-line"><td className="py-1">{g.createdAt.toISOString().slice(0, 10)}</td><td>{g.subject}</td><td><span className="kbd">{g.status}</span></td><td>{g.resolution}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
