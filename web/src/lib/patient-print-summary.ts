import { patientAllergySeverity } from "./records-presentation";
import { translate, type Locale, type MessageKey } from "./i18n";
import { ageFromIso, buildPrintSummary, type PrintSummary, type PrintSummaryInput } from "./print-summary";

const directions: Record<string, MessageKey<"records">> = { improving: "trendImproving", worsening: "trendWorsening", stable: "trendStable", rising: "trendRising", falling: "trendFalling", insufficient: "trendInsufficient" };
const bands: Record<string, MessageKey<"records">> = { below: "trendBelow", in: "trendIn", above: "trendAbove" };

/** Localize generated labels only. Source names, text, values, units and codes remain untouched. */
export function buildPatientPrintSummary(input: PrintSummaryInput, locale: Locale): PrintSummary {
  const s = buildPrintSummary(input);
  if (locale === "en") return s;
  const t = (key: MessageKey<"records">) => translate(locale, "records", key);
  const date = (iso: string | null) => {
    if (!iso || Number.isNaN(new Date(iso).getTime())) return t("dateUnknown");
    return new Date(iso).toLocaleDateString(`${locale}-IN`, { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
  };
  // Keep the original age calculation; only translate its generated suffix.
  const age = ageFromIso(input.patient.dateOfBirth, input.generatedAt)?.replace(/ y$/, "");
  const identity = [input.patient.fullName];
  if (age) identity.push(`${age} ${t("printYears")}`);
  const genders: Record<string, MessageKey<"records">> = { MALE: "printGenderMale", FEMALE: "printGenderFemale", OTHER: "printGenderOther", UNDISCLOSED: "printGenderUndisclosed" };
  if (input.patient.gender) identity.push(Object.hasOwn(genders, input.patient.gender) ? t(genders[input.patient.gender]) : input.patient.gender);
  if (input.patient.bloodGroup) identity.push(`${t("printBlood")} ${input.patient.bloodGroup}`);
  if (input.patient.city) identity.push(input.patient.city);
  const confirmed = input.medications.filter(m => !(m.notes ?? "").startsWith("DRAFT:"));
  const draftCount = input.medications.length - confirmed.length;
  const none = t("noneRecorded");
  return {
    ...s,
    title: t("printTitle"),
    metaLine: t("printGenerated").replace("{date}", new Date(input.generatedAt).toLocaleString(`${locale}-IN`, { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })),
    identityLines: [identity.join(" · "), ...(input.patient.abhaId ? [`ABHA ID: ${input.patient.abhaId}`] : [])],
    allergyLines: input.allergies.length ? input.allergies.map(a => `${a.allergen} — ${patientAllergySeverity(a.severity, locale)}`) : [none],
    conditionLines: input.conditions.length ? s.conditionLines : [none],
    medicationLines: confirmed.length ? s.medicationLines : [none],
    medicationNote: draftCount ? t("printDrafts").replace("{count}", String(draftCount)) : null,
    observationLines: input.observations.length ? input.observations.map(o => {
      if (o.latest === null || o.points < 2) return `${o.name} — ${t("printOneReading")}${o.latest !== null ? ` (${o.latest}${o.unit ? ` ${o.unit}` : ""})` : ""}`;
      const direction = Object.hasOwn(directions, o.direction) ? t(directions[o.direction]) : o.direction;
      const band = o.band ? `, ${Object.hasOwn(bands, o.band) ? t(bands[o.band]) : o.band}` : "";
      return `${o.name} — ${t("trendLatest")} ${o.latest}${o.unit ? ` ${o.unit}` : ""} · ${direction}${band}`;
    }) : [none],
    labLines: input.labs.length ? input.labs.slice(0, 5).map(l => `${l.testName} ${l.value}${l.unit ? ` ${l.unit}` : ""}${l.refRangeLow || l.refRangeHigh ? ` (${t("printReference")} ${l.refRangeLow ?? "-"}–${l.refRangeHigh ?? "-"})` : ""} · ${date(l.takenOn)}`) : [none],
    encounterLines: input.lastEncounter ? [
      `${date(input.lastEncounter.encounterDate)}${input.lastEncounter.doctor ? ` · ${input.lastEncounter.doctor}` : ""}`,
      input.lastEncounter.diagnosisText ?? t("consultation"),
      ...(input.lastEncounter.advice ? [`${t("printAdvice")}: ${input.lastEncounter.advice}`] : []),
      ...(input.lastEncounter.followUpOn ? [`${t("followUp")}: ${date(input.lastEncounter.followUpOn)}`] : []),
    ] : [none],
    footerLines: [t("printFooterDisclaimer"), t("printFooterShare"), t("printFooterBrand")],
  };
}
