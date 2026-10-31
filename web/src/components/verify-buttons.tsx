"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const REGISTERS: [string, string, string][] = [
  ["NMC_IMR", "NMC Indian Medical Register", "https://www.nmc.org.in/information-desk/indian-medical-register/"],
  ["STATE_COUNCIL", "State medical council register (e.g. MMC)", "https://www.maharashtramedicalcouncil.in/"],
  ["HPR", "Healthcare Professionals Registry (ABDM)", "https://hpr.abdm.gov.in/"],
];

/** D12 / L-G7: approve = recorded attestation of a manual register check; reject = reason for the doctor. */
export function VerifyButtons({ doctorId, registrationNo }: { doctorId: string; registrationNo?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [register, setRegister] = useState("NMC_IMR");
  const [attested, setAttested] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"APPROVE" | "REJECT" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send(body: Record<string, unknown>, which: "APPROVE" | "REJECT") {
    setBusy(which); setErr(null);
    const r = await fetch(`/api/admin/doctors/${doctorId}/verify`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setErr(j.error ?? `failed (${r.status})`); return; }
    setOpen(false); router.refresh();
  }
  function reject() {
    const n = window.prompt("Reason for rejection (the doctor will see this):");
    if (!n) return;
    void send({ decision: "REJECT", note: n }, "REJECT");
  }
  const link = REGISTERS.find((r) => r[0] === register)?.[2];
  return (
    <div className="grid gap-2">
      <div className="flex gap-2 items-center">
        <button className="btn btn-primary" disabled={!!busy} onClick={() => setOpen((o) => !o)}>Approve…</button>
        <button className="btn btn-danger" disabled={!!busy} onClick={reject}>{busy === "REJECT" ? "…" : "Reject"}</button>
        {err && <span className="text-xs text-[var(--danger)]">{err}</span>}
      </div>
      {open && (
        <div className="p-3 border border-line rounded-xl grid gap-2 text-sm bg-wash">
          <div>Look up <span className="kbd">{registrationNo ?? "registration no."}</span> yourself on the public register — there is no official API, so this is a human check that gets recorded in the ledger.</div>
          <label className="field"><span>Register checked</span>
            <select value={register} onChange={(e) => setRegister(e.target.value)}>{REGISTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          {link && <a className="text-brand text-xs" href={link} target="_blank" rel="noopener noreferrer">Open the register in a new tab ↗</a>}
          <label className="flex items-start gap-2"><input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} /><span>I searched this register and the <strong>name and registration number match</strong> this application.</span></label>
          <input placeholder="Optional note (qualification seen, remarks)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={!!busy || !attested} onClick={() => send({ decision: "APPROVE", register, attested, note: note || undefined }, "APPROVE")}>{busy === "APPROVE" ? "…" : "Record attestation & approve"}</button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
