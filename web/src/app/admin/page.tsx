import { all } from "@/lib/db";
import { viewerForPage } from "@/lib/session";
import { Card, SectionTitle, Badge, EmptyNote } from "@/components/ui";
import { VerifyButtons } from "@/components/verify-buttons";
import { fmtIstDateTime } from "@/lib/repo";

type Row = {
  id: string; fullName: string; email: string; phone: string; qualification: string; registrationNo: string | null; hprId: string | null;
  specialties: string[]; createdAt: Date; isVerified: boolean; verifiedAt: Date | null; rejectedAt: Date | null; verificationNote: string | null;
};

export default async function AdminHome() {
  await viewerForPage(["SUPER_ADMIN", "HOSPITAL_ADMIN"]);
  const rows = await all<Row>(
    `SELECT d.id, d."fullName", u.email, u.phone, d.qualification, d."registrationNo", d."hprId",
            COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE s.id IS NOT NULL), '{}') AS specialties,
            d."createdAt", d."isVerified", d."verifiedAt", d."rejectedAt", d."verificationNote"
       FROM "Doctor" d JOIN "User" u ON u.id = d."userId"
       LEFT JOIN "DoctorSpecialty" ds ON ds."doctorId" = d.id LEFT JOIN "Specialty" s ON s.id = ds."specialtyId"
      GROUP BY d.id, u.email, u.phone
      ORDER BY (NOT d."isVerified" AND d."rejectedAt" IS NULL) DESC, d."createdAt" DESC
      LIMIT 60`,
  );
  const pending = rows.filter((r) => !r.isVerified && !r.rejectedAt);
  const decided = rows.filter((r) => r.isVerified || r.rejectedAt);

  return (
    <div className="grid gap-4">
      <Card>
        <SectionTitle right={<Badge tone={pending.length ? "warn" : "live"}>{pending.length} pending</Badge>}>Registrations awaiting verification</SectionTitle>
        <p className="text-sm text-muted mb-3">
          Check the number on the State Medical Council / NMC Indian Medical Register before approving. Every decision is written to the ledger
          and the doctor is notified. Unverified doctors are invisible to patients and cannot open any record.
        </p>
        {pending.length === 0 ? <EmptyNote>Queue is empty.</EmptyNote> : (
          <table className="data">
            <thead><tr><th>Doctor</th><th>Registration</th><th>Qualification · specialty</th><th>Contact</th><th>Signed up</th><th></th></tr></thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.fullName}</td>
                  <td><span className="kbd">{r.registrationNo ?? "—"}</span>{r.hprId && <div className="text-[11px] text-muted mt-1">HPR {r.hprId}</div>}</td>
                  <td className="text-xs">{r.qualification}<div className="text-muted">{r.specialties.join(", ")}</div></td>
                  <td className="text-xs">{r.email}<div className="text-muted">{r.phone}</div></td>
                  <td className="text-xs">{fmtIstDateTime(String(r.createdAt))}</td>
                  <td><VerifyButtons doctorId={r.id} registrationNo={r.registrationNo} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card>
        <SectionTitle>Recent decisions</SectionTitle>
        {decided.length === 0 ? <EmptyNote>None yet.</EmptyNote> : (
          <table className="data">
            <thead><tr><th>Doctor</th><th>Registration</th><th>Status</th><th>Note</th><th>When</th><th></th></tr></thead>
            <tbody>
              {decided.slice(0, 25).map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.fullName}</td>
                  <td><span className="kbd">{r.registrationNo ?? "—"}</span></td>
                  <td>{r.isVerified ? <Badge tone="live">verified</Badge> : <Badge tone="crit">rejected</Badge>}</td>
                  <td className="text-xs text-muted">{r.verificationNote ?? "—"}</td>
                  <td className="text-xs">{fmtIstDateTime(String(r.verifiedAt ?? r.rejectedAt ?? r.createdAt))}</td>
                  <td>{r.rejectedAt && <VerifyButtons doctorId={r.id} registrationNo={r.registrationNo} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
