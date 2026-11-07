"use client";
// F5 — the longitudinal trends view.
//
// One panel, two audiences:
//  * patient  (/patient/records): their own readings + the "log a reading" form + delete
//  * doctor   (patient workspace): read-only, consent-scoped rows (applyScope already filtered)
//
// The sparkline is hand-rolled SVG — zero chart libraries (roadmap F5). The reference band is
// drawn behind the points so "is this in range?" is visible at a glance. Everything here is
// self-reported data: the copy says so, and the direction vocabulary is the honest one from
// lib/trends (no band → "rising/falling", never "improving").

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, EmptyNote, SectionTitle } from "./ui";
import { callApi } from "./api-client";
import { submitTrendReading } from "@/lib/trend-submission";
import { buildSeries, type TrendSeries } from "@/lib/trends";
import { useLocale } from "./use-locale";
import { translate, type Locale } from "@/lib/i18n";
import { formatTimelineDate } from "./records-timeline";
import { fmtIstDate } from "@/lib/dates";

/** A reading row in serializable form (both the RSC page and the doctor's client fetch produce this). */
export type ObsRow = {
  id: string;
  name: string;
  category: string;
  valueNum: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  takenOn: string; // ISO
  encounterId: string | null;
};

const DIR: Record<TrendSeries["direction"], { label: string; tone: "live" | "warn" | "crit" | "off" }> = {
  improving: { label: "improving", tone: "live" },
  worsening: { label: "worsening", tone: "crit" },
  stable: { label: "stable", tone: "off" },
  rising: { label: "rising (no target set)", tone: "warn" },
  falling: { label: "falling (no target set)", tone: "warn" },
  insufficient: { label: "not enough readings yet", tone: "off" },
};

const BAND_LABEL: Record<NonNullable<TrendSeries["latestBand"]>, string> = {
  below: "below target range",
  in: "in target range",
  above: "above target range",
};

/** Hand-rolled SVG sparkline with the reference band shaded behind the points. */
export function TrendSparkline({ s, height = 64, locale }: { s: TrendSeries; height?: number; locale?: Locale }) {
  const W = 280;
  const H = height;
  const pad = 6;
  if (s.points.length < 2) return null;
  let vmin = Math.min(...s.points.map((p) => p.value), s.refLow ?? Infinity);
  let vmax = Math.max(...s.points.map((p) => p.value), s.refHigh ?? -Infinity);
  if (!Number.isFinite(vmin) || !Number.isFinite(vmax)) return null;
  if (vmin === vmax) { vmin -= 1; vmax += 1; }
  const span = vmax - vmin;
  vmin -= span * 0.1;
  vmax += span * 0.1;
  const t = (iso: string) => Date.parse(iso);
  const t0 = t(s.points[0].takenOn);
  const t1 = t(s.points[s.points.length - 1].takenOn);
  const x = (tt: number) => (t1 === t0 ? W / 2 : pad + ((tt - t0) / (t1 - t0)) * (W - 2 * pad));
  const y = (v: number) => H - pad - ((v - vmin) / (vmax - vmin)) * (H - 2 * pad);
  const pts = s.points.map((p) => `${x(t(p.takenOn)).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const bandTop = s.refHigh !== null ? y(s.refHigh) : 0;
  const bandBottom = s.refLow !== null ? y(s.refLow) : H;
  const hasBand = s.refLow !== null || s.refHigh !== null;
  const last = s.points[s.points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} role="img" aria-label={locale ? translate(locale, "records", "trendChartLabel").replace("{name}", s.name).replace("{count}", String(s.points.length)) : `${s.name} trend: ${s.points.length} readings`}>
      {hasBand && <rect x={0} y={bandTop} width={W} height={Math.max(0, bandBottom - bandTop)} className="fill-teal-50" />}
      {s.refHigh !== null && (
        <line x1={0} x2={W} y1={y(s.refHigh)} y2={y(s.refHigh)} strokeWidth={1} strokeDasharray="3 3" className="stroke-teal-300" />
      )}
      {s.refLow !== null && (
        <line x1={0} x2={W} y1={y(s.refLow)} y2={y(s.refLow)} strokeWidth={1} strokeDasharray="3 3" className="stroke-teal-300" />
      )}
      <polyline points={pts} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-teal-600" />
      {s.points.map((p, i) => (
        <circle
          key={i}
          cx={x(t(p.takenOn))}
          cy={y(p.value)}
          r={i === s.points.length - 1 ? 3.5 : 2}
          className={i === s.points.length - 1 ? "fill-teal-700" : "fill-teal-400"}
        />
      ))}
      <title>{locale ? translate(locale, "records", "trendChartLatest").replace("{value}", `${last.value}${s.unit ?? ""}`).replace("{date}", formatTimelineDate(last.takenOn, locale)) : `latest ${last.value}${s.unit ?? ""} on ${fmtIstDate(last.takenOn)}`}</title>
    </svg>
  );
}

function TrendStats({ s, locale }: { s: TrendSeries; locale?: Locale }) {
  const directions = { improving: "trendImproving", worsening: "trendWorsening", stable: "trendStable", rising: "trendRising", falling: "trendFalling", insufficient: "trendInsufficient" } as const;
  const bands = { below: "trendBelow", in: "trendIn", above: "trendAbove" } as const;
  const d = DIR[s.direction];
  const latest = s.points[s.points.length - 1];
  const parts: string[] = [];
  if (s.delta !== null) {
    parts.push(`${locale ? translate(locale, "records", "trendChange") : "change"} ${s.delta > 0 ? "+" : ""}${round1(s.delta)}${s.unit ?? ""}`);
    if (s.ratePerMonth !== null) parts.push(`≈ ${s.ratePerMonth > 0 ? "+" : ""}${round1(s.ratePerMonth)}${locale ? translate(locale, "records", "trendPerMonth") : "/month"}`);
  }
  parts.push(locale ? translate(locale, "records", "trendReadings").replace("{count}", String(s.pointsUsed)) + (s.pointsDropped > 0 ? ` (${translate(locale, "records", "trendSkipped").replace("{count}", String(s.pointsDropped))})` : "") : `${s.pointsUsed} reading${s.pointsUsed === 1 ? "" : "s"}${s.pointsDropped > 0 ? ` (${s.pointsDropped} skipped — bad value or mixed unit)` : ""}`);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <Badge tone={d.tone}>{locale ? translate(locale, "records", directions[s.direction]) : d.label}</Badge>
      {s.latestBand && <span>{locale ? translate(locale, "records", bands[s.latestBand]) : BAND_LABEL[s.latestBand]}</span>}
      {latest && (
        <span>
          {locale ? translate(locale, "records", "trendLatest") : "latest"} <strong className="text-ink">{latest.value}{s.unit ?? ""}</strong> · {locale ? formatTimelineDate(latest.takenOn, locale) : fmtIstDate(latest.takenOn)}
        </span>
      )}
      <span>{parts.join(" · ")}</span>
    </div>
  );
}

function round1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * The full panel. `rows` must already be consent-scoped (doctor side) or the patient's own
 * (patient side) — the panel does no access control, it just draws what it is given.
 */
export function TrendsPanel({ rows, interactive = false }: { rows: ObsRow[]; interactive?: boolean }) {
  const { locale: preference } = useLocale();
  const locale = interactive ? preference : undefined;
  const series = useMemo(() => buildSeries(rows.map((r) => ({ name: r.name, valueNum: r.valueNum, unit: r.unit, refLow: r.refLow, refHigh: r.refHigh, takenOn: r.takenOn }))), [rows]);
  return (
    <>
      {series.length > 0 ? (
        <div className={interactive ? "grid grid-cols-1 gap-4 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
          {series.map((s) => (
            <div key={s.name} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={interactive ? "font-semibold text-sm min-w-0 [overflow-wrap:anywhere]" : "font-semibold text-sm"}>{s.name}</span>
                {s.refLow !== null || s.refHigh !== null ? (
                  <span className="text-xs text-muted">
                    {locale ? translate(locale, "records", "trendTarget") : "target"} {s.refLow === null ? (locale ? translate(locale, "records", "trendUpTo") : "up to") : s.refLow}–{s.refHigh === null ? (locale ? translate(locale, "records", "trendNoUpper") : "no upper limit") : s.refHigh}{s.unit ? ` ${s.unit}` : ""}
                  </span>
                ) : null}
              </div>
              {s.points.length >= 2 ? (
                <TrendSparkline s={s} locale={locale} />
              ) : (
                <div className="flex h-16 items-center justify-center rounded bg-line/40 text-xs text-muted">
                  {locale ? translate(locale, "records", "trendOne") : "one reading so far — log another to see the trend"}
                </div>
              )}
              <TrendStats s={s} locale={locale} />
            </div>
          ))}
        </div>
      ) : (
        !interactive && <EmptyNote>No self-reported readings in the shared scope.</EmptyNote>
      )}
      {interactive && <LoggerAndRecent rows={rows} />}
    </>
  );
}

// ---------------------------------------------------------------------------

const KNOWN: { name: string; unit: string; refLow: number | null; refHigh: number | null; category: string; hint: string }[] = [
  { name: "Fasting glucose", unit: "mg/dL", refLow: 70, refHigh: 110, category: "glucose", hint: "morning, before food" },
  { name: "Post-meal glucose", unit: "mg/dL", refLow: 90, refHigh: 140, category: "glucose", hint: "2 h after food" },
  { name: "HbA1c", unit: "%", refLow: null, refHigh: 7, category: "lab", hint: "3-month average" },
  { name: "BP systolic", unit: "mmHg", refLow: null, refHigh: 130, category: "blood_pressure", hint: "upper number" },
  { name: "BP diastolic", unit: "mmHg", refLow: null, refHigh: 80, category: "blood_pressure", hint: "lower number" },
  { name: "Peak flow", unit: "L/min", refLow: 350, refHigh: 420, category: "respiratory", hint: "best of 3 puffs" },
  { name: "Weight", unit: "kg", refLow: null, refHigh: null, category: "weight", hint: "morning, same scale" },
];

export function TrendDateField({ date, invalid, onChange }: { date: string; invalid: boolean; onChange: (value: string) => void }) {
  const { t } = useLocale();
  const errorId = useId();
  return <div className="grid gap-1">
    <input className="input" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => onChange(e.target.value)} aria-label={t("records", "trendDate")} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} />
    {invalid && <p id={errorId} role="alert" className="text-xs text-rose-600">{t("records", "trendInvalidDate")}</p>}
  </div>;
}

function LoggerAndRecent({ rows }: { rows: ObsRow[] }) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const knownLabels = ["trendFasting", "trendPostMeal", "trendHba1c", "trendSystolic", "trendDiastolic", "trendPeakFlow", "trendWeight"] as const;
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [msg, setMsg] = useState<"saved" | "saveError" | "deleteError" | "network" | "invalidDate" | null>(null);
  const [delBusy, setDelBusy] = useState<string | null>(null);

  const existingNames = useMemo(() => Array.from(new Set(rows.map((r) => r.name.trim()).filter(Boolean))), [rows]);

  const pick = (n: string) => {
    setName(n);
    const k = KNOWN.find((k) => k.name.toLowerCase() === n.toLowerCase());
    if (k && !unit.trim()) setUnit(k.unit);
  };

  const knownPick = KNOWN.find((k) => k.name.toLowerCase() === name.trim().toLowerCase()) ?? null;

  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const result = await submitTrendReading(date, {
        name: name.trim(), valueNum: Number(value), unit: unit.trim() || knownPick?.unit || null,
        category: knownPick?.category, refLow: knownPick?.refLow ?? undefined, refHigh: knownPick?.refHigh ?? undefined,
      }, (body) => callApi("/api/patient/observations", { method: "POST", body }));
      setMsg(result);
      if (result === "saved") { setName(""); setValue(""); router.refresh(); }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setDelBusy(id);
    setMsg(null);
    const res = await callApi("/api/patient/observations", { method: "DELETE", body: { id } });
    setDelBusy(null);
    if (res.ok) router.refresh();
    else setMsg(res.status === 0 ? "network" : "deleteError");
  };

  const recent = useMemo(() => [...rows].sort((a, b) => b.takenOn.localeCompare(a.takenOn)).slice(0, 6), [rows]);

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-line p-3">
        <div className="text-sm font-semibold">{t("records", "trendLog")}</div>
        <p className="mt-0.5 text-xs text-muted">{t("records", "trendLogHelp")}</p>
        <div className="mt-2 grid grid-cols-1 gap-2 text-sm">
          <select
            className="input"
            value={name}
            onChange={(e) => pick(e.target.value)}
            aria-label={t("records", "trendPick")}
          >
            <option value="">{t("records", "trendPick")}</option>
            {KNOWN.map((k, i) => (
              <option key={k.name} value={k.name}>
                {t("records", knownLabels[i])} ({k.unit})
              </option>
            ))}
            {existingNames
              .filter((n) => !KNOWN.some((k) => k.name.toLowerCase() === n.toLowerCase()))
              .map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
          </select>
          {name.length > 30 && <p className="text-xs text-muted [overflow-wrap:anywhere]" data-selected-reading>{name}</p>}
          <div className="flex gap-2">
            <input className="input max-md:min-w-0 flex-1" type="number" step="any" inputMode="decimal" placeholder={t("records", "trendValue")} value={value} onChange={(e) => setValue(e.target.value)} aria-label={t("records", "trendValue")} />
            <input className="input w-24 max-md:min-w-0" type="text" placeholder={t("records", "trendUnit")} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label={t("records", "trendUnit")} />
          </div>
          <div className="flex max-md:flex-wrap gap-2 items-center">
            <TrendDateField date={date} invalid={msg === "invalidDate"} onChange={setDate} />
            <button className="btn btn-primary" disabled={busy || !name.trim() || value === "" || !Number.isFinite(Number(value))} onClick={submit}>
              {busy ? t("records", "trendSaving") : t("records", "trendSave")}
            </button>
          </div>
          {msg && msg !== "invalidDate" && (
            <p role="status" className={msg === "saved" ? "text-xs text-teal-700" : "text-xs text-rose-600"}>{t("records", msg === "saved" ? "trendSaved" : msg === "network" ? "trendNetwork" : msg === "deleteError" ? "trendDeleteError" : "trendSaveError")}</p>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-line p-3">
        <div className="text-sm font-semibold">{t("records", "trendRecent")}</div>
        <p className="mt-0.5 text-xs text-muted">{t("records", "trendRecentHelp")}</p>
        {recent.length === 0 ? (
          <EmptyNote>{t("records", "trendEmpty")}</EmptyNote>
        ) : (
          <ul className="mt-2 grid gap-1.5 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex max-md:flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="text-xs text-muted">{formatTimelineDate(r.takenOn, locale)} · </span>
                  {r.name} <strong>{r.valueNum}{r.unit ? ` ${r.unit}` : ""}</strong>
                </span>
                <button
                  className="text-xs text-muted hover:text-rose-600 disabled:opacity-50"
                  disabled={delBusy === r.id}
                  onClick={() => remove(r.id)}
                  aria-label={t("records", "trendRemoveLabel").replace("{name}", r.name).replace("{date}", formatTimelineDate(r.takenOn, locale))}
                >
                  {delBusy === r.id ? "…" : t("records", "trendRemove")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Convenience for the patient page: the whole card, ready to drop into the layout. */
export function TrendsCard({ rows }: { rows: ObsRow[] }) {
  const { locale, t } = useLocale();
  return (
    <Card className="md:col-span-2">
      <div lang={locale}>
      <SectionTitle right={<Badge tone="off">{t("records", "trendSelfReported")}</Badge>}>
        {t("records", "trendHeading")}
      </SectionTitle>
      <p className="text-xs text-muted -mt-1">
        {t("records", "trendDescription")}
      </p>
      <div className="mt-3">
        <TrendsPanel rows={rows} interactive />
      </div>
      </div>
    </Card>
  );
}
