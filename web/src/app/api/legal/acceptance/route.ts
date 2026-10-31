import { all, run, fail } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { getViewer, guardSameOrigin } from "@/lib/session";
import { appendAudit } from "@/lib/ledger";
import { rateLimit, BUCKETS } from "@/lib/ratelimit";
import { PRIVACY_NOTICE_VERSION, TERMS_VERSION } from "@/lib/legal";

/** GET /api/legal/acceptance — the signed-in user's consent artefacts (which notice version, when). */
export const GET = handler(async () => {
  const v = await getViewer();
  if (!v) fail(401, "unauthenticated", "Sign in first");
  const rows = await all<{ policyKey: string; version: string; acceptedAt: Date; withdrawnAt: Date | null; acceptedByUserId: string | null }>(
    `SELECT "policyKey", version, "acceptedAt", "withdrawnAt", "acceptedByUserId" FROM "PolicyAcceptance"
      WHERE "userId"=$1 ORDER BY "acceptedAt" DESC`,
    [v.uid],
  );
  const latest = rows.find((r) => r.policyKey === "privacy-notice" && !r.withdrawnAt)?.version ?? null;
  return ok({
    current: { "privacy-notice": PRIVACY_NOTICE_VERSION, terms: TERMS_VERSION },
    upToDate: latest !== null && latest >= PRIVACY_NOTICE_VERSION,
    acceptances: rows.map((r) => ({ ...r, acceptedAt: r.acceptedAt.toISOString(), withdrawnAt: r.withdrawnAt?.toISOString() ?? null })),
  });
});

/**
 * POST /api/legal/acceptance — L2: accept the CURRENT notice + terms (re-acceptance after a version
 * bump). Idempotent; exempt from the consent gate by definition. Writes the artefact + a ledger entry.
 */
export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowStaleConsent: true });
  const v = await getViewer();
  if (!v) fail(401, "unauthenticated", "Sign in first");
  await rateLimit(BUCKETS.acceptance, v.uid);
  const inserted = await run(
    `INSERT INTO "PolicyAcceptance" ("userId", "policyKey", version)
       SELECT $1, k, ver FROM (VALUES ('privacy-notice', $2::text), ('terms', $3::text)) AS t(k, ver)
        WHERE NOT EXISTS (SELECT 1 FROM "PolicyAcceptance" p WHERE p."userId"=$1 AND p."policyKey"=t.k AND p.version=t.ver AND p."withdrawnAt" IS NULL)`,
    [v.uid, PRIVACY_NOTICE_VERSION, TERMS_VERSION],
  );
  if (inserted > 0) {
    await appendAudit(v.uid, "POLICY_ACCEPTED", "User", v.uid, { meta: { privacyNotice: PRIVACY_NOTICE_VERSION, terms: TERMS_VERSION } }).catch(() => null);
  }
  return ok({ accepted: true, inserted, current: { "privacy-notice": PRIVACY_NOTICE_VERSION, terms: TERMS_VERSION } });
});
