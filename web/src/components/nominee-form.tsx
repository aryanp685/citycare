"use client";
import { useEffect, useState } from "react";

type Nominee = { name: string; relation: string | null; phone: string | null } | null;

/** L1 — DPDP s.14 nomination. Tiny, honest form: set, replace or clear; every change is ledgered server-side. */
export function NomineeForm() {
  const [nominee, setNominee] = useState<Nominee | undefined>(undefined);
  const [form, setForm] = useState({ name: "", relation: "", phone: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/patient/nominee").then((r) => r.json()).then((j) => { if (alive) setNominee(j.nominee ?? null); }).catch(() => { if (alive) setNominee(null); });
    return () => { alive = false; };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch("/api/patient/nominee", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error ?? "Could not save"); return; }
    setNominee(j.nominee); setForm({ name: "", relation: "", phone: "" }); setMsg("Nominee saved and written to your ledger.");
  }
  async function clear() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/patient/nominee", { method: "DELETE" });
    setBusy(false);
    if (r.ok) { setNominee(null); setMsg("Nominee removed."); }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">
        Under the DPDP Act (s.14) you may name one person who can exercise your rights — access, correction, erasure, grievance — if you die or cannot act. Optional; you can change or remove it any time.
      </p>
      {nominee === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : nominee ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="kbd">{nominee.name}</span>
          <span className="text-muted">{nominee.relation} · {nominee.phone}</span>
          <button className="btn btn-ghost ml-auto" onClick={clear} disabled={busy}>Remove</button>
        </div>
      ) : (
        <form onSubmit={save} className="grid sm:grid-cols-3 gap-2 items-end">
          <label className="field"><span>Full name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={120} /></label>
          <label className="field"><span>Relation</span><input value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} required minLength={2} maxLength={40} placeholder="spouse, son, sister…" /></label>
          <label className="field"><span>Mobile (10 digits)</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required inputMode="numeric" pattern="\d{10}" /></label>
          <button className="btn btn-primary sm:col-span-3 justify-self-start" disabled={busy}>{busy ? "Saving…" : "Save nominee"}</button>
        </form>
      )}
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
