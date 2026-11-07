import type { ApiResult } from "@/components/api-client";

/** A calendar date in the existing 09:00 IST convention, or null if malformed. */
export function trendDateIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== value) return null;
  const instant = new Date(`${value}T09:00:00+05:30`);
  return Number.isFinite(instant.valueOf()) ? instant.toISOString() : null;
}

type Fields = { name: string; valueNum: number; unit: string | null; category?: string; refLow?: number; refHigh?: number };
type Result = "invalidDate" | "saved" | "network" | "saveError";
/** Caller manages UI busy state; no request is made for an invalid date. */
export async function submitTrendReading(date: string, fields: Fields, send: (body: Fields & { takenOn: string }) => Promise<ApiResult>): Promise<Result> {
  const takenOn = trendDateIso(date);
  if (!takenOn) return "invalidDate";
  try {
    const res = await send({ ...fields, takenOn });
    return res.ok ? "saved" : res.status === 0 ? "network" : "saveError";
  } catch { return "network"; }
}
