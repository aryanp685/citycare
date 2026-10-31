import { describe, it, expect } from "vitest";
import { windowStart, BUCKETS, clientIp } from "../ratelimit";

describe("rate limit windows (D8)", () => {
  it("aligns to the window boundary so a burst cannot straddle two half-windows for double quota", () => {
    const w = 600; // 10 min
    const t = Date.UTC(2026, 8, 29, 10, 7, 33);
    const start = windowStart(t, w);
    expect(start).toBe(Date.UTC(2026, 8, 29, 10, 0, 0));
    expect(windowStart(start + w * 1000 - 1, w)).toBe(start);
    expect(windowStart(start + w * 1000, w)).toBe(start + w * 1000);
  });
  it("buckets are sane: every limit positive, windows ≤ 1 h so the daily prune is enough", () => {
    for (const b of Object.values(BUCKETS)) {
      expect(b.limit).toBeGreaterThan(0);
      expect(b.windowSec).toBeGreaterThan(0);
      expect(b.windowSec).toBeLessThanOrEqual(3600);
    }
    expect(BUCKETS.login.limit).toBeGreaterThanOrEqual(5 * 5); // ≥ 5 users × 5 attempts behind one campus NAT
  });
  it("clientIp prefers the first x-forwarded-for hop and falls back to a fixed local key", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }))).toBe("203.0.113.9");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "198.51.100.4" } }))).toBe("198.51.100.4");
    expect(clientIp(new Request("http://x"))).toBe("local");
  });
});
