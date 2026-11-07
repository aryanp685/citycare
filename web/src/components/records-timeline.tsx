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

/** Only displays already-authorized record data; clinical text is shown as entered. */
export function RecordsTimeline({ encounters, labs }: { encounters: TimelineEncounter[]; labs: TimelineLab[] }) {
  const { locale, t } = useLocale();
  return (
    <Card className="md:col-span-1">
      <section lang={locale} aria-labelledby="records-timeline-heading">
        <SectionTitle><span id="records-timeline-heading">{t("records", "timeline")}</span></SectionTitle>
        {encounters.length === 0 && labs.length === 0 ? (
          <EmptyNote>{t("records", "emptyTimeline")}</EmptyNote>
        ) : (
          <ul className="relative border-l-2 border-line ml-2 pl-4 space-y-4 py-1">
            {encounters.map((e) => (
              <li key={e.id}>
                <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-teal-600 mt-1" aria-hidden="true" />
                <div className="text-xs text-muted">{formatTimelineDate(e.date, locale)} · {t("records", encounterTypeKey(e.type))} · {e.doctor ? <bdi lang="">{e.doctor}</bdi> : t("records", "selfReported")}</div>
                <div className="font-semibold text-sm">{e.diagnosis || e.complaint ? <bdi lang="">{e.diagnosis ?? e.complaint}</bdi> : t("records", "consultation")}</div>
                {e.code && <Badge tone="off">ICD-10 {e.code}</Badge>}
                {e.advice && <p className="text-sm text-muted mt-1" lang="" dir="auto">{e.advice}</p>}
                {e.followUp && <p className="text-xs mt-1"><Badge tone="warn">{t("records", "followUp")} {formatTimelineDate(e.followUp, locale)}</Badge></p>}
              </li>
            ))}
            {labs.slice(0, 6).map((lab) => (
              <li key={lab.id}>
                <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-slate-300 mt-1" aria-hidden="true" />
                <div className="text-xs text-muted">{lab.takenOn ? formatTimelineDate(lab.takenOn, locale) : t("records", "dateUnknown")}</div>
                <div className="text-sm"><span className="font-semibold" lang="" dir="auto">{lab.name}</span> {lab.value}{lab.unit ?? ""}
                  {(lab.low !== null || lab.high !== null) && <span className="text-muted"> ({t("records", "reference")} {lab.low ?? "-"}–{lab.high ?? "-"})</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
