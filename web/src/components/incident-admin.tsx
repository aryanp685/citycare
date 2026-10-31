"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type IncidentRow = {
  id: string; title: string; summary: string; dataInvolved: string; userAdvice: string; status: string; detectedAt: string; containedAt: string | null;
  rootCause: string | null; remediation: string | null; boardNotifiedAt: string | null; notifiedCount: number; notifiedAt: string | null; boardDeadline: string; boardOverdue: boolean;
};

/** L-G5: open → notify users → record cause/remediation → mark Board notified → download the r.7(2) report. */
export function IncidentAdmin({ rows }: { rows: IncidentRow[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", summary: "", dataInvolved: "", userAdvice: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, { rootCause: string; remediation: string; emails: string }>>({});

  async function call(path: string, method: string, body?: unknown) {
    setBusy(true); setErr(null);
    const r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? "{}" : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Failed"); return null; }
    router.refresh();
    return j;
  }

  return (
    <div className="grid gap-4">
      <form className="card grid gap-2" onSubmit={async (e) => { e.preventDefault(); const j = await call("/api/admin/incidents", "POST", form); if (j) setForm({ title: "", summary: "", dataInvolved: "", userAdvice: "" }); }}>
        <div className="font-bold">Open an incident</div>
        <label className="field"><span>Title</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={4} /></label>
        <label className="field"><span>What happened (broad facts)</span><textarea rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} required minLength={20} /></label>
        <label className="field"><span>Data involved (nature &amp; extent)</span><input value={form.dataInvolved} onChange={(e) => setForm({ ...form, dataInvolved: e.target.value })} required minLength={3} /></label>
        <label className="field"><span>Advice to affected users</span><input value={form.userAdvice} onChange={(e) => setForm({ ...form, userAdvice: e.target.value })} required minLength={10} /></label>
        <div className="flex items-center gap-3"><button className="btn btn-danger" disabled={busy}>Open incident (starts the 72-hour clock)</button>{err && <span className="text-sm text-red-700">{err}</span>}</div>
      </form>

      {rows.map((i) => {
        const ed = edit[i.id] ?? { rootCause: i.rootCause ?? "", remediation: i.remediation ?? "", emails: "" };
        return (
          <div key={i.id} className={`card ${i.boardOverdue ? "border-red-300" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <strong>{i.title}</strong><span className="kbd">{i.status}</span>
              <span className="text-xs text-muted">detected {i.detectedAt.slice(0, 16).replace("T", " ")} UTC · Board deadline {i.boardDeadline.slice(0, 16).replace("T", " ")} UTC</span>
              {i.boardOverdue && <span className="text-xs font-bold text-red-700">72 h PASSED — Board not yet notified</span>}
              <a className="btn btn-ghost ml-auto" href={`/api/admin/incidents/${i.id}/report`} download>Download r.7 report</a>
            </div>
            <p className="text-sm mt-2">{i.summary}</p>
            <p className="text-xs text-muted mt-1">Data: {i.dataInvolved} · Users notified: {i.notifiedCount}{i.notifiedAt ? ` (${i.notifiedAt.slice(0, 16).replace("T", " ")} UTC)` : ""} · Board notified: {i.boardNotifiedAt ? i.boardNotifiedAt.slice(0, 16).replace("T", " ") + " UTC" : "no"}</p>
            <div className="grid sm:grid-cols-2 gap-2 mt-3">
              <textarea rows={2} placeholder="Findings on cause" value={ed.rootCause} onChange={(e) => setEdit({ ...edit, [i.id]: { ...ed, rootCause: e.target.value } })} />
              <textarea rows={2} placeholder="Measures taken / remediation" value={ed.remediation} onChange={(e) => setEdit({ ...edit, [i.id]: { ...ed, remediation: e.target.value } })} />
            </div>
            <div className="flex flex-wrap gap-2 mt-2 items-center">
              <button className="btn btn-ghost" disabled={busy} onClick={() => call(`/api/admin/incidents/${i.id}`, "PATCH", { rootCause: ed.rootCause || undefined, remediation: ed.remediation || undefined })}>Save findings</button>
              <button className="btn btn-danger" disabled={busy} onClick={() => call(`/api/admin/incidents/${i.id}/notify`, "POST", { scope: "ALL_PATIENTS" })}>Notify all patients</button>
              <input className="min-w-64" placeholder="or affected emails, comma-separated" value={ed.emails} onChange={(e) => setEdit({ ...edit, [i.id]: { ...ed, emails: e.target.value } })} />
              <button className="btn btn-ghost" disabled={busy || !ed.emails.trim()} onClick={() => call(`/api/admin/incidents/${i.id}/notify`, "POST", { scope: "EMAILS", emails: ed.emails.split(",").map((s) => s.trim()).filter(Boolean) })}>Notify listed</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => call(`/api/admin/incidents/${i.id}`, "PATCH", { status: "CONTAINED", containedAt: new Date().toISOString() })}>Mark contained</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => call(`/api/admin/incidents/${i.id}`, "PATCH", { boardNotifiedAt: new Date().toISOString() })}>Board notified now</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => call(`/api/admin/incidents/${i.id}`, "PATCH", { status: "CLOSED" })}>Close</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
