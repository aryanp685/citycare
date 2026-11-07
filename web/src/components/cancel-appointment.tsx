"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "./api-client";
import { useLocale } from "./use-locale";

/** Uses the existing patient-owned cancellation endpoint; the server decides if it is cancellable. */
export function CancelAppointment({ id }: { id: string }) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  async function cancel() {
    if (!window.confirm(t("appointments", "cancelConfirm"))) return;
    setBusy(true); setError(null);
    const result = await callApi("/api/patient/appointments", { method: "PATCH", body: { appointmentId: id } });
    setBusy(false);
    if (!result.ok) {
      if (result.status === 0 || result.status >= 500) { setUncertain(true); setError(null); router.refresh(); return; }
      setError(result.error); return;
    }
    setDone(true); router.refresh();
  }
  return <div lang={locale} className="grid gap-1 justify-items-start">
    {!done && <button type="button" className="btn btn-ghost text-xs" disabled={busy || uncertain} onClick={cancel}>{t("appointments", busy ? "cancelling" : "cancel")}</button>}
    {done && <p className="text-sm text-brand" role="status">{t("appointments", "cancelled")}</p>}
    {uncertain && <div role="alert" className="text-sm text-[var(--danger)]"><p>{t("appointments", "cancelUncertain")}</p><button type="button" className="btn btn-ghost text-xs" onClick={() => window.location.reload()}>{t("appointments", "reload")}</button></div>}
    {error && <p className="text-sm text-[var(--danger)]" role="alert">{locale === "en" ? error : t("appointments", "cancelError")}</p>}
  </div>;
}
