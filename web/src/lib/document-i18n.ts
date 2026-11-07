import type { Locale, MessageKey } from "./i18n";

type Key = MessageKey<"documents">;
export const DOCUMENT_TYPES: readonly { value: string; label: Key }[] = [
  { value: "LAB_REPORT", label: "typeLab" }, { value: "PRESCRIPTION", label: "typePrescription" },
  { value: "DISCHARGE_SUMMARY", label: "typeDischarge" }, { value: "XRAY", label: "typeXray" },
  { value: "MRI", label: "typeMri" }, { value: "CT_SCAN", label: "typeCt" },
  { value: "ULTRASOUND", label: "typeUltrasound" }, { value: "ECG", label: "typeEcg" },
  { value: "VACCINATION_CARD", label: "typeVaccination" }, { value: "BILL", label: "typeBill" },
  { value: "OTHER", label: "typeOther" },
];
const ERRORS: Record<string, Key> = {
  auth_required: "errorAuth", consent_outdated: "errorConsent", wrong_role: "errorDenied", no_consent: "errorDenied", scope_excludes_documents: "errorDenied", bad_link: "errorLinkExpired", rate_limited: "errorRate", file_required: "errorFileRequired",
  empty_file: "errorEmpty", file_too_large: "errorLarge", title_required: "errorTitle",
  bad_type: "errorType", bad_date: "errorDate", unsupported_type: "errorUnsupported",
  quota_exceeded: "errorQuota", not_found: "errorNotFound",
};
export function documentErrorKey(code: unknown): Key {
  return typeof code === "string" && Object.hasOwn(ERRORS, code) ? ERRORS[code] : "errorGeneric";
}
export function documentTypeKey(type: string): Key {
  return DOCUMENT_TYPES.find((item) => item.value === type)?.label ?? "typeOther";
}
const SOURCES: Record<string, Key> = { PATIENT_UPLOAD: "sourcePatient", DOCTOR_UPLOAD: "sourceDoctor", LAB_UPLOAD: "sourceLab", SCANNED_PAPER: "sourceScan", IMPORTED_FHIR: "sourceImported" };
export function documentSourceKey(source: string): Key {
  return Object.hasOwn(SOURCES, source) ? SOURCES[source] : "sourceUnknown";
}
export function documentSize(bytes: number, locale: Locale): string {
  const large = bytes >= 1024 * 1024;
  const number = large ? bytes / (1024 * 1024) : Math.ceil(bytes / 1024);
  return `${new Intl.NumberFormat(`${locale}-IN`, { maximumFractionDigits: large ? 1 : 0 }).format(number)} ${large ? "MB" : "KB"}`;
}
export function documentDate(value: string, locale: Locale): string {
  // The DB's issuedOn is a calendar date, not a time. Interpret dates in UTC to avoid day shifts.
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value;
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) return value;
  return new Intl.DateTimeFormat(`${locale}-IN`, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(date);
}
export function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
