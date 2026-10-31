import { viewerForPage } from "@/lib/session";
import { recordSections, toRuleRecord, fmtIstDate, patientById } from "@/lib/repo";
import { runAllRules } from "@/lib/rules";
import { buildSeries } from "@/lib/trends";
import { buildPrintSummary } from "@/lib/print-summary";
import { Card, Badge, SectionTitle, EmptyNote } from "@/components/ui";
import { PhotoPaste } from "@/components/photo-paste";
import { DocumentManager } from "@/components/document-manager";
import { ConfirmDraftButton } from "@/components/confirm-draft";
import { ClinicalDisclaimer } from "@/components/clinical-disclaimer";
import { TrendsCard } from "@/components/trends";
import { PrintSummary } from "@/components/print-summary";
import { PrintButton } from "@/components/print-button";

export default async function RecordsPage() {
  const v = await viewerForPage("PATIENT");
  const pid = v.profileId;
  const rec = await recordSections(pid);
  const patient = await patientById(pid);
  const today = new Date().toISOString().slice(0, 10);
  const alerts = runAllRules(toRuleRecord(rec), today);
  const drafts = rec.medications.filter((m) => (m.notes ?? "").startsWith("DRAFT:"));

  // F18: the printable visit summary — same record data, the exact lines built by the
  // pure lib/print-summary (unit-tested). Hidden on screen; @media print makes it the page.
  const series = buildSeries(
    rec.observations.map((o) => ({ name: o.name, valueNum: o.valueNum, unit: o.unit, refLow: o.refLow, refHigh: o.refHigh, takenOn: o.takenOn })),
  );
  const printData = patient
    ? buildPrintSummary({
        patient: {
          fullName: patient.fullName,
          dateOfBirth: patient.dateOfBirth?.toISOString() ?? null,
          gender: patient.gender,
          bloodGroup: patient.bloodGroup,
          city: patient.city,
          abhaId: patient.abhaId,
        },
        generatedAt: new Date().toISOString(),
        audience: "patient",
        allergies: rec.allergies.map((a) => ({ allergen: a.allergen, severity: a.severity })),
        conditions: rec.conditions,
        medications: rec.medications,
        observations: series.map((s) => ({ name: s.name, unit: s.unit, latest: s.latest, direction: s.direction, band: s.latestBand, points: s.pointsUsed })),
        labs: rec.labs.slice(0, 5).map((l) => ({
          testName: l.testName,
          value: l.value,
          unit: l.unit,
          refRangeLow: l.refRangeLow,
          refRangeHigh: l.refRangeHigh,
          takenOn: l.takenOn?.toISOString() ?? null,
        })),
        lastEncounter: rec.encounters[0]
          ? {
              encounterDate: rec.encounters[0].encounterDate.toISOString(),
              diagnosisText: rec.encounters[0].diagnosisText,
              doctor: rec.encounters[0].doctor,
              advice: rec.encounters[0].advice,
              followUpOn: rec.encounters[0].followUpOn?.toISOString() ?? null,
            }
          : null,
      })
    : null;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {printData && <PrintSummary s={printData} />}
      <div className="grid gap-4 content-start md:col-span-2">
        <ClinicalDisclaimer audience="patient" />
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-bold">Your record is yours to take</div>
            <p className="text-sm text-muted mt-0.5">Download everything as a <strong>FHIR R4</strong> bundle — the format ABDM and every modern hospital system speaks. Drafts are excluded; the export itself is logged.</p>
          </div>
          <div className="flex items-center gap-2">
            <a className="btn btn-ghost" href="/api/patient/fhir" download>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
              Export FHIR R4 (JSON)
            </a>
            {/* F18: the visit summary another hospital can actually use — printed / saved as PDF */}
            <PrintButton logExport />
          </div>
        </Card>
        <Card className="border-teal-200">
          <SectionTitle right={<span className="text-xs text-muted">nothing here is a doctor&apos;s report — it is a draft until you tap confirm</span>}>
            Backfill from an old prescription
          </SectionTitle>
          <PhotoPaste />
        </Card>
      </div>

      <Card className="md:col-span-2">
        <SectionTitle right={<span className="kbd">AES-256-GCM</span>}>Files — reports, prescriptions, scans</SectionTitle>
        <DocumentManager />
      </Card>

      {/* F5: the longitudinal record — self-reported readings between visits, with trends. */}
      <TrendsCard
        rows={rec.observations.map((o) => ({
          id: o.id,
          name: o.name,
          category: o.category,
          valueNum: o.valueNum,
          unit: o.unit,
          refLow: o.refLow,
          refHigh: o.refHigh,
          takenOn: o.takenOn.toISOString(),
          encounterId: o.encounterId,
        }))}
      />

      <Card className="md:col-span-1">
        <SectionTitle>Timeline</SectionTitle>
        {rec.encounters.length === 0 && drafts.length === 0 && rec.labs.length === 0 ? (
          <EmptyNote>Nothing yet — expected on day one. Every visit from now on appears here automatically.</EmptyNote>
        ) : (
          <ul className="relative border-l-2 border-line ml-2 pl-4 space-y-4 py-1">
            {rec.encounters.map((e) => (
              <li key={e.id}>
                <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-teal-600 mt-1" />
                <div className="text-xs text-muted">{fmtIstDate(e.encounterDate)} · {e.type.toLowerCase()} · {e.doctor ?? "self-reported"}</div>
                <div className="font-semibold text-sm">{e.diagnosisText ?? e.chiefComplaint ?? "Consultation"}</div>
                {e.diagnosisCode && <Badge tone="off">ICD-10 {e.diagnosisCode}</Badge>}
                {e.advice && <p className="text-sm text-muted mt-1">{e.advice}</p>}
                {e.followUpOn && (
                  <p className="text-xs mt-1"><Badge tone="warn">follow-up {fmtIstDate(e.followUpOn)}</Badge></p>
                )}
              </li>
            ))}
            {rec.labs.slice(0, 6).map((l) => (
              <li key={l.id}>
                <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-slate-300 mt-1" />
                <div className="text-xs text-muted">{l.takenOn ? fmtIstDate(l.takenOn) : "date unknown"}</div>
                <div className="text-sm">
                  <span className="font-semibold">{l.testName}</span> {l.value}{l.unit ?? ""}
                  {(l.refRangeLow || l.refRangeHigh) && <span className="text-muted"> (ref {l.refRangeLow ?? "-"}–{l.refRangeHigh ?? "-"})</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 content-start">
        <Card>
          <SectionTitle>Medicines {drafts.length > 0 && <Badge tone="warn">{drafts.length} draft</Badge>}</SectionTitle>
          {rec.medications.length === 0 ? (
            <EmptyNote>No medicines recorded.</EmptyNote>
          ) : (
            <ul className="grid gap-2">
              {rec.medications.map((m) => (
                <li key={m.id} className="flex justify-between items-center gap-2 text-sm">
                  <span>
                    <span className="font-semibold">{m.name}</span>
                    {m.dosage && <span className="text-muted"> {m.dosage}</span>}
                    {m.frequency && <span className="text-muted"> · {m.frequency}</span>}
                  </span>
                  {(m.notes ?? "").startsWith("DRAFT:") ? (
                    <ConfirmDraftButton id={m.id} source={(m.notes ?? "").slice(6)} />
                  ) : (
                    <Badge tone="live">confirmed</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <SectionTitle>Allergies & conditions</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {rec.allergies.map((a) => <Badge key={a.id} tone="crit">⚠ {a.allergen}</Badge>)}
            {rec.conditions.map((c) => <Badge key={c.id} tone="warn">{c.name}{c.icd10 ? ` (${c.icd10})` : ""}</Badge>)}
            {rec.allergies.length + rec.conditions.length === 0 && <EmptyNote>None recorded.</EmptyNote>}
          </div>
          {alerts.length > 0 && (
            <p className="text-xs text-muted mt-3">
              The rule engine currently raises {alerts.length} flag(s) — visible to your doctors when consent is live.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
