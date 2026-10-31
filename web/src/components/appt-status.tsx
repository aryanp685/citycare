"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "./api-client";

const NEXT: Record<string, { to: string; label: string }[]> = {
  PENDING: [{ to: "CONFIRMED", label: "Confirm" }],
  CONFIRMED: [{ to: "CHECKED_IN", label: "Check in" }, { to: "NO_SHOW", label: "No-show" }],
  CHECKED_IN: [{ to: "COMPLETED", label: "Complete" }],
};

export function ApptStatusButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const opts = NEXT[status] ?? [];
  if (opts.length === 0) return null;
  return (
    <span className="flex gap-1.5">
      {opts.map((o) => (
        <button
          key={o.to}
          className="btn btn-ghost text-xs"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await callApi(`/api/doctor/appointments/${id}/status`, { method: "PATCH", body: { status: o.to } });
            setBusy(false);
            if (!r.ok) window.alert(r.error);
            router.refresh();
          }}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
