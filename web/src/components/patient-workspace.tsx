"use client";
import { useCallback, useEffect, useState } from "react";
import { EncounterForm } from "./encounter-form";
import { Card, SectionTitle, Badge, EmptyNote, KV } from "@/components/ui";
import { EmergencyAccess } from "./emergency-access";
import { openDocument } from "./document-manager";
import { TrendsPanel } from "./trends";

type RecordPayload = {
  scopeNote: string;
  scope: string;
  expiresAt: string;
  isEmergency?: boolean;
  emergencyReason?: string | null;
  record: {
    allergies: { allergen: string; severity: string; reaction: string | null }[];
    conditions: { name: string; icd10: string | null }[];
    medications: { name: string; dosage: string | null; frequency: string | null; notes: string | null }[];
    encounters: { encounterDate: string; type: string; chiefComplaint: string | null; diagnosisText: string | null; advice: string | null }[];
    labs: { testName: string; value: string; unit: string | null; refRangeLow: string | null; refRangeHigh: string | null; takenOn: string | null }[];
    // F5: self-reported readings, already consent-scoped by the server (applyScope).
    observations: { id: string; name: string; category: string; valueNum: number; unit: string | null; refLow: number | null; refHigh: number | null; takenOn: string; encounterId: string | null }[];
    prescriptions: { issuedOn: string; items: { name: string; dosage?: string; frequency?: string; durationDays?: number }[]; doctor: string | null }[];
    documents: { id: string; title: string; type: string; issuedOn: string | null }[];
  };
  alerts: { type: string; severity: string; title: string; message: string }[];
  digest: { headline: string[]; sections: { title: string; lines: string[] }[] };
};

export function PatientWorkspace({ patientId, patientName }: { patientId: string; patientName: string }) {
  const [data, setData] = useState<RecordPayload | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [deniedCode, setDeniedCode] = useState<string | null>(null);
  const [load, setLoad] = useState(0);
  const [showForm, setShowForm] = useState(false);

  const fetchRecord = useCallback(async () => {
    const res = await fetch(`/api/doctor/patients/${patientId}/record`, { credentials: "same-origin" });
    if (res.status === 403) {
      const j = await res.json().catch(() => ({}));
      setDenied(j.error ?? "Access refused.");
      setDeniedCode(j.code ?? null);
      setData(null);
      return;
    }
    if (!res.ok) { setDenied(`Could not load (${res.status}).`); return; }
    const j = (await res.json()) as RecordPayload;
    setData(j);
    setDenied(null);
  }, [patientId]);

  useEffect(() => {
    void (async () => { await fetchRecord(); })();
  }, [fetchRecord, load]);

  return (
    <div className="grid gap-4">
      {denied && (
        <Card className="border-amber-300 bg-amber-50/60">
          <div className="font-bold text-amber-900">Access refused</div>
          <p className="text-sm mt-1 text-amber-900/90">{denied}</p>
          <p className="text-xs text-muted mt-2">
            This refusal itself was written to the patient&apos;s tamper-evident ledger — this page does not
            quietly hide data; the server refuses it, and the attempt is visible to the patient.
          </p>
          <button className="btn btn-ghost mt-3" onClick={() => setLoad((x) => x + 1)}>Re-check (this re-hits the server, not cache)</button>
        </Card>
      )}
      {denied && deniedCode === "no_consent" && (
        <EmergencyAccess patientId={patientId} patientName={patientName} onGranted={() => setLoad((x) => x + 1)} />
      )}
      {data?.isEmergency && (
        <Card className="border-[#fecaca] bg-[#fff7f7]">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="crit">EMERGENCY ACCESS</Badge>
            <span className="text-sm">
              Break-glass access until {new Date(data.expiresAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "short" })} IST.
              The patient has been notified and can revoke it at any time.
            </span>
          </div>
          {data.emergencyReason && <p className="text-xs text-muted mt-2">Your stated reason: &ldquo;{data.emergencyReason}&rdquo;</p>}
        </Card>
      )}

      {data && (
        <>
          <Card>
            <SectionTitle right={<Badge tone="live">{data.scope}{data.scopeNote ? ` · ${data.scopeNote}` : ""}</Badge>}>
              {patientName}
            </SectionTitle>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="font-bold mb-1">{data.digest.headline[0]}</div>
                <ul className="text-sm space-y-0.5 mb-3">
                  {data.digest.headline.slice(1).map((h, i) => (
                    <li key={i} className={h.startsWith("ALLERGIES") ? "font-bold text-red-700" : "text-muted"}>{h}</li>
                  ))}
                </ul>
                {data.digest.sections.map((sec) => (
                  <div key={sec.title} className="mb-2">
                    <div className="text-xs font-bold uppercase text-muted">{sec.title}</div>
                    {sec.lines.map((l, i) => <div key={i} className="text-sm">{l}</div>)}
                  </div>
                ))}
                <p className="text-[11px] text-muted">
                  Summary above is COMPUTED from stored rows (0 generative tokens) — every sentence traces to a DB value.
                </p>
              </div>
              <div>
                {data.alerts.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-bold uppercase text-muted mb-1">Rule-engine flags</div>
                    {data.alerts.map((a, i) => (
                      <div key={i} className={`text-sm p-2 rounded-lg border mb-1.5 ${a.severity === "CRITICAL" ? "border-red-300 bg-red-50 text-red-800 font-semibold" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                        {a.message}
                      </div>
                    ))}
                  </div>
                )}
                <KV k="Consent expires" v={new Date(data.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} />
                <KV k="Encounters visible" v={data.record.encounters.length} />
                <KV k="Lab values visible" v={data.record.labs.length} />
                <KV k="Self-reported readings visible" v={data.record.observations.length} />
                <div className="mt-3">
                  <button className="btn btn-primary" onClick={() => setShowForm((x) => !x)}>{showForm ? "Close consultation form" : "Write consultation note + prescription"}</button>
                </div>
              </div>
            </div>
          </Card>

          {showForm && (
            <Card>
              <SectionTitle>Encounter — patient safety checks run BEFORE anything is saved</SectionTitle>
              <EncounterForm patientId={patientId} onDone={() => { setShowForm(false); setLoad((x) => x + 1); }} />
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <SectionTitle>Medicines (active, confirmed)</SectionTitle>
              {data.record.medications.filter((m) => !(m.notes ?? "").startsWith("DRAFT:")).length === 0 ? (
                <EmptyNote>None.</EmptyNote>
              ) : (
                <ul className="text-sm space-y-1">
                  {data.record.medications.filter((m) => !(m.notes ?? "").startsWith("DRAFT:")).map((m, i) => (
                    <li key={i}>• <b>{m.name}</b> {m.dosage ?? ""} {m.frequency ? `· ${m.frequency}` : ""} {m.notes ? <span className="text-xs text-muted">({m.notes})</span> : ""}</li>
                  ))}
                </ul>
              )}
              {data.record.medications.some((m) => (m.notes ?? "").startsWith("DRAFT:")) && (
                <p className="text-xs text-amber-700 mt-2">⚠ some patient-OCR&apos;d rows are UNCONFIRMED drafts and are intentionally hidden from clinical use until the patient confirms them.</p>
              )}
            </Card>
            <Card>
              <SectionTitle>Encounters {data.record.encounters.length === 0 && "(hidden by scope or none yet)"}</SectionTitle>
              <ul className="text-sm space-y-2">
                {data.record.encounters.map((e, i) => (
                  <li key={i} className="p-2 border border-line rounded-lg">
                    <div className="text-xs text-muted">{e.encounterDate.slice(0, 10)} · {e.type.toLowerCase()}</div>
                    <div className="font-semibold">{e.diagnosisText ?? "—"}</div>
                    {e.chiefComplaint && <div className="text-xs text-muted">cc: {e.chiefComplaint}</div>}
                    {e.advice && <div className="text-xs">advice: {e.advice}</div>}
                  </li>
                ))}
                {data.record.encounters.length === 0 && <EmptyNote>Nothing within the shared scope.</EmptyNote>}
              </ul>
            </Card>
            <Card>
              <SectionTitle right={<Badge tone="off">self-reported</Badge>}>Trends — patient-logged readings {data.record.observations.length === 0 && "(none in scope)"}</SectionTitle>
              <TrendsPanel rows={data.record.observations} />
            </Card>
            <Card>
              <SectionTitle>Files {data.record.documents.length === 0 && "(full-record consent only)"}</SectionTitle>
              <ul className="text-sm space-y-1">
                {data.record.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 p-2 border border-line rounded-lg">
                    <span className="kbd">{d.type.replace("_", " ").toLowerCase()}</span>
                    <span className="font-semibold">{d.title}</span>
                    <span className="text-xs text-muted">{d.issuedOn?.slice(0, 10) ?? ""}</span>
                    <button className="btn btn-ghost ml-auto" onClick={async () => { const e = await openDocument(d.id); if (e) alert(e); }}>Open (logged)</button>
                  </li>
                ))}
                {data.record.documents.length === 0 && <EmptyNote>No files within the shared scope.</EmptyNote>}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
