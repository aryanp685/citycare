# CityCare — Monitoring & Alerting (NG-S10)

**Status: PARTIALLY IMPLEMENTED — code + local evidence complete; external monitor deployment is BLOCKED on owner-side account access (see §5).**
Last updated: 2026-11-02 (Day 2). Owner: the operator of record for `citycare-z95n.vercel.app`.

This document defines what is monitored, how, at what thresholds, and exactly what the
owner must configure outside this repository. It deliberately makes **no claim that any
external monitor is active** — nothing was configured in an external account from the
Day 2 work environment, and none of the steps below that require an account were executed.

---

## 1. The monitored target

**Production health endpoint:** `https://citycare-z95n.vercel.app/api/health`

> Verification note (honest limitation): the Day 2 work sandbox has a restricted egress
> allowlist (GitHub/npm/PyPI only) and **could not probe the production URL directly**.
> The URL is the one recorded for the live deployment (Vercel project git-linked to
> `main`). When configuring the monitor (§5), the owner should first open the URL once
> in a browser to confirm it returns `200` JSON before wiring it into a monitor — that
> first successful fetch is the monitor's baseline probe.

**Endpoint contract** (`web/src/app/api/health/route.ts`, `force-dynamic`):

| Signal | Meaning | HTTP |
|---|---|---|
| 200, `status:"ok"` | process up, DB reachable, TZ=UTC, ledger chain intact (`ledger_verify()` = 0 breaks) | ready |
| 503, `status:"degraded"` | process up, but ledger break detected or DB timezone wrong | NOT ready |
| 503, `code:"db_unreachable"` | process up, DB connection failed | NOT ready |
| connection failure / non-HTTP response | process down, bad deploy, or platform issue | down |

**Liveness vs readiness** (contract pinned by `web/src/lib/__tests__/health-route.test.ts`, 6 tests):

- **Liveness** (is the process alive?) — an uptime monitor detects this by the HTTP
  request itself failing (connection refused/DNS/platform status page). No separate
  endpoint is exposed; a second public endpoint would only widen the surface.
- **Readiness** (is the app able to serve?) — the HTTP status code above. This is the
  signal external monitors key on.
- **Backup freshness is a reported FACT, not a readiness gate**: `backups.stale:true`
  never flips the status code. A stale backup must be caught by the backup-specific
  alert path (§4), not by declaring the whole app down.

**Response shape** (safe by construction — no PHI, no secret values, no connection
strings, no backup object names). Field names are exact (from the route); the values are
illustrative:

```json
{
  "status": "ok",
  "db": { "reachable": true, "timezone": "UTC", "statementTimeout": "8s", "postgres": "17.x", "ledgerBreaks": 0 },
  "config": { "documentKey": "env", "anchorSigning": true, "emailDelivery": false },
  "retention": { "policy": "demo", "enabled": true, "reason": "ok", "days": 7, "protectedDomain": "demo.in" },
  "backups": { "configured": true, "lastSuccessAt": "ISO-8601|null", "ageMs": 12345, "stale": false },
  "latencyMs": 42,
  "at": "ISO-8601"
}
```

**DB-down 503** has a different, static body (no `db` object at all):
`{ "error": "database unreachable", "code": "db_unreachable" }`

**The four monitored classes and their exact signals** (do not conflate them):

| Class | What it answers | Signal (exact) |
|---|---|---|
| **HTTP availability** (liveness) | Is the process alive at all? | The HTTP request itself: connection failure / non-HTTP response / platform status. No JSON body is involved. |
| **Database readiness** (readiness) | Can the app reach its DB, in UTC, with an intact ledger? | HTTP **200** + `$.status == "ok"` + `$.db.reachable == true`. DB down ⇒ **503** `$.code == "db_unreachable"`; ledger break or non-UTC ⇒ **503** `$.status == "degraded"` (with `$.db.ledgerBreaks` / `$.db.timezone` showing why). |
| **Backup freshness** | Did a backup succeed recently? | `$.backups.stale == false` (and `$.backups.configured == true`). A stale backup **never** changes the HTTP status — it is a separate alert path (§4). |
| **Ledger integrity** | Is the hash chain unbroken? | `$.db.ledgerBreaks == 0` (count from `ledger_verify()`). A break flips the app to 503 `degraded`, so M1's availability alert also fires — the ledger is therefore covered twice (availability + this field for root-cause). |

Security notes enforced in code and pinned by tests:

- `config.documentKey` is a **source label** (`env`/`derived`) — never the key.
- All `process.env` projections in the route are booleans/constrained enums (verified by
  inspection 2026-11-02; see `retention-core.test.ts` "health policy without secrets").
- The DB-down 503 body is **static text** (`"database unreachable"`). Driver error text
  was removed from the wire on Day 2 (A1 — pg error messages can embed host:port/user);
  only a non-sensitive error class (e.g. `ECONNREFUSED`) is logged server-side.
- Same static-wire discipline applied to `/api/cron/backup` 500s and the `/api/cron/daily`
  anchor failure reason (Day 2 sweep — cron bodies also land in client/platform logs).

**Response time:** the endpoint self-reports `latencyMs` (DB round-trip). Expected:
well under 500 ms. Suggested monitor timeout: **10 s**; suggested slow-response alert:
`> 5 s`.

## 2. What must be monitored (complete list)

| # | Thing | Signal | Where observed | Alert when |
|---|---|---|---|---|
| M1 | App availability (liveness + readiness) | HTTP status of `/api/health` | external uptime monitor (independent of Vercel) | non-2xx for ≥ 2 consecutive probes, or connection failure |
| M2 | App response time | HTTP response time / `latencyMs` | same monitor | > 5 s |
| M3 | Backup ran successfully (freshness) | `/api/health` → `backups.stale == false` and `backups.configured == true` | monitor JSON assertion or owner check | `stale == true` (no good backup in the last **30 h** — `BACKUP_STALE_MS`) |
| M4 | Backup failed but DB alive (failure row) | `Backup` metadata row `status='failed'` | Vercel dashboard (manual) or DB check | any new `failed` row — the daily cron's HTTP 500 (`backup_failed_<class>`) is the trigger event |
| M5 | Backup failed AND DB down (worst case) | platform log line **`[citycare-backup] FATAL`** | Vercel function logs of the backup-cron function | line appears at all (see §4) |
| M6 | Ledger integrity | `/api/health` → `db.ledgerBreaks == 0` / `status:"ok"` | covered by M1 (503 on break) | 503 `degraded` |
| M7 | Recovery (all of the above) | return to 200 / `stale == false` | same monitor | recovery notification must be ON |

The production backup cron runs **03:00 IST** (`30 21 * * *` UTC, Vercel cron). M3 is
therefore most meaningful when checked after ~04:30 IST daily.

## 3. Free/low-cost external monitor options (owner choice)

Either is acceptable; both are external to Vercel (independence requirement met) and have
free tiers. Day 2 configured **neither** — no account exists for this project in the work
environment, and inventing credentials or claiming a monitor is live is explicitly
prohibited.

### Option A — UptimeRobot (simplest, HTTP monitoring only)

Free tier: 50 monitors, 5-minute interval, e-mail alerts.

Setup (owner, ~5 minutes):

1. Create a free account at uptimerobot.com; verify the e-mail address that will receive
   alerts (this is the **owner contact** — the same person who receives DPDP
   breach notifications, ideally).
2. **Settings → Monitors → Add New Monitor**:
   - Monitor Type: **HTTP(S)**
   - Friendly Name: `CityCare /api/health`
   - URL: `https://citycare-z95n.vercel.app/api/health`
   - Method: GET, **no** headers, no body, no auth.
   - Interval: **5 minutes** (free-tier minimum)
   - Timeout: 10 s; Retries: **3** (alert only after 3 consecutive failures)
   - Keyword check: **off** (the status code is the contract — do not add a keyword;
     the JSON changes shape only in ways that also change the status).
3. **Alerts**: e-mail → owner address; **recovery notification: ON** ("notify when the
   monitor recovers").
4. **Verification step (required before calling this RESOLVED for M1/M2/M7):**
   - wait for the first two probe cycles (≤ 10 min) and confirm both show **UP** in the
     monitor's history;
   - send a **test notification** (Settings → Alerts → "Send test") and confirm the e-mail
     actually arrived in the owner inbox;
   - record the monitor URL + first-UP timestamp in `CITYCARE_DAY_2_MONITORING_REPORT.md`
     (owner appends).
5. Limitation (documented, accepted): the free tier cannot assert on JSON fields, so M3
   (backup freshness) on UptimeRobot degrades to the owner's daily manual check of
   `/api/health` (or a second free-tier HTTP monitor on the same URL as a tie-breaker —
   not sufficient for M3). If M3 automation matters, pick Option B or add Vercel log
   alerting (§4).

### Option B — Better Stack (free tier: 5 monitors, 1-minute interval, JSON + log-based rules)

1. Create a free account at betterstack.com (e-mail verification = alert contact).
2. **Uptime → New monitor**:
   - Name: `CityCare health`; Type: **HTTP**; Method GET;
   - URL: `https://citycare-z95n.vercel.app/api/health`
   - Expected status code: **200**; Response time limit: 5 s;
   - Interval: **1 minute**; Retries: 3;
   - **JSON check** (additional assertion): path `backups.stale` equals `false` — this
     automates M3 at the same time;
   - Alerts: e-mail to the owner; **recovery notifications ON**.
3. (Optional, M5) **Logs → Log-based alert**: ingest Vercel function logs (Better Stack
   log endpoint; Vercel can forward logs via a Webhook/Log Drains add-on or a small
   forwarder — the owner decides; no third-party data leaves the owner's own systems):
   rule: line matches `\[citycare-backup\] FATAL` → immediate e-mail.
4. Verification step: same as Option A.4 (first successful probe + test alert received).

## 4. Backup failure visibility (M3–M5) — what the code guarantees

Implemented and tested in Day 1 (F1–F4) + Day 2 sweep:

- **Stable, grep-able marker**: `[citycare-backup] FATAL` — exported as
  `BACKUP_FATAL_MARKER` in `web/src/lib/backup-core.mjs`; emitted by **both** callers
  (the `/api/cron/backup` route and `scripts/backup.mjs` CLI) in exactly one situation:
  the backup failed **and** the failure-metadata row could not be recorded either
  (DB down / missing `Backup` table). That is the only case with no database record —
  so the platform log line is the independent record, by design.
- **Failure-mode → signal table** (complete; there is no other failure mode):

| Failure mode | `Backup` row | HTTP (cron) | Process exit (CLI) | FATAL log line |
|---|---|---|---|---|
| backup failed, DB alive | `status='failed'`, `errorClass` set | 500 `backup_failed_<class>` (static message) | 1 | no |
| backup failed, DB down | impossible (row lives in the DB) | 500 `backup_failed_connect` (static message) | 1 | **yes** |
| backup never ran (cron off, key missing, deploy broken) | no new row | n/a | n/a | no — detected via **`backups.stale:true`** in `/api/health` |

- **No sensitive data in alertable signals**: the FATAL line carries the error class and
  a short context only — never a backup object name, never PHI, never key material.
  Backup object names exist only in the `Backup` metadata table and in store listings
  (both private). The 500 response bodies are static text (Day 2, A1).
- **Practical alert configuration** (owner, once a log/monitor provider is chosen):
  - **R1 (immediate)** — log-based alert on `\[citycare-backup\] FATAL` in Vercel
    function logs (Better Stack log rule, or Vercel's own log alerts if enabled on the
    plan). Severity: page/e-mail immediately.
  - **R2 (daily, stale backup)** — JSON assertion `backups.stale == false` on
    `/api/health` (Better Stack monitor check, or manual 05:00 IST check on UptimeRobot).
    Severity: e-mail; escalate if stale for > 2 days.
  - **R3 (recovery)** — notification when a new good `Backup` row appears / `stale`
    returns to `false` (monitor recovery notification covers M1; R2 recovers naturally
    on the next successful cron).
- **Honest status:** no automated alerting is configured or tested yet. The marker and
  the signals are in place and locally verified (e2e §16c exercises the DB-down path:
  non-zero exit + stable FATAL marker + no spurious file/metadata); wiring R1–R3 is the
  owner's action under §3/§5.

## 5. Owner-side configuration checklist (copy; tick as done)

- [ ] Production URL verified live in a browser (`200` JSON) — first baseline probe
- [ ] Monitor account created (UptimeRobot or Better Stack), owner e-mail verified
- [ ] Monitor `CityCare /api/health` created per §3 (GET, 200, ≤ 5 s, retries 3, no auth, no payload)
- [ ] JSON assertion `backups.stale == false` enabled (Option B; or committed to manual daily check — Option A)
- [ ] Alert destination = owner contact; **recovery notification ON**
- [ ] First ≥ 2 probe cycles recorded **UP** (screenshot/timestamp)
- [ ] Test alert actually **received** in the owner inbox (not merely sent)
- [ ] Log-based rule for `[citycare-backup] FATAL` configured (or: documented decision to rely on R2 daily check instead)
- [ ] `CITYCARE_DAY_2_MONITORING_REPORT.md` updated with monitor URL, config, first-UP timestamp, test-alert receipt
- [ ] Staging outage drill performed by the owner — **staging deployment + isolated DB
      only** (§6); BLOCKED until staging exists — never against production

Until every box is ticked, the register status for the monitoring items is **BLOCKED
(owner-side account/permission required)** — not RESOLVED.

## 6. The 5-minute controlled outage test (A4 criterion) — staging-only procedure

Acceptance asks for: controlled 5-minute outage ⇒ alert reaches the owner contact within
10 minutes ⇒ recovery notification on restore.

**Hard rule (Day 2 final security correction, 2026-11-02):** the drill must be run against
a **dedicated staging deployment and an isolated (throwaway) database only**. It must NOT
be simulated by breaking production database credentials, pausing production traffic, or
any other change to the production deployment. **If no staging deployment exists, the drill
stays BLOCKED** — that is the current state.

- It **cannot be run from the Day 2 work environment** (no access to any Vercel
  deployment; no production change of any kind on Day 2).
- The **local equivalent was executed** and is the evidence of the mechanism (Day 2,
  see report): a running app instance pointed at a dead database URL returns `503
  {"code":"db_unreachable"}` with the static safe body in < 1 s, and the backup path
  under a dead DB emits the FATAL marker + non-zero exit (e2e §16c, 4 checks, green in
  every gauntlet run). This proves the signals; it is **not** the acceptance drill.

### Staging setup (owner, ~30 min, one-time)

1. **Isolated database**: create a throwaway database dedicated to staging
   (e.g. a separate Neon branch/database, or any other DB provider's scratch
   instance). It must be a **different** resource from production — the whole point is
   that breaking it costs nothing.
2. **Staging deployment**: in Vercel, either (a) a second project (or the same project's
   preview deployment) of the same code, with its own environment variables
   (`DATABASE_URL` → the isolated DB, fresh `SESSION_SECRET`/`CRON_SECRET`,
   `RETENTION_POLICY` per your choice, `NEXT_PUBLIC_DEMO_MODE` per your choice), or
   (b) a long-lived preview deployment of a `staging` branch. Record its URL
   (`https://citycare-….vercel.app`, distinct from production).
3. **Staging monitor**: create a second monitor (§3, same settings) pointed at the
   **staging** health URL, with its own alert label (e.g. `CityCare STAGING /api/health`)
   so drill alerts are not confused with production alerts. Confirm ≥2 UP probes.

### The drill (owner, each time)

1. **Duration: 5 minutes.** Cause the staging database to become unreachable — e.g.
   pause/suspend the isolated DB's compute at the DB provider (the recommended way: no
   credential or config change), or stop it however the provider supports. The staging
   **app stays running** (we are testing detection, not deployment health).
2. **Expected alert**: the staging monitor goes DOWN and the alert reaches the owner
   contact. **Record**: alert-sent timestamp, monitor timestamp, and the difference.
   (With a 5-minute probe interval + 3 retries, a DOWN verdict lands ~5–15 min after
   the start — budget for that; the alert→restore and recovery evidence below are the
   binding checks.)
3. **Recover**: resume the isolated DB (≤ 5 minutes total outage, note the end
   timestamp).
4. **Expected recovery alert**: the monitor returns UP and the **recovery
   notification** is delivered (recovery notification ON per §3). Record both
   timestamps.
5. **Evidence collection** (append to `CITYCARE_DAY_2_MONITORING_REPORT.md`):
   staging URL + isolated-DB identifier (the name is fine — **no credentials, no
   connection strings**), outage start/end timestamps, alert timestamp, recovery
   timestamp, and screenshots of the monitor history showing DOWN → UP.
6. **Disposal**: if the staging deploy is later no longer needed, delete it and the
   isolated DB (documented disposal).

**Status: BLOCKED (no staging deployment exists yet).** The mechanism is proven locally
(e2e §16c + the before/after probes); the acceptance drill is the owner's action,
staging-only, and stays BLOCKED until a staging deployment + isolated DB exist.


## 7. What is explicitly NOT done / not claimed

- No monitor account was created; no credentials exist for this project in the work
  environment; nothing was configured in any external service.
- No alert was simulated, and no "alert received" claim is made anywhere.
- No new public endpoint was added; the public surface of the app is unchanged
  (`/api/health` already existed — only its error-path hygiene changed, Day 2 A1).
- No PHI, secrets, DB URLs, or backup object names appear in any monitoring payload,
  log marker, or this document.
