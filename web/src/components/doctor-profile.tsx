"use client";
import Link from "next/link";
import type { DoctorCard } from "@/lib/repo";
import { interpolate } from "@/lib/document-i18n";
import { Card, SectionTitle, KV, Badge } from "./ui";
import { SlotPicker } from "./slot-picker";
import { useLocale } from "./use-locale";

type Doctor = Pick<DoctorCard, "id" | "fullName" | "qualification" | "experienceYrs" | "consultationFee" | "rating" | "isVerified" | "hospital" | "city" | "languages"> & { bio: string | null };
type Day = { date: string; slots: { iso: string; wall: string; left: number }[] };
export function DoctorProfile({ doctor: d, grid }: { doctor: Doctor; grid: Day[] }) {
  const { locale, t } = useLocale();
  const fee = new Intl.NumberFormat(`${locale}-IN`, { style: "currency", currency: "INR" }).format(Number(d.consultationFee));
  return <div lang={locale} className="space-y-4">
    <Link className="text-sm font-semibold text-brand inline-block" href="/patient/doctors">← {t("discovery", "back")}</Link>
    <div className="grid md:grid-cols-3 gap-4">
      <Card className="md:col-span-1 h-fit min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted font-semibold">{t("discovery", "profile")}</p>
        <h1 className="font-bold text-xl mt-1 break-words"><bdi lang="">{d.fullName}</bdi></h1>
        <p className="text-sm text-muted break-words"><bdi lang="">{d.qualification}</bdi></p>
        {(d.hospital || d.city) && <p className="text-sm text-muted mt-1 break-words"><span className="sr-only">{t("discovery", "location")}: </span><bdi lang="">{[d.hospital, d.city].filter(Boolean).join(" · ")}</bdi></p>}
        <div className="mt-3 flex gap-2 flex-wrap">
          <Badge tone={d.isVerified ? "live" : "off"}>{t("discovery", d.isVerified ? "approved" : "notApproved")}</Badge>
          <Badge tone="off">{d.rating !== null && Number.isFinite(d.rating) ? `★ ${d.rating.toFixed(1)}` : t("discovery", "ratingUnavailable")}</Badge>
        </div>
        <div className="mt-3">
          <KV k={t("discovery", "experience")} v={interpolate(t("discovery", "years"), { count: String(d.experienceYrs) })} />
          <KV k={t("discovery", "fee")} v={fee} />
          <KV k={t("discovery", "languages")} v={d.languages.length ? <bdi lang="">{d.languages.join(", ")}</bdi> : t("discovery", "notProvided")} />
        </div>
        {d.bio && <p className="text-sm text-muted mt-3 break-words" lang="" dir="auto">{d.bio}</p>}
      </Card>
      <Card className="md:col-span-2 min-w-0">
        <SectionTitle>{t("discovery", "schedule")}</SectionTitle>
        <p className="text-xs text-muted mb-3">{t("discovery", "scheduleHelp")}</p>
        {d.isVerified ? <SlotPicker doctorId={d.id} doctorName={d.fullName} fee={Number(d.consultationFee)} grid={grid} /> : <p className="text-sm text-muted">{t("discovery", "notBookable")}</p>}
      </Card>
    </div>
  </div>;
}
