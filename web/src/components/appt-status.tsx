"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "./api-client";

const NEXT: Record<string, { to: string; label: string }[]> = {
  PENDING: [{ to: "CONFIRMED", label: "Confirm" }, { to: "CANCELLED_BY_DOCTOR", label: "Cancel" }, { to: "NO_SHOW", label: "No-show" }],
  CONFIRMED: [{ to: "CHECKED_IN", label: "Check in" }, { to: "CANCELLED_BY_DOCTOR", label: "Cancel" }, { to: "NO_SHOW", label: "No-show" }],
  CHECKED_IN: [{ to: "COMPLETED", label: "Complete" }, { to: "NO_SHOW", label: "No-show" }],
  RESCHEDULED: [{ to: "CONFIRMED", label: "Confirm" }, { to: "CHECKED_IN", label: "Check in" }, { to: "COMPLETED", label: "Complete" }, { to: "CANCELLED_BY_DOCTOR", label: "Cancel" }, { to: "NO_SHOW", label: "No-show" }],
};

export function ApptStatusButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const opts = NEXT[status] ?? [];
  if (opts.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {opts.map((o) => (
        <button
          key={o.to}
          className="btn btn-ghost text-xs"
          disabled={busy}
          onClick={async () => {
            if (o.to === "COMPLETED" && !window.confirm("Complete this appointment? The patient's auto-revoke setting may end sharing for this visit.")) return;
            if (o.to === "NO_SHOW" && !window.confirm("Mark this appointment as a no-show?")) return;
            if (o.to === "CANCELLED_BY_DOCTOR" && !window.confirm("Cancel this appointment? This does not revoke an existing consent.")) return;
            setBusy(true); setError(null); setMessage(null);
            const r = await callApi(`/api/doctor/appointments/${id}/status`, { method: "PATCH", body: { status: o.to } });
            setBusy(false);
            if (!r.ok) { setError(r.error); return; }
            setMessage("Appointment updated.");
            router.refresh();
          }}
        >
          {o.label}
        </button>
      ))}
      {error && <span role="alert" className="text-xs text-[var(--danger)]">{error}</span>}
      {message && <span role="status" className="text-xs text-brand">{message}</span>}
    </span>
  );
}
