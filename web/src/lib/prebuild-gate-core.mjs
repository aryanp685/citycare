// R1 (2026-11-02, P0 isolation remediation) — the prebuild TARGET GATE.
// Framework-agnostic pure JS (no fs, no pg, no side effects) so the EXACT same
// decision runs under vitest, the prebuild script, and e2e.
//
// WHY (CITYCARE_PREVIEW_PRODUCTION_ISOLATION_AUDIT.md, finding R1):
// the previous prebuild hook had exactly one guard — "is DATABASE_URL set?" —
// with NO target awareness. Vercel injects the production credentials into
// every build (production AND preview), so every preview build connected to
// the production database and ran the full migration/DDL pass. The gate below
// makes the target an EXPLICIT input and fails closed on anything unexpected:
//
//   VERCEL_ENV        DATABASE_URL        SCHEMA_SYNC_MODE          action
//   --------------    --------------      ------------------------  ---------------------------------
//   preview           (anything)          (anything, ignored)       skip (exit 0) — preview builds
//                                                                  NEVER touch a database; no flag
//                                                                  (incl. apply) can override this
//   production        missing/unparseable —                          refuse (exit 1) — there is NO
//                                                                  fallback connection string, ever
//   production        ok                  (missing) = verify        verify (read-only checks)
//   production        ok                  verify                    verify (read-only checks)
//   production        ok                  apply                     apply — but ONLY bound to an
//                                                                  explicit controlled migration
//                                                                  operation (MIGRATION_TARGET = the
//                                                                  newest migration file present);
//                                                                  the mode variable alone refuses
//   production        ok                  unknown value             refuse (exit 1)
//   development       missing             —                         skip (exit 0) — no implicit local
//                                                                  default; bootstrap only runs on an
//                                                                  explicit declaration + explicit URL
//   development       ok                  (ignored)                 bootstrap (the local dev flow)
//   (missing/unknown) (anything)          (anything)                refuse (exit 1) — FAIL CLOSED:
//                                                                  CI and any unexpected environment
//                                                                  can never run bootstrap/migrations
//
// "apply" therefore requires THREE explicit inputs at once (production target,
// apply mode, a named newest migration) — a temporary environment variable
// alone can never move production schema.
//
// Properties the unit tests and e2e (§18.10–§18.15) pin:
//   * preview skip is FLAG-PROOF (DATABASE_URL and SCHEMA_SYNC_MODE=apply are ignored);
//   * the URL is parsed with `new URL()` (never regex — A98 lesson), protocol
//     postgres/postgresql, non-empty hostname;
//   * unknown/missing VERCEL_ENV refuses even when a valid DATABASE_URL is present;
//   * the decision output carries only env variable names and the host — never a
//     full connection string, never credentials.
export const GATE_SKIP_EXIT = 0;
export const GATE_REFUSE_EXIT = 1;

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ availableMigrations?: string[] }} [opts] sorted list of migration
 *   filenames present in schema/migrations (the script reads the directory and
 *   passes it in — keeps this core pure and unit-testable).
 * @returns {{action: "skip"|"verify"|"apply"|"bootstrap"|"refuse", reason: string, exitCode: 0|1, target?: string}}
 */
export function resolvePrebuildAction(env, opts = {}) {
  const available = opts.availableMigrations ?? [];
  const target = typeof env.VERCEL_ENV === "string" ? env.VERCEL_ENV.trim().toLowerCase() : "";

  // ── preview: hard skip, flag-proof ─────────────────────────────────────────
  if (target === "preview") {
    return {
      action: "skip",
      exitCode: GATE_SKIP_EXIT,
      reason:
        "VERCEL_ENV=preview — preview builds never touch a database (hard skip by design; " +
        "DATABASE_URL and SCHEMA_SYNC_MODE are ignored, even apply)",
    };
  }

  // ── production: fail-closed URL validation, then the verify/apply switch ───
  if (target === "production") {
    const rawUrl = env.DATABASE_URL ?? "";
    let u;
    try {
      u = new URL(rawUrl);
    } catch {
      return refuse(
        "VERCEL_ENV=production but DATABASE_URL is missing or unparseable — refusing; " +
          "there is NO fallback connection string (a production build must fail loudly instead of guessing)",
      );
    }
    if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") {
      return refuse(
        `VERCEL_ENV=production but DATABASE_URL has unsupported protocol '${u.protocol}' ` +
          "(expected postgres: or postgresql:) — refusing",
      );
    }
    if (!u.hostname) {
      return refuse("VERCEL_ENV=production but DATABASE_URL has an empty hostname — refusing");
    }

    const mode =
      typeof env.SCHEMA_SYNC_MODE === "string" && env.SCHEMA_SYNC_MODE.trim() !== ""
        ? env.SCHEMA_SYNC_MODE.trim().toLowerCase()
        : "verify";

    if (mode === "verify") {
      return {
        action: "verify",
        exitCode: GATE_SKIP_EXIT,
        reason: `VERCEL_ENV=production, SCHEMA_SYNC_MODE=verify (the default) — read-only schema verification only (host: ${u.hostname}); no DDL, no migrations, no seed`,
      };
    }

    if (mode === "apply") {
      const t = typeof env.MIGRATION_TARGET === "string" ? env.MIGRATION_TARGET.trim() : "";
      if (t === "") {
        return refuse(
          "VERCEL_ENV=production + SCHEMA_SYNC_MODE=apply WITHOUT MIGRATION_TARGET — refusing: " +
            "a temporary SCHEMA_SYNC_MODE=apply alone must never apply migrations. Apply is bound to an " +
            "explicit controlled migration operation (runbook: web/docs/operations/DEMO_AND_PILOT_ENVIRONMENT_ISOLATION.md §7)",
        );
      }
      if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(t)) {
        return refuse(
          `MIGRATION_TARGET ${JSON.stringify(t)} is not a valid migration filename (expected NNNN_snake_name.sql) — refusing`,
        );
      }
      if (!available.includes(t)) {
        return refuse(
          `MIGRATION_TARGET ${t} is not present in schema/migrations (available: ${available.join(", ") || "none"}) — refusing`,
        );
      }
      const newest = available[available.length - 1];
      if (t !== newest) {
        return refuse(
          `MIGRATION_TARGET ${t} is not the NEWEST migration (newest: ${newest}) — a controlled operation must name the release it applies — refusing`,
        );
      }
      return {
        action: "apply",
        exitCode: GATE_SKIP_EXIT,
        target: t,
        reason: `CONTROLLED MIGRATION OPERATION: VERCEL_ENV=production + SCHEMA_SYNC_MODE=apply + MIGRATION_TARGET=${t} (host: ${u.hostname}) — full idempotent bootstrap (DDL)`,
      };
    }

    return refuse(
      `VERCEL_ENV=production + unknown SCHEMA_SYNC_MODE ${JSON.stringify(mode)} (expected "verify" or "apply") — refusing`,
    );
  }

  // ── development: explicit local declaration only ───────────────────────────
  if (target === "development") {
    if (!env.DATABASE_URL) {
      return {
        action: "skip",
        exitCode: GATE_SKIP_EXIT,
        reason: "VERCEL_ENV=development without DATABASE_URL — skipping schema sync (there is no implicit local fallback)",
      };
    }
    return {
      action: "bootstrap",
      exitCode: GATE_SKIP_EXIT,
      reason: "VERCEL_ENV=development with DATABASE_URL — full idempotent bootstrap (explicit local development flow)",
    };
  }

  // ── fail-closed: anything else (missing, "", "prod", "ci", "test", …) ──────
  return refuse(
    `unknown or missing VERCEL_ENV (got: ${JSON.stringify(target === "" ? null : target)}) — FAIL CLOSED: no environment may run database bootstrap/migrations without an explicit declaration (production | preview | development)`,
  );
}

const refuse = (reason) => ({ action: "refuse", reason, exitCode: GATE_REFUSE_EXIT });
