"use client";
import { usePathname } from "next/navigation";
import { useLocale } from "./use-locale";
import type { ReactNode } from "react";

/** Group the existing global notices only on patient routes; other shells are unchanged. */
export function PatientNoticeRegion({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { locale, t } = useLocale();
  const patient = path === "/patient" || path?.startsWith("/patient/");
  return patient
    ? <section lang={locale} aria-label={t("records", "shellNoticesLanguage")}>{children}</section>
    : <>{children}</>;
}
