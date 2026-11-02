import Link from "next/link";
import { DEMO_MODE, DEMO_RETENTION_DAYS } from "@/lib/legal";
import { evaluateRetentionPolicy } from "@/lib/retention-core.mjs";

/**
 * L1: the public demo is a public demo. People must know before they type that
 * (a) the seeded records are synthetic, (b) they must not enter real third-party data,
 * (c) self-registered accounts are erased after DEMO_RETENTION_DAYS — stated only when the
 *     sweep is actually armed (NG-S15: the banner must not promise erasure the deployment
 *     has disabled; same policy decision as /api/cron/daily and /api/health).
 * Server component — no JS.
 */
export function DemoBanner() {
  if (!DEMO_MODE) return null;
  const retention = evaluateRetentionPolicy(process.env);
  return (
    <div role="note" className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs">
      <div className="max-w-6xl mx-auto px-4 py-1.5 flex flex-wrap gap-x-3 gap-y-1 items-center">
        <strong className="font-bold">Public demo.</strong>
        <span>All seeded records are synthetic. Do not enter real personal or health data about yourself or anyone else.</span>
        <span>
          {retention.enabled
            ? `Accounts you create are erased automatically after ${DEMO_RETENTION_DAYS} days.`
            : "This deployment does not auto-erase accounts — you can erase your data any time (Access & trust → Erase my data)."}
        </span>
        <Link href="/legal/privacy" className="underline underline-offset-2 font-semibold">Privacy notice</Link>
      </div>
    </div>
  );
}
