import { viewerForPage } from "@/lib/session";
import { all } from "@/lib/db";
import { AppointmentHistory } from "@/components/appointment-history";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

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
  return <AppointmentHistory rows={rows.map((a) => ({ ...a, scheduledAt: new Date(a.scheduledAt).toISOString() }))} page={page} hasMore={hasMore} pageSize={PAGE_SIZE} />;
}
