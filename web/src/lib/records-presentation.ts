import { translate, type Locale, type MessageKey } from "./i18n";

const SEVERITIES: Readonly<Record<string, MessageKey<"records">>> = {
  INFO: "printSeverityInfo", WARNING: "printSeverityWarning", CRITICAL: "printSeverityCritical",
};
export function patientAllergySeverity(severity: string, locale: Locale): string {
  return Object.hasOwn(SEVERITIES, severity) ? translate(locale, "records", SEVERITIES[severity]) : severity;
}
