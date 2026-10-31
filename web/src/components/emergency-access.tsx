"use client";
import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui";

export function EmergencyAccess({ patientId, patientName, onGranted }: { patientId: string; patientName: string; onGranted: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reduce = useReducedMotion();

  async function submit() {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/doctor/patients/${patientId}/emergency`, {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason, confirm }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? `Refused (${r.status})`); return; }
    onGranted();
  }

  return (
    <div className="card border-[#fecaca] bg-[#fff7f7]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-bold text-[var(--danger)]">Emergency? Break the glass.</div>
          <p className="text-sm text-muted mt-1">
            If {patientName} cannot consent right now, you can open the full record for <strong>60 minutes</strong>.
            The reason you give is written to the tamper-evident ledger and sent to the patient, who can revoke it at any moment.
          </p>
        </div>
        {!open && <button className="btn btn-danger whitespace-nowrap" onClick={() => setOpen(true)}>Emergency access</button>}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden"
          >
            <div className="grid gap-3 mt-4">
              <label className="field">
                <span>Clinical reason (mandatory, min 20 characters)</span>
                <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Unconscious after RTA, brought by bystanders; need allergy and medication history before intubation" />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1" />
                <span>I confirm this is a medical emergency, the patient cannot give consent now, and I accept that this access is audited and disclosed to the patient.</span>
              </label>
              {err && <div className="text-sm text-[var(--danger)]">{err}</div>}
              <div className="flex gap-2 items-center">
                <button className="btn btn-danger" disabled={busy || reason.trim().length < 20 || !confirm} onClick={submit}>
                  {busy ? "Opening…" : "Open record for 60 min"}
                </button>
                <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
                <Badge tone="off">max 3 per doctor / 24 h</Badge>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
