"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "./api-client";

type Props = {
  consent: { id: string; doctorId?: string; doctorName: string; status: string; scope: string; expiresAt: string | null };
  compact?: boolean;
};

const SCOPES = [
  { v: "LAST_N_ENCOUNTERS", label: "Last 3 visits only" },
  { v: "SUMMARY_ONLY", label: "Summary + safety facts only" },
  { v: "FULL_RECORD", label: "Full record" },
];

export function ConsentActions({ consent, compact }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [scope, setScope] = useState("LAST_N_ENCOUNTERS");
  const [open, setOpen] = useState(false);

  async function act(fn: () => Promise<{ ok: boolean; error?: string; code?: string; extra?: Record<string, unknown> }>, done: string) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      if (r.code === "safety_block") {
        const alerts = (r.extra?.alerts as { message: string }[]) ?? [];
        setMsg(alerts.map((a) => a.message).join(" · ") || (r.error ?? "blocked"));
      } else {
        setMsg(r.error ?? "failed");
      }
      return;
    }
    setMsg(done);
    router.refresh();
  }

  const approve = () =>
    act(
      () =>
        callApi("/api/patient/consents", {
          method: "POST",
          body: { doctorId: consent.doctorId, scope, expiryDays: 7, lastNEncounters: scope === "LAST_N_ENCOUNTERS" ? 3 : undefined },
        }),
      "Access granted — the doctor now sees only what you chose.",
    );

  const denyOrRevoke = (verb: "DENIED" | "REVOKED") =>
    act(
      () => callApi(`/api/patient/consents?id=${consent.id}`, { method: "PATCH", body: { reason: `${verb.toLowerCase()} by patient from CityCare UI` } }),
      verb === "DENIED" ? "Request denied. This is logged — the doctor can see why." : "Revoked. Their next request will be refused instantly.",
    );

  return (
    <div className={compact ? "" : "mt-2"}>
      <div className="flex flex-wrap gap-2 items-center">
        {consent.status === "REQUESTED" && (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => (open ? approve() : setOpen(true))}>
              {open ? "Confirm approve" : "Review & approve…"}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => denyOrRevoke("DENIED")}>Deny</button>
          </>
        )}
        {consent.status === "APPROVED" && (
          <button className="btn btn-danger" disabled={busy} onClick={() => denyOrRevoke("REVOKED")}>Revoke now</button>
        )}
      </div>
      {open && consent.status === "REQUESTED" && (
        <div className="mt-2 p-3 border border-line rounded-xl bg-wash">
          <div className="text-sm font-semibold mb-2">What should {consent.doctorName} see?</div>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((s) => (
              <button
                key={s.v}
                type="button"
                onClick={() => setScope(s.v)}
                className={`badge cursor-pointer ${scope === s.v ? "badge-live" : ""}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted mt-2">Expires in 7 days automatically. Every access lands on your “who saw my data” screen.</p>
        </div>
      )}
      {msg && <p className="text-xs mt-1.5 text-muted">{msg}</p>}
      {busy && <p className="text-xs mt-1.5 text-muted">Working…</p>}
    </div>
  );
}
