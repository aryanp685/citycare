"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Ticket = { id: string; category: string; subject: string; status: string; resolution: string | null; createdAt: string; dueAt: string; resolvedAt: string | null };
const CATS: [string, string][] = [
  ["ACCESS", "Access / copy of my data"], ["CORRECTION", "Correction of a record"], ["ERASURE", "Erasure"],
  ["CONSENT", "Consent or access I did not authorise"], ["SECURITY", "Security concern"], ["DOCTOR_APPEAL", "Doctor verification appeal"], ["OTHER", "Something else"],
];

/** L-G1: file a grievance in-app and follow it — the DPDP s.13 channel, no mailbox needed. */
export function GrievanceDesk() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [form, setForm] = useState({ category: "ACCESS", subject: "", body: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/grievances");
    if (r.status === 401) { setSignedIn(false); return; }
    const j = await r.json().catch(() => ({}));
    setSignedIn(true); setTickets(j.grievances ?? []);
  }
  useEffect(() => {
    void (async () => { try { await load(); } catch { setSignedIn(false); } })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await fetch("/api/grievances", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error ?? "Could not submit"); return; }
    setMsg(`Ticket opened. We respond by ${new Date(j.dueAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}.`);
    setForm({ category: "ACCESS", subject: "", body: "" });
    load();
  }

  if (signedIn === null) return <p className="text-sm text-muted">Loading…</p>;
  if (signedIn === false) {
    return (
      <div className="callout">
        <strong>Sign in to raise a grievance</strong> — it is tied to your account so we can act on it and reply in your inbox.{" "}
        <Link href="/login">Sign in</Link>. If you cannot sign in (locked or erased account), contact the team through the college as described below.
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <form onSubmit={submit} className="card grid gap-3">
        <div className="font-bold">New grievance</div>
        <label className="field"><span>Category</span>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field"><span>Subject</span><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required minLength={4} maxLength={140} /></label>
        <label className="field"><span>What happened, and what outcome do you want?</span><textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required minLength={20} maxLength={4000} rows={5} /></label>
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={busy}>{busy ? "Submitting…" : "Submit grievance"}</button>
          {msg && <span className="text-sm text-muted">{msg}</span>}
        </div>
      </form>
      {tickets.length > 0 && (
        <div className="card">
          <div className="font-bold mb-2">Your grievances</div>
          <table>
            <thead><tr><th>Opened</th><th>Subject</th><th>Status</th><th>Due by</th><th>Response</th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td>{t.createdAt.slice(0, 10)}</td>
                  <td>{t.subject}<div className="text-xs text-muted">{t.category}</div></td>
                  <td><span className="kbd">{t.status}</span></td>
                  <td>{t.dueAt.slice(0, 10)}</td>
                  <td className="text-sm">{t.resolution ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
