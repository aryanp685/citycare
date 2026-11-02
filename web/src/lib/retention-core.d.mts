export type RetentionPolicyName = "demo" | "internal" | "pilot";

export type RetentionReason =
  | "ok"
  | "missing_policy"
  | "invalid_policy"
  | "contradictory_policy"
  | "policy_disables_sweep";

/**
 * The retention-sweep decision. `policy`/`enabled`/`reason` are the SAFE subset
 * (no environment free-text) exposed by `/api/health` and the cron response;
 * `warning` is operator console output only.
 */
export interface RetentionInfo {
  policy: RetentionPolicyName | null;
  enabled: boolean;
  reason: RetentionReason;
  warning: string | null;
}

export const RETENTION_POLICIES: readonly RetentionPolicyName[];

export function evaluateRetentionPolicy(env: Record<string, string | undefined>): RetentionInfo;
