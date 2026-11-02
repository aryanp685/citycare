# CITYCARE — DAY 2 MONITORING & ALERTING REPORT (NG-S10)

**Date:** 2026-11-02 · **Times:** UTC (with IST = UTC+05:30 noted where useful) · **Environment label: LOCAL SANDBOX (PG 18.6, production build)** unless stated otherwise.
**Overall status: PARTIALLY IMPLEMENTED — code, docs and local evidence complete; external monitor deployment BLOCKED on owner-side account access.** Nothing below is a claim that an external monitor is active.

---

## 1. What was done (with exact evidence)

### 1.1 A1 — `/api/health` inspection & hardening

**Inspection (code, commit `f56ea86` baseline):** the endpoint already (Day 1 work) reports DB
connectivity, UTC check, `ledger_verify()` break count, PG version, backup freshness facts
(`configured/lastSuccessAt/ageMs/stale`), the effective retention policy (safe enum subset),
config *source* labels, and `latencyMs` — with `force-dynamic` (never cached). It exposes no
PHI, no secret values, no connection strings, no backup object names (verified field-by-field).

**Defect found and fixed (A1):** the DB-down catch returned the raw driver error message on the
public wire — pg error text can embed host:port/user. **Executed proof of the defect on the
pre-fix production build** (throwaway instance on `:3002` pointed at a dead DB URL,
`12:03:11Z` / 17:33 IST):

```
GET /api/health → 503
{"error":"connect ECONNREFUSED 127.0.0.1:59999","code":"db_unreachable"}
```

**After the fix** (static wire text; only a non-sensitive error class is logged server-side),
same probe against the rebuilt app (`12:05:33Z` / 17:35:33 IST):

```
GET /api/health → 503  (0.10 s)
{"error":"database unreachable","code":"db_unreachable"}
```

The same raw-error-to-wire pattern was found and fixed in the two cron endpoints (their 500
bodies also land in client/platform logs): `/api/cron/backup` (2 sites) and
`/api/cron/daily` (anchor failure `reason` — now static `"anchor_failed"`, detail stays in the
private platform log). Full app-wide sweep for `e.message`/`process.env` projections in
responses: no other exposure found (2026-11-02).

**New tests:** `web/src/lib/__tests__/health-route.test.ts` — 6 tests pinning the monitoring
contract: (1) leaky driver message ⇒ static safe 503, no host/port/URL/password on the wire;
(2) non-Error throw ⇒ same safe 503; (3) healthy ⇒ 200 with safe facts, secret env values
absent from the wire; (4) ledger break ⇒ 503 `degraded`; (5) non-UTC ⇒ 503 `degraded`;
(6) `Backup` table absent ⇒ still 200, reported `configured:false, stale:true` (backup health
never flips liveness).

### 1.2 A2 — external uptime monitor

**Status: BLOCKED (owner-side account required).** The Day 2 work environment has no
UptimeRobot/Better Stack account, and creating one / inventing credentials is prohibited.
Deliverable = exact owner-side setup instructions + configuration checklist in
`web/docs/operations/MONITORING_AND_ALERTING.md` §3/§5 (both free-tier options, full field-by-field
monitor config, JSON assertion for `backups.stale`, recovery notifications, and the required
verification steps — first ≥2 UP probes + a test alert actually *received* in the owner inbox —
before the item may move out of BLOCKED).

**Probe limitation (honest):** the sandbox egress allowlist (GitHub/npm/PyPI only) prevented
directly probing `https://citycare-z95n.vercel.app/api/health`. The URL is the recorded
production one; the owner's first action is to open it in a browser and confirm a 200 JSON
response (that fetch is the monitor's baseline probe). **No first-successful-probe claim is
made here.**

### 1.3 A3 — backup failure visibility

Verified in code (Day 1 F1–F4 + Day 2 sweep):

- Stable marker **`[citycare-backup] FATAL`** (`BACKUP_FATAL_MARKER`,
  `web/src/lib/backup-core.mjs:53`) — grep-able, emitted by **both** the cron route and the CLI
  exactly when the backup failed *and* the failure row could not be recorded (the only no-DB
  case). The line carries error class + short context only — **no backup object names, no PHI,
  no key material**.
- Complete failure-mode → signal table in the ops doc §4 (failed-row / FATAL / stale-freshness
  paths) plus ready-to-configure alert rules R1 (log rule on the FATAL marker), R2 (JSON
  assertion `backups.stale == false`), R3 (recovery). Stale threshold = 30 h (`BACKUP_STALE_MS`).
- **No automated alerting is configured or tested** — stated explicitly in code comments, the
  ops doc, and here. e2e §16c (4 checks) exercises the DB-down path (non-zero exit + stable
  FATAL marker + no spurious file/metadata) and was green in every run below.

### 1.4 A4 — acceptance criteria, honestly scored

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `/api/health` inspected: DB connectivity, readiness, backup freshness, retention config, safe diagnostics, response time, error handling | **DONE** | §1.1 + unit tests (6) |
| 2 | Liveness vs readiness distinguished | **DONE (documented + coded)** | ops doc §1; status-code contract in route doc; 503-on-DB-down pinned by tests |
| 3 | External monitor configured (HTTPS + status code + response time + interval + alerts + recovery) | **BLOCKED** — owner account required | ops doc §3/§5 checklist; no account exists in the work environment |
| 4 | First successful probe verified | **NOT DONE** (follows #3) | no probe claim made; owner verification step documented |
| 5 | 5-minute controlled staging outage ⇒ alert < 10 min + recovery notification | **NOT DONE — owner action** | mechanism proven locally (503 in 0.10 s under DB-down; FATAL marker under DB-down, e2e §16c); full owner procedure documented (ops doc §6). **Not run against production** (no production change on Day 2) |
| 6 | No PHI/secrets in any monitoring payload/marker/log-to-wire | **DONE** | field-level verification + 6 unit tests + A1 wire fix (before/after probes above) |
| 7 | Monitoring docs committed | **DONE** | `web/docs/operations/MONITORING_AND_ALERTING.md` (this batch) |

## 2. Test / run evidence (this report's own runs)

| # | Command | Scope/label | Result | When |
|---|---|---|---|---|
| T1 | live probe `:3000/api/health` (healthy) | LOCAL, new build | 200, `latencyMs:13`, 0.10 s wall, safe payload | 12:05:33Z (17:35 IST) |
| T2 | live probe `:3002/api/health` (DB down, **old** build) | LOCAL | 503 + leaky body (defect proof) | 12:03:11Z (17:33 IST) |
| T3 | live probe `:3002/api/health` (DB down, **new** build) | LOCAL | 503 + static safe body | 12:05:33Z (17:35 IST) |
| T4 | `npx vitest run` (full) | LOCAL, `f56ea86`+WS-A changes | **229/229 passed** (223 baseline + 6 new health-route) | 12:05:37Z (17:35 IST) |
| T5 | `npx tsc --noEmit -p .` | LOCAL | 0 errors | 12:06Z |
| T6 | `npm run lint` | LOCAL | exit 0, 0 problems | 12:06–12:07Z |
| T7 | `npx next build` (with `RETENTION_POLICY=demo`) | LOCAL | exit 0 (55 routes) | 12:05:07Z |
| T8 | `node scripts/e2e.mjs` (server `:3000`, new build) | LOCAL | **286/286 passed, 0 failed, exit 0** | finished 12:07:22Z (17:37 IST) |
| T9 | GitHub Actions CI on `6475348` (the ci.yml fix — WS-B, reported in the CI doc) | CI (ubuntu-latest, PG 17) | **both runs SUCCESS** (push 41441262459: 12:00:52→12:03:44Z; pull_request 41441271173: 12:00:55→12:03:35Z) | 17:30–17:34 IST |

## 3. Deliverables for WS-A

- `web/docs/operations/MONITORING_AND_ALERTING.md` — monitoring contract, monitor options,
  owner checklist, failure-mode table, outage-drill procedure.
- This report.
- Code: `src/app/api/health/route.ts` (A1 fix + monitoring contract doc),
  `src/app/api/cron/backup/route.ts` + `src/app/api/cron/daily/route.ts` (static-wire 500s),
  `src/lib/__tests__/health-route.test.ts` (new, 6 tests).
- Register: NG-S10 → **PARTIALLY IMPLEMENTED** (code + local evidence done; external monitor
  BLOCKED on owner account — never RESOLVED without the §5 checklist being ticked by the owner).
