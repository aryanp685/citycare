// Day 2 (NG-S14) — the demo-seed gate: the single decision point that controls whether
// scripts/seed.mjs (the ONLY code that creates demo accounts) may run in an environment.
// Pins the full config matrix, the fail-safe defaults, and the contradiction refusal.
import { describe, it, expect } from "vitest";
import {
  resolveDemoSeedAction,
  normalizeSeedFlag,
  DEMO_SEED_SKIP_EXIT,
  DEMO_SEED_REFUSE_EXIT,
} from "../demo-seed-core.mjs";

const d = (env: Record<string, string | undefined>) => resolveDemoSeedAction(env);

describe("1. demo environment (RETENTION_POLICY=demo)", () => {
  it("seeds by default (SEED_DEMO unset) — backward-compatible synthetic-demo behaviour", () => {
    expect(d({ RETENTION_POLICY: "demo" })).toMatchObject({ action: "seed", exitCode: DEMO_SEED_SKIP_EXIT, warning: null });
  });

  it("seeds with explicit SEED_DEMO=1", () => {
    expect(d({ RETENTION_POLICY: "demo", SEED_DEMO: "1" })).toMatchObject({ action: "seed" });
  });

  it("SKIPS (exit 0, nothing written) when SEED_DEMO=0", () => {
    expect(d({ RETENTION_POLICY: "demo", SEED_DEMO: "0" })).toMatchObject({ action: "skip", exitCode: DEMO_SEED_SKIP_EXIT });
  });
});

describe("2. real-data environments (RETENTION_POLICY=internal|pilot)", () => {
  it("pilot + SEED_DEMO=0 → skip (operator explicitly opted out; nothing written)", () => {
    expect(d({ RETENTION_POLICY: "pilot", SEED_DEMO: "0" })).toMatchObject({ action: "skip" });
  });

  it("pilot + SEED_DEMO=1 → REFUSE (contradiction: demo accounts requested on real data)", () => {
    const r = d({ RETENTION_POLICY: "pilot", SEED_DEMO: "1" });
    expect(r.action).toBe("refuse");
    expect(r.exitCode).toBe(DEMO_SEED_REFUSE_EXIT);
    expect(r.reason).toContain("contradictory");
    expect(r.reason).toContain("pilot");
  });

  it("pilot + SEED_DEMO unset → REFUSE (fail-safe default: must be explicit)", () => {
    const r = d({ RETENTION_POLICY: "pilot" });
    expect(r).toMatchObject({ action: "refuse", exitCode: DEMO_SEED_REFUSE_EXIT });
  });

  it("internal (production-grade) + any SEED_DEMO ≠ 0 → REFUSE", () => {
    expect(d({ RETENTION_POLICY: "internal" })).toMatchObject({ action: "refuse" });
    expect(d({ RETENTION_POLICY: "internal", SEED_DEMO: "1" })).toMatchObject({ action: "refuse" });
  });
});

describe("3. unverified environment (missing/invalid RETENTION_POLICY)", () => {
  it("SEED_DEMO=1 → seeds but with a LOUD warning (explicit operator decision)", () => {
    const r = d({ RETENTION_POLICY: undefined, SEED_DEMO: "1" });
    expect(r.action).toBe("seed");
    expect(r.reason).toBe("ok_with_warning");
    expect(r.warning).toMatch(/UNVERIFIED environment/);
  });

  it("invalid policy + SEED_DEMO=1 → still seeds with warning (the policy is not a real-data declaration)", () => {
    const r = d({ RETENTION_POLICY: "totally-bogus", SEED_DEMO: "1" });
    expect(r.action).toBe("seed");
    expect(r.warning).not.toBeNull();
  });

  it("SEED_DEMO unset → REFUSE (fail-safe: the environment was not verified as a demo env)", () => {
    expect(d({})).toMatchObject({ action: "refuse", exitCode: DEMO_SEED_REFUSE_EXIT });
    expect(d({ RETENTION_POLICY: "totally-bogus" })).toMatchObject({ action: "refuse" });
  });

  it("SEED_DEMO=0 → skip", () => {
    expect(d({ SEED_DEMO: "0" })).toMatchObject({ action: "skip" });
  });
});

describe("4. flag normalisation (no silent enables)", () => {
  it("only exactly 0/1 (trimmed) are recognised; anything else is treated as unset", () => {
    expect(normalizeSeedFlag("0")).toBe("0");
    expect(normalizeSeedFlag(" 1 ")).toBe("1");
    expect(normalizeSeedFlag("true")).toBeNull();
    expect(normalizeSeedFlag("yes")).toBeNull();
    expect(normalizeSeedFlag(undefined)).toBeNull();
    expect(normalizeSeedFlag("")).toBeNull();
  });

  it("SEED_DEMO=yes on a real-data env is NOT a skip and NOT a seed → REFUSE", () => {
    expect(d({ RETENTION_POLICY: "pilot", SEED_DEMO: "yes" })).toMatchObject({ action: "refuse" });
  });
});

describe("5. no PHI/secrets in the decision output (alertable strings are safe)", () => {
  it("reason/warning carry only env NAMES and values of the two config vars — nothing else", () => {
    const marker = "super-secret-value";
    for (const env of [
      { RETENTION_POLICY: "demo", SEED_DEMO: "1", DATABASE_URL: `postgresql://x:${marker}@host/db` },
      { RETENTION_POLICY: "pilot", SEED_DEMO: "1", DATABASE_URL: `postgresql://x:${marker}@host/db` },
    ]) {
      const r = resolveDemoSeedAction(env);
      const wire = JSON.stringify(r);
      expect(wire).not.toContain(marker);
      expect(wire).not.toContain("postgresql://");
    }
  });
});
