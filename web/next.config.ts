import type { NextConfig } from "next";

// Framing is OFF by default. The only place CityCare is legitimately shown inside an
// iframe is the sandbox preview (ALLOW_EMBED=1 in that .env.local). On a public deployment
// an embeddable consent screen is a clickjacking target (attacker frames /patient/access,
// overlays a fake button, patient "allows" a request they never saw). Bug A37.
// NB: next.config headers are compiled into routes-manifest.json at BUILD time — the env
// must be present when `next build` runs, not only at `next start`.
const allowEmbed = process.env.ALLOW_EMBED === "1";
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(allowEmbed
    ? []
    : [
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },

  // The sandbox preview proxies this dev server under a *.e2b.app host;
  // Next 16 blocks cross-origin dev requests unless allowed explicitly.
  allowedDevOrigins: ["*.e2b.app", "*.localhost"],

  // Cloudflare (OpenNext): `pg` loads `pg-cloudflare` only under the `workerd`
  // export condition. Next's file tracing resolves it with the *default* condition
  // (→ dist/empty.js), so the real socket implementation never reaches the
  // bundle and the Worker build fails with "Could not resolve pg-cloudflare".
  // Force the whole package into every route's trace. (Bug A25)
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/pg-cloudflare/**/*"],
  },
};

export default nextConfig;
