"use client";
import { useLocale } from "./use-locale";
import { PrintSummary } from "./print-summary";
import { buildPatientPrintSummary } from "@/lib/patient-print-summary";
import type { PrintSummaryInput } from "@/lib/print-summary";

export function PatientPrintSummary({ input }: { input: PrintSummaryInput }) {
  const { locale, t } = useLocale();
  return <PrintSummary s={buildPatientPrintSummary(input, locale)} lang={locale} headings={[
    t("records", "printPatient"), t("records", "printAllergies"), t("records", "printConditions"),
    t("records", "printMedicines"), t("records", "printReadings"), t("records", "printLabs"), t("records", "printVisit"),
  ]} />;
}
