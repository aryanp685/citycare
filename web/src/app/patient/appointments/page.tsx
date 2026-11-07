import Link from "next/link";
import { viewerForPage } from "@/lib/session";
import { all } from "@/lib/db";
import { Badge, Card, EmptyNote } from "@/components/ui";
import { WorkspaceHeading } from "@/components/workspace-heading";
import { CancelAppointment } from "@/components/cancel-appointment";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;
const appointmentDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

type Appointment = { id: string; scheduledAt: Date; status: string; tokenNo: number | null; reason: string | null; doctorName: string; doctorId: string };

/** Patient-owned appointment history. Data is selected using the server-side patient session. */
export default async function PatientAppointments({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const viewer = await viewerForPage("PATIENT");
  const { page: rawPage } = await searchParams;
  const requested = typeof rawPage === "string" && /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Number.isSafeInteger(requested) && requested >= 1 && requested <= 500 ? requested : 1;
  const appointments = await all<Appointment>(
    `SELECT a.id, a."scheduledAt", a.status, a."tokenNo", a.reason, d."fullName" AS "doctorName", d.id AS "doctorId"
       FROM "Appointment" a JOIN "Doctor" d ON d.id=a."doctorId"
      WHERE a."patientId"=$1
      ORDER BY a."scheduledAt" DESC, a.id DESC LIMIT $2 OFFSET $3`,
    [viewer.profileId, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE],
  );
  const hasMore = appointments.length > PAGE_SIZE;
  const rows = appointments.slice(0, PAGE_SIZE);
  return <div className="space-y-6">
    <WorkspaceHeading eyebrow="Patient workspace" title="Appointments" description="Review your bookings and past appointments. Changes are confirmed by the server." actions={<Link className="btn btn-primary" href="/patient/doctors">Find a doctor</Link>} />
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3"><h2 className="font-bold">Your appointments</h2><span className="text-xs text-muted">Page {page} · up to {PAGE_SIZE} per page</span></div>
      {rows.length === 0 ? <EmptyNote>{page === 1 ? "No appointments yet. Find a doctor to make a booking." : "No appointments on this page."}</EmptyNote> : <ul className="divide-y divide-line">
        {rows.map((a) => <li key={a.id} className="py-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold break-words">{a.doctorName}</h3><Badge tone="off">{a.status.replaceAll("_", " ").toLowerCase()}</Badge></div>
            <p className="text-sm text-muted mt-1">{appointmentDate.format(new Date(a.scheduledAt))} IST{a.tokenNo != null ? ` · Token #${a.tokenNo}` : ""}</p>
            <details className="mt-2 text-sm"><summary className="cursor-pointer text-brand font-semibold">Appointment details</summary><p className="text-muted mt-2 break-words">Reason: {a.reason || "Not provided"}</p><Link href={`/patient/doctors/${a.doctorId}`} className="inline-block mt-2 text-brand font-semibold">View doctor profile →</Link></details>
          </div>
          {["PENDING", "CONFIRMED"].includes(a.status) && <CancelAppointment id={a.id} />}
        </li>)}
      </ul>}
      <nav aria-label="Appointment pages" className="flex items-center gap-3 mt-4">
        {page > 1 && <Link className="btn btn-ghost" href={`/patient/appointments?page=${page - 1}`}>Previous</Link>}
        {hasMore && page < 500 && <Link className="btn btn-ghost" href={`/patient/appointments?page=${page + 1}`}>Next</Link>}
      </nav>
    </Card>
  </div>;
}
