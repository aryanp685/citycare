import { one } from "@/lib/db";
import { ok, err } from "@/lib/api";
import { documentKeySource } from "@/lib/storage";
import { emailDeliveryConfigured } from "@/lib/email";
import { LATEST_GOOD_BACKUP_SQL, backupStaleness } from "@/lib/backup-core.mjs";

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
    // NG-S09: last good backup (facts only — no object contents, no keys, no PHI). A stale
    // backup is a warning fact, not a liveness failure: it does not flip status to degraded.
    let backups: { configured: boolean; lastSuccessAt: string | null; ageMs: number | null; stale: boolean };
    try {
      const b = await one<{ createdAt: string }>(LATEST_GOOD_BACKUP_SQL);
      const s = backupStaleness(b?.createdAt ?? null, Date.now());
      backups = {
        configured: !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BACKUP_DIR),
        lastSuccessAt: s.lastSuccessAt,
        ageMs: s.ageMs,
        stale: s.stale,
      };
    } catch {
      // "Backup" table not migrated yet (pre-0006) — report as unconfigured, don't 503
      backups = { configured: false, lastSuccessAt: null, ageMs: null, stale: true };
    }
    return ok(
      {
        status: healthy ? "ok" : "degraded",
        db: { reachable: true, timezone: row?.tz, statementTimeout: row?.st, postgres: row?.version, ledgerBreaks: row?.breaks },
        // configuration facts a reviewer should be able to see without secrets
        config: { documentKey: documentKeySource(), anchorSigning: !!process.env.ANCHOR_SIGNING_KEY, emailDelivery: emailDeliveryConfigured() },
        backups,
        latencyMs: Date.now() - t0,
        at: new Date().toISOString(),
      },
      healthy ? 200 : 503,
    );
  } catch (e) {
    return err(503, "db_unreachable", e instanceof Error ? e.message.slice(0, 120) : "database unreachable");
  }
}
