# CityCare — Security & Privacy Audit (Step 1)

_Audited 2026-11-01: full read of `web/src/lib/{auth,session,origin,db,consent,storage,rules,
ratelimit,env}.ts` + the highest-risk routes (emergency, documents link, consents, purge,
appointments), plus **live read-only HTTP probes** against the production build on the local
server (headers, unauth access, CSRF gates, cookie attrs, error shapes, oracle comparison).
No penetration testing, no destructive actions, no production traffic. No secrets, keys or
personal data are reproduced in this file._

Risk scale: **Critical / High / Medium / Low / Informational** (impact × likelihood, demo→pilot
context). Every finding: evidence → impact → fix → validation. IDs are the NG-Sxx series of
the master register; cross-references to the project's own log are A##/D##.

## 1. Headline

**No Critical findings.** The security-critical paths (auth, consent, ledger, documents,
CSRF, rate limiting, erasure) are implemented correctly and are pinned by 162 unit + 241 e2e
checks, all re-run green today. The residual risk is concentrated in **operations** (no
backup/DR, no monitoring, free-tier limits) and in **things deliberately deferred** (2FA,
e-mail delivery, ABDM identity) — not in the code that touches health data today.

## 2. Risk register

| ID | Sev | Finding | Evidence | Impact | Fix | Validation |
|---|---|---|---|---|---|---|
| NG-S09 | **High (P0 for pilot)** | **No backup / disaster-recovery path for the database.** Production is Neon Free: no PITR, autosuspend, 0.5 GB cap; Vercel Hobby has no snapshots. There is no documented restore procedure and no tested copy. | FEATURES.md deploy row ("free tiers … no backup: disclose in report"); `DEPLOY_VERCEL.md`; nothing in `web/scripts` takes a DB dump | Total loss of all records, ledger and audit evidence on provider incident or accidental `FORCE_SCHEMA=1` against prod (the script's guard is human discipline) | Add a scheduled `pg_dump` (cron or Vercel schedule hitting a small export route under `CRON_SECRET`) to a private location; write + **test** a restore runbook (restore into scratch, verify `ledger_verify()` = 0 breaks); document RPO/RTO | restore drill passes; `ledger_verify()` clean on restored DB; documented |
| NG-S10 | **High (P1)** | **No uptime monitoring / alerting.** The only heartbeat is the app's own cron hitting itself; if Vercel or Neon is down, nobody knows. | `vercel.json` (self-cron); no external monitor configured (owner-side, BLOCKED to verify) | Unbounded unknown downtime; consent/booking failures invisible | UptimeRobot/BetterStack on `/api/health` (free); DB-level alert on Neon (paid) | monitor receives probe; test an induced outage in staging |
| NG-S13 | **Medium (P1 for pilot)** | **No second factor.** Password-only auth on health data. Mitigations present: scrypt 2¹⁷, lockout, per-IP rate limit, server-side revocable sessions — but a phished/leaked password is full account access. | `auth.ts` (no MFA code path); F6 (passkeys) on the roadmap | Credential theft → full record read/export/erase | F6 passkeys (WebAuthn) as phish-resistant login; until then consider TOTP for doctors/admins | passkey login e2e; stolen-password simulation denied |
| NG-S14 | **Medium (P1 for pilot)** | **Production demo accounts with published credentials** (`@demo.in`, password in README/START_HERE) are live on the public site. By design for a demo (banner, 7-day sweep for self-registrations, synthetic data) — but a controlled pilot cannot ship this. | `web/README.md` demo logins; `LEGAL_COMPLIANCE.md` §5 | Anyone can act as a "patient"/"doctor" on the pilot instance; audit trail polluted | Pilot env without seeded demo users (or demo data isolated behind a flag + separate DB); sweep already covers self-registered accounts | fresh pilot DB has 0 seeded users; login with old demo creds fails |
| NG-S01 | **Medium (P2)** | **HSTS is not declared in code.** `next.config.ts` sets nosniff/XFO/CSP-frame-ancestors/referrer/permissions — but no `Strict-Transport-Security`. Vercel adds HSTS at the platform; the Cloudflare path (if ever deployed) would not. Probe today: header absent locally (expected) and not in `next.config.ts`. | `next.config.ts` headers list; probe `headers /` → `strict-transport-security: null` | First-visit downgrade window on any host without platform HSTS | Add `Strict-Transport-Security: max-age=…; includeSubDomains` to `next.config.ts` headers (build-time, like the others) | header present on all paths incl. CF preview |
| NG-S03 | **Medium (P2)** | **`DOCUMENT_KEY` fallback couples file encryption to the session secret.** When `DOCUMENT_KEY` env is absent, the blob key is HKDF(SESSION_SECRET). Rotating `SESSION_SECRET` (the documented breach-runbook step #1) therefore makes **every stored document permanently unreadable** — silently. Also couples a session-secret compromise to all file bytes. | `storage.ts key()`; `LEGAL_COMPLIANCE.md` §4 runbook | Document-loss via runbook step; blast-radius coupling | Make `DOCUMENT_KEY` mandatory (env schema `min(1)` like SESSION_SECRET) — refuse boot without it; keep the HKDF derivation only for local dev with a loud log line | boot fails fast without the key; runbook updated |
| NG-S05 | **Medium (P2)** | **`liveConsent` = "newest row wins" is a latent invariant, not an enforced one.** `ORDER BY requestedAt DESC LIMIT 1` per pair. Today all three writers avoid creating a shadowing row (booking checks for an active pair first; grant upgrades the pending row or 409s on live; emergency expires pending in-tx — all verified). Any future writer that forgets would silently flip doctor access. | `consent.ts liveConsent`; `appointments/route.ts` L116-138; `consents/route.ts` POST; `emergency/route.ts` | Wrong access grant/deny if invariant is broken later — exactly the class of bug A58 fixed for scope | Change the read to explicit preference: latest `APPROVED` unexpired, else latest row for status messaging; add e2e case "pending request coexists with live consent → access stays up" | new e2e green; read semantics unit-tested |
| NG-S06 | **Low (P3)** | **Consent-pair index conflicts are mislabelled as `slot_full`.** In `POST /api/patient/appointments`, any 23505 (incl. `one_active_consent_per_pair` from a rare race) maps to the "slot_full — pick another slot" message; the tx rolls back atomically (no corruption), only the message misleads. | `appointments/route.ts` catch block | Confused retry; no data impact | Map by constraint name (`one_active_consent_per_pair` → distinct code + "consent request being created, retry") | race e2e returns the distinct code |
| NG-S04 | **Low (P3)** | **Some ledger writes are fail-open** (`.catch(() => null)`) — e.g. document-link issuance logs `DOWNLOAD_DOC` but swallows a ledger failure. Transparency could silently miss an entry. | `documents/[id]/link/route.ts` | Audit gap on an edge failure; chain stays valid (no fake rows) | For ledger-critical events, fail the request (or queue-and-retry) instead of swallowing; keep swallow only for best-effort events and log them | forced ledger-failure test → 503 + retry |
| NG-S02 | **Low (P3)** | **`requestIsHttps` trusts first-hop `x-forwarded-proto`.** Correct behind Vercel/CF (they are the only front door). If the app were ever exposed without a proxy, a spoofed header could flip cookie attributes (worst case: `Secure` set over plain http → browser drops the cookie → self-inflicted login friction, not privilege escalation). | `auth.ts requestIsHttps` | Low — no escalation path found | Document the trust assumption; optionally allow-list the proxy when `ALLOW_EMBED`-style flags exist | review note |
| NG-S08 | **Low (P3)** | **Single `CRON_SECRET` bearer, no job granularity / rotation path.** Leak lets an attacker trigger the daily sweep (bounded: only 7-day self-registered demo accounts; budgeted 20 s) or spam it. | `cron/daily/route.ts`; probe: `GET /api/cron/daily` → 401 `cron secret mismatch` | Bounded abuse / DoS | Per-job secrets or IP allow-list; rotation documented | 401 with rotated secret, 200 with new |
| NG-S07 | **Info (P3)** | **`/api/health` is public and reveals the Postgres major version** (`18.6`), TZ, statement timeout, ledger break count, key-source. Deliberate (uptime monitors; secret-free by design — A44). | probe output | Minor info disclosure; standard for health endpoints | Keep; strip version if a scanner ever complains | — |
| NG-S12 | **Info (P3)** | **`SESSION_SECRET` is validated for length (≥32) but not entropy.** Deploy script generates strong random values; a hand-typed weak 32-char secret would pass. | `env.ts` | Low | Entropy/charset hint in the deploy script (it already generates cryptographically random) | — |
| NG-S11 | **Medium (P1, process)** | **CI is disabled on GitHub** (D59): the workflow file exists and mirrors a locally-green sequence, but no push has ever completed a run. Regressions ship by hand. | `.github/workflows/ci.yml`; D59; today's local re-run green (162/162, 241/241, build clean) | Regression risk between merges | Owner enables Actions in repo settings → first green run closes D59 + NG-S11 | a green Actions run on `main` |
| NG-S16 | **Info** | **JWTs are signed, not encrypted** (claims: role, profileId, sid, actingFor). No sensitive data in claims; `sid` join is the real gate. | `auth.ts signSession` | None found | Keep; documented decision | — |

## 3. Control-by-control verdict (with today's evidence)

| Control | Verdict | Evidence (2026-11-01) |
|---|---|---|
| Password hashing | **Good** | scrypt N=2¹⁷ r=8 p=1 async, `timingSafeEqual`, hostile-N cap 2²⁰, transparent rehash (A39/A59); probe: wrong password → 401, no stack leak |
| Login protection | **Good** | 15-min sliding lockout + admin unlock (A38/A63); per-IP 60/10 min + signup 20/h (A61); e2e `D8:` |
| Session lifecycle | **Good** | server-side `Session` row + `sid` join per request; sliding 7d / hard 30d; revocation instant (A60/A62/D52); probe: cookie `HttpOnly; SameSite=lax; Path=/; Max-Age=2592000` over http (Secure only on https — by design, A20) |
| JWT validation | **Good** | HS256 pinned, claim-type checks, garbage→anonymous |
| Revocation / devices | **Good** | `/api/auth/sessions` device list; logout `{everywhere:true}`; purge revokes all |
| Recovery | **Good** | 8 one-time Crockford codes (hashed, shown once), e-mail codes 15 min/5 attempts, reset clears lockout + revokes sessions (F9); e-mail *delivery* not live (NG-F01) |
| Cookie security | **Good** | httpOnly, per-request scheme-aware SameSite, CHIPS `Partitioned` for the iframe case (A20/A37); both shapes expired on logout |
| CSRF | **Strong** | Sec-Fetch-Site + Origin-vs-Host (+XFH first hop) + JSON-only (415) + multipart opt-in (D22); probe: evil Origin → 403 `csrf_origin`; text/plain → 415 `json_only`; no-JSON cross-site form structurally cannot reach mutations |
| Authorization (RBAC) | **Good** | role list per route; `requireVerifiedDoctor` gate on every clinical doctor action (F1/A48); admin pages `viewerForPage` redirect (probe: 7 sensitive pages → 307 `/login`; 9 sensitive APIs → 401) |
| Cross-patient isolation (IDOR) | **Good** | ownership joins in SQL; 404-not-403 for foreign ids (A72); probe: two fake doc ids → identical 401/404 shape (no oracle at unauth layer); e2e covers cross-patient 404s |
| Consent enforcement | **Strong** | DB-clock verdict on every read; 5 scopes applied by pure `applyScope` (unit-pinned; found a real leak — A58); revoke → instant 403 (e2e); emergency override bounded + reviewed + auto-suspension (F2/F7b); stale-consent 428 gate on mutations (L2) |
| SQL injection | **Good** | 100% parameterized `pg` `$n` (raw SQL, no ORM string-building found); zod before DB |
| XSS | **Good (structural)** | React escaping; no `dangerouslySetInnerHTML` on user data (grep clean — verified this audit); CSP frame-ancestors only (no script-src needed: no third-party scripts at all); self-hosted Inter |
| File upload | **Good** | magic-byte sniffing (not declared MIME), 3 MB/file, 30 MB/patient quota, AES-256-GCM (key outside DB), 60-s viewer-bound HMAC links, FULL_RECORD-only doctor access, ledgered, cascade-erase (F12/D4) |
| Ledger integrity | **Strong** | hash chain with stored canonical UTC ms-precision string (A6/A7/A8), trigger blocks UPDATE/DELETE, `ledger_verify()` full recompute (probe/health: 0 breaks), nightly Ed25519 anchor + OpenTimestamps (D13), tamper negative-tests (A1/A30 discipline) |
| Infrastructure | **Weak (see NG-S09/S10)** | security headers good (probe-verified); HSTS platform-dependent (NG-S01); no backup/monitoring; free-tier limits; secrets Vercel-only (none in repo — verified: `git ls-files` clean) |
| Info leakage | **Good** | uniform error codes; probe validation error = field-level message, no stack/SQL; 404s consistent; `/api/health` public facts deliberate (NG-S07) |

## 4. What is NOT covered (honestly)

1. **No external pentest** — this is a defensive code + probe review by the project's own
   auditor, on the local build. A pre-pilot external OWASP assessment (STQC/CERT-IN empanelled
   if ABDM certification is ever pursued) is required and BLOCKED without owner budget.
2. **Production runtime NOT VERIFIED from this sandbox** (no `*.vercel.app` egress): HSTS
   header value, WAF behaviour, Neon TLS pinning (D30) — owner-side check, ~10 min
   (`curl -sI https://citycare-z95n.vercel.app/api/health`).
3. **Cloudflare path** (OpenNext) is built and locally tested but **never deployed** — its
   security config (secrets, HSTS, scrypt 4096) is unverified in production (D28, BLOCKED on
   credentials).
4. **Human factors**: admin verification is attestation, not registry lookup (D57) — a
   careless admin is the weakest link; two-person rule absent (D50).
5. **Volume attacks**: fixed-window DB rate limit + Hobby plan is not a DDoS defence (D37) —
   platform WAF is the answer, and it's a config step, not code.
