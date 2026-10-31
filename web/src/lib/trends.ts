// F5 — longitudinal trend math.
//
// Pure and deterministic: given the numeric readings of ONE test/measurement (a "series"),
// report how it moved relative to its reference band. No clock, no RNG, no I/O, so every
// branch is pinned by unit tests. This module is the ONLY place that decides
// "improving / worsening / stable" for patient-logged readings.
//
// Why Observation rows and not LabResult rows: a LabResult is a line parsed off a document
// upload (takenOn ≈ upload date, values in TEXT, ref ranges in free text) — a poor trend
// source. Observation rows are the self-reported, numeric, per-patient series
// (glucose, blood pressure, peak flow, weight) that chronic care in India actually runs on
// between clinic visits.
//
// Honesty rules (no false logic):
//  * fewer than 2 valid points → "insufficient" — we never invent a trend;
//  * without a reference band we cannot claim improvement, only the neutral
//    "rising" / "falling" / "stable";
//  * with a band: "improving" = moving TOWARD the band, "worsening" = moving AWAY from it,
//    "stable" = both endpoints inside the band (or a change ≤ 5% relative);
//  * mixed units for one name → keep the majority unit, drop the rest (counted in
//    pointsDropped) — we never average mg/dL with mmol/L;
//  * non-finite values and unparseable dates are dropped, never coerced;
//  * an inconsistent stored band (refLow > refHigh) is discarded whole, never "corrected".

export const MS_PER_MONTH = 30.44 * 86_400_000;
/** A relative change at or below 5% is called "stable" — measurement noise territory. */
export const STABLE_REL_EPS = 0.05;

export type TrendInput = {
  name: string;
  valueNum: number | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  takenOn: string | Date;
};

export type Direction = "improving" | "worsening" | "stable" | "rising" | "falling" | "insufficient";
export type BandPos = "below" | "in" | "above";

export type TrendSeries = {
  /** Canonical (first-seen) spelling of the measurement name. */
  name: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  /** Ascending by takenOn. ISO strings — serializable as-is. */
  points: { value: number; takenOn: string }[];
  latest: number | null;
  /** latest − first, in the series' unit. */
  delta: number | null;
  monthsSpanned: number | null;
  /** delta per 30.44 days; null when the span is under ~1.5 days (division would lie). */
  ratePerMonth: number | null;
  direction: Direction;
  /** Latest point vs the band; null when the series carries no (valid) band. */
  latestBand: BandPos | null;
  pointsUsed: number;
  /** Points dropped: non-finite values, bad dates, minority units. */
  pointsDropped: number;
};

function parseDate(d: string | Date): Date | null {
  const dt = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function posOf(v: number, lo: number | null, hi: number | null): BandPos {
  if (lo !== null && v < lo) return "below";
  if (hi !== null && v > hi) return "above";
  return "in";
}

/**
 * Direction between two endpoints relative to the band.
 * `months` is carried through for readability but not used to veto: a jump within a day is
 * still real movement; only the rate is withheld when the span is too short.
 */
export function directionOf(first: number, latest: number, months: number, lo: number | null, hi: number | null): Direction {
  const delta = latest - first;
  if (Math.abs(delta) <= STABLE_REL_EPS * Math.max(Math.abs(first), Math.abs(latest), 1)) return "stable";
  if (lo === null && hi === null) return delta > 0 ? "rising" : "falling";
  const pFirst = posOf(first, lo, hi);
  const pLatest = posOf(latest, lo, hi);
  if (pLatest === "in") return pFirst === "in" ? "stable" : "improving";
  if (pFirst === "in") return "worsening";
  if (pLatest === pFirst) {
    // Both outside on the same side: improvement = moving toward the band.
    return pLatest === "above" ? (delta < 0 ? "improving" : "worsening") : delta > 0 ? "improving" : "worsening";
  }
  // Crossed the band without landing in it (e.g. below → above): farther from target than a
  // straight shot would be — that is "worsening" by definition here.
  return "worsening";
}

function majorityUnit(points: { unit: string | null }[]): string | null {
  const counts = new Map<string, number>();
  for (const p of points) if (p.unit) counts.set(p.unit, (counts.get(p.unit) ?? 0) + 1);
  if (counts.size === 0) return null;
  let best: string | null = null;
  let bestN = -1;
  for (const [u, n] of counts) if (n > bestN) { best = u; bestN = n; }
  return best; // tie → first-seen unit (Map insertion order)
}

function oneSeries(canonical: string, rows: TrendInput[]): TrendSeries {
  const total = rows.length;
  type P = { value: number; takenOn: Date; unit: string | null; refLow: number | null; refHigh: number | null };
  const valid: P[] = [];
  for (const r of rows) {
    const v = r.valueNum;
    const t = parseDate(r.takenOn);
    if (v === null || !Number.isFinite(v) || t === null) continue;
    valid.push({ value: v, takenOn: t, unit: r.unit, refLow: r.refLow, refHigh: r.refHigh });
  }
  const unit = majorityUnit(valid);
  const kept = unit === null ? valid : valid.filter((p) => !p.unit || p.unit === unit);
  const pointsDropped = total - kept.length;
  kept.sort((a, b) => a.takenOn.getTime() - b.takenOn.getTime());

  // Reference band comes from the most recent row that carries it (bounds independent).
  let refLow: number | null = null;
  let refHigh: number | null = null;
  for (let i = kept.length - 1; i >= 0; i--) {
    if (refLow === null && kept[i].refLow !== null && Number.isFinite(kept[i].refLow)) refLow = kept[i].refLow;
    if (refHigh === null && kept[i].refHigh !== null && Number.isFinite(kept[i].refHigh)) refHigh = kept[i].refHigh;
    if (refLow !== null && refHigh !== null) break;
  }
  // An inconsistent stored band is discarded whole — never silently swapped.
  if (refLow !== null && refHigh !== null && refLow > refHigh) { refLow = null; refHigh = null; }

  const first = kept[0] ?? null;
  const latest = kept[kept.length - 1] ?? null;
  // A delta needs two endpoints — one reading has no "change" at all (0 would be a lie).
  const delta = first && latest && kept.length > 1 ? latest.value - first.value : null;
  const monthsSpanned = delta !== null ? (latest.takenOn.getTime() - first.takenOn.getTime()) / MS_PER_MONTH : null;
  const ratePerMonth = delta === null || monthsSpanned === null || monthsSpanned < 0.05 ? null : delta / monthsSpanned;
  const direction: Direction =
    first && latest && kept.length > 1 ? directionOf(first.value, latest.value, monthsSpanned ?? 0, refLow, refHigh) : "insufficient";
  const hasBand = refLow !== null || refHigh !== null;
  const latestBand = latest && hasBand ? posOf(latest.value, refLow, refHigh) : null;

  return {
    name: canonical,
    unit,
    refLow,
    refHigh,
    points: kept.map((p) => ({ value: p.value, takenOn: p.takenOn.toISOString() })),
    latest: latest ? latest.value : null,
    delta,
    monthsSpanned,
    ratePerMonth,
    direction,
    latestBand,
    pointsUsed: kept.length,
    pointsDropped,
  };
}

/**
 * Group raw observation rows into per-measurement trend series.
 * Grouping is case-insensitive on the measurement name ("Fasting Glucose" === "fasting glucose");
 * the canonical (first-seen) spelling is kept for display.
 */
export function buildSeries(rows: TrendInput[]): TrendSeries[] {
  const groups = new Map<string, TrendInput[]>();
  for (const r of rows) {
    const name = (r.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const out: TrendSeries[] = [];
  for (const rowsIn of groups.values()) out.push(oneSeries(rowsIn[0].name.trim(), rowsIn));
  return out;
}
