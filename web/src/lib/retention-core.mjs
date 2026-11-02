/**
 * NG-S15 — retention-sweep policy gate (P0: the demo sweep must never erase real users).
 *
 * The daily cron (`/api/cron/daily`) erases self-registered accounts older than
 * `DEMO_RETENTION_DAYS` (7) — correct for the public demo, *fatal* for a pilot or
 * internal deployment that reuses this code. The sweep now runs only when the
 * deployment EXPLICITLY declares its data class via `RETENTION_POLICY`:
 *
 *   RETENTION_POLICY=demo     → sweep ON  (public demo; the banner must be on too)
 *   RETENTION_POLICY=internal → sweep OFF (real data; erasure only on request/obligation)
 *   RETENTION_POLICY=pilot    → sweep OFF (real data; erasure only on request/obligation)
 *
 * Fail-safe: a MISSING or INVALID policy, or a CONTRADICTORY one (demo policy on a
 * non-demo-presented deployment), DISABLES the sweep and produces a loud warning.
 * An unknown environment never erases data — the only way the sweep runs is by
 * explicit, consistent declaration.
 *
 * This module is pure (env in → decision out) so the exact gate the route consults is
 * unit-testable and e2e-testable from node. It returns NO free-text environment values
 * except in `warning` (operator console output); the `policy`/`enabled`/`reason` fields
 * are the safe subset that `/api/health` and the cron response expose.
 */

export const RETENTION_POLICIES = Object.freeze(["demo", "internal", "pilot"]);

/** Same rule as `DEMO_MODE` in legal.ts (banner on unless explicitly "0") — keep in sync. */
function demoBannerOn(env) {
  return env.NEXT_PUBLIC_DEMO_MODE !== "0";
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{policy: "demo"|"internal"|"pilot"|null, enabled: boolean,
 *            reason: "ok"|"missing_policy"|"invalid_policy"|"contradictory_policy"|"policy_disables_sweep",
 *            warning: string|null}}
 */
export function evaluateRetentionPolicy(env) {
  const raw = typeof env.RETENTION_POLICY === "string" ? env.RETENTION_POLICY.trim().toLowerCase() : "";

  if (!raw) {
    return {
      policy: null,
      enabled: false,
      reason: "missing_policy",
      warning:
        "RETENTION_POLICY is not set — the retention sweep is DISABLED (fail-safe). " +
        "A public demo deployment must set RETENTION_POLICY=demo; a real-data deployment must set " +
        "RETENTION_POLICY=internal or RETENTION_POLICY=pilot.",
    };
  }

  if (!RETENTION_POLICIES.includes(raw)) {
    return {
      policy: null,
      enabled: false,
      reason: "invalid_policy",
      warning:
        `RETENTION_POLICY must be one of: demo, internal, pilot (got: ${JSON.stringify(env.RETENTION_POLICY)}) — ` +
        "the retention sweep is DISABLED (fail-safe).",
    };
  }

  if (raw === "demo") {
    if (!demoBannerOn(env)) {
      return {
        policy: "demo",
        enabled: false,
        reason: "contradictory_policy",
        warning:
          "RETENTION_POLICY=demo but NEXT_PUBLIC_DEMO_MODE=0 — a demo retention policy on a " +
          "non-demo-presented deployment is a contradiction; the retention sweep is DISABLED (fail-safe).",
      };
    }
    return { policy: "demo", enabled: true, reason: "ok", warning: null };
  }

  // internal | pilot — real data: the sweep is never enabled by these policies.
  const warning = demoBannerOn(env)
    ? `RETENTION_POLICY=${raw} declares real data, but the public demo banner is shown ` +
      "(NEXT_PUBLIC_DEMO_MODE is not \"0\") — fix the deployment; the retention sweep is DISABLED either way."
    : null;
  return { policy: raw, enabled: false, reason: "policy_disables_sweep", warning };
}
