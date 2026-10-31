import { notFound } from "next/navigation";
import { viewerForPage } from "@/lib/session";
import { one } from "@/lib/db";
import { liveConsentFor, scopedRecord, patientById } from "@/lib/repo";
import { buildSeries } from "@/lib/trends";
import { buildPrintSummary } from "@/lib/print-summary";
import { PatientWorkspace } from "@/components/patient-workspace";
import { ClinicalDisclaimer } from "@/components/clinical-disclaimer";
import { PrintSummary } from "@/components/print-summary";
import { PrintButton } from "@/components/print-button";

export default async function DoctorPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewerForPage("DOCTOR");
  const { id } = await params;
  const p = await one<{ id: string; fullName: string; guardian: string | null; relation: string | null }>(
    `SELECT p.id, p."fullName", g."fullName" AS guardian, p."guardianRelation" AS relation
       FROM "Patient" p LEFT JOIN "Patient" g ON g.id = p."guardianPatientId" WHERE p.id=$1`,
    [id],
  );
  if (!p) notFound();

  // F18: printable visit summary, server-side and consent-gated EXACTLY like the API —
  // liveConsentFor re-checks the DB clock; denied/absent consent → no print block at all
  // (the workspace below shows the refusal + break-glass path as usual). No extra ledger
  // row: every read of the record already logs VIEW_RECORD with the consent scope.
  let printData = null;
  const full = await patientById(p.id);
  if (full) {
    const { verdict } = await liveConsentFor(p.id, v.profileId);
    if (verdict.allowed) {
      const { sections, scopeNote } = await scopedRecord(p.id, verdict);
      const series = buildSeries(
        sections.observations.map((o) => ({ name: o.name, valueNum: o.valueNum, unit: o.unit, refLow: o.refLow, refHigh: o.refHigh, takenOn: o.takenOn })),
      );
      printData = buildPrintSummary({
        patient: {
          fullName: full.fullName,
          dateOfBirth: full.dateOfBirth?.toISOString() ?? null,
          gender: full.gender,
          bloodGroup: full.bloodGroup,
          city: full.city,
          abhaId: full.abhaId,
        },
        generatedAt: new Date().toISOString(),
        audience: "doctor",
        scopeNote,
        allergies: sections.allergies.map((a) => ({ allergen: a.allergen, severity: a.severity })),
        conditions: sections.conditions,
        medications: sections.medications,
        observations: series.map((s) => ({ name: s.name, unit: s.unit, latest: s.latest, direction: s.direction, band: s.latestBand, points: s.pointsUsed })),
        labs: sections.labs.slice(0, 5).map((l) => ({
          testName: l.testName,
          value: l.value,
          unit: l.unit,
          refRangeLow: l.refRangeLow,
          refRangeHigh: l.refRangeHigh,
          takenOn: l.takenOn?.toISOString() ?? null,
        })),
        lastEncounter: sections.encounters[0]
          ? {
              encounterDate: sections.encounters[0].encounterDate.toISOString(),
              diagnosisText: sections.encounters[0].diagnosisText,
              doctor: sections.encounters[0].doctor,
              advice: sections.encounters[0].advice,
              followUpOn: sections.encounters[0].followUpOn?.toISOString() ?? null,
            }
          : null,
      });
    }
  }

  return (
    <>
      <ClinicalDisclaimer audience="doctor" />
      {p.guardian && (
        <div className="callout mb-3 text-sm">
          <strong>Dependent profile.</strong> Records are managed by {p.relation === "PARENT" ? "parent" : "legal guardian"} <strong>{p.guardian}</strong>, who gives consent on the minor&apos;s behalf (DPDP Act s.9). Address the guardian for history and consent questions.
        </div>
      )}
      {printData && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-xs text-muted">The printout carries exactly what your consent scope shares — no more.</span>
          <PrintButton label="Print / save as PDF" />
        </div>
      )}
      {printData && <PrintSummary s={printData} />}
      <PatientWorkspace patientId={p.id} patientName={p.fullName} />
    </>
  );
}
