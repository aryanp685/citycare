import { IST_OFFSET_MIN } from "./env";

/**
 * Appointment slot math — pure functions, unit-tested, no DB.
 *
 * The landmine this design defuses: the DB stores UTC timestamptz, humans (and
 * the AvailabilitySlot table) speak wall-clock "HH:MM" in IST. If you build a
 * Date from a "YYYY-MM-DDTHH:MM" string without an offset, JS assumes the
 * SERVER timezone — dev machine (UTC here) differs from every Pune user. We
 * therefore convert explicitly, with a fixed +05:30 (India has no DST).
 */

export const MIN_LEAD_MINUTES = 120; // no bookings inside the next 2 h
export const HORIZON_DAYS = 14;

export type SlotRule = {
  id: string;
  dayOfWeek: number; // 0=Sun..6=Sat, in IST calendar
  startTime: string; // "09:30"
  endTime: string; // "13:00"
  slotMinutes: number;
  maxPerSlot: number;
  isActive: boolean;
};

/** IST wall time (date + minutes-since-midnight) -> real UTC epoch ms. */
export function istWallToUtcMs(dateISO: string, minutesSinceMidnight: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!m) throw new Error(`bad date string: ${dateISO}`);
  const [, y, mo, d] = m.map(Number);
  return (
    Date.UTC(y, mo - 1, d, 0, 0, 0) +
    minutesSinceMidnight * 60_000 -
    IST_OFFSET_MIN * 60_000
  );
}

/** UTC instant -> {dateISO (IST calendar day), minutes (IST wall), dayOfWeek (IST)} */
export function utcMsToIstWall(ms: number): { dateISO: string; minutes: number; dayOfWeek: number } {
  const shifted = new Date(ms + IST_OFFSET_MIN * 60_000);
  const y = shifted.getUTCFullYear();
  const mo = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = shifted.getUTCHours();
  const mm = shifted.getUTCMinutes();
  return {
    dateISO: `${y}-${mo}-${d}`,
    minutes: hh * 60 + mm,
    dayOfWeek: shifted.getUTCDay(),
  };
}

export function parseHHMM(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Which slot start-times does one rule open on a given IST date? */
export function expandRule(rule: SlotRule): number[] {
  const s = parseHHMM(rule.startTime);
  const e = parseHHMM(rule.endTime);
  const step = rule.slotMinutes;
  if (s === null || e === null || !Number.isInteger(step) || step <= 0 || e <= s) {
    return []; // malformed rule: produce nothing rather than a wrong time
  }
  const out: number[] = [];
  for (let t = s; t + step <= e; t += step) out.push(t);
  return out;
}

export function isPastOrTooSoon(startUtcMs: number, nowMs: number, leadMinutes = MIN_LEAD_MINUTES): boolean {
  return startUtcMs < nowMs + leadMinutes * 60_000;
}

export type FreeSlot = { wallMinutes: number; utcMs: number; left: number; capacity: number };

/**
 * booked: scheduledAt instants (UTC ms) already taken that day — one entry PER booking, so an
 * instant with two seats booked appears twice. D6: a rule's maxPerSlot is real capacity (1–6);
 * when two rules cover the same instant the larger capacity wins.
 */
export function freeSlotsForDay(
  rules: SlotRule[],
  dateISO: string,
  bookedUtcMs: number[],
  nowMs: number,
  leadMinutes = MIN_LEAD_MINUTES,
): FreeSlot[] {
  const day = new Date(dateISO + "T00:00:00Z");
  const dowIst = day.getUTCDay();
  const taken = new Map<number, number>();
  for (const ms of bookedUtcMs) taken.set(ms, (taken.get(ms) ?? 0) + 1);
  const capacity = new Map<number, { wallMinutes: number; capacity: number }>();
  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (rule.dayOfWeek !== dowIst) continue;
    const cap = Math.min(6, Math.max(1, Math.trunc(rule.maxPerSlot) || 1));
    for (const wm of expandRule(rule)) {
      const utcMs = istWallToUtcMs(dateISO, wm);
      if (isPastOrTooSoon(utcMs, nowMs, leadMinutes)) continue;
      const prev = capacity.get(utcMs);
      if (!prev || prev.capacity < cap) capacity.set(utcMs, { wallMinutes: wm, capacity: cap }); // overlapping rules → dedupe, keep the larger capacity
    }
  }
  const slots: FreeSlot[] = [];
  for (const [utcMs, { wallMinutes, capacity: cap }] of capacity) {
    const left = cap - (taken.get(utcMs) ?? 0);
    if (left <= 0) continue;
    slots.push({ wallMinutes, utcMs, left, capacity: cap });
  }
  slots.sort((a, b) => a.utcMs - b.utcMs);
  return slots;
}

/** does [aStart,aStart+durA) overlap [bStart,bStart+durB)? half-open: back-to-back is fine */
export function overlaps(aStartMs: number, aDurMin: number, bStartMs: number, bDurMin: number): boolean {
  return aStartMs < bStartMs + bDurMin * 60_000 && bStartMs < aStartMs + aDurMin * 60_000;
}

export function istDateRangeTodayPlusN(nowMs: number, days: number): string[] {
  const { dateISO } = utcMsToIstWall(nowMs);
  const start = new Date(dateISO + "T00:00:00Z");
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
