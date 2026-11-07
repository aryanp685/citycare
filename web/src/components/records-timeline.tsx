"use client";
import { useLocale } from "@/components/use-locale";
import { Badge, Card, EmptyNote, SectionTitle } from "@/components/ui";
import type { MessageKey, Locale } from "@/lib/i18n";

export type TimelineEncounter = { id: string; date: string; type: string; doctor: string | null; diagnosis: string | null; complaint: string | null; code: string | null; advice: string | null; followUp: string | null };
export type TimelineLab = { id: string; takenOn: string | null; name: string; value: string | number; unit: string | null; low: string | number | null; high: string | number | null };
const TYPES: Record<string, MessageKey<"records">> = {
  OUTPATIENT: "outpatient", INPATIENT: "inpatient", EMERGENCY: "emergency", TELECONSULT: "teleconsult",
  LAB_TEST: "labTest", SURGERY: "surgery", SELF_REPORTED: "selfReportedType",
};
export function encounterTypeKey(type: string): MessageKey<"records"> {
  return Object.hasOwn(TYPES, type) ? TYPES[type] : "otherEncounter";
}
export function formatTimelineDate(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(`${locale}-IN`, { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }).format(date);
}

type TimelineEntry = { kind: "encounter"; data: TimelineEncounter } | { kind: "lab"; data: TimelineLab };
function timestamp(value: string | null): number | null {
  if (!value) return null;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}
/** Newest first; undated/invalid entries are last. Original order breaks ties. */
export function buildTimeline(encounters: TimelineEncounter[], labs: TimelineLab[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...encounters.map((data): TimelineEntry => ({ kind: "encounter", data })),
    ...labs.map((data): TimelineEntry => ({ kind: "lab", data })),
  ];
  return entries.map((entry, index) => ({ entry, index, date: timestamp(entry.kind === "encounter" ? entry.data.date : entry.data.takenOn) }))
    .sort((a, b) => a.date === null ? (b.date === null ? a.index - b.index : 1) : b.date === null ? -1 : b.date - a.date || a.index - b.index)
    .map(({ entry }) => entry);
}

/** Patient-owned data already fetched by the records page. This does not control doctor access. */
export function RecordsTimeline({ encounters, labs }: { encounters: TimelineEncounter[]; labs: TimelineLab[] }) {
  const { locale, t } = useLocale();
  const entries = buildTimeline(encounters, labs);
  return (
    <Card className="md:col-span-1">
      <section lang={locale} aria-labelledby="records-timeline-heading">
        <SectionTitle><span id="records-timeline-heading">{t("records", "timeline")}</span></SectionTitle>
        <p className="text-sm text-muted mb-4">{t("records", "timelineLimit")}</p>
        {entries.length === 0 ? <EmptyNote>{t("records", "emptyTimeline")}</EmptyNote> : (
          <ol className="relative border-l-2 border-line ml-2 pl-4 space-y-4 py-1">
            {entries.map((entry) => entry.kind === "encounter" ? (() => {
              const e = entry.data;
              const validDate = timestamp(e.date) !== null;
              return <li key={`encounter-${e.id}`} className="min-w-0 break-words">
                <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-teal-600 mt-1" aria-hidden="true" />
                <div className="text-xs text-muted">{validDate ? <time dateTime={e.date}>{formatTimelineDate(e.date, locale)}</time> : t("records", "dateUnknown")} · {t("records", encounterTypeKey(e.type))} · {e.doctor ? <bdi>{e.doctor}</bdi> : t("records", e.type === "SELF_REPORTED" ? "selfReported" : "sourceUnknown")}</div>
                <div className="font-semibold text-sm">{e.diagnosis || e.complaint ? <bdi>{e.diagnosis || e.complaint}</bdi> : t("records", "consultation")}</div>
                {e.code && <Badge tone="off">ICD-10 {e.code}</Badge>}
                {e.advice && <p className="text-sm text-muted mt-1" lang="" dir="auto">{e.advice}</p>}
                {e.followUp && <p className="text-xs mt-1"><Badge tone="warn">{t("records", "followUp")} {timestamp(e.followUp) === null ? t("records", "dateUnknown") : formatTimelineDate(e.followUp, locale)}</Badge></p>}
              </li>;
            })() : (() => {
              const lab = entry.data;
              const validDate = timestamp(lab.takenOn) !== null;
              return <li key={`lab-${lab.id}`} className="min-w-0 break-words">
                <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-slate-300 mt-1" aria-hidden="true" />
                <div className="text-xs text-muted">{validDate && lab.takenOn ? <time dateTime={lab.takenOn}>{formatTimelineDate(lab.takenOn, locale)}</time> : t("records", "dateUnknown")} · {t("records", "labResult")} · {t("records", "linkedDocument")}</div>
                <div className="text-sm"><span className="font-semibold" lang="" dir="auto">{lab.name}</span> {lab.value}{lab.unit ? ` ${lab.unit}` : ""}
                  {(lab.low !== null || lab.high !== null) && <span className="text-muted"> ({t("records", "reference")} {lab.low ?? "-"}–{lab.high ?? "-"})</span>}
                </div>
              </li>;
            })())}
          </ol>
        )}
      </section>
    </Card>
  );
}
