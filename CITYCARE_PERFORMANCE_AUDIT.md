# CityCare — Performance & Scalability Audit (Step 1)

_Audited 2026-11-01. Measurements are from the sandbox (2 vCPU-class box, embedded Postgres
18.6, production build `next start`). Production (Vercel sin1 + Neon) figures are marked
NOT VERIFIED (no egress to `*.vercel.app` from this sandbox)._

## 1. Measured today (real numbers)

| Metric | Value | How |
|---|---|---|
| `npx vitest run` | 162 tests, 18 files — pass in ~5 s | run today |
| `npx tsc --noEmit` (TS 7 native) | clean, ~1.5 s | run today |
| `next build` (NODE_OPTIONS heap 1150 MB) | clean, ~29 s, `BUILD_ID` present | run today |
| `next start` boot | Ready in ~160 ms | start_process log |
| e2e full suite (241 HTTP checks, prod server, warm) | **~18 s** total (~75 ms/check avg) | run today |
| Server RSS after full e2e | ~160 MB (A24: dev server is ~1.5 GB — prod build is 10× leaner) | A24 measurement, consistent with observed footprint |
| Build artifact total (`.next/static/chunks`) | ~1.1 MB raw; largest chunk 229 KB (landing, incl. GSAP) | `ls .next` |
| Landing animation payload | GSAP + plugins ≈ +97 KB **gzip** over app baseline, landing-only route | D35 measurement |
| `/api/health` (DB round trip incl. `ledger_verify()`) | < 100 ms on warm local DB (probe) | probe today |
| Login (scrypt N=2¹⁷) | ~430 ms CPU in sandbox (A39) — the expected cost of the OWASP bar | A39 measurement |
| Patient layout DB cost | 1 query (two scalar sub-selects merged — A41 saved ~110 ms/page on Vercel→Neon) | A41 |

## 2. Query & rendering strategy

- **RSC-first**: pages are server components; client JS is limited to interactive islands
  (slot picker, consent actions, ledger paging, inbox bell, trends form). Landing is SSR HTML
  + a client animation layer.
- **One round trip per auth**: `getViewer` (React-cached) joins User + Session in a single
  statement that also slides the idle deadline at most hourly (A60/D52) — no per-middleware
  N+1.
- **Keyset pagination** on the ledger (the only unbounded list) — `LIMIT` + `before` cursor,
  chain verdict computed once (D14).
- **Statement timeout 8 s** at pool + role + DB level (A46) — a hung query dies at 8 s,
  well under the 30 s function cap.
- **No ORM overhead** (raw `pg`, `$n` params); `recordSections` is a fixed set of parallel
  SELECTs per section (not per-row) — no N+1 pattern found in `repo.ts` (read today).
- **Caching**: deliberate absence on consent/record paths (revocation must be instant —
  correctness over cache); `React.cache()` memoisation per request is the only cache. This is
  the right trade at this scale.
- **Polling**: inbox bell 30 s (partial-index count ≈ 1 ms, pauses in hidden tabs); slot grid
  45 s / on focus / after conflict. Both bounded and hidden-tab-aware.

## 3. Serverless & hosting constraints (honest)

| Constraint | Effect | Mitigation today | Pilot fix |
|---|---|---|---|
| Neon Free scale-to-zero | 0.5–3 s wake on first request after idle | `/` and `/login` fire `/api/health` on mount (D31 warmup); daily cron keeps it warm for the demo's hours | paid compute / autosuspend off (one setting) |
| Neon Free 0.5 GB | ~15 patients at full document quota (NG-D05); DB also holds the ledger | 3 MB/file + 30 MB/patient caps; `/admin/system` shows size | object storage (R2/S3/Supabase) |
| Neon Free ~100 direct conns | instance-pool(10) × concurrent instances can exhaust under burst (NG-D04) | small pool + idle eviction + one retry on gone-away (A29) | pooled endpoint validated end-to-end, or paid tier |
| Vercel Hobby function cap 30 s (`maxDuration`) | bulk ops (incident fan-out, retention sweep) must fit | sweep budgeted at 20 s with `deferred` reporting; fan-out is one `INSERT…SELECT` | Pro if volume grows |
| Hobby non-commercial ToS | **cannot be a commercial pilot host** (legal, not perf) | — | Vercel Pro or the Supabase Mumbai path (F21) |
| Build OOM < ~1.5 GB free RAM (D20) | sandbox needs `NODE_OPTIONS` cap | documented; CI box fine | — |

## 4. Findings

| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| NG-P01 | **Low (P3)** | Landing carries ~97 KB gzip of animation libs; app pages don't. | D35; chunk listing today | `LazyMotion`/`domAnimation` (~−20 KB); pause out-of-view GSAP loops (UI doc §2) |
| NG-P02 | **Medium (P2)** | Cold-start UX: first touch after idle waits 0.5–3 s (Neon) + function init. Warmup covers the two entry pages only. | D31; probe (warm < 100 ms; cold NOT measured today — needs Neon) | paid compute / autosuspend off; extend warmup to the booking page |
| NG-P03 | **Medium (P2)** | **No load testing exists.** The concurrency-correct claims (booking tx, ledger 4-way race) are proven by SQL negative tests + unit tests, never by a concurrent-traffic harness. | e2e is functional single-user; `gap_test.sql` races are in-DB | k6/autocannon: 50 concurrent bookings on one doctor-day; parallel ledger appends; 0 5xx, conflicts surface as 409s; publish numbers in README | green run with published p95/5xx numbers |
| NG-P04 | **Low (P3)** | Per-limited-request DB write (RateLimit `INSERT…ON CONFLICT`) — one extra round trip on login/signup/emergency/grievance paths. | D51; `ratelimit.ts` | keep (correct at demo scale); edge WAF at scale | — |
| NG-P05 | **Low (P3)** | Image optimization: no `next/image` in use because there are **no third-party images at all** (only self-hosted SVGs — Copyright-clean). Documents render via decrypted stream, not `next/image`. | grep: no `next/image` imports; no raster assets | keep — nothing to optimize; if photos (F11) arrive, use `next/image` with the blob route as `loader` | — |
| NG-P06 | **Info** | Production p95 latency NOT VERIFIED from this sandbox (no `*.vercel.app` egress). Owner 10-min check: `curl` timing on `/api/health` + one page, plus Vercel Analytics. | — | owner-side measurement into README "Verified" block | — |

## 5. Realistic bottleneck order (when it will hurt, in what order)

1. **Neon cold starts** (user-perceived) — solved by a settings change, not code.
2. **Document storage ceiling** (data loss risk before perf) — object storage.
3. **Connection ceiling** (burst 5xx) — pooled endpoint / paid tier.
4. **Rate-limit DB writes** (extra latency on auth) — WAF offload.
5. **Ledger verify cost** (full-chain recompute grows linearly; at 100k rows still single-digit ms in SQL — not a near-term issue; archival plan NG-D06 covers the long tail).

**No premature overengineering recommended**: no read replicas, no caching layer, no message
queue, no CDN-for-API. The monolith + Postgres + object-storage trio carries the pilot.
