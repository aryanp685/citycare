import { one } from "@/lib/db";
import { ok, err } from "@/lib/api";
import { documentKeySource } from "@/lib/storage";
import { emailDeliveryConfigured } from "@/lib/email";
import { LATEST_GOOD_BACKUP_SQL, backupStaleness } from "@/lib/backup-core.mjs";
import { evaluateRetentionPolicy } from "@/lib/retention-core.mjs";
import { DEMO_RETENTION_DAYS, DEMO_SEED_DOMAIN } from "@/lib/legal";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — readiness probe for uptime monitors and the daily Vercel cron.
 * Deliberately public and deliberately boring: no secrets, no counts that leak usage,
 * just "can the app reach its database, is it in UTC, is the ledger intact".
 * The cron ping doubles as activity so a free Supabase project is never paused for idleness.
 *
 * Liveness vs readiness (Day 2 NG-S10 — monitoring contract, see
 * web/docs/operations/MONITORING_AND_ALERTING.md):
 *  - process DOWN (crash / bad deploy)  ⇒ the HTTP request itself fails (connection error,
 *    DNS failure, or Vercel platform status) — the uptime monitor alerts on that;
 *  - process UP but NOT READY           ⇒ HTTP 503 with a stable JSON body
 *    (db_unreachable, or status:"degraded" on a ledger break / wrong timezone) —
 *    the uptime monitor alerts on the non-2xx code;
 *  - ready                              ⇒ HTTP 200.
 * Backup freshness (`backups.*`) is a reported FACT, not a readiness gate: a stale backup
 * must be caught by the backup-specific alert path (FATAL marker / JSON assertion), not by
 * taking the whole app "down" from the monitor's point of view.
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
        // NG-S15: the EFFECTIVE retention-sweep policy (safe subset — constrained enums, no secrets).
        // A reviewer can see at a glance whether the sweep is armed and under which policy.
        retention: (() => {
          const r = evaluateRetentionPolicy(process.env);
          return { policy: r.policy, enabled: r.enabled, reason: r.reason, days: DEMO_RETENTION_DAYS, protectedDomain: DEMO_SEED_DOMAIN };
        })(),
        backups,
        latencyMs: Date.now() - t0,
        at: new Date().toISOString(),
      },
      healthy ? 200 : 503,
    );
  } catch (e) {
    // Public endpoint: the response must never carry driver error text — Postgres driver
    // error messages can embed host:port / user, and we do not send DB connection details
    // to anyone polling this URL (Day 2 NG-S10, A1). Log only a non-sensitive error class
    // (e.g. ETIMEDOUT, ECONNREFUSED, 28P01) server-side for the operator.
    const code =
      e instanceof Error && typeof (e as NodeJS.ErrnoException).code === "string"
        ? (e as NodeJS.ErrnoException).code
        : "unknown";
    console.error("[health] db_unreachable", { code });
    return err(503, "db_unreachable", "database unreachable");
  }
}
