import { describe, it, expect } from "vitest";
import {
  istWallToUtcMs, utcMsToIstWall, parseHHMM, expandRule,
  freeSlotsForDay, overlaps, isPastOrTooSoon,
} from "../slots";

describe("IST wall <-> UTC", () => {
  it("converts a Pune morning to the right UTC instant", () => {
    // 2026-09-28 09:30 IST = 04:00 UTC
    expect(istWallToUtcMs("2026-09-28", 9 * 60 + 30)).toBe(Date.UTC(2026, 8, 28, 4, 0, 0));
  });
  it("round-trips through utcMsToIstWall", () => {
    const ms = istWallToUtcMs("2026-09-28", 13 * 60 + 45);
    const w = utcMsToIstWall(ms);
    expect(w.dateISO).toBe("2026-09-28");
    expect(w.minutes).toBe(13 * 60 + 45);
    expect(w.dayOfWeek).toBe(new Date("2026-09-28T00:00:00Z").getUTCDay());
  });
  it("a late-night IST slot belongs to the IST date, not the UTC date", () => {
    // 2026-09-28 00:30 IST = 2026-09-27T19:00Z
    const ms = istWallToUtcMs("2026-09-28", 30);
    expect(new Date(ms).toISOString().startsWith("2026-09-27T19:00")).toBe(true);
    expect(utcMsToIstWall(ms).dateISO).toBe("2026-09-28");
  });
  it("rejects malformed dates", () => {
    expect(() => istWallToUtcMs("2026-9-28", 0)).toThrow();
  });
});

describe("rule parsing", () => {
  it("parseHHMM handles valid/invalid", () => {
    expect(parseHHMM("09:30")).toBe(570);
    expect(parseHHMM("9:05")).toBe(545);
    expect(parseHHMM("24:00")).toBeNull();
    expect(parseHHMM("9:60")).toBeNull();
    expect(parseHHMM("morning")).toBeNull();
  });
  it("expandRule aligns to the grid and excludes a partial tail", () => {
    const rule = { id: "x", dayOfWeek: 1, startTime: "09:30", endTime: "10:20", slotMinutes: 15, maxPerSlot: 1, isActive: true };
    expect(expandRule(rule)).toEqual([570, 585, 600]); // 09:30, 09:45, 10:00 (10:15 + 15 = 10:30 > 10:20)
  });
  it("a malformed rule yields zero slots rather than wrong times", () => {
    const bad = { id: "x", dayOfWeek: 1, startTime: "13:00", endTime: "09:00", slotMinutes: 15, maxPerSlot: 1, isActive: true };
    expect(expandRule(bad)).toEqual([]);
    const bad2 = { ...bad, startTime: "9:00 AM" };
    expect(expandRule(bad2)).toEqual([]);
  });
});

describe("free slot computation", () => {
  const tueRule = { id: "a", dayOfWeek: 2, startTime: "10:00", endTime: "10:30", slotMinutes: 15, maxPerSlot: 1, isActive: true };
  const now = Date.UTC(2026, 8, 28, 0, 0, 0); // 2026-09-28 is a Monday in UTC; IST same
  it("excludes booked instants", () => {
    const all = freeSlotsForDay([tueRule], "2026-09-29", [], now); // Tuesday
    expect(all.map((s) => s.wallMinutes)).toEqual([600, 615]);
    const minusOne = freeSlotsForDay([tueRule], "2026-09-29", [all[0].utcMs], now);
    expect(minusOne.map((s) => s.wallMinutes)).toEqual([615]);
  });
  it("skips days that do not match the weekday", () => {
    expect(freeSlotsForDay([tueRule], "2026-09-28", [], now)).toEqual([]); // Monday
  });
  it("respects lead time (nothing inside 2h)", () => {
    // 10:00 IST on 2026-09-29 = 04:30 UTC; "now" one hour before that slot
    const slotUtc = Date.UTC(2026, 8, 29, 4, 30, 0);
    const near = slotUtc - 3600e3;
    expect(freeSlotsForDay([tueRule], "2026-09-29", [], near).length).toBe(0);
  });
  it("ignores inactive rules", () => {
    expect(freeSlotsForDay([{ ...tueRule, isActive: false }], "2026-09-29", [], now)).toEqual([]);
  });
  it("D6: maxPerSlot is real capacity — seats left per instant, full instants disappear", () => {
    const cap3 = { ...tueRule, maxPerSlot: 3 };
    const fresh = freeSlotsForDay([cap3], "2026-09-29", [], now);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((s) => s.left === 3 && s.capacity === 3)).toBe(true);
    const first = fresh[0].utcMs;
    const two = freeSlotsForDay([cap3], "2026-09-29", [first, first], now);
    expect(two.find((s) => s.utcMs === first)?.left).toBe(1);
    const full = freeSlotsForDay([cap3], "2026-09-29", [first, first, first], now);
    expect(full.find((s) => s.utcMs === first)).toBeUndefined();
    // capacity is clamped to the DB CHECK range 1..6
    expect(freeSlotsForDay([{ ...tueRule, maxPerSlot: 99 }], "2026-09-29", [], now)[0].capacity).toBe(6);
  });
  it("D6: overlapping rules keep the larger capacity for a shared instant", () => {
    const r2 = { ...tueRule, id: "b", endTime: "10:30", slotMinutes: 15, maxPerSlot: 2 };
    const slots = freeSlotsForDay([tueRule, r2], "2026-09-29", [], now);
    const at10 = slots.find((s) => s.wallMinutes === 10 * 60);
    expect(at10?.capacity).toBe(2);
  });
  it("dedupes identical instants from two overlapping rules", () => {
    const r2 = { ...tueRule, id: "b", endTime: "10:30", slotMinutes: 15 };
    const slots = freeSlotsForDay([tueRule, r2], "2026-09-29", [], now);
    expect(slots.length).toBe(2);
  });
});

describe("overlap (patient double-booking)", () => {
  it("back-to-back appointments do NOT overlap (half-open intervals)", () => {
    const a = Date.UTC(2026, 8, 29, 5, 0); // 10:30-10:45
    expect(overlaps(a, 15, a + 15 * 60e3, 15)).toBe(false);
  });
  it("15-min slot inside a 30-min appt DOES overlap", () => {
    const a = Date.UTC(2026, 8, 29, 5, 0);
    expect(overlaps(a, 15, a, 30)).toBe(true);
    expect(overlaps(a + 10 * 60e3, 15, a, 30)).toBe(true);
    expect(overlaps(a + 30 * 60e3, 15, a, 30)).toBe(false);
  });
  it("isPastOrTooSoon boundary", () => {
    const t = Date.UTC(2026, 8, 29, 5, 0);
    expect(isPastOrTooSoon(t + 2 * 3600e3, t)).toBe(false); // exactly at lead edge: allowed
    expect(isPastOrTooSoon(t + 2 * 3600e3 - 1000, t)).toBe(true);
  });
});
