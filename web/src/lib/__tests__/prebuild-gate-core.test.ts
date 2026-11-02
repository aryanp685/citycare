// R1 (2026-11-02, P0 isolation remediation) — the prebuild target gate:
// the single decision point that controls whether a build may touch a database,
// and HOW. STRICTLY FAIL-CLOSED: preview hard-skips (flag-proof), production
// verifies read-only by default and applies only as an explicit controlled
// operation, development bootstraps only on an explicit declaration + URL, and
// anything unknown/missing refuses. Pins the full matrix below.
import { describe, it, expect } from "vitest";
import { resolvePrebuildAction, GATE_SKIP_EXIT, GATE_REFUSE_EXIT } from "../prebuild-gate-core.mjs";

const MIGS = [
  "0001_verification_emergency_inbox.sql",
  "0002_legal_consent_nominee.sql",
  "0003_sessions_grievance_incidents_dependents.sql",
  "0004_storage_recovery_anchors_capacity.sql",
  "0005_observation_reference_bands.sql",
  "0006_backup_metadata.sql",
  "0007_dedup_observation_index.sql",
];
const LATEST = MIGS[MIGS.length - 1];
const URL_OK = "postgres://user:pass@db.example.com:5432/citycare";

// env + availableMigrations for one decision
const d = (env: Record<string, string | undefined>, migs: string[] = MIGS) =>
  resolvePrebuildAction(env, { availableMigrations: migs });

describe("1. preview target — hard skip, flag-proof", () => {
  it("skips with no env at all (no DATABASE_URL, no mode)", () => {
    expect(d({ VERCEL_ENV: "preview" })).toMatchObject({ action: "skip", exitCode: GATE_SKIP_EXIT });
  });

  it("skips EVEN WITH a valid DATABASE_URL present", () => {
    expect(d({ VERCEL_ENV: "preview", DATABASE_URL: URL_OK })).toMatchObject({ action: "skip" });
  });

  it("skips EVEN WITH SCHEMA_SYNC_MODE=apply + DATABASE_URL + a valid MIGRATION_TARGET (flag-proof)", () => {
    const r = d({
      VERCEL_ENV: "preview",
      DATABASE_URL: URL_OK,
      SCHEMA_SYNC_MODE: "apply",
      MIGRATION_TARGET: LATEST,
    });
    expect(r).toMatchObject({ action: "skip", exitCode: GATE_SKIP_EXIT });
    expect(r.target).toBeUndefined();
  });

  it("skips with an unparseable DATABASE_URL (preview never parses it at all)", () => {
    expect(d({ VERCEL_ENV: "preview", DATABASE_URL: "not a url" })).toMatchObject({ action: "skip" });
  });

  it("normalizes case (PREVIEW)", () => {
    expect(d({ VERCEL_ENV: "PREVIEW", DATABASE_URL: URL_OK })).toMatchObject({ action: "skip" });
  });
});

describe("2. production target — fail-closed URL validation", () => {
  it("REFUSES with a missing DATABASE_URL (no fallback, ever)", () => {
    const r = d({ VERCEL_ENV: "production" });
    expect(r).toMatchObject({ action: "refuse", exitCode: GATE_REFUSE_EXIT });
  });

  it("REFUSES with an empty/whitespace DATABASE_URL", () => {
    for (const bad of ["", "   "]) {
      expect(d({ VERCEL_ENV: "production", DATABASE_URL: bad }).action, `DATABASE_URL=${JSON.stringify(bad)}`).toBe("refuse");
    }
  });

  it("REFUSES with an unparseable DATABASE_URL", () => {
    expect(d({ VERCEL_ENV: "production", DATABASE_URL: "postgres://host with spaces" }).action).toBe("refuse");
  });

  it("REFUSES with a non-postgres protocol (http:// is not a database URL)", () => {
    expect(d({ VERCEL_ENV: "production", DATABASE_URL: "http://db.example.com/citycare" }).action).toBe("refuse");
  });

  it("accepts both postgres: and postgresql: protocols", () => {
    expect(d({ VERCEL_ENV: "production", DATABASE_URL: "postgres://u:p@h/db" })).toMatchObject({ action: "verify" });
    expect(d({ VERCEL_ENV: "production", DATABASE_URL: "postgresql://u:p@h/db" })).toMatchObject({ action: "verify" });
  });
});

describe("3. production target — verify is the default (read-only)", () => {
  it("defaults to verify when SCHEMA_SYNC_MODE is unset", () => {
    expect(d({ VERCEL_ENV: "production", DATABASE_URL: URL_OK })).toMatchObject({ action: "verify", exitCode: GATE_SKIP_EXIT });
  });

  it("verify when SCHEMA_SYNC_MODE=verify (also trimmed/upper-cased)", () => {
    expect(d({ VERCEL_ENV: "production", DATABASE_URL: URL_OK, SCHEMA_SYNC_MODE: "verify" })).toMatchObject({ action: "verify" });
    expect(d({ VERCEL_ENV: "production", DATABASE_URL: URL_OK, SCHEMA_SYNC_MODE: " VERIFY " })).toMatchObject({ action: "verify" });
  });

  it("REFUSES an unknown SCHEMA_SYNC_MODE (never guessed)", () => {
    for (const bad of ["migrate", "applyy", "true", "sync", "apply-0007"]) {
      expect(
        d({ VERCEL_ENV: "production", DATABASE_URL: URL_OK, SCHEMA_SYNC_MODE: bad }).action,
        `SCHEMA_SYNC_MODE=${bad}`,
      ).toBe("refuse");
    }
  });
});

describe("4. production target — apply is bound to an explicit controlled operation", () => {
  it("REFUSES SCHEMA_SYNC_MODE=apply WITHOUT MIGRATION_TARGET (a temporary mode variable alone must never apply)", () => {
    const r = d({ VERCEL_ENV: "production", DATABASE_URL: URL_OK, SCHEMA_SYNC_MODE: "apply" });
    expect(r).toMatchObject({ action: "refuse", exitCode: GATE_REFUSE_EXIT });
  });

  it("REFUSES malformed MIGRATION_TARGET values (path traversal, wrong shape, no extension)", () => {
    for (const bad of ["../0007_dedup_observation_index.sql", "0007", "0007_dedup.sql.txt", "0007_DUP.sql", "0007-dup.sql", "migrations/0007_dedup_observation_index.sql", "x"]) {
      expect(
        d({ VERCEL_ENV: "production", DATABASE_URL: URL_OK, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: bad }).action,
        `MIGRATION_TARGET=${bad}`,
      ).toBe("refuse");
    }
  });

  it("REFUSES a MIGRATION_TARGET that is not present in schema/migrations", () => {
    expect(
      d({
        VERCEL_ENV: "production",
        DATABASE_URL: URL_OK,
        SCHEMA_SYNC_MODE: "apply",
        MIGRATION_TARGET: "0099_does_not_exist.sql",
      }).action,
    ).toBe("refuse");
  });

  it("REFUSES a MIGRATION_TARGET that is not the NEWEST migration (controlled ops name the release they apply)", () => {
    expect(
      d({
        VERCEL_ENV: "production",
        DATABASE_URL: URL_OK,
        SCHEMA_SYNC_MODE: "apply",
        MIGRATION_TARGET: "0006_backup_metadata.sql",
      }).action,
    ).toBe("refuse");
  });

  it("APPLIES only with all three explicit inputs: production + apply + newest target", () => {
    const r = d({
      VERCEL_ENV: "production",
      DATABASE_URL: URL_OK,
      SCHEMA_SYNC_MODE: "apply",
      MIGRATION_TARGET: LATEST,
    });
    expect(r).toMatchObject({ action: "apply", exitCode: GATE_SKIP_EXIT, target: LATEST });
  });

  it("tracks the newest migration when the available set changes", () => {
    const migs = [...MIGS, "0008_future_migration.sql"];
    const r = d(
      { VERCEL_ENV: "production", DATABASE_URL: URL_OK, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: "0008_future_migration.sql" },
      migs,
    );
    expect(r.action).toBe("apply");
    // naming the previous newest is now refused (0007 is no longer the newest)
    expect(
      d({ VERCEL_ENV: "production", DATABASE_URL: URL_OK, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: LATEST }, migs).action,
    ).toBe("refuse");
  });

  it("normalize case (PRODUCTION) — but still refuses apply without a target", () => {
    expect(d({ VERCEL_ENV: "PRODUCTION", DATABASE_URL: URL_OK })).toMatchObject({ action: "verify" });
    expect(d({ VERCEL_ENV: "PRODUCTION", DATABASE_URL: URL_OK, SCHEMA_SYNC_MODE: "apply" }).action).toBe("refuse");
  });
});

describe("5. development target — explicit local declaration only", () => {
  it("skips (no implicit local fallback) when DATABASE_URL is missing", () => {
    const r = d({ VERCEL_ENV: "development" });
    expect(r).toMatchObject({ action: "skip", exitCode: GATE_SKIP_EXIT });
  });

  it("bootstraps when DATABASE_URL is present (the explicit local dev flow)", () => {
    expect(d({ VERCEL_ENV: "development", DATABASE_URL: "postgres://citycare:citycare@127.0.0.1:5432/citycare" })).toMatchObject({
      action: "bootstrap",
    });
  });

  it("ignores SCHEMA_SYNC_MODE (the dev flow is the full bootstrap either way)", () => {
    expect(
      d({ VERCEL_ENV: "development", DATABASE_URL: URL_OK, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: LATEST }).action,
    ).toBe("bootstrap");
  });
});

describe("6. unknown / missing VERCEL_ENV — FAIL CLOSED (the owner-mandated correction)", () => {
  it("REFUSES when VERCEL_ENV is missing entirely — even with a valid DATABASE_URL (no silent dev-path fallback)", () => {
    const r = d({ DATABASE_URL: URL_OK });
    expect(r).toMatchObject({ action: "refuse", exitCode: GATE_REFUSE_EXIT });
  });

  it("REFUSES when VERCEL_ENV is empty/whitespace", () => {
    for (const bad of ["", "   "]) {
      expect(d({ VERCEL_ENV: bad, DATABASE_URL: URL_OK }).action, `VERCEL_ENV=${JSON.stringify(bad)}`).toBe("refuse");
    }
  });

  it("REFUSES unexpected environment names (ci, prod, test, staging, …)", () => {
    for (const bad of ["ci", "prod", "test", "staging", "build", "v2", "development2"]) {
      expect(d({ VERCEL_ENV: bad, DATABASE_URL: URL_OK }).action, `VERCEL_ENV=${bad}`).toBe("refuse");
    }
  });
});

describe("7. decision output hygiene", () => {
  it("reason strings never contain a full connection string or credentials", () => {
    const secretUrl = "postgres://topsecret-user:topsecret-pass@db.example.com:5432/citycare";
    for (const env of [
      { VERCEL_ENV: "production", DATABASE_URL: secretUrl },
      { VERCEL_ENV: "production", DATABASE_URL: secretUrl, SCHEMA_SYNC_MODE: "apply", MIGRATION_TARGET: LATEST },
      { VERCEL_ENV: "production", DATABASE_URL: "broken" },
      { VERCEL_ENV: "preview", DATABASE_URL: secretUrl, SCHEMA_SYNC_MODE: "apply" },
    ]) {
      const r = d(env);
      expect(r.reason, JSON.stringify(env)).not.toContain("topsecret-user");
      expect(r.reason, JSON.stringify(env)).not.toContain("topsecret-pass");
      expect(r.reason, JSON.stringify(env)).not.toContain(secretUrl);
    }
  });
});
