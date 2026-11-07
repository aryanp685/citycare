"use client";
import { useLayoutEffect } from "react";
import { useLocale } from "@/components/use-locale";

/** Only the preference control is translated until the journeys are ready. */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  useLayoutEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return (
    <div lang={locale} className="border-b border-line bg-white px-4 py-2 text-sm">
      <div className="mx-auto max-w-6xl flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor="citycare-language" className="font-semibold">{t("common", "language")}</label>
        <select id="citycare-language" value={locale} onChange={(event) => setLocale(event.target.value)}
          aria-describedby="citycare-language-status" className="rounded border border-line-2 bg-white px-2 py-1 text-ink">
          <option lang="en" value="en">English</option>
          <option lang="hi" value="hi">हिन्दी</option>
          <option lang="mr" value="mr">मराठी</option>
        </select>
        <span id="citycare-language-status" className="text-ink-2">{t("common", "incomplete")}</span>
      </div>
    </div>
  );
}
