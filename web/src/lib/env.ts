import { z } from "zod";

// Fail fast at import time with a readable message instead of a cryptic
// undefined inside a request handler at 2am.
const EnvSchema = z.object({
  // Optional here: on Cloudflare Workers the database comes from the Hyperdrive
  // binding instead (see db.ts), which is not a string in process.env.
  DATABASE_URL: z.string().min(1).optional(),
  // Set by the Neon/Vercel Marketplace integration (direct endpoint). db.ts
  // prefers it over the pooled DATABASE_URL — see nodeConnectionString().
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be >= 32 chars (it signs the session JWT)"),
});

/** True inside the Cloudflare Workers runtime (workerd sets this UA; Node/Bun never do). */
export const onWorkers =
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

let cached: z.infer<typeof EnvSchema> | null = null;

export function env() {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment — ${issues}. Set them in .env.local (Node) or as Worker secrets (Cloudflare)`);
  }
  cached = parsed.data;
  return cached;
}

// Single source of truth for the "clinic timezone". India has no DST, so a
// fixed +05:30 offset is SAFE here and avoids host-TZ bugs in tests.
export const IST_OFFSET_MIN = 330;
