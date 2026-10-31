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

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, EmptyNote, SectionTitle } from "./ui";
import { callApi } from "./api-client";
import { buildSeries, type TrendSeries } from "@/lib/trends";
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
export function TrendSparkline({ s, height = 64 }: { s: TrendSeries; height?: number }) {
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
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} role="img" aria-label={`${s.name} trend: ${s.points.length} readings`}>
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
      <title>{`latest ${last.value}${s.unit ?? ""} on ${fmtIstDate(last.takenOn)}`}</title>
    </svg>
  );
}

function TrendStats({ s }: { s: TrendSeries }) {
  const d = DIR[s.direction];
  const latest = s.points[s.points.length - 1];
  const parts: string[] = [];
  if (s.delta !== null) {
    parts.push(`change ${s.delta > 0 ? "+" : ""}${round1(s.delta)}${s.unit ?? ""}`);
    if (s.ratePerMonth !== null) parts.push(`≈ ${s.ratePerMonth > 0 ? "+" : ""}${round1(s.ratePerMonth)}/month`);
  }
  parts.push(`${s.pointsUsed} reading${s.pointsUsed === 1 ? "" : "s"}${s.pointsDropped > 0 ? ` (${s.pointsDropped} skipped — bad value or mixed unit)` : ""}`);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <Badge tone={d.tone}>{d.label}</Badge>
      {s.latestBand && <span>{BAND_LABEL[s.latestBand]}</span>}
      {latest && (
        <span>
          latest <strong className="text-ink">{latest.value}{s.unit ?? ""}</strong> · {fmtIstDate(latest.takenOn)}
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
  const series = useMemo(() => buildSeries(rows.map((r) => ({ name: r.name, valueNum: r.valueNum, unit: r.unit, refLow: r.refLow, refHigh: r.refHigh, takenOn: r.takenOn }))), [rows]);
  return (
    <>
      {series.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {series.map((s) => (
            <div key={s.name} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm">{s.name}</span>
                {s.refLow !== null || s.refHigh !== null ? (
                  <span className="text-xs text-muted">
                    target {s.refLow === null ? "up to" : s.refLow}–{s.refHigh === null ? "no upper limit" : s.refHigh}{s.unit ? ` ${s.unit}` : ""}
                  </span>
                ) : null}
              </div>
              {s.points.length >= 2 ? (
                <TrendSparkline s={s} />
              ) : (
                <div className="flex h-16 items-center justify-center rounded bg-line/40 text-xs text-muted">
                  one reading so far — log another to see the trend
                </div>
              )}
              <TrendStats s={s} />
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

function LoggerAndRecent({ rows }: { rows: ObsRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [delBusy, setDelBusy] = useState<string | null>(null);

  const existingNames = useMemo(() => Array.from(new Set(rows.map((r) => r.name.trim()).filter(Boolean))), [rows]);

  const pick = (n: string) => {
    setName(n);
    const k = KNOWN.find((k) => k.name.toLowerCase() === n.toLowerCase());
    if (k && !unit.trim()) setUnit(k.unit);
  };

  const knownPick = KNOWN.find((k) => k.name.toLowerCase() === name.trim().toLowerCase()) ?? null;

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    // takenOn: the picked date at 09:00 IST — a stable instant, no "server-local midnight" surprises.
    const res = await callApi("/api/patient/observations", {
      method: "POST",
      body: {
        name: name.trim(),
        valueNum: Number(value),
        unit: unit.trim() || knownPick?.unit || null,
        category: knownPick?.category,
        takenOn: new Date(`${date}T09:00:00+05:30`).toISOString(),
        refLow: knownPick?.refLow ?? undefined,
        refHigh: knownPick?.refHigh ?? undefined,
      },
    });
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: "ok", text: "Saved. Trends update instantly." });
      setName("");
      setValue("");
      router.refresh();
    } else {
      setMsg({ kind: "err", text: res.error ?? "Could not save that reading." });
    }
  };

  const remove = async (id: string) => {
    setDelBusy(id);
    await callApi("/api/patient/observations", { method: "DELETE", body: { id } });
    setDelBusy(null);
    router.refresh();
  };

  const recent = useMemo(() => [...rows].sort((a, b) => b.takenOn.localeCompare(a.takenOn)).slice(0, 6), [rows]);

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-line p-3">
        <div className="text-sm font-semibold">Log a reading</div>
        <p className="mt-0.5 text-xs text-muted">From your glucometer, BP monitor or diary. Self-reported — a data point, not a diagnosis.</p>
        <div className="mt-2 grid gap-2 text-sm">
          <select
            className="input"
            value={name}
            onChange={(e) => pick(e.target.value)}
            aria-label="What are you logging?"
          >
            <option value="">What are you logging?</option>
            {KNOWN.map((k) => (
              <option key={k.name} value={k.name}>
                {k.name} ({k.unit})
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
          <div className="flex gap-2">
            <input className="input flex-1" type="number" step="any" inputMode="decimal" placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} aria-label="value" />
            <input className="input w-24" type="text" placeholder="unit" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="unit" />
          </div>
          <div className="flex gap-2 items-center">
            <input className="input" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} aria-label="date" />
            <button className="btn btn-primary" disabled={busy || !name.trim() || value === "" || !Number.isFinite(Number(value))} onClick={submit}>
              {busy ? "Saving…" : "Save reading"}
            </button>
          </div>
          {msg && (
            <p className={msg.kind === "ok" ? "text-xs text-teal-700" : "text-xs text-rose-600"}>{msg.text}</p>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-line p-3">
        <div className="text-sm font-semibold">Your last readings</div>
        <p className="mt-0.5 text-xs text-muted">Remove an entry that was a mistake — every change is in your audit trail.</p>
        {recent.length === 0 ? (
          <EmptyNote>Nothing logged yet.</EmptyNote>
        ) : (
          <ul className="mt-2 grid gap-1.5 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span>
                  <span className="text-xs text-muted">{fmtIstDate(r.takenOn)} · </span>
                  {r.name} <strong>{r.valueNum}{r.unit ? ` ${r.unit}` : ""}</strong>
                </span>
                <button
                  className="text-xs text-muted hover:text-rose-600 disabled:opacity-50"
                  disabled={delBusy === r.id}
                  onClick={() => remove(r.id)}
                  aria-label={`remove ${r.name} reading from ${fmtIstDate(r.takenOn)}`}
                >
                  {delBusy === r.id ? "…" : "remove"}
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
  return (
    <Card className="md:col-span-2">
      <SectionTitle right={<Badge tone="off">self-reported</Badge>}>
        Trends — your readings over time
      </SectionTitle>
      <p className="text-xs text-muted -mt-1">
        The shaded band is the target range. These readings are what you log yourself between visits — they show the journey, and they are never a diagnosis.
      </p>
      <div className="mt-3">
        <TrendsPanel rows={rows} interactive />
      </div>
    </Card>
  );
}
