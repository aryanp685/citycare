import { describe, it, expect, afterEach } from "vitest";
import { requestIsHttps, sessionCookieOpts, appendSessionExpiry, scryptCost, hashPassword, verifyPassword, needsRehash } from "../auth";
import { checkOrigin, contentTypeAcceptable } from "../origin";

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

describe("session cookie attributes follow scheme + embedding (A20)", () => {
  it("plain http dev → Lax, not Secure, not Partitioned (even if embedded)", () => {
    for (const embedded of [false, true]) {
      const o = sessionCookieOpts(req("http://localhost:3000/api/auth/login"), { embedded });
      expect(o.sameSite).toBe("lax");
      expect(o.secure).toBe(false);
      expect("partitioned" in o).toBe(false);
      expect(o.httpOnly).toBe(true);
      expect(o.path).toBe("/");
    }
  });
  it("https top-level page → Lax + Secure (strongest CSRF posture, e.g. the Cloudflare deploy)", () => {
    const o = sessionCookieOpts(req("https://citycare.example/api/auth/login"), { embedded: false });
    expect(o.sameSite).toBe("lax");
    expect(o.secure).toBe(true);
    expect("partitioned" in o).toBe(false);
  });
  it("https inside a cross-site iframe → None + Secure + Partitioned", () => {
    const r = req("http://localhost:3000/api/auth/login", { "x-forwarded-proto": "https" });
    expect(requestIsHttps(r)).toBe(true);
    const o = sessionCookieOpts(r, { embedded: true });
    expect(o.sameSite).toBe("none");
    expect(o.secure).toBe(true);
    expect((o as { partitioned?: boolean }).partitioned).toBe(true);
  });
  it("omitting `embedded` behaves like a top-level page", () => {
    expect(sessionCookieOpts(req("https://a/")).sameSite).toBe("lax");
  });
  it("multi-hop x-forwarded-proto uses the FIRST hop (the browser's)", () => {
    expect(requestIsHttps(req("http://x/", { "x-forwarded-proto": "https, http" }))).toBe(true);
    expect(requestIsHttps(req("http://x/", { "x-forwarded-proto": "http, https" }))).toBe(false);
  });
  it("never emits SameSite=None without Secure (browsers drop that combination)", () => {
    for (const r of [req("http://a/"), req("https://a/"), req("http://a/", { "x-forwarded-proto": "https" })]) {
      for (const embedded of [false, true]) {
        const o = sessionCookieOpts(r, { embedded });
        if (o.sameSite === "none") expect(o.secure).toBe(true);
      }
    }
  });
  it("appendSessionExpiry kills BOTH cookie shapes over https, one over http", () => {
    const https = new Response(null);
    appendSessionExpiry(https, req("https://a/api/auth/logout"));
    const sc = https.headers.getSetCookie();
    expect(sc).toHaveLength(2);
    expect(sc.every((c) => c.startsWith("cc_session=;") && /Max-Age=0/.test(c) && /HttpOnly/.test(c))).toBe(true);
    expect(sc.some((c) => /SameSite=Lax; Secure/.test(c))).toBe(true);
    expect(sc.some((c) => /SameSite=None; Secure; Partitioned/.test(c))).toBe(true);
    const http = new Response(null);
    appendSessionExpiry(http, req("http://localhost:3000/api/auth/logout"));
    expect(http.headers.getSetCookie()).toEqual(["cc_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"]);
  });
});

describe("scrypt cost knob (Cloudflare free plan has a 10 ms CPU budget)", () => {
  const saved = process.env.SCRYPT_N;
  afterEach(() => { if (saved === undefined) delete process.env.SCRYPT_N; else process.env.SCRYPT_N = saved; });
  it("defaults to 2^14", () => {
    delete process.env.SCRYPT_N;
    expect(scryptCost()).toBe(131072);
  });
  it("accepts a power of two ≥ 1024 and embeds it in the hash", async () => {
    process.env.SCRYPT_N = "4096";
    expect(scryptCost()).toBe(4096);
    const h = await hashPassword("city1234xx");
    expect(h.startsWith("scrypt$4096$8$1$")).toBe(true);
    expect(await verifyPassword("city1234xx", h)).toBe(true);
    expect(await verifyPassword("city1234xy", h)).toBe(false);
  });
  it("a hash made at one cost still verifies after the knob changes (cost lives in the hash)", async () => {
    process.env.SCRYPT_N = "2048";
    const h = await hashPassword("city1234xx");
    process.env.SCRYPT_N = "131072";
    expect(await verifyPassword("city1234xx", h)).toBe(true);
  });
  it("D2: hashing is async — the event loop keeps ticking while scrypt runs", async () => {
    process.env.SCRYPT_N = "131072";
    let ticks = 0;
    const t = setInterval(() => { ticks++; }, 5);
    await hashPassword("city1234xx");
    clearInterval(t);
    expect(ticks).toBeGreaterThan(0); // a blocking scryptSync would have starved the timer
  });
  it("never accepts the '!' sentinel used for erased accounts and dependents", async () => {
    expect(await verifyPassword("anything", "!")).toBe(false);
  });
  it("refuses silently-weak or garbage values and falls back to the default", () => {
    for (const bad of ["512", "3000", "abc", "0", "-4096", "2097152"]) {
      process.env.SCRYPT_N = bad;
      expect(scryptCost()).toBe(131072);
    }
  });
});

describe("origin guard is proxy-aware (A21) and labels errors correctly (A22)", () => {
  const pub = "3000-abc.e2b.app";
  it("no Origin header → absent (allowed)", () => {
    expect(checkOrigin(null, "localhost:3000", null)).toBe("absent");
  });
  it("Origin matches Host → ok", () => {
    expect(checkOrigin("http://localhost:3000", "localhost:3000", null)).toBe("ok");
  });
  it("public Origin + internal Host + X-Forwarded-Host → ok (the preview/proxy case)", () => {
    expect(checkOrigin(`https://${pub}`, "localhost:3000", pub)).toBe("ok");
  });
  it("X-Forwarded-Host with multiple hops uses the first", () => {
    expect(checkOrigin(`https://${pub}`, "localhost:3000", `${pub}, internal-lb`)).toBe("ok");
  });
  it("genuinely foreign Origin → mismatch, NOT malformed", () => {
    expect(checkOrigin("https://evil.example", pub, pub)).toBe("mismatch");
  });
  it("Origin: null (sandboxed iframe / privacy mode) → malformed → refused", () => {
    expect(checkOrigin("null", pub, pub)).toBe("malformed");
  });
  it("port matters: same hostname on another port is a different origin", () => {
    expect(checkOrigin("http://localhost:4000", "localhost:3000", null)).toBe("mismatch");
  });
  it("forwarded host cannot be spoofed to bypass: attacker's Origin still has to equal it", () => {
    // an attacker controls Origin (their page) but not what OUR proxy puts in X-Forwarded-Host
    expect(checkOrigin("https://evil.example", pub, pub)).toBe("mismatch");
  });
});

describe("content-type belt (forms cannot send JSON)", () => {
  it("json ok, with or without charset", () => {
    expect(contentTypeAcceptable("application/json")).toBe(true);
    expect(contentTypeAcceptable("application/json; charset=utf-8")).toBe(true);
    expect(contentTypeAcceptable("Application/JSON")).toBe(true);
  });
  it("no body / no header ok (fetch POST without body, e.g. logout)", () => {
    expect(contentTypeAcceptable(null)).toBe(true);
  });
  it("every enctype an HTML form can produce is refused", () => {
    expect(contentTypeAcceptable("application/x-www-form-urlencoded")).toBe(false);
    expect(contentTypeAcceptable("multipart/form-data; boundary=x")).toBe(false);
    expect(contentTypeAcceptable("text/plain")).toBe(false);
  });
});

describe("needsRehash (A39: transparent upgrade of weaker hashes)", () => {
  it("flags a hash made at a lower N than today's default, accepts one at the default", async () => {
    const prev = process.env.SCRYPT_N;
    process.env.SCRYPT_N = "4096";
    const weak = await hashPassword("city1234");
    delete process.env.SCRYPT_N;
    expect(await verifyPassword("city1234", weak)).toBe(true);   // old hashes keep working…
    expect(needsRehash(weak)).toBe(true);                   // …but are marked for upgrade
    expect(needsRehash(await hashPassword("city1234"))).toBe(false);
    expect(needsRehash("bcrypt$whatever")).toBe(true);      // unknown format → always upgrade
    if (prev !== undefined) process.env.SCRYPT_N = prev;
  });
  it("refuses a hostile N instead of allocating gigabytes", async () => {
    await expect(verifyPassword("x", "scrypt$1073741824$8$1$AAAA$AAAA")).resolves.toBe(false);
  });
});
