"use client";
import { useEffect, useState } from "react";

type Doc = { id: string; title: string; type: string; mimeType: string; sizeBytes: number; issuedOn: string | null; createdAt: string; sha: string };
const TYPES: [string, string][] = [["LAB_REPORT", "Lab report"], ["PRESCRIPTION", "Prescription"], ["DISCHARGE_SUMMARY", "Discharge summary"], ["XRAY", "X-ray"], ["MRI", "MRI"], ["CT_SCAN", "CT scan"], ["ULTRASOUND", "Ultrasound"], ["ECG", "ECG"], ["VACCINATION_CARD", "Vaccination card"], ["BILL", "Bill"], ["OTHER", "Other"]];
const fmt = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Opens a 60-second signed link in a new tab (works for patients and, under FULL_RECORD consent, doctors). */
export async function openDocument(id: string): Promise<string | null> {
  const r = await fetch(`/api/documents/${id}/link`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return j.error ?? "Could not open";
  window.open(j.url, "_blank", "noopener");
  return null;
}

/** D4 / F12: the patient's files — upload (PDF/JPEG/PNG ≤ 3 MB, encrypted), open, delete. */
export function DocumentManager() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [quota, setQuota] = useState<{ usedBytes: number; maxBytes: number; maxFileBytes: number } | null>(null);
  const [f, setF] = useState({ title: "", type: "LAB_REPORT", issuedOn: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/patient/documents");
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setDocs(j.documents ?? []); setQuota(j.quota ?? null); }
  }
  useEffect(() => { void (async () => { await load(); })(); }, []);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.set("file", file); fd.set("title", f.title || file.name); fd.set("type", f.type); if (f.issuedOn) fd.set("issuedOn", f.issuedOn);
    const r = await fetch("/api/patient/documents", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error ?? "Upload failed"); return; }
    setMsg(`Stored encrypted · sha-256 ${String(j.sha256).slice(0, 16)}…`);
    setF({ title: "", type: "LAB_REPORT", issuedOn: "" }); setFile(null);
    (e.target as HTMLFormElement).reset();
    load();
  }
  async function del(id: string) {
    if (!confirm("Delete this file? The bytes are erased immediately.")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE", headers: { "content-type": "application/json" } });
    load();
  }

  return (
    <div className="grid gap-3">
      <form onSubmit={upload} className="grid gap-2">
        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <input type="file" accept="application/pdf,image/jpeg,image/png" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
          <input placeholder="Title (defaults to the file name)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={140} />
          <input type="date" value={f.issuedOn} onChange={(e) => setF({ ...f, issuedOn: e.target.value })} title="Report date" />
          <button className="btn btn-primary" disabled={busy || !file}>{busy ? "Encrypting…" : "Upload"}</button>
        </div>
        <p className="text-xs text-muted">
          PDF, JPEG or PNG up to {quota ? fmt(quota.maxFileBytes) : "3 MB"} (checked by content, not by name). Files are encrypted (AES-256-GCM) before they reach the database and are shared with a doctor only under a <em>full record</em> consent — every open is written to your ledger.
          {quota && <> Used {fmt(quota.usedBytes)} of {fmt(quota.maxBytes)}.</>}
        </p>
        {msg && <p className="text-xs text-muted">{msg}</p>}
      </form>
      {docs === null ? <p className="text-sm text-muted">Loading…</p> : docs.length === 0 ? <p className="text-sm text-muted">No files yet.</p> : (
        <ul className="divide-y divide-line text-sm">
          {docs.map((d) => (
            <li key={d.id} className="py-2 flex flex-wrap items-center gap-2">
              <span className="kbd">{d.type.replace("_", " ").toLowerCase()}</span>
              <span className="font-semibold">{d.title}</span>
              <span className="text-xs text-muted">{d.issuedOn ?? d.createdAt.slice(0, 10)} · {fmt(d.sizeBytes)} · {d.mimeType.split("/")[1]} · sha {d.sha}…</span>
              <span className="ml-auto flex gap-2">
                <button className="btn btn-ghost" onClick={async () => { const e = await openDocument(d.id); if (e) setMsg(e); }}>Open</button>
                <button className="btn btn-ghost text-red-700" onClick={() => del(d.id)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
