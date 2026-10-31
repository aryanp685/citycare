"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "./api-client";

type Slot = { iso: string; wall: string; left: number };
type Day = { date: string; slots: Slot[] };

const REFRESH_MS = 45_000;

/**
 * D7: the grid arrives server-rendered but a tab left open goes stale, so the picker re-fetches
 * `/api/patient/doctors/[id]/slots` every 45 s, whenever the tab becomes visible again, and after
 * any "slot_full" answer. The selected instant survives a refresh only if it is still open.
 */
export function SlotPicker({ doctorId, doctorName, fee, grid: initial }: { doctorId: string; doctorName: string; fee: number; grid: Day[] }) {
  const router = useRouter();
  const [grid, setGrid] = useState<Day[]>(initial);
  const [date, setDate] = useState<string | null>(initial.find((g) => g.slots.length > 0)?.date ?? null);
  const [iso, setIso] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current || document.visibilityState === "hidden") return;
    inflight.current = true;
    try {
      const r = await fetch(`/api/patient/doctors/${doctorId}/slots`, { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { grid: Day[] };
      setGrid(j.grid);
      setRefreshedAt(new Date());
      setIso((cur) => (cur && j.grid.some((g) => g.slots.some((s) => s.iso === cur)) ? cur : null));
    } catch {
      /* transient — next tick retries */
    } finally {
      inflight.current = false;
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

  async function book() {
    if (!iso || !day) return;
    setBusy(true);
    const r = await callApi("/api/patient/appointments", { method: "POST", body: { doctorId, scheduledAt: iso, reason: reason || undefined } });
    setBusy(false);
    if (r.ok) {
      const d = r.data as { consentRequested?: boolean };
      setMsg({ kind: "ok", text: `Booked with ${doctorName} for ${day.date} ${new Date(new Date(iso).getTime() + 19.5 * 3600e3).toISOString().slice(11, 16)} IST.${d.consentRequested ? " Access request created — approve it on your dashboard when you are ready." : ""}` });
      setIso(null);
      void refresh();
      router.refresh();
    } else if (r.code === "slot_full" || r.code === "already_booked" || r.code === "token_race") {
      setMsg({ kind: "err", text: r.code === "token_race" ? "Two bookings collided on the queue number — please tap Confirm again." : "That slot just filled up. The list has been refreshed — pick another." });
      void refresh();
    } else if (r.code === "patient_overlap") {
      setMsg({ kind: "err", text: "You already have an appointment overlapping that time." });
    } else {
      setMsg({ kind: "err", text: r.error });
    }
  }

  if (days.length === 0) {
    return <p className="text-sm text-muted">No open slots in the next 14 days for this doctor. Try another doctor or check back after 19:00.</p>;
  }

  return (
    <div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {days.map((g) => (
          <button
            key={g.date}
            onClick={() => { setDate(g.date); setIso(null); }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${day?.date === g.date ? "border-brand bg-teal-50 text-brand" : "border-line bg-white text-muted"}`}
          >
            {new Date(g.date + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
            <span className="ml-1 opacity-70">· {g.slots.length}</span>
          </button>
        ))}
      </div>

      {day && (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
          {day.slots.map((s) => (
            <button
              key={s.iso}
              onClick={() => setIso(s.iso)}
              title={s.left > 1 ? `${s.left} seats left in this slot` : undefined}
              className={`py-1.5 rounded-lg border text-sm font-semibold ${iso === s.iso ? "border-brand bg-teal-600 text-white" : "border-line bg-white hover:border-teal-500"}`}
            >
              {s.wall}
              {s.left > 1 && <span className="block text-[10px] font-normal opacity-70">{s.left} left</span>}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="field flex-1 min-w-48">
          <span>Reason (optional, doctor sees this before the visit)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} placeholder="follow-up for sugar control" />
        </label>
        <button className="btn btn-primary" disabled={!iso || busy} onClick={book}>
          {busy ? "Booking…" : iso ? `Confirm · ₹${fee}` : "Pick a slot"}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={() => void refresh()} title="Slots also refresh automatically every 45 s and when you return to this tab">
          ↻ {refreshedAt ? `updated ${refreshedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "refresh"}
        </button>
      </div>
      {msg && (
        <p className={`mt-2 text-sm rounded-lg p-2 border ${msg.kind === "ok" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
