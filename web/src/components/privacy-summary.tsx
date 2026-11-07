"use client";

import Link from "next/link";
import { useLocale } from "@/components/use-locale";
import { LEGAL_LANGS, LEGAL_SUMMARY, howLongBody, pickLang } from "@/lib/legal-i18n";
import type { Locale } from "@/lib/i18n";

/** Explicit notice links take precedence over a browser preference, including invalid links. */
export function privacySummaryLocale(requested: string | undefined, preference: Locale): Locale {
  return requested === undefined ? preference : pickLang(requested);
}

export function PrivacySummary({ requestedLang, retentionEnabled, retentionDays }: {
  requestedLang?: string; retentionEnabled: boolean; retentionDays: number;
}) {
  const { locale } = useLocale();
  const lang = privacySummaryLocale(requestedLang, locale);
  const t = LEGAL_SUMMARY[lang];
  const points = t.points.map((point, index) => index === 4
    ? { ...point, body: howLongBody(retentionEnabled, retentionDays, lang) } : point);
  return (
    <div className="callout" lang={lang}>
      <div className="flex flex-wrap items-center gap-2 mb-2" lang="en">
        <span className="text-xs text-muted">Read the key points in:</span>
        {LEGAL_LANGS.map((l) => (
          <Link key={l} href={`/legal/privacy?lang=${l}`} className={`kbd ${l === lang ? "font-bold" : ""}`} hrefLang={l} aria-current={l === lang ? "true" : undefined}>{LEGAL_SUMMARY[l].langName}</Link>
        ))}
      </div>
      <strong>{t.title}</strong>
      <p className="text-sm">{t.operativeNote}{t.reviewNote ? ` ${t.reviewNote}` : ""}</p>
      <ul>
        {points.map((point) => <li key={point.heading}><strong>{point.heading}:</strong> {point.body}</li>)}
        <li>{t.rights}</li>
        <li>{t.grievance}</li>
        <li>{t.children}</li>
      </ul>
    </div>
  );
}
