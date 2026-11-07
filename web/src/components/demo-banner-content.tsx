"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "./use-locale";

/** Only the patient presentation is localized; the server chooses the actual retention policy. */
export function DemoBannerContent({ enabled, days }: { enabled: boolean; days: number }) {
  const path = usePathname();
  const { locale, t } = useLocale();
  const patient = path === "/patient" || path?.startsWith("/patient/");
  return <div lang={patient ? locale : undefined} role="note" className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs">
    <div className="max-w-6xl mx-auto px-4 py-1.5 flex flex-wrap gap-x-3 gap-y-1 items-center">
      <strong className="font-bold">{patient ? t("records", "demoTitle") : "Public demo."}</strong>
      <span>{patient ? t("records", "demoWarning") : "All seeded records are synthetic. Do not enter real personal or health data about yourself or anyone else."}</span>
      <span>{patient ? t("records", enabled ? "demoRetention" : "demoNoRetention").replace("{days}", String(days)) : enabled ? `Accounts you create are erased automatically after ${days} days.` : "This deployment does not auto-erase accounts — you can erase your data any time (Access & trust → Erase my data)."}</span>
      <Link href="/legal/privacy" className="underline underline-offset-2 font-semibold">{patient ? t("records", "demoPrivacy") : "Privacy notice"}</Link>
    </div>
  </div>;
}
