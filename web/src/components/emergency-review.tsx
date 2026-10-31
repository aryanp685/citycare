"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type EmergencyRow = {
  id: string; reason: string | null; approvedAt: string; expiresAt: string; revokedAt: string | null; status: string;
  reviewedAt: string | null; reviewVerdict: string | null; reviewNote: string | null;
  doctorId: string; doctor: string; registrationNo: string | null; patient: string; doctorWeekCount: number; doctorUnjustified: number; reads: number;
};

/** D41: the human verdict on every break-glass override. */
export function EmergencyReview({ rows }: { rows: EmergencyRow[] }) {
  const router = useRouter();
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function review(id: string, verdict: "JUSTIFIED" | "UNJUSTIFIED") {
    setBusy(id); setErr(null);
    const r = await fetch(`/api/admin/emergencies/${id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ verdict, note: note[id] || undefined }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setErr(j.error ?? "Review failed"); return; }
    router.refresh();
  }
  if (rows.length === 0) return <p className="text-sm text-muted">Nothing awaiting review.</p>;
  return (
    <div className="grid gap-3">
      {err && <p className="text-sm text-red-700">{err}</p>}
      {rows.map((e) => (
        <div key={e.id} className={`card ${e.doctorWeekCount > 3 || e.doctorUnjustified > 0 ? "border-red-300" : ""}`}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <strong>Dr {e.doctor}</strong><span className="kbd">{e.registrationNo ?? "—"}</span>
            <span className="text-muted">→ {e.patient} · {e.approvedAt.slice(0, 16).replace("T", " ")} UTC · {e.reads} record reads</span>
            {e.doctorWeekCount > 3 && <span className="text-xs font-bold text-red-700">FLAG: {e.doctorWeekCount} overrides in 7 days</span>}
            {e.doctorUnjustified > 0 && <span className="text-xs font-bold text-red-700">{e.doctorUnjustified} prior unjustified</span>}
            <span className="ml-auto kbd">{e.revokedAt ? "revoked by patient" : e.status}</span>
          </div>
          <p className="text-sm mt-2"><span className="text-muted">Stated reason:</span> {e.reason}</p>
          {e.reviewedAt ? (
            <p className="text-sm mt-2">Verdict: <strong>{e.reviewVerdict}</strong> {e.reviewNote && <span className="text-muted">— {e.reviewNote}</span>}</p>
          ) : (
            <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 mt-3 items-center">
              <input placeholder="Note (required for unjustified)" value={note[e.id] ?? ""} onChange={(ev) => setNote({ ...note, [e.id]: ev.target.value })} />
              <button className="btn btn-primary" disabled={busy === e.id} onClick={() => review(e.id, "JUSTIFIED")}>Justified</button>
              <button className="btn btn-danger" disabled={busy === e.id} onClick={() => review(e.id, "UNJUSTIFIED")}>Unjustified</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
