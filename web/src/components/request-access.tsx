"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "./api-client";

export function RequestAccess({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [scope, setScope] = useState("LAST_N_ENCOUNTERS");
  const [purpose, setPurpose] = useState("TREATMENT");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    const result = await callApi(`/api/doctor/patients/${patientId}/request-access`, { method: "POST", body: { scope, purpose } });
    setBusy(false);
    if (!result.ok) { setMessage(result.error); return; }
    setMessage("Request sent to the patient’s CityCare inbox. Access remains closed until approval.");
    router.refresh();
  }
  return <form onSubmit={submit} className="grid gap-2 mt-3 border-t border-line pt-3">
    <p className="text-xs text-muted">Ask for access · the patient decides. Request expires after 7 days.</p>
    <label className="field"><span>Requested scope</span><select value={scope} onChange={e => setScope(e.target.value)}><option value="SUMMARY_ONLY">Summary and safety facts</option><option value="LAST_N_ENCOUNTERS">Last 3 visits</option><option value="FULL_RECORD">Full record</option></select></label>
    <label className="field"><span>Purpose</span><select value={purpose} onChange={e => setPurpose(e.target.value)}><option value="TREATMENT">Treatment</option><option value="SECOND_OPINION">Second opinion</option></select></label>
    <button className="btn btn-ghost justify-self-start" disabled={busy}>{busy ? "Sending…" : "Request access"}</button>
    {message && <p role="status" className="text-xs text-muted">{message}</p>}
  </form>;
}
