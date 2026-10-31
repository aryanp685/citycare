"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = { id: string; category: string; subject: string; body: string; status: string; resolution: string | null; createdAt: string; dueAt: string; email: string; role: string; overdue: boolean };

/** Admin side of the desk: change status, write the resolution; the complainant is notified server-side. */
export function GrievanceAdmin({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [res, setRes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function update(id: string, status: string) {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/admin/grievances/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, resolution: res || undefined }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Update failed"); return; }
    setOpen(null); setRes(""); router.refresh();
  }

  if (rows.length === 0) return <p className="text-sm text-muted">No open grievances.</p>;
  return (
    <div className="grid gap-3">
      {rows.map((g) => (
        <div key={g.id} className={`card ${g.overdue ? "border-red-300" : ""}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="kbd">{g.category}</span>
            <strong>{g.subject}</strong>
            <span className="text-xs text-muted">from {g.email} ({g.role.toLowerCase()}) · opened {g.createdAt.slice(0, 10)} · due {g.dueAt.slice(0, 10)}</span>
            {g.overdue && <span className="text-xs font-bold text-red-700">OVERDUE</span>}
            <span className="ml-auto kbd">{g.status}</span>
          </div>
          <p className="text-sm mt-2 whitespace-pre-wrap">{g.body}</p>
          {open === g.id ? (
            <div className="grid gap-2 mt-3">
              <textarea className="w-full" rows={3} placeholder="Resolution shown to the complainant (≥10 chars to resolve/reject)" value={res} onChange={(e) => setRes(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-ghost" disabled={busy} onClick={() => update(g.id, "IN_PROGRESS")}>Mark in progress</button>
                <button className="btn btn-primary" disabled={busy} onClick={() => update(g.id, "RESOLVED")}>Resolve</button>
                <button className="btn btn-danger" disabled={busy} onClick={() => update(g.id, "REJECTED")}>Reject</button>
                <button className="btn btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
                {err && <span className="text-sm text-red-700">{err}</span>}
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost mt-3" onClick={() => { setOpen(g.id); setRes(g.resolution ?? ""); }}>Respond…</button>
          )}
        </div>
      ))}
    </div>
  );
}
