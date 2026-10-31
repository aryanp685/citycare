import { one } from "@/lib/db";
import { ok, err } from "@/lib/api";
import { documentKeySource } from "@/lib/storage";
import { emailDeliveryConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness for uptime monitors and the daily Vercel cron.
 * Deliberately public and deliberately boring: no secrets, no counts that leak usage,
 * just "can the app reach its database, is it in UTC, is the ledger intact".
 * The cron ping doubles as activity so a free Supabase project is never paused for idleness.
 */
export async function GET() {
  const t0 = Date.now();
  try {
    const row = await one<{ tz: string; st: string; breaks: number; version: string }>(
      `SELECT current_setting('TimeZone') AS tz,
              current_setting('statement_timeout') AS st,
              (SELECT count(*)::int FROM ledger_verify()) AS breaks,
              split_part(version(), ' ', 2) AS version`,
    );
    const healthy = !!row && row.tz === "UTC" && row.breaks === 0;
    return ok(
      {
        status: healthy ? "ok" : "degraded",
        db: { reachable: true, timezone: row?.tz, statementTimeout: row?.st, postgres: row?.version, ledgerBreaks: row?.breaks },
        // configuration facts a reviewer should be able to see without secrets
        config: { documentKey: documentKeySource(), anchorSigning: !!process.env.ANCHOR_SIGNING_KEY, emailDelivery: emailDeliveryConfigured() },
        latencyMs: Date.now() - t0,
        at: new Date().toISOString(),
      },
      healthy ? 200 : 503,
    );
  } catch (e) {
    return err(503, "db_unreachable", e instanceof Error ? e.message.slice(0, 120) : "database unreachable");
  }
}
