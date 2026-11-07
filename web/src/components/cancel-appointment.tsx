"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "./api-client";

/** Uses the existing patient-owned cancellation endpoint; the server decides if it is cancellable. */
export function CancelAppointment({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function cancel() {
    if (!window.confirm("Cancel this appointment? A pending access request for this visit may also close. Existing approved sharing is not revoked by cancellation.")) return;
    setBusy(true); setError(null);
    const result = await callApi("/api/patient/appointments", { method: "PATCH", body: { appointmentId: id } });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setDone(true); router.refresh();
  }
  return <div className="grid gap-1 justify-items-start">
    {!done && <button type="button" className="btn btn-ghost text-xs" disabled={busy} onClick={cancel}>{busy ? "Cancelling…" : "Cancel appointment"}</button>}
    {done && <p className="text-sm text-brand" role="status">Appointment cancelled.</p>}
    {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
  </div>;
}
