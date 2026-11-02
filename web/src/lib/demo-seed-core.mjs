// NG-S14 — demo-seed gate (Day 2). Framework-agnostic pure JS so the EXACT same file
// runs under plain node (scripts/seed.mjs), vitest, and e2e (scripts/e2e.mjs).
//
// This is the single decision point for whether the demo seed script (the only code that
// creates demo accounts — signup itself refuses @demo.in, `reserved_domain`) may run in a
// given environment:
//
//   RETENTION_POLICY   SEED_DEMO      action
//   ----------------   -----------    ---------------------------------------------
//   demo               0              skip  (exit 0, nothing written, nothing truncated)
//   demo               1 / unset      seed  (the synthetic-demo default)
//   internal | pilot   0              skip  (real-data env, operator explicitly opts out)
//   internal | pilot   1              refuse (exit 2 — contradictory: demo accounts
//                                       requested on a real-data environment)
//   internal | pilot   unset          refuse (exit 2 — fail-safe default: a real-data
//                                       env must explicitly set SEED_DEMO=0)
//   missing | invalid  0              skip
//   missing | invalid  1              seed  (LOUD warning — explicit operator decision on
//   ----------------   --------------- an UNVERIFIED environment)
//   missing | invalid  unset          refuse (exit 2 — fail-safe default: the environment
//                                       was not verified as a synthetic demo env)
//
// Properties the e2e suite (section 17) and unit tests pin:
//   * on a real-data environment the gate fires BEFORE any database write — a contradicting
//     or default run cannot even TRUNCATE the database;
//   * the only paths that create demo accounts are: RETENTION_POLICY=demo (with
//     SEED_DEMO != 0) or an explicit SEED_DEMO=1 on an unverified environment (warned);
//   * no hostname inference — the decision is made only from explicit env config.
import { RETENTION_POLICIES } from "./retention-core.mjs";

export const DEMO_SEED_SKIP_EXIT = 0;
export const DEMO_SEED_REFUSE_EXIT = 2;

/** "0"/"1" (trimmed); anything else is treated as unset (null) — never a silent enable. */
export function normalizeSeedFlag(raw) {
  const v = typeof raw === "string" ? raw.trim() : "";
  return v === "0" || v === "1" ? v : null;
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{action: "seed"|"skip"|"refuse", reason: string, warning: string|null, exitCode: 0|2}}
 */
export function resolveDemoSeedAction(env) {
  const policy = typeof env.RETENTION_POLICY === "string" ? env.RETENTION_POLICY.trim().toLowerCase() : "";
  const flag = normalizeSeedFlag(env.SEED_DEMO);

  if (flag === "0") {
    return {
      action: "skip",
      reason:
        "SEED_DEMO=0 — demo seed disabled; nothing was written and nothing was truncated",
      warning: null,
      exitCode: DEMO_SEED_SKIP_EXIT,
    };
  }

  const realData = RETENTION_POLICIES.includes(policy) && policy !== "demo";
  if (realData) {
    if (flag === "1") {
      return {
        action: "refuse",
        reason: `contradictory: SEED_DEMO=1 requests demo accounts, but RETENTION_POLICY=${policy} declares a real-data environment — demo seeding is refused and the database is left untouched`,
        warning: null,
        exitCode: DEMO_SEED_REFUSE_EXIT,
      };
    }
    return {
      action: "refuse",
      reason: `RETENTION_POLICY=${policy} declares a real-data environment and SEED_DEMO is not explicitly 0 — refusing by default (set SEED_DEMO=0 to skip the demo seed)`,
      warning: null,
      exitCode: DEMO_SEED_REFUSE_EXIT,
    };
  }

  if (policy === "demo") {
    return { action: "seed", reason: "ok", warning: null, exitCode: DEMO_SEED_SKIP_EXIT };
  }

  // policy missing or invalid → unverified environment
  if (flag === "1") {
    return {
      action: "seed",
      reason: "ok_with_warning",
      warning:
        `RETENTION_POLICY is missing/invalid (got: ${JSON.stringify(env.RETENTION_POLICY ?? null)}) but SEED_DEMO=1 was ` +
        "explicitly set — seeding demo data on an UNVERIFIED environment. If this database holds real data, that is a severe incident " +
        "(see web/docs/operations/DEMO_AND_PILOT_ENVIRONMENT_ISOLATION.md).",
      exitCode: DEMO_SEED_SKIP_EXIT,
    };
  }
  return {
    action: "refuse",
    reason:
      "RETENTION_POLICY is missing/invalid and SEED_DEMO is not explicitly 1 — refusing by default " +
      "(set RETENTION_POLICY=demo for a synthetic demo environment, SEED_DEMO=0 to skip, or SEED_DEMO=1 to explicitly accept on an unverified environment)",
    warning: null,
    exitCode: DEMO_SEED_REFUSE_EXIT,
  };
}
