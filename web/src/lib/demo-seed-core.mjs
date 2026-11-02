// NG-S14 — demo-seed gate (Day 2, strictly fail-closed revision 2026-11-02).
// Framework-agnostic pure JS so the EXACT same file runs under plain node
// (scripts/seed.mjs), vitest, and e2e (scripts/e2e.mjs).
//
// This is the single decision point for whether the demo seed script (the only code that
// creates demo accounts — signup itself refuses @demo.in, `reserved_domain`) may run in a
// given environment. The matrix is STRICTLY FAIL-CLOSED: the ONLY path that creates demo
// accounts is RETENTION_POLICY=demo with SEED_DEMO unset or exactly "1".
//
//   RETENTION_POLICY      SEED_DEMO        action
//   --------------------  ---------------  -------------------------------------------------
//   demo                  0                skip  (exit 0, nothing written, nothing truncated)
//   demo                  1 / unset        seed  (the synthetic-demo default)
//   demo                  invalid value    refuse (exit 2 — invalid flags are never guessed as unset)
//   internal | pilot      0                skip  (real-data env, operator explicitly opts out)
//   internal | pilot      1                refuse (exit 2 — contradictory: demo accounts
//                                           requested on a real-data environment)
//   internal | pilot      unset            refuse (exit 2 — fail-safe default: a real-data
//                                           env must explicitly set SEED_DEMO=0)
//   internal | pilot      invalid value    refuse (exit 2)
//   missing | invalid     anything         refuse (exit 2 — an UNVERIFIED environment never
//   --------------------  ---------------  seeds, regardless of SEED_DEMO; not even
//                                           SEED_DEMO=0 "skips": the environment itself is
//                                           unverified, so the run refuses loudly instead
//                                           of proceeding with any assumption)
//
// "Invalid value" = the variable is present and non-empty after trimming but is not
// exactly "0" or "1" (e.g. "2", "true", "yes", "01"). Empty/unset = "unset".
//
// Properties the e2e suite (section 17) and unit tests pin:
//   * on a refused run NOTHING touches the database — the gate fires BEFORE any database
//     connection or write, so a contradicting/unverified run cannot even TRUNCATE the
//     database (e2e proves it: a pre-seeded marker row survives every refused run);
//   * no hostname inference — the decision is made only from explicit env config;
//   * the decision output carries only the two config variables' names/values — never a
//     database URL, never anything else from the environment.
import { RETENTION_POLICIES } from "./retention-core.mjs";

export const DEMO_SEED_SKIP_EXIT = 0;
export const DEMO_SEED_REFUSE_EXIT = 2;

/**
 * @param {string | undefined} raw
 * @returns {"0"|"1"|"invalid"|null} "0"/"1" when the value is exactly that (trimmed);
 *   "invalid" when the value is present, non-empty, and not 0/1; null when unset (absent
 *   or empty/whitespace-only).
 */
export function normalizeSeedFlag(raw) {
  if (raw === undefined || raw === null) return null;
  const v = typeof raw === "string" ? raw.trim() : "";
  if (v === "") return null;
  if (v === "0" || v === "1") return v;
  return "invalid";
}

const refuse = (reason) => ({ action: "refuse", reason, warning: null, exitCode: DEMO_SEED_REFUSE_EXIT });
const skip = (reason) => ({ action: "skip", reason, warning: null, exitCode: DEMO_SEED_SKIP_EXIT });

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{action: "seed"|"skip"|"refuse", reason: string, warning: string|null, exitCode: 0|2}}
 */
export function resolveDemoSeedAction(env) {
  const policy = typeof env.RETENTION_POLICY === "string" ? env.RETENTION_POLICY.trim().toLowerCase() : "";
  const flag = normalizeSeedFlag(env.SEED_DEMO);

  // R1 (2026-11-02, P0 isolation remediation): a PRODUCTION target may never
  // demo-seed, whatever RETENTION_POLICY says. The only skip is an explicit
  // SEED_DEMO=0 on a VERIFIED policy; SEED_DEMO=1 / unset / invalid — and any
  // unverified policy — refuse. (The prebuild gate already keeps production
  // builds on the read-only verify path by default; this closes the seed
  // dimension of the same hole at its own chokepoint, incl. direct runs.)
  const isProductionTarget =
    typeof env.VERCEL_ENV === "string" && env.VERCEL_ENV.trim().toLowerCase() === "production";
  if (isProductionTarget) {
    if (flag === "0" && RETENTION_POLICIES.includes(policy)) {
      return skip(
        `VERCEL_ENV=production — demo seeding is impossible on a production target; SEED_DEMO=0 on verified ` +
          `RETENTION_POLICY=${policy} acknowledged (nothing was written and nothing was truncated)`,
      );
    }
    return refuse(
      `VERCEL_ENV=production — demo seeding is REFUSED on a production target regardless of RETENTION_POLICY ` +
        `(policy: ${JSON.stringify(env.RETENTION_POLICY ?? null)}, SEED_DEMO: ${JSON.stringify(env.SEED_DEMO ?? null)}); ` +
        "demo accounts can only ever be created on a verified demo environment (RETENTION_POLICY=demo outside a production target)",
    );
  }

  // Strictly fail-closed (F1 rule 5): a missing/invalid RETENTION_POLICY identifies an
  // UNVERIFIED environment. It never seeds — and it never "skips" either: any assumption
  // about what an unverified database contains is unsafe, so the run refuses loudly
  // regardless of SEED_DEMO.
  if (!RETENTION_POLICIES.includes(policy)) {
    return refuse(
      `RETENTION_POLICY is missing/invalid (got: ${JSON.stringify(env.RETENTION_POLICY ?? null)}) — an unverified ` +
        "environment is strictly fail-closed: demo seeding is refused regardless of SEED_DEMO " +
        "(set RETENTION_POLICY=demo for a synthetic demo environment, or RETENTION_POLICY=internal|pilot with " +
        "SEED_DEMO=0 for a real-data environment)",
    );
  }

  // F1 rule 6: an invalid SEED_DEMO value is refused, never guessed (not treated as unset,
  // not treated as 0, not treated as 1).
  if (flag === "invalid") {
    return refuse(
      `SEED_DEMO has an invalid value (got: ${JSON.stringify(env.SEED_DEMO)}; expected exactly "0" or "1") — ` +
        "refusing instead of guessing what was intended",
    );
  }

  if (policy === "demo") {
    if (flag === "0") {
      return skip("SEED_DEMO=0 — demo seed disabled; nothing was written and nothing was truncated");
    }
    return { action: "seed", reason: "ok", warning: null, exitCode: DEMO_SEED_SKIP_EXIT };
  }

  // internal | pilot — real-data environment
  if (flag === "0") {
    return skip(
      `RETENTION_POLICY=${policy} is a real-data environment and SEED_DEMO=0 — demo seed skipped; ` +
        "nothing was written and nothing was truncated",
    );
  }
  if (flag === "1") {
    return refuse(
      `contradictory: SEED_DEMO=1 requests demo accounts, but RETENTION_POLICY=${policy} declares a real-data ` +
        "environment — demo seeding is refused and the database is left untouched",
    );
  }
  return refuse(
    `RETENTION_POLICY=${policy} declares a real-data environment and SEED_DEMO is not explicitly 0 — ` +
      "refusing by default (set SEED_DEMO=0 to skip the demo seed)",
  );
}
