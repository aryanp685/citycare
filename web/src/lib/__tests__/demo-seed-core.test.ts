// Day 2 (NG-S14) — the demo-seed gate: the single decision point that controls whether
// scripts/seed.mjs (the ONLY code that creates demo accounts) may run in an environment.
// STRICTLY FAIL-CLOSED revision (2026-11-02 final security correction): the only path that
// creates demo accounts is RETENTION_POLICY=demo with SEED_DEMO unset or exactly "1".
// A missing/invalid RETENTION_POLICY refuses regardless of SEED_DEMO; an invalid
// SEED_DEMO value refuses. Review F3 (2026-11-02): the matrix below pins the
// policy×flag dimension in a DECLARED execution context (SEED_CONTEXT=ci); the
// missing/unknown-context dimension (direct invocations) is pinned in block 8.
// (The older rows without a context declaration were updated to declare one —
// the assertions are unchanged.) Pins the full config matrix below.
import { describe, it, expect } from "vitest";
import {
  resolveDemoSeedAction,
  normalizeSeedFlag,
  DEMO_SEED_SKIP_EXIT,
  DEMO_SEED_REFUSE_EXIT,
} from "../demo-seed-core.mjs";

const d = (env: Record<string, string | undefined>) => resolveDemoSeedAction(env);
// FINAL REVIEW (2026-11-02): the identity gate requires a same-machine (loopback) destination for a seed decision.
const LOOP_URL = "postgresql://demo:demopw@127.0.0.1:5432/citycare_local";

describe("1. demo environment (RETENTION_POLICY=demo)", () => {
  it("seeds by default (SEED_DEMO unset) — backward-compatible synthetic-demo behaviour", () => {
    expect(d({ RETENTION_POLICY: "demo", SEED_CONTEXT: "ci", DATABASE_URL: LOOP_URL })).toMatchObject({ action: "seed", exitCode: DEMO_SEED_SKIP_EXIT, warning: null });
  });

  it("seeds with explicit SEED_DEMO=1", () => {
    expect(d({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "ci", DATABASE_URL: LOOP_URL })).toMatchObject({ action: "seed" });
  });

  it("SKIPS (exit 0, nothing written) when SEED_DEMO=0", () => {
    expect(d({ RETENTION_POLICY: "demo", SEED_DEMO: "0", SEED_CONTEXT: "ci" })).toMatchObject({ action: "skip", exitCode: DEMO_SEED_SKIP_EXIT });
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
    expect(d({ RETENTION_POLICY: "pilot", SEED_DEMO: "0", SEED_CONTEXT: "ci" })).toMatchObject({ action: "skip" });
  });

  it("internal (production-grade) + SEED_DEMO=0 → skip", () => {
    expect(d({ RETENTION_POLICY: "internal", SEED_DEMO: "0", SEED_CONTEXT: "ci" })).toMatchObject({ action: "skip" });
  });

  it("pilot + SEED_DEMO=1 → REFUSE (contradiction: demo accounts requested on real data)", () => {
    const r = d({ RETENTION_POLICY: "pilot", SEED_DEMO: "1", SEED_CONTEXT: "ci" });
    expect(r.action).toBe("refuse");
    expect(r.exitCode).toBe(DEMO_SEED_REFUSE_EXIT);
    expect(r.reason).toContain("contradictory");
    expect(r.reason).toContain("pilot");
  });

  it("pilot + SEED_DEMO unset → REFUSE (fail-safe default: must be explicit)", () => {
    expect(d({ RETENTION_POLICY: "pilot", SEED_CONTEXT: "ci" })).toMatchObject({ action: "refuse", exitCode: DEMO_SEED_REFUSE_EXIT });
  });

  it("internal (production-grade) + any SEED_DEMO ≠ 0 → REFUSE", () => {
    expect(d({ RETENTION_POLICY: "internal", SEED_CONTEXT: "ci" })).toMatchObject({ action: "refuse" });
    expect(d({ RETENTION_POLICY: "internal", SEED_DEMO: "1", SEED_CONTEXT: "ci" })).toMatchObject({ action: "refuse" });
  });

  it("real-data env + invalid SEED_DEMO value → REFUSE", () => {
    expect(d({ RETENTION_POLICY: "pilot", SEED_DEMO: "yes", SEED_CONTEXT: "ci" })).toMatchObject({ action: "refuse" });
    expect(d({ RETENTION_POLICY: "internal", SEED_DEMO: "2", SEED_CONTEXT: "ci" })).toMatchObject({ action: "refuse" });
  });
});

describe("3. unverified environment (missing/invalid RETENTION_POLICY) — strictly fail-closed", () => {
  it("SEED_DEMO unset → REFUSE (the environment was not verified as a demo env)", () => {
    expect(d({})).toMatchObject({ action: "refuse", exitCode: DEMO_SEED_REFUSE_EXIT });
    expect(d({ RETENTION_POLICY: "totally-bogus" })).toMatchObject({ action: "refuse" });
  });

  it("SEED_DEMO=1 → REFUSE (a missing/invalid policy NEVER seeds, even when explicitly requested)", () => {
    const missing = d({ RETENTION_POLICY: undefined, SEED_DEMO: "1", SEED_CONTEXT: "ci" });
    expect(missing).toMatchObject({ action: "refuse", exitCode: DEMO_SEED_REFUSE_EXIT });
    expect(missing.reason).toContain("missing/invalid");
    const invalid = d({ RETENTION_POLICY: "totally-bogus", SEED_DEMO: "1", SEED_CONTEXT: "ci" });
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
    expect(d({ RETENTION_POLICY: "demo", SEED_DEMO: "yes", SEED_CONTEXT: "ci" })).toMatchObject({ action: "refuse" });
  });
});

describe("5. exhaustive matrix (every configuration combination is pinned)", () => {
  const policies: Array<string | undefined> = ["demo", "internal", "pilot", undefined, "totally-bogus"];
  const flags: Array<string | undefined> = ["0", "1", undefined, "", "yes"];

  it("asserts the exact expected action for all 25 (policy × flag) combinations", () => {
    for (const policy of policies) {
      for (const flag of flags) {
        const env: Record<string, string | undefined> = { SEED_CONTEXT: "ci", DATABASE_URL: LOOP_URL }; // context declared; pinned separately in block 8; loopback destination for the seed rows
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
    const r = resolveDemoSeedAction({ RETENTION_POLICY: "totally-bogus", SEED_DEMO: "1", SEED_CONTEXT: "ci", SOME_OTHER_SECRET: "x" });
    expect(r.reason).toContain("totally-bogus");
    expect(JSON.stringify(r)).not.toContain("SOME_OTHER_SECRET");
  });
});
// R1 (2026-11-02, P0 isolation remediation): a PRODUCTION target may never
// demo-seed, whatever RETENTION_POLICY says. The only skip is SEED_DEMO=0 on a
// VERIFIED policy; SEED_DEMO=1 / unset / invalid — and any unverified policy —
// refuse. This closes the seed dimension of the shared-credential hole at its
// own chokepoint (incl. direct bootstrap runs, not just builds).
describe("7. production target (VERCEL_ENV=production) — seeding is impossible", () => {
  it("production + RETENTION_POLICY=demo + SEED_DEMO=0 → skip (explicit opt-out acknowledged)", () => {
    expect(d({ VERCEL_ENV: "production", RETENTION_POLICY: "demo", SEED_DEMO: "0" })).toMatchObject({
      action: "skip",
      exitCode: DEMO_SEED_SKIP_EXIT,
    });
  });

  it("production + real-data policy + SEED_DEMO=0 → skip (pilot/internal)", () => {
    for (const policy of ["pilot", "internal"]) {
      expect(d({ VERCEL_ENV: "production", RETENTION_POLICY: policy, SEED_DEMO: "0" }).action, policy).toBe("skip");
    }
  });

  it("production + SEED_DEMO=1 REFUSES regardless of RETENTION_POLICY (demo or real-data)", () => {
    for (const policy of ["demo", "pilot", "internal"]) {
      const r = d({ VERCEL_ENV: "production", RETENTION_POLICY: policy, SEED_DEMO: "1" });
      expect(r.action, `policy=${policy}`).toBe("refuse");
      expect(r.exitCode).toBe(DEMO_SEED_REFUSE_EXIT);
    }
  });

  it("production + SEED_DEMO UNSET refuses (the demo-default must never auto-seed a production build)", () => {
    for (const policy of ["demo", "pilot", "internal"]) {
      expect(d({ VERCEL_ENV: "production", RETENTION_POLICY: policy }).action, `policy=${policy}`).toBe("refuse");
    }
  });

  it("production + invalid SEED_DEMO refuses (never guessed)", () => {
    for (const bad of ["2", "true", "on", "01"]) {
      expect(d({ VERCEL_ENV: "production", RETENTION_POLICY: "demo", SEED_DEMO: bad }).action, bad).toBe("refuse");
    }
  });

  it("production + unverified RETENTION_POLICY refuses even with SEED_DEMO=0 (an unverified env refuses loudly)", () => {
    for (const policy of [undefined, "bogus", ""]) {
      const env: Record<string, string | undefined> = { VERCEL_ENV: "production", SEED_DEMO: "0" };
      if (policy !== undefined) env.RETENTION_POLICY = policy;
      expect(resolveDemoSeedAction(env).action, `policy=${JSON.stringify(policy)}`).toBe("refuse");
    }
  });

  it("normalizes case (PRODUCTION) — still refuses SEED_DEMO=1", () => {
    expect(d({ VERCEL_ENV: "PRODUCTION", RETENTION_POLICY: "demo", SEED_DEMO: "1" }).action).toBe("refuse");
    expect(d({ VERCEL_ENV: "PRODUCTION", RETENTION_POLICY: "demo", SEED_DEMO: "0" }).action).toBe("skip");
  });

  it("the production rule never leaks the environment beyond the config variables' names/values", () => {
    const r = resolveDemoSeedAction({
      VERCEL_ENV: "production",
      RETENTION_POLICY: "demo",
      SEED_DEMO: "1",
      DATABASE_URL: "postgresql://leak-me:leak@10.0.0.8:5432/x",
    });
    const wire = JSON.stringify(r);
    expect(wire).not.toContain("leak-me");
    expect(wire).not.toContain("10.0.0.8");
    expect(wire).not.toContain("postgresql://");
  });
});

// R1 review F3 (2026-11-02 request-changes): a MISSING/UNKNOWN execution context
// (VERCEL_ENV absent or not production|preview|development) identifies a DIRECT
// invocation (npm run seed / bootstrap / manual) that may be pointed at ANY
// database — including production. Such a run may seed ONLY with a declared
// isolated demo context (SEED_CONTEXT=ci|local-demo); production environments
// never set SEED_CONTEXT, so a direct production-shaped run can neither seed nor
// truncate. The e2e regression (18.19) proves this on a real database.
describe("8. unverified execution context (missing/unknown VERCEL_ENV) — fail closed for direct seed paths", () => {
  it("no context + no VERCEL_ENV: NEVER seeds — demo config refuses (the exact production-shaped direct-run hole)", () => {
    for (const [label, env] of [
      ["demo, SEED_DEMO unset", { RETENTION_POLICY: "demo" }],
      ["demo, SEED_DEMO=1", { RETENTION_POLICY: "demo", SEED_DEMO: "1" }],
      ["demo, SEED_DEMO=0 (refuses loudly — even a no-op skip declares the context)", { RETENTION_POLICY: "demo", SEED_DEMO: "0" }],
      ["pilot, SEED_DEMO=0", { RETENTION_POLICY: "pilot", SEED_DEMO: "0" }],
      ["missing policy, SEED_DEMO=1", { SEED_DEMO: "1" }],
    ] as Array<[string, Record<string, string | undefined>]>) {
      const r = resolveDemoSeedAction(env);
      expect(r.action, label).toBe("refuse");
      expect(r.exitCode, label).toBe(DEMO_SEED_REFUSE_EXIT);
      expect(r.reason, label).toContain("unverified execution context");
    }
  });

  it("no context + unknown non-empty VERCEL_ENV (ci, staging, prod): also refuses", () => {
    for (const v of ["ci", "staging", "prod", "test"]) {
      const r = resolveDemoSeedAction({ VERCEL_ENV: v, RETENTION_POLICY: "demo", SEED_DEMO: "1" });
      expect(r.action, v).toBe("refuse");
      expect(r.reason, v).toContain("unverified execution context");
    }
  });

  it("SEED_CONTEXT=ci restores the isolated CI seeding workflow (existing matrix intact)", () => {
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_CONTEXT: "ci", DATABASE_URL: LOOP_URL })).toMatchObject({ action: "seed" });
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "ci", DATABASE_URL: LOOP_URL })).toMatchObject({ action: "seed" });
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "0", SEED_CONTEXT: "ci" })).toMatchObject({ action: "skip" });
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "pilot", SEED_DEMO: "0", SEED_CONTEXT: "ci" })).toMatchObject({ action: "skip" });
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "pilot", SEED_DEMO: "1", SEED_CONTEXT: "ci" })).toMatchObject({ action: "refuse" });
  });

  it("SEED_CONTEXT=local-demo restores the explicit local dev seeding flow", () => {
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "local-demo", DATABASE_URL: LOOP_URL })).toMatchObject({ action: "seed" });
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "0", SEED_CONTEXT: "local-demo" })).toMatchObject({ action: "skip" });
  });

  it("an INVALID SEED_CONTEXT refuses (closed set: ci | local-demo — never guessed)", () => {
    for (const bad of ["production", "staging", "demo", "1", "on"]) {
      const r = resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: bad });
      expect(r.action, `SEED_CONTEXT=${JSON.stringify(bad)}`).toBe("refuse");
    }
  });

  it("SEED_CONTEXT is trim/case-normalised like the SEED_DEMO flag (block 4 convention)", () => {
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "ci ", DATABASE_URL: LOOP_URL })).toMatchObject({ action: "seed" });
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: " LOCAL-DEMO ", DATABASE_URL: LOOP_URL })).toMatchObject({ action: "seed" });
  });

  it("the production target rule is UNAFFECTED by context (production refuses even with SEED_CONTEXT=ci)", () => {
    const r = resolveDemoSeedAction({ VERCEL_ENV: "production", RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "ci" });
    expect(r.action).toBe("refuse");
    expect(r.reason).toContain("VERCEL_ENV=production");
  });

  it("known non-production targets (preview/development) stay explicit declarations — no context needed", () => {
    expect(resolveDemoSeedAction({ VERCEL_ENV: "preview", RETENTION_POLICY: "demo", DATABASE_URL: LOOP_URL })).toMatchObject({ action: "seed" });
    expect(resolveDemoSeedAction({ VERCEL_ENV: "development", RETENTION_POLICY: "demo", SEED_DEMO: "0" })).toMatchObject({ action: "skip" });
  });

  it("the refusal reason carries only config variable names/values — no URLs or other env", () => {
    const r = resolveDemoSeedAction({
      RETENTION_POLICY: "demo",
      SEED_DEMO: "1",
      DATABASE_URL: "postgresql://leak-f3:leak@10.0.0.7:5432/x",
      MIGRATION_DATABASE_URL: "postgresql://leak2:leak@10.0.0.8:5432/y",
    });
    const wire = JSON.stringify(r);
    expect(wire).not.toContain("leak-f3");
    expect(wire).not.toContain("10.0.0.7");
    expect(wire).not.toContain("10.0.0.8");
    expect(wire).not.toContain("postgresql://");
  });
});

// FINAL REVIEW (2026-11-02) — the destination IDENTITY gate. The owner's adversarial
// scenario: VERCEL_ENV missing + SEED_CONTEXT=local-demo + RETENTION_POLICY=demo +
// SEED_DEMO=1 + FORCE_SEED=1 + DATABASE_URL pointing at a PRODUCTION (remote) database.
// SEED_CONTEXT is caller-controlled — it is a self-attested label, NOT proof of
// database identity. A seed decision (the only path that reaches TRUNCATE) therefore
// additionally requires the destination to be a same-machine (loopback) database,
// established from the URL itself. Remote/unknown destinations fail closed.
describe("9. destination identity gate — a declared context never overrides database identity", () => {
  const PROD_URL = "postgresql://prod-owner:prod-pw@db-prod-1.neon-sim.tech:5432/citycare";

  it("THE OWNER'S ADVERSARIAL SCENARIO: no VERCEL_ENV + SEED_CONTEXT=local-demo + demo policy + SEED_DEMO=1 + production-shaped URL → REFUSE (no TRUNCATE)", () => {
    const r = resolveDemoSeedAction({
      RETENTION_POLICY: "demo",
      SEED_DEMO: "1",
      SEED_CONTEXT: "local-demo",
      FORCE_SEED: "1",
      DATABASE_URL: PROD_URL,
    });
    expect(r).toMatchObject({ action: "refuse", exitCode: DEMO_SEED_REFUSE_EXIT });
    expect(r.reason).toContain("NOT a same-machine (loopback) database");
    expect(r.reason).toContain("db-prod-1.neon-sim.tech"); // host recorded — the identity that was checked
    expect(r.reason).toContain("SEED_CONTEXT");
    expect(r.reason).toContain("never overrides database identity");
  });

  it("a CI context (the declared isolated workflow label) CANNOT override a production-shaped destination", () => {
    const r = resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "ci", DATABASE_URL: PROD_URL });
    expect(r.action).toBe("refuse");
    expect(r.reason).toContain("NOT a same-machine (loopback) database");
  });

  it("FORCE_SEED=1 cannot force a seed on a non-loopback destination (the core never reads FORCE_SEED)", () => {
    const r = resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "local-demo", FORCE_SEED: "1", DATABASE_URL: PROD_URL });
    expect(r.action).toBe("refuse");
  });

  it("unknown VERCEL_ENV (prod/staging) + a DECLARED context + production-shaped URL → still REFUSE (target declaration doesn't help identity)", () => {
    for (const v of ["prod", "staging"]) {
      const r = resolveDemoSeedAction({ VERCEL_ENV: v, RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "local-demo", DATABASE_URL: PROD_URL });
      expect(r.action, v).toBe("refuse");
      expect(r.reason, v).toContain("NOT a same-machine (loopback) database");
    }
  });

  it("missing VERCEL_ENV + production-shaped URL + NO context → refuses (the context rule fires first — either way refused)", () => {
    const r = resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", DATABASE_URL: PROD_URL });
    expect(r.action).toBe("refuse");
    expect(r.reason).toContain("unverified execution context");
  });

  it("the VERIFIED isolated flows still seed: loopback + local-demo (local dev) and loopback + ci (CI scratch)", () => {
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "local-demo", DATABASE_URL: "postgresql://citycare:citycare@127.0.0.1:5432/citycare" })).toMatchObject({ action: "seed" });
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "ci", DATABASE_URL: "postgresql://citycare:citycare@localhost:5432/citycare_e2e_ci" })).toMatchObject({ action: "seed" });
    expect(resolveDemoSeedAction({ VERCEL_ENV: "development", RETENTION_POLICY: "demo", SEED_DEMO: "1", DATABASE_URL: "postgresql://citycare:citycare@localhost:5432/citycare" })).toMatchObject({ action: "seed" });
    expect(resolveDemoSeedAction({ VERCEL_ENV: "preview", RETENTION_POLICY: "demo", SEED_DEMO: "1", DATABASE_URL: "postgresql://x:x@127.0.0.1:5432/db" })).toMatchObject({ action: "seed" });
  });

  it("all loopback spellings are same-machine (127.0.0.1 / localhost / ::1 / 0.0.0.0, case-insensitive host)", () => {
    for (const host of ["127.0.0.1", "localhost", "[::1]", "0.0.0.0"]) { // IPv6 = bracketed per URL spec
      expect(resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "local-demo", DATABASE_URL: `postgresql://u:p@${host}:5432/db` }).action, host).toBe("seed");
    }
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "local-demo", DATABASE_URL: "postgresql://u:p@LOCALHOST:5432/db" }).action).toBe("seed");
  });

  it("an identity that CANNOT be established fails closed: missing DATABASE_URL or unparseable URL → REFUSE (never seed on an unknown destination)", () => {
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "ci" })).toMatchObject({ action: "refuse" });
    const missing = resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "ci" });
    expect(missing.reason).toContain("CANNOT be established");
    const unparseable = resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "ci", DATABASE_URL: "not a url" });
    expect(unparseable).toMatchObject({ action: "refuse" });
    expect(unparseable.reason).toContain("CANNOT be established");
  });

  it("a skip is unaffected by the destination identity (SEED_DEMO=0 writes nothing, so the identity gate does not block skips)", () => {
    expect(resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "0", SEED_CONTEXT: "ci", DATABASE_URL: PROD_URL })).toMatchObject({ action: "skip" });
  });

  it("the production TARGET rule still fires first and is unchanged (refuses even a loopback demo config on production)", () => {
    const r = resolveDemoSeedAction({ VERCEL_ENV: "production", RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "ci", DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/db" });
    expect(r.action).toBe("refuse");
    expect(r.reason).toContain("VERCEL_ENV=production");
  });

  it("no credentials leak: the identity refusal carries the host, never the username/password/URL", () => {
    const r = resolveDemoSeedAction({ RETENTION_POLICY: "demo", SEED_DEMO: "1", SEED_CONTEXT: "local-demo", DATABASE_URL: PROD_URL });
    const wire = JSON.stringify(r);
    expect(wire).toContain("db-prod-1.neon-sim.tech");
    expect(wire).not.toContain("prod-owner");
    expect(wire).not.toContain("prod-pw");
    expect(wire).not.toContain("postgresql://");
    expect(wire).not.toContain("neon-sim.tech:5432");
  });
});
