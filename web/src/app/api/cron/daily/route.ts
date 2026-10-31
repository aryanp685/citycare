import { timingSafeEqual } from "node:crypto";
import { all, one, run, tx } from "@/lib/db";
import { pruneSessions } from "@/lib/sessions";
import { PRUNE_RATELIMIT_SQL } from "@/lib/ratelimit";
import { anchorLedgerHead } from "@/lib/anchors";
import { notify } from "@/lib/notify";
import { ok, err } from "@/lib/api";
import { appendAudit } from "@/lib/ledger";
import { erasePatientData, anonymiseDoctor } from "@/lib/erasure";
import { DEMO_RETENTION_DAYS, DEMO_SEED_DOMAIN } from "@/lib/legal";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/daily — the single Vercel cron (Hobby allows daily jobs only).
 *   1. Demo retention sweep (L1, DPDP s.8(7)): accounts self-registered on the public demo are
 *      erased DEMO_RETENTION_DAYS after creation. Seeded @demo.in identities are never touched.
 *      Each erasure is a DATA_ERASED ledger entry with reason=demo_retention.
 *   2. Ledger integrity check (what /api/health does) so the cron doubles as the daily monitor
 *      and as activity that keeps a free Postgres project from being paused.
 *   3. Housekeeping: expired/revoked sessions and stale rate-limit windows (D44).
 *   4. D13: sign + externally timestamp the ledger head (LedgerAnchor).
 *   5. D49: remind guardians whose dependent has turned 18 to hand the account over.
 * D45: erasures stop after TIME_BUDGET_MS so the function never hits Vercel's maxDuration;
 *      whatever is left is picked up tomorrow (LIMIT 200 per run anyway).
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET`. Unset secret ⇒ 503 (never open).
 */
const TIME_BUDGET_MS = 20_000;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return err(503, "cron_unconfigured", "CRON_SECRET is not set; the daily job refuses to run unauthenticated");
  const given = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const okAuth = given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
  if (!okAuth) return err(401, "unauthorized", "cron secret mismatch");

  const t0 = Date.now();
  const due = await all<{ uid: string; role: "PATIENT" | "DOCTOR"; pid: string | null; did: string | null }>(
    `SELECT u.id AS uid, u.role, p.id AS pid, d.id AS did
       FROM "User" u
       LEFT JOIN "Patient" p ON p."userId" = u.id
       LEFT JOIN "Doctor"  d ON d."userId" = u.id
      WHERE u.role IN ('PATIENT','DOCTOR')
        AND u.status <> 'DELETED'
        AND lower(u.email) NOT LIKE '%@' || $1
        AND u."createdAt" < now() - make_interval(days => $2::int)
      ORDER BY u."createdAt"
      LIMIT 200`,
    [DEMO_RETENTION_DAYS, DEMO_RETENTION_DAYS],
  );

  const swept = { patients: 0, doctors: 0, failed: 0, deferred: 0 };
  for (const r of due) {
    if (Date.now() - t0 > TIME_BUDGET_MS) { swept.deferred += 1; continue; }
    try {
      if (r.role === "PATIENT" && r.pid) {
        await tx((c) => erasePatientData(c, r.pid!, r.uid));
        await appendAudit(r.uid, "DATA_ERASED", "Patient", r.pid, { meta: { reason: "demo_retention", days: DEMO_RETENTION_DAYS } }).catch(() => null);
        swept.patients += 1;
      } else if (r.role === "DOCTOR" && r.did) {
        await tx((c) => anonymiseDoctor(c, r.did!, r.uid));
        await appendAudit(r.uid, "DATA_ERASED", "Doctor", r.did, { meta: { reason: "demo_retention", days: DEMO_RETENTION_DAYS } }).catch(() => null);
        swept.doctors += 1;
      }
    } catch (e) {
      swept.failed += 1;
      console.error("[cron] erasure failed for", r.uid, e instanceof Error ? e.message : e);
    }
  }

  // D13 — anchor the chain head (skips if today's head is already anchored)
  const anchor = await anchorLedgerHead({ ots: process.env.ANCHOR_OTS !== "0" }).catch((e) => ({ anchored: false, seq: null, reason: e instanceof Error ? e.message : "error" }));

  // D49 — handover reminders (at most one per guardian per dependent per 30 days)
  const due18 = await all<{ id: string; name: string; guardianUid: string }>(
    `SELECT d.id, d."fullName" AS name, gu.id AS "guardianUid"
       FROM "Patient" d JOIN "Patient" g ON g.id = d."guardianPatientId" JOIN "User" gu ON gu.id = g."userId"
      WHERE d."dateOfBirth" IS NOT NULL AND d."dateOfBirth" + interval '18 years' <= now() AND d."fullName" <> '[REDACTED]'
        AND NOT EXISTS (SELECT 1 FROM "Notification" n WHERE n."userId" = gu.id AND n.title = 'Handover due: ' || d."fullName" AND n."createdAt" > now() - interval '30 days')
      LIMIT 100`,
  );
  for (const d of due18) {
    await notify(d.guardianUid, { title: `Handover due: ${d.name}`, body: `${d.name} is 18 now. Hand the account over from Dashboard → Dependents so they hold their own login and give their own consent.`, href: "/patient", severity: "WARNING" }).catch(() => null);
  }

  const [health, sessionsPruned, rateWindowsPruned] = await Promise.all([
    one<{ breaks: number; tz: string }>(`SELECT (SELECT count(*)::int FROM ledger_verify()) AS breaks, current_setting('TimeZone') AS tz`),
    pruneSessions().catch(() => -1),
    run(PRUNE_RATELIMIT_SQL).catch(() => -1),
  ]);

  return ok({
    ok: (health?.breaks ?? 1) === 0 && swept.failed === 0,
    retention: { days: DEMO_RETENTION_DAYS, protectedDomain: DEMO_SEED_DOMAIN, due: due.length, ...swept },
    ledger: { breaks: health?.breaks ?? null, timezone: health?.tz ?? null },
    housekeeping: { sessionsPruned, rateWindowsPruned },
    anchor,
    handoverReminders: due18.length,
    tookMs: Date.now() - t0,
    at: new Date().toISOString(),
  });
}
