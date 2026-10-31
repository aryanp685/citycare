"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "./api-client";
import { PROFILE_STEPS } from "@/lib/onboard";

const BLOOD = ["A_POSITIVE", "A_NEGATIVE", "B_POSITIVE", "B_NEGATIVE", "AB_POSITIVE", "AB_NEGATIVE", "O_POSITIVE", "O_NEGATIVE", "UNKNOWN"];

export function Wizard({ initial }: { initial: { allergies: string[]; chronicConditions: string[]; currentMedications: string[]; bloodGroup: string } }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [vals, setVals] = useState(initial);
  const [chip, setChip] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const s = PROFILE_STEPS[Math.min(step, PROFILE_STEPS.length - 1)];

  function addChip(list: string[], v: string): string[] {
    const t = v.trim();
    if (!t || list.some((x) => x.toLowerCase() === t.toLowerCase())) return list;
    return [...list, t];
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await callApi("/api/patient/profile", {
      method: "POST",
      body: {
        allergies: vals.allergies,
        chronicConditions: vals.chronicConditions,
        currentMedications: vals.currentMedications,
        bloodGroup: vals.bloodGroup || "UNKNOWN",
      },
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    router.push("/patient");
    router.refresh();
  }

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {PROFILE_STEPS.map((x, i) => (
          <div key={x.key} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-teal-600" : "bg-slate-200"}`} />
        ))}
      </div>
      <div className="text-xs text-muted mb-1">Step {step + 1}/{PROFILE_STEPS.length} · ~{s.seconds}s</div>
      <div className="font-bold mb-3">{s.question}</div>

      {(s.inputType === "chips" || s.inputType === "text") && (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(s.field === "allergies" ? vals.allergies : s.field === "chronic_conditions" ? vals.chronicConditions : vals.currentMedications).map((x) => (
              <span key={x} className="badge badge-live">
                {x}
                <button
                  className="ml-1.5 text-muted"
                  onClick={() => {
                    const f = s.field === "allergies" ? "allergies" : s.field === "chronic_conditions" ? "chronicConditions" : "currentMedications";
                    setVals((vv) => ({ ...vv, [f]: vv[f].filter((y) => y !== x) }));
                  }}
                >×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="border border-line rounded-xl px-3 py-2 text-sm flex-1"
              placeholder={s.field === "allergies" ? "e.g. Penicillin — or 'none'" : s.field === "chronic_conditions" ? "e.g. Type 2 Diabetes" : "e.g. Metformin 500 mg"}
              value={chip}
              onChange={(e) => setChip(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!chip.trim()) return;
                  if (s.field === "allergies") setVals((v) => ({ ...v, allergies: addChip(v.allergies, chip) }));
                  else if (s.field === "chronic_conditions") setVals((v) => ({ ...v, chronicConditions: addChip(v.chronicConditions, chip) }));
                  else setVals((v) => ({ ...v, currentMedications: addChip(v.currentMedications, chip) }));
                  setChip("");
                }
              }}
            />
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (!chip.trim()) return;
                if (s.field === "allergies") setVals((v) => ({ ...v, allergies: addChip(v.allergies, chip) }));
                else if (s.field === "chronic_conditions") setVals((v) => ({ ...v, chronicConditions: addChip(v.chronicConditions, chip) }));
                else setVals((v) => ({ ...v, currentMedications: addChip(v.currentMedications, chip) }));
                setChip("");
              }}
            >Add</button>
          </div>
        </div>
      )}

      {s.inputType === "select" && (
        <select
          className="border border-line rounded-xl px-3 py-2 text-sm w-full max-w-xs"
          value={vals.bloodGroup}
          onChange={(e) => setVals((v) => ({ ...v, bloodGroup: e.target.value }))}
        >
          <option value="">— I don&apos;t know / prefer not to say —</option>
          {BLOOD.map((b) => <option key={b} value={b}>{b.replace("_", " ")}</option>)}
        </select>
      )}

      {err && <p className="text-sm text-red-700 mt-3">{err}</p>}
      <div className="flex justify-between mt-6">
        <button className="btn btn-ghost" disabled={step === 0 || busy} onClick={() => setStep((x) => x - 1)}>Back</button>
        {step < PROFILE_STEPS.length - 1 ? (
          <button className="btn btn-primary" onClick={() => setStep((x) => x + 1)}>
            {s.optional ? "Skip / next →" : "Next →"}
          </button>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save safety card"}</button>
        )}
      </div>
    </div>
  );
}
