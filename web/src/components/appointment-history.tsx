"use client";
import Link from "next/link";
import { Badge, Card, EmptyNote } from "@/components/ui";
import { WorkspaceHeading } from "@/components/workspace-heading";
import { CancelAppointment } from "@/components/cancel-appointment";
import { useLocale } from "@/components/use-locale";
import { interpolate } from "@/lib/document-i18n";
import type { MessageKey } from "@/lib/i18n";

type Appointment = { id: string; scheduledAt: string; status: string; tokenNo: number | null; reason: string | null; doctorName: string; doctorId: string };
const STATUS: Record<string, MessageKey<"appointments">> = {
  PENDING: "statusPending", CONFIRMED: "statusConfirmed", CHECKED_IN: "statusCheckedIn", COMPLETED: "statusCompleted",
  CANCELLED_BY_PATIENT: "statusPatientCancelled", CANCELLED_BY_DOCTOR: "statusDoctorCancelled", NO_SHOW: "statusNoShow", RESCHEDULED: "statusRescheduled",
};

export function AppointmentHistory({ rows, page, hasMore, pageSize }: { rows: Appointment[]; page: number; hasMore: boolean; pageSize: number }) {
  const { locale, t } = useLocale();
  const fmt = new Intl.DateTimeFormat(`${locale}-IN`, { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return <div lang={locale} className="space-y-6">
    <WorkspaceHeading eyebrow={t("appointments", "eyebrow")} title={t("appointments", "title")} description={t("appointments", "description")} actions={<Link className="btn btn-primary" href="/patient/doctors">{t("appointments", "findDoctor")}</Link>} />
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3"><h2 className="font-bold">{t("appointments", "yourAppointments")}</h2><span className="text-xs text-muted">{interpolate(t("appointments", "pageInfo"), { page: String(page), size: String(pageSize) })}</span></div>
      {rows.length === 0 ? <EmptyNote>{t("appointments", page === 1 ? "emptyFirst" : "emptyPage")}</EmptyNote> : <ul className="divide-y divide-line">
        {rows.map((a) => <li key={a.id} className="py-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold break-words"><bdi>{a.doctorName}</bdi></h3><Badge tone="off">{t("appointments", Object.hasOwn(STATUS, a.status) ? STATUS[a.status] : "statusUnknown")}</Badge></div>
            <p className="text-sm text-muted mt-1"><time dateTime={a.scheduledAt}>{fmt.format(new Date(a.scheduledAt))} IST</time>{a.tokenNo != null ? ` · ${interpolate(t("appointments", "token"), { number: String(a.tokenNo) })}` : ""}</p>
            <details className="mt-2 text-sm"><summary className="cursor-pointer text-brand font-semibold">{t("appointments", "details")}</summary><p className="text-muted mt-2 break-words">{t("appointments", "reason")}: {a.reason ? <bdi>{a.reason}</bdi> : t("appointments", "notProvided")}</p><Link href={`/patient/doctors/${encodeURIComponent(a.doctorId)}`} className="inline-block mt-2 text-brand font-semibold">{t("appointments", "profile")} →</Link></details>
          </div>
          {["PENDING", "CONFIRMED"].includes(a.status) && <CancelAppointment id={a.id} />}
        </li>)}
      </ul>}
      <nav aria-label={t("appointments", "pages")} className="flex flex-wrap items-center gap-3 mt-4">
        {page > 1 && <Link className="btn btn-ghost" href={`/patient/appointments?page=${page - 1}`}>{t("appointments", "previous")}</Link>}
        {hasMore && page < 500 && <Link className="btn btn-ghost" href={`/patient/appointments?page=${page + 1}`}>{t("appointments", "next")}</Link>}
      </nav>
      {hasMore && page === 500 && <p className="text-sm text-muted mt-2">{t("appointments", "limit")}</p>}
    </Card>
  </div>;
}
