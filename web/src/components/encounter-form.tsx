"use client";
import { useState } from "react";
import { callApi } from "./api-client";

type Item = { name: string; dosage: string; frequency: string; durationDays: string; instructions: string };
const emptyItem = (): Item => ({ name: "", dosage: "", frequency: "1-0-1", durationDays: "5", instructions: "" });

type SafetyAlert = { type: string; severity: string; title: string; message: string };

export function EncounterForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const [cc, setCc] = useState("");
  const [dx, setDx] = useState("");
  const [icd, setIcd] = useState("");
  const [advice, setAdvice] = useState("");
  const [fuDays, setFuDays] = useState("30");
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [alerts, setAlerts] = useState<SafetyAlert[] | null>(null);
  const [override, setOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const setItem = (i: number, k: keyof Item) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)));

  async function submit(withOverride: boolean) {
    setBusy(true); setErr(null); setDone(null);
    const body = {
      chiefComplaint: cc,
      diagnosisText: dx,
      ...(icd.trim() ? { diagnosisCode: icd.trim().toUpperCase() } : {}),
      ...(advice.trim() ? { advice } : {}),
      followUpDays: fuDays ? Number(fuDays) : undefined,
      items: items
        .filter((i) => i.name.trim().length >= 2)
        .map((i) => ({
          name: i.name.trim(),
          ...(i.dosage.trim() ? { dosage: i.dosage.trim() } : {}),
          ...(i.frequency.trim() ? { frequency: i.frequency.trim() } : {}),
          ...(i.durationDays ? { durationDays: Number(i.durationDays) } : {}),
          ...(i.instructions.trim() ? { instructions: i.instructions.trim() } : {}),
        })),
      ...(withOverride && override.trim().length >= 10 ? { overrideReason: override.trim() } : {}),
    };
    const r = await callApi<{ alertsRaised?: number; criticalOverridden?: number }>(
      `/api/doctor/patients/${patientId}/encounter`,
      { method: "POST", body },
    );
    setBusy(false);
    if (r.ok) {
      setDone(`Saved. ${String(r.data.alertsRaised ?? 0)} flag(s) written to the patient's alerts.${r.data.criticalOverridden ? ` Your override reason was recorded in the ledger.` : ""}`);
      setAlerts(null);
      setTimeout(onDone, 1200);
    } else if (r.code === "safety_block") {
      setAlerts(((r.extra?.alerts as SafetyAlert[]) ?? []));
    } else {
      setErr(r.error);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="field"><span>Chief complaint *</span><input value={cc} onChange={(e) => setCc(e.target.value)} maxLength={500} /></label>
        <label className="field"><span>Diagnosis (plain text) *</span><input value={dx} onChange={(e) => setDx(e.target.value)} maxLength={500} /></label>
        <label className="field"><span>ICD-10 (optional)</span><input value={icd} onChange={(e) => setIcd(e.target.value)} placeholder="E11" /></label>
        <label className="field"><span>Follow-up after (days, 0 = none)</span><input type="number" min={0} max={365} value={fuDays} onChange={(e) => setFuDays(e.target.value)} /></label>
        <label className="field sm:col-span-2"><span>Advice</span><input value={advice} onChange={(e) => setAdvice(e.target.value)} maxLength={2000} /></label>
      </div>

      <div>
        <div className="text-xs font-bold uppercase text-muted mb-1.5">Prescription items</div>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-12 gap-1.5 mb-1.5 items-center">
            <input className="col-span-4 border border-line rounded-lg px-2 py-1.5 text-sm" placeholder="Tab. Metformin" value={it.name} onChange={setItem(i, "name")} />
            <input className="col-span-2 border border-line rounded-lg px-2 py-1.5 text-sm" placeholder="500 mg" value={it.dosage} onChange={setItem(i, "dosage")} />
            <input className="col-span-2 border border-line rounded-lg px-2 py-1.5 text-sm" title="1-0-1 = morning, noon, night" placeholder="1-0-1" value={it.frequency} onChange={setItem(i, "frequency")} />
            <input className="col-span-2 border border-line rounded-lg px-2 py-1.5 text-sm" title="duration (days)" type="number" min={1} value={it.durationDays} onChange={setItem(i, "durationDays")} />
            <input className="col-span-1 border border-line rounded-lg px-2 py-1.5 text-sm" placeholder="pcs" value={it.instructions} onChange={setItem(i, "instructions")} title="instructions" />
            <button type="button" className="col-span-1 text-muted" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} title="remove row">✕</button>
          </div>
        ))}
        <button type="button" className="text-sm text-brand font-semibold" onClick={() => setItems((xs) => [...xs, emptyItem()])}>+ add drug</button>
      </div>

      {alerts && (
        <div className="p-3 border border-red-300 bg-red-50 rounded-xl">
          <div className="font-bold text-red-800 text-sm mb-1">⚠ Safety conflict — the server refused this prescription</div>
          <ul className="text-sm text-red-800 space-y-1 mb-2">
            {alerts.map((a, i) => <li key={i}>• {a.message}</li>)}
          </ul>
          {alerts.length > 0 && (
            <>
              <label className="field">
                <span>If you are certain, state your clinical reason (≥10 chars) — it becomes part of the record AND the patient&apos;s ledger</span>
                <textarea className="border border-line rounded-lg p-2 text-sm" value={override} onChange={(e) => setOverride(e.target.value)} rows={2} placeholder="e.g. allergy is a childhood rash, re-tested negative on skin prick 2025" />
              </label>
              <button className="btn btn-danger mt-2" disabled={override.trim().length < 10 || busy} onClick={() => submit(true)}>
                Override & prescribe anyway
              </button>
            </>
          )}
        </div>
      )}

      {err && <p className="text-sm text-red-700">{err}</p>}
      {done && <p className="text-sm text-green-700">{done}</p>}
      <div>
        <button className="btn btn-primary" disabled={busy || !cc.trim() || !dx.trim()} onClick={() => submit(false)}>
          {busy ? "Running safety checks…" : "Save encounter"}
        </button>
      </div>
    </div>
  );
}
