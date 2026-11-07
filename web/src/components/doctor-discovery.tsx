"use client";
import Link from "next/link";
import type { DoctorCard, DoctorSearch } from "@/lib/repo";
import { useLocale } from "./use-locale";
import { Card, DoctorCardMini, EmptyNote } from "./ui";
import { WorkspaceHeading } from "./workspace-heading";

export function DoctorDiscovery({ filters, doctors }: { filters: DoctorSearch; doctors: DoctorCard[] }) {
  const hasFilters = Object.values(filters).some((value) => value.trim().length > 0);
  const { locale, t } = useLocale();
  return <div lang={locale} className="grid gap-4">
    <WorkspaceHeading eyebrow={t("discovery", "eyebrow")} title={t("discovery", "title")} description={t("discovery", "intro")} />
    <Card>
      <form key={JSON.stringify(filters)} className="grid gap-3" action="/patient/doctors" method="get" role="search">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="field min-w-0"><span>{t("discovery", "searchLabel")}</span><input name="q" maxLength={120} defaultValue={filters.q} placeholder={t("discovery", "searchPlaceholder")} /></label>
          <label className="field min-w-0"><span>{t("discovery", "cityLabel")}</span><input name="city" maxLength={120} defaultValue={filters.city} placeholder={t("discovery", "cityPlaceholder")} /></label>
          <label className="field min-w-0"><span>{t("discovery", "specialtyLabel")}</span><input name="specialty" maxLength={120} defaultValue={filters.specialty} placeholder={t("discovery", "specialtyPlaceholder")} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-2"><button className="btn btn-primary">{t("discovery", "search")}</button>{hasFilters && <Link className="btn btn-ghost" href="/patient/doctors">{t("discovery", "clearFilters")}</Link>}</div>
      </form>
      <p className="text-xs text-muted mt-2">{t("discovery", "searchHelp")} {t("discovery", "filterHelp")}</p>
    </Card>
    {doctors.length === 0 ? <Card><EmptyNote>{t("discovery", hasFilters ? "noResults" : "noDoctors")}</EmptyNote></Card> : <>
      <p className="text-xs text-muted">{t("discovery", "limit")}</p>
      <div className="grid md:grid-cols-2 gap-3">{doctors.map((d) => <DoctorCardMini key={d.id} d={d} locale={locale} approvedLabel={t("discovery", "approved")} ratingUnavailable={t("discovery", "ratingUnavailable")} />)}</div>
    </>}
    <p className="text-xs text-muted">{t("discovery", "doctorSignup")} <Link className="text-brand" href="/signup">{t("discovery", "createAccount")}</Link>. {t("discovery", "reviewNote")}</p>
  </div>;
}
