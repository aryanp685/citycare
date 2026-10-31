import { one, fail } from "./db";

/**
 * D37 — fixed-window rate limits in Postgres (no Redis on the free tier, and one fewer processor
 * to disclose). One upsert per guarded request; windows are aligned to the clock so the key space
 * stays tiny and the daily cron can drop old rows.
 *
 * Keys are `${bucket}:${subject}` where subject is the client IP (anonymous endpoints) or the
 * user id (authenticated ones). The IP comes from x-forwarded-for's first hop, which Vercel sets.
 */
export type Bucket = { name: string; limit: number; windowSec: number };

export const BUCKETS = {
  login: { name: "login", limit: 60, windowSec: 600 } as Bucket,          // per IP: 60 attempts / 10 min (scrypt + lockout do the rest)
  signup: { name: "signup", limit: 20, windowSec: 3600 } as Bucket,        // per IP
  emergency: { name: "emergency", limit: 10, windowSec: 3600 } as Bucket,  // per doctor (on top of the 3/24h business quota)
  grievance: { name: "grievance", limit: 10, windowSec: 600 } as Bucket,   // per user
  acceptance: { name: "acceptance", limit: 30, windowSec: 3600 } as Bucket,
  dependents: { name: "dependents", limit: 20, windowSec: 3600 } as Bucket,
  write: { name: "write", limit: 600, windowSec: 600 } as Bucket,          // generic per-user write ceiling
  upload: { name: "upload", limit: 30, windowSec: 3600 } as Bucket,        // per user: 30 files / hour
  recover: { name: "recover", limit: 10, windowSec: 3600 } as Bucket,      // per IP: recovery/reset attempts
  emailcode: { name: "emailcode", limit: 5, windowSec: 3600 } as Bucket,   // per user: emailed codes
};

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "local";
}

/** Window start for `now`, aligned to windowSec (exported for the unit test). */
export function windowStart(nowMs: number, windowSec: number): number {
  return Math.floor(nowMs / 1000 / windowSec) * windowSec * 1000;
}

/** Throws 429 with Retry-After semantics when the bucket overflows. */
export async function rateLimit(bucket: Bucket, subject: string): Promise<{ count: number; remaining: number }> {
  const key = `${bucket.name}:${subject}`.slice(0, 200);
  const row = await one<{ count: number; ws: Date }>(
    `INSERT INTO "RateLimit" ("key", "windowStart", "count")
     VALUES ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
     ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
     RETURNING "count", "windowStart" AS ws`,
    [key, bucket.windowSec],
  );
  const count = row?.count ?? 1;
  if (count > bucket.limit) {
    const resetAt = (row?.ws ? row.ws.getTime() : Date.now()) + bucket.windowSec * 1000;
    const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    fail(429, "rate_limited", `Too many requests. Try again in ${Math.ceil(retryAfterSec / 60)} min.`, { retryAfterSec });
  }
  return { count, remaining: bucket.limit - count };
}

/** Housekeeping for the daily cron. */
export const PRUNE_RATELIMIT_SQL = `DELETE FROM "RateLimit" WHERE "windowStart" < now() - interval '1 day'`;
