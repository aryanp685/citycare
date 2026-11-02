// Day 2 (NG-S14) — the demo-seed gate: the single decision point that controls whether
// scripts/seed.mjs (the ONLY code that creates demo accounts) may run in an environment.
// STRICTLY FAIL-CLOSED revision (2026-11-02 final security correction): the only path that
// creates demo accounts is RETENTION_POLICY=demo with SEED_DEMO unset or exactly "1".
// A missing/invalid RETENTION_POLICY refuses regardless of SEED_DEMO; an invalid
// SEED_DEMO value refuses. Pins the full config matrix below.
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

  it("REFUSES an invalid SEED_DEMO value (fail-closed: never guessed as unset)", () => {
    for (const bad of ["2", "true", "yes", "01", " 2 ", "on"]) {
      const r = d({ RETENTION_POLICY: "demo", SEED_DEMO: bad });
      expect(r.action, `SEED_DEMO=${bad}`).toBe("refuse");
      expect(r.exitCode).toBe(DEMO_SEED_REFUSE_EXIT);
    }
  });
});

describe("2. real-data environments (RETENTION_POLICY=internal|pilot)", () => {
  it("pilot + SEED_DEMO=0 → skip (operator explicitly opted out; nothing written)", () => {
    expect(d({ RETENTION_POLICY: "pilot", SEED_DEMO: "0" })).toMatchObject({ action: "skip" });
  });

  it("internal (production-grade) + SEED_DEMO=0 → skip", () => {
    expect(d({ RETENTION_POLICY: "internal", SEED_DEMO: "0" })).toMatchObject({ action: "skip" });
  });

  it("pilot + SEED_DEMO=1 → REFUSE (contradiction: demo accounts requested on real data)", () => {
    const r = d({ RETENTION_POLICY: "pilot", SEED_DEMO: "1" });
    expect(r.action).toBe("refuse");
    expect(r.exitCode).toBe(DEMO_SEED_REFUSE_EXIT);
    expect(r.reason).toContain("contradictory");
    expect(r.reason).toContain("pilot");
  });

  it("pilot + SEED_DEMO unset → REFUSE (fail-safe default: must be explicit)", () => {
    expect(d({ RETENTION_POLICY: "pilot" })).toMatchObject({ action: "refuse", exitCode: DEMO_SEED_REFUSE_EXIT });
  });

  it("internal (production-grade) + any SEED_DEMO ≠ 0 → REFUSE", () => {
    expect(d({ RETENTION_POLICY: "internal" })).toMatchObject({ action: "refuse" });
    expect(d({ RETENTION_POLICY: "internal", SEED_DEMO: "1" })).toMatchObject({ action: "refuse" });
  });

  it("real-data env + invalid SEED_DEMO value → REFUSE", () => {
    expect(d({ RETENTION_POLICY: "pilot", SEED_DEMO: "yes" })).toMatchObject({ action: "refuse" });
    expect(d({ RETENTION_POLICY: "internal", SEED_DEMO: "2" })).toMatchObject({ action: "refuse" });
  });
});

describe("3. unverified environment (missing/invalid RETENTION_POLICY) — strictly fail-closed", () => {
  it("SEED_DEMO unset → REFUSE (the environment was not verified as a demo env)", () => {
    expect(d({})).toMatchObject({ action: "refuse", exitCode: DEMO_SEED_REFUSE_EXIT });
    expect(d({ RETENTION_POLICY: "totally-bogus" })).toMatchObject({ action: "refuse" });
  });

  it("SEED_DEMO=1 → REFUSE (a missing/invalid policy NEVER seeds, even when explicitly requested)", () => {
    const missing = d({ RETENTION_POLICY: undefined, SEED_DEMO: "1" });
    expect(missing).toMatchObject({ action: "refuse", exitCode: DEMO_SEED_REFUSE_EXIT });
    expect(missing.reason).toContain("missing/invalid");
    const invalid = d({ RETENTION_POLICY: "totally-bogus", SEED_DEMO: "1" });
    expect(invalid).toMatchObject({ action: "refuse" });
    expect(invalid.reason).toContain("totally-bogus");
  });

  it("SEED_DEMO=0 → REFUSE (an unverified environment does not even 'skip' — it refuses loudly)", () => {
    expect(d({ SEED_DEMO: "0" })).toMatchObject({ action: "refuse", exitCode: DEMO_SEED_REFUSE_EXIT });
    expect(d({ RETENTION_POLICY: "totally-bogus", SEED_DEMO: "0" })).toMatchObject({ action: "refuse" });
  });

  it("empty-string / whitespace-only policy → treated as missing → REFUSE", () => {
    expect(d({ RETENTION_POLICY: "" })).toMatchObject({ action: "refuse" });
    expect(d({ RETENTION_POLICY: "   " })).toMatchObject({ action: "refuse" });
    expect(d({ RETENTION_POLICY: "", SEED_DEMO: "1" })).toMatchObject({ action: "refuse" });
  });
});

describe("4. flag normalisation (no silent enables, no guessing)", () => {
  it("exactly 0/1 (trimmed) are recognised; empty/absent is unset", () => {
    expect(normalizeSeedFlag("0")).toBe("0");
    expect(normalizeSeedFlag(" 1 ")).toBe("1");
    expect(normalizeSeedFlag("")).toBeNull();
    expect(normalizeSeedFlag("   ")).toBeNull();
    expect(normalizeSeedFlag(undefined)).toBeNull();
  });

  it("anything else that is present and non-empty is 'invalid' (never silently 'unset')", () => {
    expect(normalizeSeedFlag("true")).toBe("invalid");
    expect(normalizeSeedFlag("yes")).toBe("invalid");
    expect(normalizeSeedFlag("2")).toBe("invalid");
    expect(normalizeSeedFlag("01")).toBe("invalid");
  });

  it("SEED_DEMO=yes on a demo env is NOT a seed → REFUSE", () => {
    expect(d({ RETENTION_POLICY: "demo", SEED_DEMO: "yes" })).toMatchObject({ action: "refuse" });
  });
});

describe("5. exhaustive matrix (every configuration combination is pinned)", () => {
  const policies: Array<string | undefined> = ["demo", "internal", "pilot", undefined, "totally-bogus"];
  const flags: Array<string | undefined> = ["0", "1", undefined, "", "yes"];

  it("asserts the exact expected action for all 25 (policy × flag) combinations", () => {
    for (const policy of policies) {
      for (const flag of flags) {
        const env: Record<string, string | undefined> = {};
        if (policy !== undefined) env.RETENTION_POLICY = policy;
        if (flag !== undefined) env.SEED_DEMO = flag;
        const r = d(env);
        let expected: "seed" | "skip" | "refuse";
        if (policy === "demo") {
          expected = flag === "0" ? "skip" : flag === "yes" ? "refuse" : "seed"; // yes = invalid value
        } else if (policy === "internal" || policy === "pilot") {
          expected = flag === "0" ? "skip" : "refuse";
        } else {
          expected = "refuse"; // missing/invalid policy → always refuse
        }
        expect(r.action, `RETENTION_POLICY=${JSON.stringify(policy)} SEED_DEMO=${JSON.stringify(flag)}`).toBe(expected);
        expect(r.exitCode, `policy=${JSON.stringify(policy)} flag=${JSON.stringify(flag)}`).toBe(
          r.action === "refuse" ? DEMO_SEED_REFUSE_EXIT : DEMO_SEED_SKIP_EXIT,
        );
      }
    }
  });
});

describe("6. no PHI/secrets in the decision output (alertable strings are safe)", () => {
  it("no DATABASE_URL value ever appears, for ANY (policy × flag) combination", () => {
    const marker = "super-secret-value";
    const url = `postgresql://x:${marker}@10.0.0.9:5432/somepdb`;
    const policies: Array<string | undefined> = ["demo", "internal", "pilot", undefined, "bogus"];
    const flags: Array<string | undefined> = ["0", "1", undefined, "", "yes"];
    for (const policy of policies) {
      for (const flag of flags) {
        const env: Record<string, string | undefined> = { DATABASE_URL: url };
        if (policy !== undefined) env.RETENTION_POLICY = policy;
        if (flag !== undefined) env.SEED_DEMO = flag;
        const wire = JSON.stringify(resolveDemoSeedAction(env));
        expect(wire, `policy=${JSON.stringify(policy)} flag=${JSON.stringify(flag)}`).not.toContain(marker);
        expect(wire).not.toContain("postgresql://");
        expect(wire).not.toContain("10.0.0.9");
      }
    }
  });

  it("reason/warning carry only the two config variables' names/values — nothing else", () => {
    const r = resolveDemoSeedAction({ RETENTION_POLICY: "totally-bogus", SEED_DEMO: "1", SOME_OTHER_SECRET: "x" });
    expect(r.reason).toContain("totally-bogus");
    expect(JSON.stringify(r)).not.toContain("SOME_OTHER_SECRET");
  });
});
