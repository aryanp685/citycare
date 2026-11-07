import { viewerForPage } from "@/lib/session";
import { recordSections, toRuleRecord, patientById } from "@/lib/repo";
import { runAllRules } from "@/lib/rules";
import { buildSeries } from "@/lib/trends";
import type { PrintSummaryInput } from "@/lib/print-summary";
import { Card } from "@/components/ui";
import { PhotoPaste } from "@/components/photo-paste";
import { DocumentManager } from "@/components/document-manager";
import { TrendsCard } from "@/components/trends";
import { PatientPrintSummary } from "@/components/patient-print-summary";
import { RecordsTimeline } from "@/components/records-timeline";
import { PatientRecordsIntro, PatientRecordCards } from "@/components/patient-records-cards";

export default async function RecordsPage() {
  const v = await viewerForPage("PATIENT");
  const pid = v.profileId;
  const rec = await recordSections(pid);
  const patient = await patientById(pid);
  const today = new Date().toISOString().slice(0, 10);
  const alerts = runAllRules(toRuleRecord(rec), today);

  // F18: the printable visit summary — same record data, the exact lines built by the
  // pure lib/print-summary (unit-tested). Hidden on screen; @media print makes it the page.
  const series = buildSeries(
    rec.observations.map((o) => ({ name: o.name, valueNum: o.valueNum, unit: o.unit, refLow: o.refLow, refHigh: o.refHigh, takenOn: o.takenOn })),
  );
  const printData: PrintSummaryInput | null = patient
    ? {
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
        conditions: rec.conditions.map(c => ({ name: c.name, icd10: c.icd10 })),
        medications: rec.medications.map(m => ({ name: m.name, dosage: m.dosage, frequency: m.frequency, notes: (m.notes ?? "").startsWith("DRAFT:") ? "DRAFT:" : null })),
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
      }
    : null;

  return (
    <div id="patient-records">
      {printData && <PatientPrintSummary input={printData} />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="grid gap-4 content-start md:col-span-2">
        <PatientRecordsIntro />
        <PhotoPaste />
      </div>

      <Card className="md:col-span-2">
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

      <RecordsTimeline
        encounters={rec.encounters.map((e) => ({ id: e.id, date: e.encounterDate.toISOString(), type: e.type, doctor: e.doctor,
          diagnosis: e.diagnosisText, complaint: e.chiefComplaint, code: e.diagnosisCode, advice: e.advice,
          followUp: e.followUpOn?.toISOString() ?? null }))}
        labs={rec.labs.slice(0, 6).map((l) => ({ id: l.id, takenOn: l.takenOn?.toISOString() ?? null, name: l.testName,
          value: l.value, unit: l.unit, low: l.refRangeLow, high: l.refRangeHigh }))}
      />

      <PatientRecordCards medications={rec.medications.map(m => ({ id: m.id, name: m.name, dosage: m.dosage, frequency: m.frequency, notes: m.notes }))}
        allergies={rec.allergies.map(a => ({ id: a.id, allergen: a.allergen, severity: a.severity }))}
        conditions={rec.conditions.map(c => ({ id: c.id, name: c.name, icd10: c.icd10 }))} alertCount={alerts.length} />
      </div>
    </div>
  );
}
