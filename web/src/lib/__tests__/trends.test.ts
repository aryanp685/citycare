import { describe, it, expect } from "vitest";
import { buildSeries, directionOf, MS_PER_MONTH, type TrendInput } from "../trends";

// F5: the trend module is the ONLY place that decides "improving/worsening/stable" for
// patient-logged readings. Every branch below is a contract — a regression here would mean
// we tell a diabetic patient their sugar is improving when it is not.
const pt = (name: string, value: number, takenOn: string, unit = "mg/dL", refLow: number | null = null, refHigh: number | null = null): TrendInput => ({
  name, valueNum: value, unit, refLow, refHigh, takenOn,
});
const one = (rows: TrendInput[]) => buildSeries(rows);

describe("directionOf (pure)", () => {
  it("≤5% relative change is 'stable' regardless of band", () => {
    expect(directionOf(100, 104, 3, 70, 110)).toBe("stable");
    expect(directionOf(100, 96, 3, 70, 110)).toBe("stable");
    expect(directionOf(100, 104, 3, null, null)).toBe("stable");
  });
  it("no band → neutral rising/falling, never a clinical claim", () => {
    expect(directionOf(1, 5, 2, null, null)).toBe("rising");
    expect(directionOf(5, 1, 2, null, null)).toBe("falling");
  });
  it("out-of-band → in-band is improving; in-band → out-of-band is worsening", () => {
    expect(directionOf(210, 105, 4, 70, 110)).toBe("improving");
    expect(directionOf(100, 130, 4, 70, 110)).toBe("worsening");
  });
  it("both in band → stable", () => {
    expect(directionOf(80, 109, 4, 70, 110)).toBe("stable");
  });
  it("both above the band: falling = improving, rising = worsening", () => {
    expect(directionOf(9.2, 7.4, 6, null, 7)).toBe("improving");
    expect(directionOf(7.4, 9.2, 6, null, 7)).toBe("worsening");
  });
  it("both below the band: rising = improving, falling = worsening", () => {
    expect(directionOf(50, 65, 3, 70, 110)).toBe("improving");
    expect(directionOf(65, 50, 3, 70, 110)).toBe("worsening");
  });
  it("crossing the band without landing in it is worsening", () => {
    expect(directionOf(90, 120, 3, 100, 110)).toBe("worsening");
    expect(directionOf(120, 90, 3, 100, 110)).toBe("worsening");
  });
  it("upper-bound-only band (e.g. HbA1c ≤ 7): anything ≤ hi is 'in'", () => {
    expect(directionOf(7.8, 6.9, 3, null, 7)).toBe("improving");
    expect(directionOf(6.5, 7.9, 3, null, 7)).toBe("worsening");
  });
});

describe("buildSeries (grouping + guards)", () => {
  it("fewer than 2 valid points → 'insufficient', no trend invented", () => {
    const [s] = one([pt("HbA1c", 9.2, "2026-06-01", "%")]);
    expect(s.direction).toBe("insufficient");
    expect(s.latest).toBe(9.2);
    expect(s.delta).toBeNull();
    expect(s.ratePerMonth).toBeNull();
    const empty = one([]);
    expect(empty).toEqual([]);
  });
  it("groups case-insensitively and keeps the first-seen spelling", () => {
    const [s] = one([
      pt("Fasting Glucose", 190, "2026-06-01"),
      pt("fasting glucose", 150, "2026-09-01"),
    ]);
    expect(s.name).toBe("Fasting Glucose");
    expect(s.points).toHaveLength(2);
  });
  it("sorts chronologically even when input is shuffled", () => {
    const [s] = one([
      pt("Weight", 74, "2026-09-01", "kg"),
      pt("Weight", 80, "2026-01-01", "kg"),
      pt("Weight", 77, "2026-05-01", "kg"),
    ]);
    expect(s.points.map((p) => p.value)).toEqual([80, 77, 74]);
    expect(s.delta).toBe(-6); // 74 - 80, chronological endpoints
  });
  it("mixed units: majority unit kept, minority points dropped and counted", () => {
    const [s] = one([
      pt("Glucose", 150, "2026-06-01", "mg/dL"),
      pt("Glucose", 140, "2026-07-01", "mg/dL"),
      pt("Glucose", 130, "2026-08-01", "mg/dL"),
      pt("Glucose", 7.2, "2026-08-15", "mmol/L"),
    ]);
    expect(s.unit).toBe("mg/dL");
    expect(s.pointsUsed).toBe(3);
    expect(s.pointsDropped).toBe(1);
    expect(s.points.map((p) => p.value)).toEqual([150, 140, 130]);
  });
  it("every point a different unit → majority is first-seen, the rest dropped", () => {
    const [s] = one([
      pt("Glucose", 150, "2026-06-01", "mg/dL"),
      pt("Glucose", 140, "2026-07-01", "mmol/L"),
      pt("Glucose", 130, "2026-08-01", "g/dL"),
    ]);
    expect(s.unit).toBe("mg/dL");
    expect(s.pointsUsed).toBe(1);
    expect(s.direction).toBe("insufficient"); // one usable point left
  });
  it("non-finite values and unparseable dates are dropped, never coerced", () => {
    const [s] = one([
      pt("Glucose", NaN, "2026-06-01"),
      pt("Glucose", Infinity, "2026-07-01"),
      pt("Glucose", 150, "not-a-date"),
      pt("Glucose", 150, "2026-08-01"),
      pt("Glucose", 140, "2026-09-01"),
    ]);
    expect(s.pointsUsed).toBe(2);
    expect(s.pointsDropped).toBe(3);
    expect(s.latest).toBe(140);
  });
  it("null valueNum (text-only rows) never enter the series", () => {
    const rows: TrendInput[] = [
      { name: "Notes", valueNum: null, unit: null, refLow: null, refHigh: null, takenOn: "2026-06-01" },
      pt("Notes", 5, "2026-09-01"),
    ];
    const [s] = one(rows);
    expect(s.pointsUsed).toBe(1);
    expect(s.direction).toBe("insufficient");
  });
  it("inconsistent stored band (low > high) is discarded whole, not swapped", () => {
    const [s] = one([
      pt("Glucose", 150, "2026-06-01", "mg/dL", 110, 70),
      pt("Glucose", 140, "2026-09-01", "mg/dL", 110, 70),
    ]);
    expect(s.refLow).toBeNull();
    expect(s.refHigh).toBeNull();
    expect(s.latestBand).toBeNull();
    expect(s.direction).toBe("falling"); // no band → neutral vocabulary
  });
  it("reference band is taken from the most recent row that carries it", () => {
    const [s] = one([
      pt("Glucose", 150, "2026-06-01"),
      pt("Glucose", 140, "2026-09-01", "mg/dL", 70, 110),
    ]);
    expect(s.refLow).toBe(70);
    expect(s.refHigh).toBe(110);
    expect(s.latestBand).toBe("above");
  });
  it("rate per month is delta over 30.44-day months; withheld under ~1.5 days", () => {
    const [s] = one([
      pt("HbA1c", 6, "2026-01-01", "%", null, 7),
      pt("HbA1c", 18, "2026-04-01", "%", null, 7),
    ]);
    const months = (Date.parse("2026-04-01") - Date.parse("2026-01-01")) / MS_PER_MONTH; // = 90/30.44
    expect(s.monthsSpanned).toBeCloseTo(months, 10);
    expect(s.ratePerMonth).toBeCloseTo(12 / months, 8);
    const [sameDay] = one([
      pt("Glucose", 100, "2026-06-01T09:00:00Z"),
      pt("Glucose", 118, "2026-06-01T21:00:00Z"),
    ]);
    expect(sameDay.ratePerMonth).toBeNull();
  });
});

describe("seed-shaped realistic series (sanity, mirroring seed.mjs)", () => {
  it("ramesh's HbA1c 9.2 → 7.4 over 6 months with target ≤ 7% is 'improving', still above band", () => {
    const [s] = one([
      pt("HbA1c", 9.2, "2026-04-30", "%", null, 7),
      pt("HbA1c", 8.9, "2026-05-30", "%", null, 7),
      pt("HbA1c", 8.4, "2026-06-30", "%", null, 7),
      pt("HbA1c", 7.9, "2026-07-31", "%", null, 7),
      pt("HbA1c", 7.6, "2026-08-31", "%", null, 7),
      pt("HbA1c", 7.4, "2026-09-30", "%", null, 7),
    ]);
    expect(s.direction).toBe("improving");
    expect(s.latestBand).toBe("above");
    expect(s.delta).toBeCloseTo(-1.8, 10);
    expect(s.ratePerMonth).toBeLessThan(0);
  });
  it("anita's peak flow 300 → 370 (band 350–420) ends 'in band' and is 'improving'", () => {
    const [s] = one([
      pt("Peak flow", 300, "2026-07-01", "L/min", 350, 420),
      pt("Peak flow", 330, "2026-08-01", "L/min", 350, 420),
      pt("Peak flow", 370, "2026-09-01", "L/min", 350, 420),
    ]);
    expect(s.direction).toBe("improving");
    expect(s.latestBand).toBe("in");
  });
});
