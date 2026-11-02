import { describe, it, expect } from "vitest";
import { evaluateRetentionPolicy, RETENTION_POLICIES } from "../retention-core.mjs";

// NG-S15 — the retention-sweep policy gate. The daily cron erases self-registered
// accounts older than DEMO_RETENTION_DAYS. That is correct for the public demo but FATAL
// for a pilot/internal deployment reusing this code. This is the pure decision that the
// cron consults; the e2e suite (section 15) exercises it against a real DB + real cron.
//
// The five acceptance behaviours, at the decision level:
//   1. demo sweep works            → demo + banner on  ⇒ enabled
//   2. real-mode account survives  → internal/pilot    ⇒ disabled (sweep never runs)
//   3. missing config fails safe   → (no policy)       ⇒ disabled + warning
//   4. health policy w/o secrets   → safe fields only, no env free-text
//   5. regression                  → contradictory/invalid ⇒ disabled, never enabled

describe("retention-core RETENTION_POLICIES", () => {
  it("is exactly the three declared policies and is frozen", () => {
    expect([...RETENTION_POLICIES].sort()).toEqual(["demo", "internal", "pilot"]);
    expect(Object.isFrozen(RETENTION_POLICIES)).toBe(true);
  });
});

describe("1. demo sweep works", () => {
  it("demo policy with the banner on ⇒ sweep enabled, reason ok", () => {
    const r = evaluateRetentionPolicy({ RETENTION_POLICY: "demo" });
    expect(r).toEqual({ policy: "demo", enabled: true, reason: "ok", warning: null });
  });

  it("is case/whitespace tolerant for the demo policy", () => {
    const r = evaluateRetentionPolicy({ RETENTION_POLICY: "  DEMO  " });
    expect(r.enabled).toBe(true);
    expect(r.policy).toBe("demo");
    expect(r.reason).toBe("ok");
  });
});

describe("2. real-mode account survives (sweep must not run)", () => {
  it("internal policy ⇒ disabled regardless of banner", () => {
    for (const banner of [undefined, "1", "0"]) {
      const r = evaluateRetentionPolicy({ RETENTION_POLICY: "internal", NEXT_PUBLIC_DEMO_MODE: banner });
      expect(r.enabled, `banner=${banner}`).toBe(false);
      expect(r.reason).toBe("policy_disables_sweep");
      expect(r.policy).toBe("internal");
    }
  });

  it("pilot policy ⇒ disabled regardless of banner", () => {
    for (const banner of [undefined, "1", "0"]) {
      const r = evaluateRetentionPolicy({ RETENTION_POLICY: "pilot", NEXT_PUBLIC_DEMO_MODE: banner });
      expect(r.enabled, `banner=${banner}`).toBe(false);
      expect(r.reason).toBe("policy_disables_sweep");
      expect(r.policy).toBe("pilot");
    }
  });
});

describe("3. missing config fails safe", () => {
  it("no RETENTION_POLICY ⇒ disabled + a loud warning (the safe default)", () => {
    const r = evaluateRetentionPolicy({});
    expect(r.enabled).toBe(false);
    expect(r.policy).toBeNull();
    expect(r.reason).toBe("missing_policy");
    expect(r.warning).toMatch(/RETENTION_POLICY is not set/);
    expect(r.warning).toMatch(/DISABLED \(fail-safe\)/);
  });

  it("empty/whitespace-only RETENTION_POLICY ⇒ treated as missing", () => {
    expect(evaluateRetentionPolicy({ RETENTION_POLICY: "   " }).reason).toBe("missing_policy");
    expect(evaluateRetentionPolicy({ RETENTION_POLICY: "" }).enabled).toBe(false);
  });

  it("non-string RETENTION_POLICY ⇒ treated as missing, never throws", () => {
    expect(evaluateRetentionPolicy({ RETENTION_POLICY: undefined }).enabled).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(evaluateRetentionPolicy({ RETENTION_POLICY: 7 as any }).enabled).toBe(false);
  });
});

describe("4. health policy without secrets", () => {
  it("exposes only safe enum fields; policy/enabled/reason carry no env free-text", () => {
    for (const env of [
      { RETENTION_POLICY: "demo" },
      { RETENTION_POLICY: "pilot" },
      { RETENTION_POLICY: "totally-bogus-value" },
      {},
    ]) {
      const r = evaluateRetentionPolicy(env);
      // The three fields an endpoint may expose are constrained to safe values.
      expect(["ok", "missing_policy", "invalid_policy", "contradictory_policy", "policy_disables_sweep"]).toContain(r.reason);
      expect(r.policy === null || RETENTION_POLICIES.includes(r.policy)).toBe(true);
      expect(typeof r.enabled).toBe("boolean");
    }
  });

  it("a bogus policy value is NOT echoed into the safe `policy` field (stays null)", () => {
    const r = evaluateRetentionPolicy({ RETENTION_POLICY: "super-secret-marker-XYZ" });
    expect(r.policy).toBeNull();
    expect(r.reason).toBe("invalid_policy");
    // The raw value only ever appears in `warning` (console), never in the safe `policy` field.
    expect(JSON.stringify(r.policy)).not.toContain("super-secret-marker-XYZ");
  });
});

describe("5. regression (contradictory / invalid never enable the sweep)", () => {
  it("demo policy on a non-demo-presented deployment ⇒ contradictory ⇒ disabled", () => {
    const r = evaluateRetentionPolicy({ RETENTION_POLICY: "demo", NEXT_PUBLIC_DEMO_MODE: "0" });
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe("contradictory_policy");
    expect(r.warning).toMatch(/contradiction/);
  });

  it("an invalid policy value ⇒ disabled, never enabled", () => {
    const r = evaluateRetentionPolicy({ RETENTION_POLICY: "banana" });
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe("invalid_policy");
    expect(r.warning).toMatch(/must be one of: demo, internal, pilot/);
  });

  it("no input combination can enable the sweep except demo + banner-on", () => {
    const allPolicies = ["demo", "internal", "pilot", "", "banana", "Demo", " DEMO "];
    const allBanners = [undefined, "0", "1", ""];
    let sawEnabled = false;
    for (const p of allPolicies) {
      for (const b of allBanners) {
        const r = evaluateRetentionPolicy(
          b === undefined ? { RETENTION_POLICY: p } : { RETENTION_POLICY: p, NEXT_PUBLIC_DEMO_MODE: b },
        );
        if (r.enabled) {
          sawEnabled = true;
          // The ONLY enabling path is a clean demo declaration with the banner on.
          expect(p.trim().toLowerCase()).toBe("demo");
          expect(b !== "0").toBe(true);
        }
      }
    }
    expect(sawEnabled).toBe(true); // the demo+banner-on case did enable
  });
});
