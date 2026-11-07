"use client";
import { patientAllergySeverity } from "@/lib/records-presentation";
import { useLocale } from "./use-locale";
import { Badge, Card, EmptyNote, SectionTitle } from "./ui";
import { ConfirmDraftButton } from "./confirm-draft";
import { FhirDownload } from "./fhir-download";
import { PrintButton } from "./print-button";

type Medication = { id: string; name: string; dosage: string | null; frequency: string | null; notes: string | null };
type Allergy = { id: string; allergen: string; severity?: string };
type Condition = { id: string; name: string; icd10: string | null };

export function PatientRecordsIntro() {
  const { locale, t } = useLocale();
  return <div lang={locale} className="grid gap-4">
    <h1 className="text-xl font-bold">{t("records", "shellRecords")}</h1>
    <p className="text-[11px] leading-relaxed text-muted border border-dashed border-line rounded-lg px-3 py-2 mb-4">{t("records", "patientDisclaimer")}</p>
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="font-bold">{t("records", "exportHeading")}</div><p className="text-sm text-muted mt-0.5">{t("records", "exportDescription")}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <FhirDownload />
        <PrintButton logExport label={t("records", "exportPrint")} />
      </div>
    </Card>
  </div>;
}
export function PatientRecordCards({ medications, allergies, conditions, alertCount }: { medications: Medication[]; allergies: Allergy[]; conditions: Condition[]; alertCount: number }) {
  const { locale, t } = useLocale();
  const drafts = medications.filter(m => (m.notes ?? "").startsWith("DRAFT:")).length;
  return <div lang={locale} className="grid gap-4 content-start">
    <Card><SectionTitle>{t("records", "medicines")} {drafts > 0 && <Badge tone="warn">{t("records", "draftCount").replace("{count}", String(drafts))}</Badge>}</SectionTitle>
      {medications.length === 0 ? <EmptyNote>{t("records", "medEmpty")}</EmptyNote> : <ul className="grid gap-2">{medications.map(m =>
        <li key={m.id} className="flex flex-wrap justify-between items-center gap-2 text-sm"><span lang="" dir="auto"><span className="font-semibold">{m.name}</span>{m.dosage && <span className="text-muted"> {m.dosage}</span>}{m.frequency && <span className="text-muted"> · {m.frequency}</span>}</span>
          {(m.notes ?? "").startsWith("DRAFT:") ? <ConfirmDraftButton id={m.id} source={(m.notes ?? "").slice(6)} /> : <Badge tone="live">{t("records", "medConfirmed")}</Badge>}
        </li>)}</ul>}
    </Card>
    <Card><SectionTitle>{t("records", "allergiesConditions")}</SectionTitle><div className="flex flex-wrap gap-1.5">
      {allergies.map(a => <Badge key={a.id} tone="crit">⚠ {a.allergen}{a.severity ? ` — ${patientAllergySeverity(a.severity, locale)}` : ""}</Badge>)}
      {conditions.map(c => <Badge key={c.id} tone="warn">{c.name}{c.icd10 ? ` (${c.icd10})` : ""}</Badge>)}
      {allergies.length + conditions.length === 0 && <EmptyNote>{t("records", "noneRecorded")}</EmptyNote>}
    </div>{alertCount > 0 && <p className="text-xs text-muted mt-3">{t("records", "ruleFlags").replace("{count}", String(alertCount))}</p>}</Card>
  </div>;
}
