import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { nodeConnectionString } from "@/lib/db";
import { ok, err } from "@/lib/api";
import { BackupError, createBackup, recordBackupMeta, dbFingerprintFromUrl } from "@/lib/backup-core.mjs";
import { withCopySupport } from "@/lib/pg-copy.mjs";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/backup — NG-S09: daily encrypted database backup.
 *
 * Same auth contract as /api/cron/daily: Vercel sends `Authorization: Bearer $CRON_SECRET`;
 * an unset secret ⇒ 503 (never open), a mismatch ⇒ 401. This endpoint can ONLY take a
 * backup (read-only over the database; writes go to the private backup store) — it has no
 * restore, delete, or overwrite capability. Restore is a human-run script targeting a
 * scratch database only (web/scripts/restore-drill.mjs, see RESTORE_RUNBOOK.md).
 *
 * Connection: a DEDICATED pg client, not the app pool — the pool pins statement_timeout=8 s,
 * which a COPY of a large table would exceed, and a long dump must not hold a pooled
 * connection. Session timezone is pinned to UTC like the rest of the app.
 *
 * Budget: Vercel functions here run maxDuration=30 s (vercel.json). createBackup carries a
 * 20 s soft limit and is all-or-nothing: if the budget is hit, NO partial file is written
 * and the attempt is recorded in the "Backup" metadata table with status='failed',
 * errorClass='time_budget' — visible in /api/health and in the metadata, never silent.
 * The response carries no secrets and no patient data (fingerprint is a db identity hash).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return err(503, "cron_unconfigured", "CRON_SECRET is not set; the backup job refuses to run unauthenticated");
  const given = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const okAuth = given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
  if (!okAuth) return err(401, "unauthorized", "cron secret mismatch");

  const env = process.env as Record<string, string>;
  const url = env.DATABASE_URL;
  if (!url) return err(500, "backup_failed_config", "DATABASE_URL is not set");
  const migrationsDir = path.join(process.cwd(), "..", "schema", "migrations");
  const metaBase = { dbFingerprint: dbFingerprintFromUrl(url), storeKind: "unknown" };

  let raw: pg.Client;
  try {
    raw = new pg.Client({ connectionString: nodeConnectionString(), connectionTimeoutMillis: 15_000, options: "-c timezone=UTC" });
    await raw.connect();
  } catch (e) {
    return err(500, "backup_failed_connect", e instanceof Error ? e.message.slice(0, 200) : "database connect failed");
  }
  const client = withCopySupport(raw);
  const query = async (text: string, params?: unknown[]) => (await raw.query(text, (params ?? []) as unknown as string[])); // node-pg types values as any[]
  const t0 = Date.now();

  try {
    const res = await createBackup({
      env,
      query,
      client: client as unknown as Parameters<typeof createBackup>[0]["client"],
      url,
      migrationsDir,
    });
    const meta = await recordBackupMeta(query, {
      dbFingerprint: metaBase.dbFingerprint,
      schemaVersion: (res.header.schemaVersion as string | null) ?? null,
      pgVersion: String(res.header.pgVersion),
      status: "ok",
      fileSize: res.fileSize,
      sha256: res.sha256,
      storeKind: res.storeKind,
      objectName: res.objectName,
      durationMs: res.durationMs,
      errorClass: null,
      tableCount: Number(res.header.tableCount),
      rowCounts: Object.fromEntries((res.header.tables as { name: string; rows: number }[]).map((t) => [t.name, t.rows])),
    });
    return ok({
      ok: true,
      backup: {
        objectName: res.objectName,
        store: res.storeKind,
        fileSize: res.fileSize,
        sha256: res.sha256,
        tables: res.header.tableCount,
        rows: res.header.totalRows,
        schemaVersion: res.header.schemaVersion,
        durationMs: res.durationMs,
        pruned: res.pruned,
        recordedAt: meta.createdAt,
      },
    });
  } catch (e) {
    const code = e instanceof BackupError ? e.code : "unknown";
    // best-effort failure record so the outage is observable in the metadata table + health
    await recordBackupMeta(query, {
      ...metaBase,
      schemaVersion: null,
      pgVersion: null,
      status: "failed",
      fileSize: 0,
      sha256: "",
      objectName: "",
      durationMs: Date.now() - t0,
      errorClass: code,
      tableCount: null,
      rowCounts: null,
    }).catch(() => null); // e.g. missing "Backup" table before migration 0006 — the 500 still surfaces
    return err(500, `backup_failed_${code}`, e instanceof Error ? e.message.slice(0, 200) : "backup failed");
  } finally {
    await raw.end().catch(() => null);
  }
}
