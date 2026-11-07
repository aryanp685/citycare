"use client";

import PatientLoading from "@/app/patient/loading";
import { useLocale } from "@/components/use-locale";

/** Records-only fallback: keep the page heading while the existing skeleton loads. */
export default function RecordsLoading() {
  const { locale, t } = useLocale();
  return <div className="grid gap-4" lang={locale}>
    <h1 className="text-xl font-bold">{t("records", "shellRecords")}</h1>
    <PatientLoading />
  </div>;
}
