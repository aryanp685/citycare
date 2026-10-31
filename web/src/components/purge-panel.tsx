"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "./api-client";

const PHRASE = "DELETE MY CITYCARE DATA";

export function PurgePanel() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "type" | "busy" | "done">("idle");
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      {phase === "idle" && (
        <>
          <p className="text-sm text-muted max-w-2xl">
            You can erase what CityCare holds about you. Anything you contributed is deleted; clinical
            prose a doctor wrote is redacted to an anonymous shell (the clinician&apos;s own record-keeping
            duty — NMC/MCI Ethics Reg. 1.3.1, 3 years; DGHS manual, up to 10 years — is theirs to obey, not
            yours to erase); your inbox and nominee details go too; and the access ledger is kept — it is your proof.
            Hospitals&apos; own records were never stored here, so they are unaffected by this button.
          </p>
          <button className="btn btn-danger mt-3" onClick={() => setPhase("type")}>Erase my data…</button>
        </>
      )}
      {phase === "type" && (
        <div className="grid gap-2 max-w-lg">
          <label className="field">
            <span>Type exactly: <span className="kbd">{PHRASE}</span></span>
            <input value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button
              className="btn btn-danger"
              disabled={text !== PHRASE}
              onClick={async () => {
                setPhase("busy");
                setErr(null);
                const r = await callApi("/api/patient/purge", { method: "POST", body: { confirmPhrase: text } });
                if (r.ok) {
                  setReport(r.data as Record<string, unknown>);
                  setPhase("done");
                  router.push("/");
                  router.refresh();
                } else {
                  setErr(r.error);
                  setPhase("type");
                }
              }}
            >
              Erase permanently
            </button>
            <button className="btn btn-ghost" onClick={() => setPhase("idle")}>Cancel</button>
          </div>
          {err && <p className="text-sm text-red-700">{err}</p>}
        </div>
      )}
      {phase === "busy" && <p className="text-sm text-muted">Erasing… (this is one database transaction — nothing is half-deleted)</p>}
      {phase === "done" && report && (
        <div className="p-3 border border-green-200 bg-green-50 rounded-xl text-sm">
          <div className="font-bold text-green-800">Erased at {String((report as { atLocal?: string }).atLocal ?? "")}</div>
          <pre className="text-xs mt-2 overflow-auto">{JSON.stringify(report, null, 1)}</pre>
          <p className="text-xs text-muted mt-1">You were signed out. Your ledger — the proof of what was held and destroyed — stays verifiable.</p>
        </div>
      )}
    </div>
  );
}
