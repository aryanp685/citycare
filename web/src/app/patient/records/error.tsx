"use client";
import { useLocale } from "@/components/use-locale";

/** Scoped to the records route; never expose the error object to the patient. */
export default function RecordsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale, t } = useLocale();
  return <section lang={locale} role="alert"><h1 className="text-xl font-bold mb-4">{t("records", "shellRecords")}</h1><p>{t("records", "recordsRenderError")}</p><button type="button" className="btn btn-primary" onClick={reset}>{t("records", "recordsRetry")}</button></section>;
}
