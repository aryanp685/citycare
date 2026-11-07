import { DemoBannerContent } from "./demo-banner-content";
import { DEMO_MODE, DEMO_RETENTION_DAYS } from "@/lib/legal";
import { evaluateRetentionPolicy } from "@/lib/retention-core.mjs";

/**
 * L1: the public demo is a public demo. People must know before they type that
 * (a) the seeded records are synthetic, (b) they must not enter real third-party data,
 * (c) self-registered accounts are erased after DEMO_RETENTION_DAYS — stated only when the
 *     sweep is actually armed (NG-S15: the banner must not promise erasure the deployment
 *     has disabled; same policy decision as /api/cron/daily and /api/health).
 * Server component computes the policy; client presentation follows the patient locale.
 */
export function DemoBanner() {
  if (!DEMO_MODE) return null;
  const retention = evaluateRetentionPolicy(process.env);
  return <DemoBannerContent enabled={retention.enabled} days={DEMO_RETENTION_DAYS} />;
}
