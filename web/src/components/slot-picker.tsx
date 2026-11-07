"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { callApi } from "./api-client";
import { useLocale } from "./use-locale";
import { interpolate } from "@/lib/document-i18n";
import type { MessageKey } from "@/lib/i18n";

type Slot = { iso: string; wall: string; left: number };
type Day = { date: string; slots: Slot[] };
const REFRESH_MS = 45_000;

/** The server remains authoritative for availability, capacity and booking. */
export function SlotPicker({ doctorId, doctorName, fee, grid: initial }: { doctorId: string; doctorName: string; fee: number; grid: Day[] }) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const dateTime = (value: string) => new Intl.DateTimeFormat(`${locale}-IN`, { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  const [grid, setGrid] = useState<Day[]>(initial);
  const [date, setDate] = useState<string | null>(initial.find((g) => g.slots.length > 0)?.date ?? null);
  const [iso, setIso] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; key: MessageKey<"appointments">; bookedIso?: string; access?: boolean; error?: string } | null>(null);
  const inflight = useRef(false);
  const booking = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current || document.visibilityState === "hidden") return;
    inflight.current = true; setRefreshing(true);
    try {
      const r = await fetch(`/api/patient/doctors/${encodeURIComponent(doctorId)}/slots`, { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) throw new Error("availability unavailable");
      const j = (await r.json()) as { grid?: Day[] };
      if (!Array.isArray(j.grid)) throw new Error("invalid availability response");
      const next = j.grid;
      setGrid(next);
      setRefreshedAt(new Date()); setRefreshError(false);
      setIso((cur) => (cur && next.some((g) => g.slots.some((s) => s.iso === cur)) ? cur : null));
    } catch {
      setRefreshError(true);
    } finally {
      inflight.current = false; setRefreshing(false);
    }
  }, [doctorId]);

  useEffect(() => {
    const t = setInterval(() => void refresh(), REFRESH_MS);
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [refresh]);

  const days = grid.filter((g) => g.slots.length > 0);
  const day = days.find((g) => g.date === date) ?? days[0] ?? null;
  const selected = day?.slots.find((slot) => slot.iso === iso);

  async function book() {
    if (!iso || !day || !selected || booking.current || uncertain) return;
    const bookedIso = iso;
    booking.current = true; setBusy(true); setMsg(null);
    try {
      const r = await callApi("/api/patient/appointments", { method: "POST", body: { doctorId, scheduledAt: bookedIso, reason: reason.trim() || undefined } });
      if (r.ok) {
        const d = r.data as { consentRequested?: boolean };
        setMsg({ kind: "ok", key: "bookingSuccess", bookedIso, access: d.consentRequested });
        setIso(null); setReason("");
        void refresh(); router.refresh();
      } else if (r.status === 0 || r.status >= 500) {
        setUncertain(true);
        setMsg({ kind: "err", key: "bookingUncertain" });
      } else if (r.code === "slot_full" || r.code === "already_booked" || r.code === "slot_not_offered") {
        setIso(null);
        setMsg({ kind: "err", key: "slotTaken" });
        void refresh();
      } else if (r.code === "token_race") {
        setMsg({ kind: "err", key: "tokenRace" });
        void refresh();
      } else if (r.code === "patient_overlap") {
        setMsg({ kind: "err", key: "overlap" });
      } else {
        setMsg({ kind: "err", key: "bookingError", error: r.error });
      }
    } finally {
      booking.current = false; setBusy(false);
    }
  }

  return (
    <div lang={locale} className="space-y-4">
      {msg && <p role={msg.kind === "ok" ? "status" : "alert"} className={`text-sm rounded-lg p-3 border ${msg.kind === "ok" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.bookedIso ? interpolate(t("appointments", msg.key), { doctor: doctorName, date: dateTime(msg.bookedIso) }) : msg.error && locale === "en" ? msg.error : t("appointments", msg.key)} {msg.access && t("appointments", "accessRequested")} {uncertain && <Link href="/patient/appointments" className="font-semibold underline">{t("appointments", "viewAppointments")}</Link>}</p>}
      {days.length === 0 ? <p className="text-sm text-muted">{t("appointments", "noSlots")}</p> : <>
        <div role="group" aria-label={t("appointments", "availableDates")} className="flex gap-2 flex-wrap">
          {days.map((g) => <button type="button" key={g.date} disabled={busy} aria-pressed={day?.date === g.date} onClick={() => { setDate(g.date); setIso(null); }} className={`px-3 py-2 rounded-lg text-sm font-semibold border ${day?.date === g.date ? "border-brand bg-teal-50 text-brand" : "border-line bg-white text-muted"}`}>
            {new Date(g.date + "T00:00:00Z").toLocaleDateString(`${locale}-IN`, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}<span className="ml-1 opacity-70">· {g.slots.length}</span>
          </button>)}
        </div>
        {day && <div role="group" aria-label={t("appointments", "availableTimes")} className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
          {day.slots.map((s) => <button type="button" key={s.iso} disabled={busy} aria-pressed={iso === s.iso} onClick={() => setIso(s.iso)} title={s.left > 1 ? interpolate(t("appointments", "seatsLeft"), { count: String(s.left) }) : undefined} className={`min-h-11 py-2 px-1 rounded-lg border text-sm font-semibold ${iso === s.iso ? "border-brand bg-teal-600 text-white" : "border-line bg-white hover:border-teal-500"}`}>
            {s.wall}{s.left > 1 && <span className="block text-[10px] font-normal opacity-70">{interpolate(t("appointments", "left"), { count: String(s.left) })}</span>}
          </button>)}
        </div>}
        <p className="text-sm text-muted">{selected && iso ? interpolate(t("appointments", "selected"), { date: dateTime(iso) }) : t("appointments", "chooseSlot")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="field flex-1 min-w-0 basis-56"><span>{t("appointments", "reasonLabel")}</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} placeholder={t("appointments", "reasonPlaceholder")} /></label>
          <button type="button" className="btn btn-primary" disabled={!selected || busy || uncertain} onClick={() => void book()}>{busy ? t("appointments", "booking") : selected ? interpolate(t("appointments", "confirmFee"), { fee: new Intl.NumberFormat(`${locale}-IN`, { style: "currency", currency: "INR" }).format(fee) }) : t("appointments", "pickSlot")}</button>
        </div>
      </>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost text-xs" disabled={refreshing} onClick={() => void refresh()}>{t("appointments", refreshing ? "refreshing" : "refresh")}</button>
        {refreshedAt && !refreshError && <span className="text-xs text-muted">{interpolate(t("appointments", "updated"), { time: new Intl.DateTimeFormat(`${locale}-IN`, { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(refreshedAt) })}</span>}
      </div>
      {refreshError && <p role="alert" className="text-sm text-red-700">{t("appointments", "refreshError")}</p>}
    </div>
  );
}
