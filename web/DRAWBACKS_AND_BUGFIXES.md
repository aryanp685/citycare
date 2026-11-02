# CityCare Web — Drawbacks & the real bug log

Two halves: **A)** every genuine bug found while building this app (all fixed, most
caught by tests I wrote deliberately). **B)** the remaining drawbacks of this build
and what production would need instead. Written so that a viva examiner can pick any
line and ask me about it.

---

## A) Bugs found & fixed (chronological — this is the honest dev diary)

### The Postgres ledger functions (`schema/sql/ledger.sql`)

**A1. A test that tests nothing (twice).**
My first tamper test did `UPDATE ... SET action = "NOTHING_HAPPENED"` — double quotes
made Postgres parse it as an *identifier* → the statement never ran, and the log showed
`UPDATE 0`. Chain "clean" — vacuously, because the table was **empty**. Same trap again:
`UPDATE ... WHERE seq=3` when max seq was 2.
*Fix:* every assertion now pins the row count first (`expected 3 rows, found 0` fails
loudly). **Lesson: a passing test on the wrong state is worse than no test.**

**A2. plpgsql OUT variable shadowed a table column.**
`ledger_append` had `RETURNS TABLE (seq …)` while its body ran
`SELECT MAX("seq") FROM "AuditLog"` — plpgsql resolved `"seq"` to the OUT variable →
`column reference "seq" is ambiguous`.
*Fix:* OUT names are always prefixed (`out_seq`, `at_seq`, `found_hash`) and columns are
always qualified (`a."seq"`).

**A3. `CREATE OR REPLACE` silently kept the broken function.**
Changing a function's return type via `CREATE OR REPLACE` errors — but the *old body
stays live*. Next test run had rows written by an old body vs new verify →
"phantom tampering" reported on a DB nobody touched.
*Fix:* DROP + re-create during migration, re-verify from a clean table.
**Lesson: "it deployed" ≠ "it's live."**

**A4. `found` is a reserved plpgsql variable.**
Naming an OUT column `found` collides with plpgsql's built-in `FOUND` (boolean) —
assignment to it crashed with `invalid input syntax for type boolean`.
*Fix:* renamed `found_hash`.

**A5. Postgres `text` cannot contain NUL.**
The python version hashes bytes joined with `\x00`; `chr(0)` in SQL text →
`null character not permitted`.
*Fix:* hash `bytea`: `convert_to(x,'UTF8') || '\x00'::bytea …` — byte-for-byte the same
input as python's `_sha()`, so both implementations agree on semantics.

**A6. The millisecond-rounding ghost (the best bug of the project).**
`now()` has microsecond precision, but Prisma's `timestamp(3)` column **rounds** on
store. We hashed the un-rounded value → rows whose microseconds rounded *up* (e.g.
`.682953→.683`) failed verification forever, while neighbouring rows verified clean.
Symptom: 31 fresh appends, breaks at "random" seq numbers, moving between runs.
*Fix:* `v_created := date_trunc('milliseconds', now())` — hash and store the SAME
truncated value; the mismatch becomes structurally impossible.

**A7. The timezone trap (a second, nastier ghost).**
Prisma maps `DateTime` to **naive** `timestamp(3)`. The verify function re-derived the
timestamp string via `to_char(createdAt AT TIME ZONE 'UTC')` — which re-interprets the
naive value under the **session TimeZone**. One `ALTER ROLE … SET timezone` later and
*every* row "proved tampering" (9/9 breaks) with zero data edits.
*Fix (double):* (1) the canonical UTC string is now **stored** in
`AuditLog."createdAtIso"` and hashed/verified verbatim — no re-derivation, no TZ
dependency; (2) the app pool pins `options: "-c timezone=UTC"` and sets
`process.env.TZ` — the convention "naive == UTC" is enforced on every connection.
*Proof:* after rebuild, `SET TIME ZONE 'Pacific/Kiritimati' (+14!)` → `ledger_verify()`
still reports **0 breaks**.

**A8. Fallback with its own TZ bug.**
My "legacy row" fallback was `to_char(createdAt AT TIME ZONE 'UTC')` — for a naive
column that *adds* the session offset before rendering (in UTC session it accidentally
worked; under IST it would shift 5.5 h and "detect" fake breaks).
*Fix:* naive UTC-wall values are formatted **directly** — no `AT TIME ZONE`.

### The web app

**A9. Booking could only ever offer TODAY.**
Re-validation called the 14-day grid with `days=1` and checked `grid[0]` — any
tomorrow+ booking would 400 even though the UI offered it. Caught by reading my own
code during e2e design; *fix:* `freeSlotsOneDay(doctorId, dateISO)` validates the exact
requested date (and the e2e proves a +3-day booking 201).

**A10. Patient-overlap query had `id <> $4` with `""`** — empty-string → uuid cast
error at runtime. *Fix:* removed; also made the overlap test a real **half-open
interval** comparison (back-to-back 15-min slots don't collide; a 15-min inside a
30-min does) — `overlaps()` has unit tests pinning both.

**A11. Cancelled appointments poisoned their queue token.**
`one_token_per_doctor_per_day` has no status filter (by design — tokens are a
historical ledger). Cancel kept `tokenNo=1`, so the *next* patient getting token 1 hit
the unique index → 409 `already_booked` on a genuinely free slot. Two bugs in one:
wrong behaviour **and** a wrong error message.
*Fix:* cancel / no-show / doctor-cancel set `"tokenNo"=NULL` (the index ignores NULL),
token = `MAX(tokenNo)+1` over rows that still hold tokens, and a token-index conflict
now returns a distinct `token_race` asking a retry. e2e: *cancel → another patient books
the same slot* passes.

**A12. Unquoted camelCase in DML.** `SET tokenNo=NULL`, `isChronic` in an INSERT list —
Postgres folds unquoted identifiers to lowercase → `column "tokenno" does not exist`
500s at runtime. *Fix:* quote all identifiers; a `grep` sweep confirmed no others.

**A13. `consents` GET forgot `doctorId`.** The approve button sent `doctorId: undefined`
→ 400 validation. *Fix:* return the column (e2e grant step now passes).

**A14. The stale-consent deadlock with the pair index.**
`one_active_consent_per_pair` counts REQUESTED/APPROVED rows **regardless of expiry**.
A lapsed-but-unmarked REQUESTED row would block every future consent for that pair.
*Fix:* grant flow first marks lapsed rows `EXPIRED` inside the same tx — the app
maintains the invariant the index assumes.

**A15. Client read a field the server never sent** (`inserted` vs `draftsInserted`) →
UI would have printed "Stored undefined draft row(s)." *Fix:* aligned names; the e2e
asserts the numeric field instead.

**A16. `runAllRules(record, [])`** — passed the dedupe set where the `today` string
belongs; TypeScript caught it, but it shows how an easy silent-wrong becomes loud.
*Fix:* explicit `todayISO`.

**A17. `requireRole` threw API-style errors inside RSC pages.**
Anonymous visit still redirected (307) but logged scary server errors.
*Fix:* `viewerForPage()` — same guards, but `redirect()` typed to return non-null.

**A18. e2e phone generator invented letters** (`Date.now().toString(36)` → non-digits)
→ signup 400. And two e2e **expectations were wrong, not the code** (the ported parser
keeps `en–dash` and digit-less lines exactly like the python original; alert text is
lowercased like python). *Fix:* tests pin the **source behaviour**, not wishful
behaviour — that is what a port test is for.

**A19. Vacuous PASS discipline** — after A1 bit twice, every assertion now checks the
state exists before checking its content (row counts, non-empty lists, exact status).

**A20. "Sign in nahi ho raha" — cookie silently dropped inside an iframe (user-reported).**
The session cookie was `SameSite=Lax` with `secure` keyed off `NODE_ENV`. The live
preview embeds the app on *another* origin, i.e. a cross-site frame: Chrome refuses to
*store* a Lax cookie set from a cross-site response, so `/api/auth/login` returned 200,
the client did `router.push("/patient")`, the server saw no cookie and bounced to
`/login` — the page appeared to "do nothing". Every curl-based check had passed because
curl is not a browser. Fix: attributes are now decided **per request** from the
browser-visible scheme (`x-forwarded-proto` first hop, then URL): HTTPS →
`SameSite=None; Secure; Partitioned` (CHIPS — survives third-party-cookie blocking),
plain-http dev → `Lax` (Chrome rejects None-without-Secure). Logout/purge expire the
cookie with the **same** attributes via `expireSessionCookie()` — a non-partitioned
delete does not remove a partitioned cookie. Regression: `auth-cookie.test.ts` + e2e §8.
Consequence handled: with `SameSite=None` the Origin check is now *load-bearing* for
CSRF, so a second belt was added — any request body must be `application/json` (415
otherwise); an HTML `<form>` can only produce urlencoded / multipart / text/plain.

**A21. CSRF guard compared browser `Origin` against the *internal* `Host`.** Behind a
TLS-terminating proxy Next sees `Host: localhost:3000` while the browser sends
`Origin: https://<public-host>` → every legitimate login would 403 `csrf_origin`. Now the
first hop of `X-Forwarded-Host` is accepted alongside `Host`. Pure decision extracted to
`src/lib/origin.ts` so it is unit-tested without `next/headers`.

**A22. Wrong error label (false logic).** The mismatch `fail()` was thrown *inside* the
`try` that parsed the Origin URL, so the `catch` relabelled every real cross-origin
attempt as "malformed Origin header". Parse in try, compare outside. Found by the
HTTP test in A21, pinned in `origin.ts` tests.

**A23. Login page gave zero feedback when the cookie was rejected.** After a 200 from
`/api/auth/login` the page now calls new `GET /api/auth/me` (returns `{viewer:null}`
with 200 for anonymous, never 401) and, if the server does not recognise the session,
says so — with an "open in a new tab" link when it detects it is framed
(`window.self !== window.top`, via `useSyncExternalStore` so SSR/hydration agree and no
`setState`-in-effect lint error).

**A24. Dev server OOM-killed mid-session (2 GB sandbox, no swap).** `dmesg`:
`Out of memory: Killed process (next-server) anon-rss:1496656kB` while Turbopack compiled
routes on demand under e2e load — the second plausible cause of the user's failed sign-in
(a dead server behind the preview). The preview now runs the **production build**
(`next build` with the heap cap, then `next start`): RSS ≈ 160 MB after 3 full e2e runs
vs ~1.5 GB for dev, and e2e drops from ~20 s to ~1.7 s per run. `npm run dev` remains for
development with hot reload.

**A25. Cloudflare build: `Could not resolve "pg-cloudflare"`.** `pg` loads its Workers
socket implementation only under the `workerd` export condition. Next's output-file tracing
resolves the package with the *default* condition (→ `dist/empty.js`), so the real
`dist/index.js` never reached the bundle and esbuild failed. Fixed with
`outputFileTracingIncludes: { "/**/*": ["./node_modules/pg-cloudflare/**/*"] }` in
`next.config.ts`. (I first misread a truncated `ls` as "the package is broken" — it was not;
the trace copy was.)

**A26. Seed hashed passwords at a cost the deploy could not afford.** `scripts/seed.mjs`
hard-coded scrypt N=16384 while the Worker's `SCRYPT_N` is 4096 for the free-plan CPU
budget. Result would have been: build green, deploy green, and *every demo login* burning
~80 ms CPU → error 1102 on the free plan. Seed now reads the same `SCRYPT_N` knob with the
same validation; the deploy script exports it for both. Verified: all 9 seeded users carry
`scrypt$4096$…`.

**A27. OpenNext build OOM-killed while `wrangler dev` was running** (2 GB box, no swap;
`dmesg`: killed `node` at 741 MB RSS with workerd + miniflare + esbuild ≈ 700 MB alongside).
The dying build had already emptied `.open-next/`, so the running local Worker started
serving 404s — misleading if you do not check `dmesg`. Procedure now: stop the local
Worker → build → start. Documented in DEPLOY_CLOUDFLARE.md.

**A28. e2e §8 proxy simulation is not portable across runtimes.** wrangler dev rewrites
`X-Forwarded-*`, so five proxied-header checks failed on workerd although the app was
correct (behind real Cloudflare the Worker sees the public Host and an https URL directly).
The suite now probes once and reports those five as *skipped with the reason*, instead of
either failing or silently passing.

**A29. `pg.Pool` had no `error` listener** — on serverless Postgres (Neon scales to zero
after 5 min) the server closes idle sockets; pg then emits `error` on the pool and, with no
listener, Node treats it as an uncaught exception → the whole process / Vercel instance
dies mid-request. Never showed locally because the sandbox Postgres never drops idle
connections. Added the listener (pg evicts the dead client), `idleTimeoutMillis: 20 s`,
`connectionTimeoutMillis: 10 s` (covers a 0.5–3 s Neon wake), `keepAlive`, and exactly one
transparent retry for server-went-away errors (`isTransientConnError`, unit-tested to
*never* retry SQL/constraint/timeout/auth errors — those are real answers).

**A30. My own tamper test used a wrong column name** (`entityHash` for `entryHash`), the
UPDATE hit 0 rows, and the bootstrap "passed" the tampered-ledger case. Caught only because
the plan was to *see it fail*; re-ran with `UPDATE 1` confirmed → `ledger_verify()` reported
2 breaks and the script exited 1. Same lesson as A1/A19: a negative test must prove it
actually altered state.

**A31. The e2e suite's "green" partly depended on the calendar.** `pickDay()` added a
"+12 h noon-UTC safe zone" before converting to an IST date, which rolls the date one day
forward whenever the suite runs after 12:00 IST. It also only avoided Sundays, while the
doctor it books against is a *freshly signed-up* one whose default hours are
Mon/Wed/Fri 10:00–13:00 and Tue/Thu/Sat 16:00–19:00 — so a 10:00 IST booking is only
offered three days a week. Every earlier 55/55 happened to land on a morning day; the first
run on a Sunday afternoon picked Tuesday and failed 6 booking checks with
`slot_not_offered`. Fixed: the day is computed directly in IST and must be Mon/Wed/Fri
(1..7 days ahead, always inside the 14-day horizon); verified around IST midnight on both
sides. Re-run 55/55 twice on the A29 build. Lesson: a test that derives "a valid input"
from wall-clock time must derive it from the *same rules the system uses*, not from a
loose approximation.

**A32. `vercel link` silently rewrites `.env.local`.** CLI 60 auto-runs an env pull after
linking; the first link appended a `VERCEL_OIDC_TOKEN` to the developer's `.env.local`, and with
the Neon integration installed it would have replaced the local `DATABASE_URL` with the cloud
one. The deploy script now snapshots `.env.local` before `link` and restores it after.

**A33. The deploy script guessed the production alias** (`https://<project>.vercel.app`). Vercel
assigns `citycare-xi.vercel.app` + `citycare-<team>.vercel.app`; the guessed name belongs to
someone else, and the per-deployment URL it fell back to sits behind SSO deployment protection —
so a healthy deploy reported "smoke test failed". Fixed: aliases are read from `vercel inspect`.

**A34. …and `vercel inspect` prints its report on stderr.** The first version of that fix used
`2>/dev/null`, so the alias list was always empty, the pipeline returned non-zero and `set -e`
ended the script *silently* after a successful deploy. Fixed with `2>&1`, `|| true` on the
substitutions, and an `ERR` trap that names the failing line — a script that can die without a
message is a script that lies about its result.

**A35. Re-running the deploy script would have rotated `SESSION_SECRET`.** It generated a new
secret whenever none was exported and `--force`d it onto the project, which invalidates every
existing session cookie on each redeploy. Now: explicit value → set; already on the project →
kept; missing → generated once.

**A36. The e2e cookie checks assumed `BASE` is plain http.** Against the live https URL they
demanded *no* `Secure` flag (and one logout header), i.e. they would only pass on an insecure
deployment. Checks are now scheme-aware: https top-level → `Lax; Secure`, https embedded →
`None; Secure; Partitioned`, logout over https must expire both shapes. Also the helper's default
body was `embedded:true`, so the first "top-level" assertion tested the iframe path — fixed by
passing `embedded:false` explicitly. Live result after the fix: 52/0/5 twice.

---


**A37. The site could be framed by any origin (clickjacking).** No `X-Frame-Options`, no CSP
`frame-ancestors`. A consent "Allow" button under a transparent iframe is the textbook attack on a
consent UI. `next.config.ts` now sends `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (camera/mic/geo off) and `Content-Security-Policy: frame-ancestors 'self'` +
`X-Frame-Options: SAMEORIGIN` (live-verified after deploy). The one legitimate embed (this sandbox's preview iframe) is opted in with
`ALLOW_EMBED=1` **at build time** — headers are captured into the routes manifest at `next build`,
so setting it only for `next start` does nothing (learned the hard way). Vercel builds never set it.

**A38. Account lockout was permanent — a free denial-of-service.** Five wrong passwords against
*anyone's* email locked that account forever (until a DB edit). Now a **15-minute sliding window**:
inside it `429 {code:"locked", retryAfterMin}`; after it, a correct password logs in and resets the
counter. Implemented in SQL from `updatedAt` age — no schema change. Verified: 6 fails → 429; still
429 with the right password; `updatedAt` aged 16 min → 200, `failedAttempts = 0`.

**A39. scrypt cost was 2^14 — 8× below OWASP's minimum.** Default is now **N=2^17, r=8, p=1**
(≈430 ms here) with `maxmem` 256 MiB (Node's 32 MiB default throws above N=2^15), and
`needsRehash()` upgrades old hashes transparently on the next successful login (seed hashes are
N=4096 for speed; `vikas@demo.in` was observed going 4096 → 131072). The parsed N from a stored hash
is capped at 2^20 before it reaches `scryptSync` — a hostile hash must not be able to OOM the server.
`engines.node >=20.9` added. Cloudflare Workers keep `SCRYPT_N=4096` (10 ms CPU budget).

**A40. Two tabs highlighted at once.** `path.startsWith(href + "/")` made the root tab (`/patient`)
active on every sub-route. `activeTab()` now picks the **longest** matching prefix, only that one;
4 unit tests (`tabs-active.test.ts`).

**A41. Patient layout made three round-trips per navigation** (name, pending consents, drafts).
One query with two scalar sub-selects; on Vercel→Neon that is ~110 ms saved per page.

**A42. `DATABASE_URL_UNPOOLED` always won**, so pointing `DATABASE_URL` at another provider did
nothing while Neon's Marketplace vars lingered. New rule: `DATABASE_URL` wins unless it is a
*transaction* pooler (`-pooler.` host, `pgbouncer=true`, or `:6543`), then the direct sibling is used.
The live Neon path is unchanged (its `DATABASE_URL` is `-pooler.`).

**A43. Dead code with a live bug in it.** `src/components/AppNav.tsx` was an unused duplicate of
`tabs.tsx` carrying the A40 bug. Deleted; zero importers.

**A44. No health endpoint, no keep-alive.** `GET /api/health` reports DB reachability, session
`TimeZone` (must be UTC), `statement_timeout`, Postgres version and `ledger_verify()` breaks —
503 when degraded. `vercel.json` now has a daily cron hitting it, which also keeps a free Supabase
project from being paused for idleness. Public and secret-free by design.

**A45. Seed built each allergy's reaction text and then never inserted it** (`rx` unused — ESLint
had been saying so). Doctor screen showed "Penicillin · CRITICAL" with an empty reaction. Column
added to the INSERT; Ramesh now reads "rash + swelling (childhood)". Two other unused variables
(`users`, `encPrev`) were dead weight and are gone; the `name` argument that `mkUser` never read is gone too.

**A46. `statement_timeout` was silently 0 in production.** The app sets it as a pg *startup*
parameter, which Neon's proxy (and Supavisor, and Hyperdrive) may drop; the new `/api/health`
showed `"statementTimeout":"0"` live vs `"8s"` locally — a hung query would have run until Vercel's
30 s kill. `db-bootstrap.sh` now runs `ALTER ROLE CURRENT_USER SET statement_timeout='8s'` and
`… SET timezone='UTC'` (a role may always alter its own defaults; applies to every new session on
any provider). Live now reports `8s`; `pg_roles.rolconfig = {statement_timeout=8s,TimeZone=UTC}`.

**A47. Three copies of the "where does this role go" rule disagreed.** `login/page.tsx`, both
layouts and the landing each hard-coded `DOCTOR → /doctor else /patient`; with an admin role that
meant an admin bouncing between `/patient` and `/doctor` forever. One `homeFor(role)` in
`src/lib/roles.ts`, used everywhere, with a unit test. `requireRole`/`viewerForPage` now take a
role list.

**A48 (design gap, not a crash). Doctor signup was open** — anyone could register as a doctor,
appear in search and receive consents. Now: registration number required (regex), `isVerified=false`
at signup, hidden from search, booking/consent/record/encounter/break-glass all `403 doctor_unverified`
until an admin approves in `/admin`. Verified by 9 e2e checks. (Was drawback D36.)

**A49 (found while writing F2).** The one-active-consent-per-pair partial index would have rejected
an emergency consent whenever a stale `REQUESTED` row existed for the pair. The emergency route
expires such rows in the same transaction (`revocationReason = 'superseded by emergency access'`)
and refuses with `409 consent_live` when an APPROVED one is already live — no override where none is
needed.

**A50. Notification rows were write-only.** Three routes inserted them; nothing ever read them.
`/api/notifications` (+ `?count=1`), `/api/notifications/read`, inbox pages for all roles, header bell,
tab badge; `href`/`severity` columns via migration 0001.

**L1 legal round.**

| # | Bug / false logic | Fix |
|---|---|---|
| A51 | App copy still promised a "**7-year** statutory retention" (purge API response + purge panel) although the plan review had already established there is no such figure (NMC/MCI Reg. 1.3.1: 3 years; DGHS manual: up to 10 years). A false legal statement shown to users. | Copy corrected in both places; the number now lives only in `src/lib/erasure.ts` comment + `LEGAL_COMPLIANCE.md` |
| A52 | **Erasure left the inbox behind**: `Notification` rows (which quote names, doctors and clinical facts, e.g. the emergency reason) survived "Erase my data". | `erasePatientData()` deletes the user's notifications and the nominee fields; purge route and retention sweep share the one implementation |
| A53 | **Signup recorded no consent at all** — no notice link, no checkbox, no artefact. Under DPDP s.6 that is processing without demonstrable consent. | Stand-alone notice pages; `acceptPolicy`/`adult` as `z.literal(true)` server-side; `PolicyAcceptance` rows written in the signup transaction; `GET /api/legal/acceptance` |
| A54 | **Minors could self-register** (DOB was accepted at any age) — DPDP s.9 forbids processing a child's data without verifiable parental consent. | `isMinor()` (calendar-correct) → `400 minor_needs_guardian`; adult attestation required even without DOB; guardian flow queued (F13) |
| A55 | Designing the retention sweep exposed a hole: the seed exemption was "email ends with `@demo.in`", and anyone could self-register such an address and become un-sweepable. | Signup refuses the reserved domain (`400 reserved_domain`); e2e accounts moved to RFC 2606 `@e2e.test` |
| A56 | `/api/health` was the cron target; adding a second Hobby cron risks the 2-job plan limit and splits responsibilities. | One daily job `/api/cron/daily` (sweep + ledger verify), bearer-secret protected; `/api/health` stays public for uptime monitors |
| A57 | The patient's transparency ledger only showed `Patient`-keyed and consent-keyed rows; account-level events about the same person (`POLICY_ACCEPTED`, `ACCOUNT_UNLOCKED`, keyed by `User`) and grievances they filed were invisible to them. | `ledgerForPatient` also includes `User` rows for the owner's uid and `Grievance` rows filed by them (e2e asserts GRIEVANCE_OPENED/UPDATED and POLICY_ACCEPTED appear) |
| A58 | `SPECIFIC_CONDITION` scope filtered **encounters** by condition but passed **all** labs and prescriptions through — a "diabetes only" consent leaked the CRP from the fever visit. | Scope filter extracted as pure `applyScope()`; labs/prescriptions are restricted to the matching encounters; `scope.test.ts` pins every scope (D19 closed) |
| A59 | `hashPassword/verifyPassword` used `scryptSync` on the request thread — 2^17 scrypt froze the whole Node event loop ~80 ms per login (D2). | Promisified `crypto.scrypt`; a test proves a timer keeps ticking during a hash |
| A60 | A stolen JWT stayed valid until expiry; logout only cleared the cookie (D21); no way to see or end other devices (D14). | `Session` table: every JWT carries `sid`, `getViewer` joins the live row, logout revokes it, `{everywhere:true}` revokes all, `GET /api/auth/sessions` lists them, purge revokes every session of the owner |
| A61 | Signup/login/emergency had per-account lockout but no per-IP or per-user throttle (D37): one IP could hammer 100 accounts × 4 attempts forever. | Postgres-backed fixed-window `RateLimit` (`ratelimit.ts`) — login 60/10 min/IP, signup 20/h/IP, grievance 10/10 min/user … → 429 `rate_limited {retryAfterSec}`; windows pruned by the daily cron |
| A62 | Old cookies minted before A60 have no `sid`; treating them as valid would have kept the pre-session weakness alive. | `verifySession` rejects tokens without `sid` → anonymous → user simply signs in again (one-time logout for everyone at deploy; disclosed) |
| A63 | Locked accounts were invisible to admins; the only unlock was a SQL statement (D9). | `/admin/system` "Locked accounts" card + `POST /api/admin/users/[id]/unlock` (ledgered, user notified); e2e now unlocks `anita@demo.in` instead of leaving her locked (D16 closed) |
| A64 | e2e `check()` for the L1 acceptance flow could not exercise an outdated notice without a schema hook. | e2e reads `DATABASE_URL` from `.env.local` and backdates the acceptance with `pg`, then proves 428 → re-accept → 200 (skips cleanly against a remote BASE) |
| A65 | `notify()` for a dependent's login-less user would have written to an inbox nobody can open. | `notify()` and the incident fan-out re-route to the guardian's user id, prefixed with the child's name |
| A66 | Route files exported helper symbols (`ownProfile`, `MAX_DEPENDENTS`) — Next 16 rejects non-route exports at build. | Moved to `src/lib/dependents.ts`; nothing but handlers is exported from `route.ts` files |

| A67 | Access & trust said "you accepted notice v2026-09-28" by printing the *current* constant, not the user's own `PolicyAcceptance` row — a version bump would have shown a version the user had never seen. | Page reads `consentStatus(uid).accepted`; the 428 gate and the page now agree |
| A68 | `VerifyDoctorSchema` accepted `{decision:"APPROVE"}` with nothing else — the "human check" of the register was a hope, not a record (D12/L-G7). | Approval requires `register` (NMC_IMR / STATE_COUNCIL / HPR) + `attested:true`; the attestation sentence is stored in `verificationNote` and in the ledger meta; e2e proves the bare approve is now a 400 |
| A69 | The privacy notice said "original files are not stored" — true until this round, false the moment uploads shipped; a notice that lags the code is a DPDP s.5 defect, not a typo. | Notice bumped to v2026-09-29 (files, e-mail codes, anchors added to the inventory); every existing user re-accepts on the next mutation (428), demo seed re-run |
| A70 | A guardian-created dependent carries a `PolicyAcceptance` written *by the guardian*; after handover the adult would have inherited a consent they never gave. | Handover withdraws those rows (`withdrawnAt`) so the adult's first action is a 428 → they accept personally (e2e §11) |
| A71 | Multi-seat slots would have double-counted: `slotRulesAndBooked` returned one `scheduledAt` per booking, but `freeSlotsForDay` collapsed them into a `Set`. | `Map<instant, bookedCount>` + per-instant capacity; booking picks the lowest free `seatNo` inside the transaction; the partial unique index now includes `seatNo` |
| A72 | `link` route answered 403 `not_yours` for another patient's document id — an existence oracle (UUIDs make it cheap, but the dependents routes already answer 404; be consistent). | 404 `not_found` for any document that is not yours |
| A73 | `recover`/`reset` answered 400 for a wrong code while `login` answers 401 for a wrong password — same class of failure, two status codes, confusing for the client and for rate-limit dashboards. | Both 401 `bad_code`; validation failures stay 400 |
| A74 | `security-panel` used `window.location.assign("/login")` after sign-out-everywhere — Next 16 lint flags it and it skips the router cache invalidation. | `router.push` + `router.refresh` |
| A75 | e2e computed the F13 synthetic DOBs as `now − N×365.25d`. The fractional day drifts the date of birth by up to a full day around the exact Nth anniversary — on **2026-11-01** (the synthetic child's exact 7th birthday) `7×365.25d` lands 6 h into the *next* day, so "age 7" was 6 and 2 checks failed. Pre-existing, date-dependent, unrelated to F5 (the F5 run is what happened to hit the birthday). | `dobYearsAgo(n)` at the top of `scripts/e2e.mjs`: calendar-year math, DOB at UTC midnight of the anniversary (`ageFrom` is UTC-based, so age is exactly N for the whole day). All five 365.25-d sites swept, not just the failing one. |
| A76 | **Production 500 on every record page (owner screenshot, 2026-11-01).** F5's `recordSections` now selects `"refLow"/"refHigh"` from `Observation` (migration `0005`) — but Vercel git deploys run `next build` and **nothing ever applies migrations to production**; the schema only moved when a human ran the bootstrap (the fresh-stack run applied 0001–0004, pre-F5). Result: `ERROR 42703: column "refLow" does not exist` on the live site for `/patient`, `/patient/records`, the doctor record API and the doctor patient page — while `/login` still worked, which is why it looked fine at first. Reproduced locally: scratch DB with base + 0001–0004, exact F5 query → same 42703. | `prebuild` hook (`web/scripts/prebuild-schema-sync.mjs`, wired in `package.json`): every `npm run build` first runs the idempotent `db-bootstrap-node.mjs` when `DATABASE_URL` is set — migrations apply **as part of the deploy**, so code and schema always move together; an unreachable/mismatched schema now **fails the build loudly** instead of shipping a 500 (negative-tested: bad URL → prebuild exits 1 before `next build` starts). Locally without `DATABASE_URL` it's a no-op, so `npx next build` is untouched. Plus the missing e2e guard: `A76:` — a logged-in patient's `/patient` home must render 200 with content (the exact page that shipped broken). Verified on the repro DB: prebuild applies 0005 + seeds a fresh DB → F5 query OK; idempotent re-run exit 0; no-URL no-op exit 0. |
| A77 | **pg 8.23 has no COPY protocol, and the first adapter deadlocked (NG-S09, 2026-11-01).** `Query.handleCopyData` is a no-op (COPY TO data silently dropped) and `handleCopyInResponse` fails with "No source stream defined" — so a `pg.Query` subclass adapter (`src/lib/pg-copy.mjs`) was written. Adapter v1 made both query objects *thenable* (a `then` method wrapping the internal promise). The internal promise resolved with **the query object itself**, so the promise-resolution procedure called `q.then(...)` to "unwrap" it — which returned the very promise being unwrapped → circular wait, pending **forever, silently** (no error, 5 unit tests timed out). Found by one-method-at-a-time bisection: removing only `then` fixed it. | The query objects **never define `then`**: TO returns the non-thenable async-iterable query; FROM returns a plain (native) Promise. Pinned by a regression test asserting `typeof q.then === "undefined"` on the TO query. Rule recorded in the module header. |
| A78 | **Silent backup corruption: CopyData chunks are Buffer VIEWS into a reusable parser buffer (NG-S09, 2026-11-01/02).** `pg-protocol`'s `parseCopyData` → `reader.bytes(len)` → `this.buffer.slice(...)` — a *subarray view*, not a copy. The parser's `mergeBuffer()` overwrites that buffer on subsequent socket events (including a self-copy when it reuses the buffer: `this.buffer.copy(newBuffer, 0, …)` with `newBuffer === this.buffer`). Holding chunk views past the current event corrupts them — the 2026-11-01 restore drill caught **NUL bytes materialising inside UUIDs** in the `Notification` section; the server aborted the COPY (`idle in transaction (aborted)` + ClientRead). Row counts and even the payload sha would **not** have caught it: the file self-consistently verifies. | `handleCopyData` now does `Buffer.from(msg.chunk)` (copy, not alias). Pinned by a regression test: hand the query a `subarray` view, mutate the backing buffer afterward, assert the iterator still yields the original bytes. A new drill gate (`contentMatch`) re-COPYs every restored table and byte-compares against the manifest — the corruption class is now end-to-end detectable. |
| A79 | **Server-side COPY errors were swallowed by the adapter (NG-S09, 2026-11-01).** `pg.Query.handleError(err)` does `if (this.callback) return this.callback(err)` and **only emits `'error'` when no callback exists** — the adapter constructed its queries with a no-op callback, so a server ErrorResponse during COPY (e.g. the NUL-byte abort of A78) went into the void: the promise hung instead of rejecting, and the drill looked like a hang, not a failure. | Both adapter queries are constructed **without a callback** (`super({ text })`), so pg forwards errors as `'error'` events → the iteration rejects / the FROM promise rejects. Regression test calls `q.handleError(err, null)` and asserts the rejection. |
| A80 | **The drill's scrypt verifier was wrong twice (NG-S09, 2026-11-02).** (a) Node's `scryptSync` refuses >32 MiB by default; the app's default work factor is N=2^17 (128 MiB), so verifying a default-strength hash threw `RangeError` — swallowed by the `catch` as "wrong password". (b) The fix introduced a **TDZ bug**: `verifyScrypt` is a hoisted function called from the top-level flow, but `const SCRYPT_MAXMEM` was declared near the *bottom* of the module → `ReferenceError: Cannot access 'SCRYPT_MAXMEM' before initialization`, swallowed by the same `catch`. Both failures looked identically like "login gate false" — the hash was correct both times. | The drill's verifier now mirrors `src/lib/auth.ts` `verifyPassword` exactly (`maxmem: 256 MiB`, defensive N bounds ≤ 2^20, constant-time compare), and `SCRYPT_MAXMEM` is declared at module top with a comment explaining the TDZ trap. |
| A81 | **The drill exited silently on gate failure (NG-S09, 2026-11-02).** Only `fail()` (exception path) and the success path printed the JSON report; a *gate* failure (e.g. `login.ok=false`) fell through to `process.exit(1)` with **no output** — e2e saw `code 1 null` with no evidence trail, which cost real diagnosis time. | The report is now **always** printed (success, gate failure, or not); exit code still encodes success/failure. |
| A82 | **e2e D6 capacity check was not idempotent across runs (2026-11-02).** D6 books a **fixed** future instant (11-04 12:45 IST) with fixed seeded users (vikas = b2, sunita = b3), and e2e does **not** reseed between runs. On a warm DB, vikas still holds a seat at `at` from the previous run → b2 correctly gets `409 patient_overlap` (the server behaved right!) and the expected `201/201/409` pattern becomes `201/409/201` — observed on the second run of the day. | Before the three bookings, the check deletes the three test patients' prior appointments at `at` (comment explains why), so the capacity check measures only this run's bookings. Verified: back-to-back full e2e runs both green (257/257). |
| A83 | **The demo retention sweep ran unconditionally on every deployment (NG-S15, found 2026-11-01, fixed 2026-11-02).** `/api/cron/daily` erased every self-registered non-`@demo.in` account older than 7 days with **no environment gate** — a pilot or internal deployment reusing this code would silently auto-erase real patients/doctors on day 8 (`DATA_ERASED reason=demo_retention`). The demo *banner* flag (`NEXT_PUBLIC_DEMO_MODE`) gated the UI copy, not the erasure. | New `src/lib/retention-core.mjs` (pure, unit-tested): the sweep runs **only** for an explicit, consistent `RETENTION_POLICY=demo` (banner on); `internal`/`pilot`/missing/invalid/contradictory ⇒ **disabled (fail-safe)** + loud console warning. Cron executes **zero** sweep SQL when disabled; `/api/health` + cron response expose the safe policy subset (`policy`/`enabled`/`reason`/`days`/`protectedDomain`). All disclosure copy (banner, privacy §1/§6 + i18n summary, terms, signup) now states what THIS deployment actually does. 13 unit tests + 15 e2e checks (incl. behavioural: 10-day demo account erased, fresh account survives, seed protected, no secret leak, notice copy matches). |
| A84 | **`web/.gitignore`'s `.env*` rule ignored `.env.example` itself (NG-G01 root cause, found 2026-11-02).** The onboarding docs say `cp .env.example .env.local`, but the template could not exist in the repo at all: the blanket `.env*` pattern (whose own comment says "can opt-in for committing if needed") refused to track it — even after writing the file, `git add web/.env.example` failed with "paths are ignored". The missing-file symptom was actually an un-trackable-file symptom. | Added `!.env.example` after `.env*` in `web/.gitignore`. Verified with `git check-ignore`: the template is now trackable while `.env.local`/`.dev.vars` stay ignored. The template is value-free by construction (secrets are empty lines with generation commands), so tracking it leaks nothing. |
| A85 | **Batch-1 docs claimed `@vercel/blob` was "an existing declared dependency" used for documents (NG-S09 doc pass, found in the 2026-11-02 correction audit).** Both halves were false: (a) documents are Postgres `DocumentBlob` rows — nothing in `src/` imports the SDK except `backup-core.mjs` (backup files); (b) the package is **not** in `web/package.json`, **not** in `package-lock.json` (verified: 961 lock entries, zero `@vercel/blob`), and **not** in `node_modules`. The build still succeeds because the import is dynamic (`import("@vercel/blob")`) — Turbopack leaves it as a runtime import, so the failure surfaces at runtime, not build time. | Docs corrected with explicit correction notes (2026-11-02): `BACKUP_CONFIGURATION.md` (prod prerequisite + the exact required action), `BACKUP_AND_DISASTER_RECOVERY.md` §2, `CITYCARE_DAY_1_REPORT.md` §7/§10, register NG-S09 entry. **Consequence (loud, not silent):** on Vercel the blob store path throws `BackupError("store", "@vercel/blob unavailable")` → the backup cron records a failed `"Backup"` metadata row and `/api/health` shows `stale:true` — a visible, auditable failure, never a partial file. **Exact required action (owner approval, one-line change):** in `web/` run `npm i @vercel/blob` (updates `package.json` + `package-lock.json`), `npm run build`, re-run e2e (local-store path is unchanged; the blob path is only exercised on Vercel), then the production backup cron can succeed. Deliberately **not** done in this docs-only audit batch — no new runtime dependencies without owner approval. |
| A86 | **`@vercel/blob` 2.8.2 has no `delete` export — the code called the old name (found 2026-11-02, final-verification batch, by inspecting the *installed* package after the owner-approved install).** `pruneBackups` called `blob.delete(...)`; Vercel renamed `del`→`delete` across the v2 minors and 2.8.2 (the installed version) ships **only `del`** — the docs for later versions show `delete`, which is exactly why trusting the docs (or an older mental model) would have shipped a crash: the first production blob prune (`> 30` files) would have thrown `blob.delete is not a function` inside the backup cron. | `pruneBackups` now resolves the name tolerantly — `const rm = blob.delete ?? blob.del` — and throws a loud, specific error if **neither** export exists (never a silent no-op). Pinned by a unit test (`backup-core.test.ts`, "prune tolerates the v2 del API") that mocks the installed shape (`del` present, `delete` undefined) and asserts the deletion actually happens, newest-first, newest file always kept. Rule recorded: after installing a dependency, verify the exact exports of the *installed* version, not the docs. |
| A87 | **Drill gate 7 swallowed the child's verdict on non-zero exit and mislabelled it a restore crash (found 2026-11-02, final-verification batch, first e2e §16d run).** `verifyOneDocument` caught the child's non-zero exit and rethrew if the stderr didn't look like a TS-extension error — but a *legitimate negative verdict* (`not_found`, `decrypt_failed`) exits non-zero with the JSON verdict on **stdout** and a benign runtime warning on stderr, so the verdict was lost and the drill reported `restore failed: Command failed: … verify-document.ts` — a verification *result* dressed as a restore *crash*, with `checks.documentVerify` missing from the report. | `verifyOneDocument` now parses the verdict JSON from `e.stdout` on **every** non-zero exit first; only when there is no parseable verdict does it classify (`verify_runner_failed` with the stderr detail, or the tsx fallback on a genuine TS-extension error). Runner problems and verification results are distinct error classes in the report. Verified by e2e §16d negative path: unknown id ⇒ `documentVerify.found=false`, `status:"failed"`, `scratchDropped:true` — and the scratch-drop cleanup (DrillFail + `createdScratch`) now covers this path too. |
| A88 | **Drill content gate compared raw COPY text and went FALSE RED on a perfectly correct restore (found 2026-11-02, final-verification batch, e2e run after the snapshot-transaction change).** Gate 5b asserted `re-COPY text === manifest text` byte-for-byte, on the assumption "same server + same row order ⇒ byte-identical". PostgreSQL does **not** guarantee COPY row order (no `ORDER BY` = physical/heap order), and a fresh scratch restore has a different physical layout than the live table it was dumped from: after the e2e retention sweep + updates had displaced some rows in the live heap (updated tuples move), the dump's physical order and the scratch's COPY-FROM placement diverged — one 339 B `AuditLog` row landed in a free page-1 slot (placement is size-dependent on page fragmentation) instead of at the end. Result: **identical row multiset, identical total bytes, different row order ⇒ gate red, drill exit 1, e2e 3 false failures** (drill B-gate, content check, §16d drill) — a verification *tool* defect, not a data defect. Root-caused empirically: clean round-trip on a bare table reproduces it; **100% server-side** (`COPY … FROM '/tmp/file'` — zero client involvement) reproduces it; 347 individual `INSERT`s in the same order do **not** reproduce it (order preserved); minimal failing prefix = rows 0..346 (347 rows); page-slot evidence shows the late row occupying page 1's last free line pointer while the skipped row moved to page 2. | Gate 5b now compares the **exact sorted row multiset** (order-independent): any corrupted cell, flipped bit, NUL byte, missing row, or extra row still fails the gate — only legitimate physical re-ordering no longer does. The gate comment records the invariant change. e2e check name updated (A88). Note for the record: the earlier green drills (2026-11-01, 2026-11-02 06:05/08:38) passed because the live heap had not yet accumulated row-displacing updates — the gate was passing by layout luck, and this batch made the guarantee real. |
| A89 | **`verify-document.ts` called `process.exit()` inside try/finally, bypassing client cleanup (found 2026-11-02, final cleanup & safety patch, F1 review).** The old `out()` = `console.log(JSON); process.exit(code)` was invoked from *inside* the `try` block on every early-return verdict (`not_found`, `tombstoned_anomaly`, …) — `process.exit` kills the process without running `finally`, so `await client.end()` never executed on those paths (connection/socket cleanup skipped; the process death masked it). A second latent weakness: the helper only *connected* to whatever `SCRATCH_DATABASE_URL` it was given — nothing inside the process verified the target really was a drill scratch, so a fat-fingered production URL would have let it SELECT + decrypt a live document. | F1: refactored to a testable core (`verifyDocument()` — no `process.exit`, no argv, injectable `connect`) that **collects the verdict, closes the client in `finally` on every path (success, not-found, tombstone, decrypt-failure, identity-refusal, connect-failure, unexpected error), and only then returns**; `main()` prints the JSON line and **returns** the exit code; only the direct-invocation guard calls `process.exit`, and only after `main()` resolved (verdict printed + client closed). The one-JSON-line stdout contract and the 0/1 exit codes are unchanged (the parent drill's gate-7 parsing, A87, is untouched). F2: new **identity gate** — after connect, before any document SELECT, `SELECT current_database()` must match `^citycare_drill_\d{8}_\d{6}$` or the helper returns `errorClass: "unsafe_database_identity"` **without running the document query** and still closes the connection (the parent's scratch-drop cleanup is independent and still runs on every path). Also corrected the stale header comment (claimed exit `2` for usage errors; the code — and the parent's contract — use `1`). 7 unit tests pin: success, not-found, decrypt-failure, connect-failure, cleanup-after-negative (event order `identity → docSelect → end`), identity refusal (6 bad names, zero document SELECTs), and the usage/env contract without process exit. |
| A90 | **CI workflow unparseable ⇒ every CI run on the branch failed before a single test executed (found 2026-11-02, final cleanup & safety patch, F4 prep).** `.github/workflows/ci.yml` line 7 used a **flow-style** mapping with an unquoted expression: `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` — the `}` inside `${{ … }}` is a flow indicator, so the mapping is a YAML syntax error ("missed comma between flow collection entries" at 7:27; GitHub's parser rejects it the same way — the run fails as "workflow file issue" before any job step). The line was introduced in `9212ee4` (PR #5 merge into main), so **all** CI runs since that merge — including this branch's 5 runs — failed at parse time: the "CI green" assumption was false, and nothing had actually been verifying the four CI checks on any of those pushes. Second latent CI gap found while fixing it: the CI env block lacked `RETENTION_POLICY`, so even a parseable workflow would have failed the S15 e2e checks (armed-sweep assertions + the statically-prerendered legal pages bake build-time env). | `concurrency` moved to **block style** (the standard GH pattern — `${{ … }}` is safe in a plain block scalar): `concurrency:\n  group: ci-${{ github.ref }}\n  cancel-in-progress: true` — re-parsed and validated (js-yaml) after the change. `RETENTION_POLICY: demo` added to the CI job env with a comment (CI is a demo-equivalent throwaway environment; the e2e suite asserts the armed sweep and the matching notice copy, and Next.js statically prerenders the legal pages from **build-time** env — so the env must be present for the build, not only at `next start`). Recorded here because it silently invalidated the CI gate for every commit since the PR #5 merge — the branch's "green" was only ever the sandbox gauntlet. |
| A92 | **e2e NG-S14 pilot-app section: killing only the `npx` pid orphaned the `next-server` child, which kept port 3007 + its scratch-DB connections alive (found 2026-11-02, Day 2 WS-C, first green run of section 17).** `npx next start` forks a `next-server` child that owns the socket; `pilotProc.kill("SIGKILL")` killed only the npx wrapper. Consequence in the next run: the fresh `npx next start -p 3007` died with `EADDRINUSE`, the health-poll loop silently connected to the ORPHAN (from the previous run), and every "pilot" API check hit the previous run's scratch database — one check ("no demo records in the pilot DB … real registration is present") failed with `realPatient=0`, and the previous run's scratch DB refused to drop ("being accessed by other users"). The failure mode is the nasty kind: 18/19 checks green while the checks ran against the wrong database. Proven by evidence, not guessed: `EADDRINUSE` in the app log + the orphan's `/proc/<pid>/environ` showing the previous run's scratch `DATABASE_URL`. | Section 17 now (a) spawns the pilot app with `detached: true` and cleanup kills the **whole process group** (`process.kill(-pid, "SIGKILL")`) so the `next-server` child dies with it; (b) **pre-checks the port before spawning** — any HTTP response on the pilot port (something foreign already listening) fails the boot check loudly instead of proceeding against the wrong server; (c) retries scratch-DB drops (the killed app's sockets need a moment). Re-run: 305/305 e2e, exit 0, zero leftover `citycare_e2e_*` databases, port free afterwards. Rule recorded: when e2e spawns a server, kill its process group and verify the port is actually released — a surviving child is a silent cross-run data contaminator. |
| A91 | **CI e2e failed on the first runs that ever actually executed (found 2026-11-02, Day 2 precheck; the failure itself is not a Day-1 regression — it was masked by A90).** Runs 41438463442 / 41438467092 (branch head `f56ea86`) got through every step to `npx next build` and then failed at `e2e (HTTP, against the built app)` with exit 1. Root-caused by exact local reproduction (fresh `citycare_ci` DB, seed with CI's `SCRYPT_N=16384`, app + e2e started with *only* the CI workflow env, no `.env.local` involvement): the e2e backup/DR section (`B: backup cron runs with the secret…`, `B: a 'Backup' metadata row…`, `B: /api/health surfaces the backup fact (configured, lastSuccessAt set, not stale)`) runs **unconditionally** — but the CI env defined neither `BACKUP_KEY` nor `BACKUP_DIR`, so the app answered 500 `backup_failed_config` and no `Backup` row/health fact existed. 3 failed checks ⇒ exit 1. Attribution: the two B cron/metadata checks date from `e51e437` (NG-S09 backup work, pre-Day-1) and the health-fact check from `e11063d` (Day 1 final verification); **none of them had ever executed on CI** because A90's YAML parse error killed every run before step 1. The *real* defect was the CI env config: the workflow never gave the backup subsystem the store/key it needs, so the suite could never have been green on CI even before Day 1. | `ci.yml` now generates a per-run throwaway `BACKUP_KEY` (crypto.randomBytes(32), like the other CI-only keys — never a secret at rest) and sets `BACKUP_DIR: /tmp/ci-backups` (created in the schema step). Consequence: the e2e backup section now runs **fully** in CI — backup cron, encrypted-file verify, full isolated restore drill, concurrent-writer backups (S16b) and the document-level drill (S16d) — instead of the gated sub-checks skipping. Pre-push local validation of the exact fixed CI profile (fresh DB, env-only keys, SCRYPT_N=16384): **286 passed, 0 failed, 0 skipped, exit 0**. This is CI config for a synthetic throwaway env (as is `RETENTION_POLICY: demo`) — it must never be copied into production deployment config. |
| A93 | **Vercel production builds silently failed on EVERY deploy since the WS-C seed gate shipped (found 2026-11-02 while executing the owner-approved PR #7 merge + deploy).** The prebuild hook (`prebuild-schema-sync.mjs` → `db-bootstrap-node.mjs`, added in A76) runs the demo-seed gate before every build. The Vercel project `citycare-z95n` (production URL `citycare-z95n.vercel.app`) had **no `RETENTION_POLICY` set**, so from commit `60f9c63` (WS-C — first push of the gate) onward every Vercel build exited 2 with `seed gate: refuse — RETENTION_POLICY is missing/invalid (got: null)`. Failing deploys: `dpl_JALPEzoVG5A1icQL6mn2r8Juv5jU` (60f9c63), `dpl_C3uSmhJqPsWQ6Za5xzmvvj1d6MwY` (0fe6b4e), **`dpl_EwXSuiPZrsztBPh45vBUi5wTHv9e` (c47f9ff — the PR #6 merge to main, 12:36:54Z)**, `dpl_E81Mg3NHcHvcjC8TgAdYNYUVGtzL` (93d5c5d), `dpl_CAgooHFVWoNr8AXyNXj6s5WZJQ8J` (ba81248), `dpl_H6V9Hu1uzBGSJkvbwRfJXPT8JVZ8` (2b5122c — PR #7 merge, 13:11:21Z). Consequence: **production kept serving the pre-Day-2 build (`29706c9e`) the whole time — no Day-1/Day-2 code, including the F1 security correction itself, had ever reached the live site.** The gate behaved exactly as designed (refuse to build against an unverified environment); what was missing was the environment configuration — a build-path env var never added to the Vercel project, and nobody noticed the failing deploys for ~2h. | Fixed on the project side (no code change): set `RETENTION_POLICY=demo`, `SEED_DEMO=0`, `NEXT_PUBLIC_DEMO_MODE=1` on `citycare-z95n` (plain, production+preview — honest labels for the public-demo env: demo data, no auto-seed on deploys, demo-credential disclosure kept visible as the live build already showed it). Manual redeploy of `main` → **`dpl_B5fBtAoqPDrDbq2tZdZH36EMjmCe` READY + PROMOTED 13:14:22Z**, alias `citycare-z95n.vercel.app` assigned. Build-log evidence (13:13:51Z): `verified: 36 tables · ledger_append/verify · tamper trigger · 3 partial unique indexes · timezone=UTC` + `seed gate: skip — SEED_DEMO=0 — demo seed disabled; nothing was written and nothing was truncated` → production database byte-for-byte untouched. Both crons (`/api/cron/daily 0 21`, `/api/cron/backup 30 21`) now registered on the production deployment. Rule recorded: before merging code that a build-path step depends on, verify every env var that path reads EXISTS on the Vercel project — the fail-closed gate turns an unverified deploy into a loud build failure (good), but failing deploys must be noticed, not left to accumulate. |

**Stack bump (no bug id).** React 19.3.0, TypeScript 7.0.2 native `tsc` + 6.0.2 API (official alias
recipe), Tailwind 4.3.3. ESLint 10 blocked by `eslint-plugin-react` (`context.getFilename` removed);
Vitest 5 blocked by an npm 10.8 resolver crash — both pinned to their latest working majors and noted
in `FEATURES.md`. Lockfile regenerated; `npm ci` clean.

**UI round (no bug id).** Self-hosted Inter via `next/font/local` (no third-party font request),
design tokens + `:focus-visible` ring + one global `prefers-reduced-motion` rule, Motion
(`motion/react`) reveals / page transitions / `layoutId` tab underline, GSAP hero + MotionPath
consent diagram + ScrollTrigger steps, Lenis smooth scroll — **mounted on the landing page only**
(verified: the 159 KB gsap chunk is referenced by `/` and not by `/login` or `/patient`), skeleton
`loading.tsx` for `/patient` and `/doctor`. Landing is still a server component; all copy is in the
SSR HTML.

| A94 | **Exact-duplicate index on `Observation` in every database (found 2026-11-02, Day 3 database audit, NG-D01).** `citycare_init.sql:545` creates `"Observation_patientId_name_takenOn_idx" ON "Observation"("patientId", name, "takenOn")`, and migration `0005_observation_reference_bands.sql` later creates an index with the **identical column list** under a different name (`"Observation_patient_name_taken_idx"`) — the different name defeats `IF NOT EXISTS`, so fresh *and* existing databases both carry the duplicate (proven by the Day-3 drift check: pg_dump of the live DB == init+migrations output, duplicate included). Cost: double index maintenance on every Observation insert/update + double storage; zero query benefit (either index serves the trend query). | New idempotent migration `0007_dedup_observation_index.sql` drops the 0005 copy (`DROP INDEX IF EXISTS` — no query loses an index because the identical base index remains; no data touched). Verified on the live local DB (only base index + pkey remain), re-ran the whole migrations folder on the existing DB (clean, nothing changed), re-ran the fresh-vs-live drift check (still byte-identical), and pinned it in e2e §18.7a–d (duplicate absent, base present, full folder re-run clean, 36 tables / 2 Observation indexes after). | — |
| A95 | **Ledger appends ran outside the business transaction at most call sites (found 2026-11-02, Day 3 database audit, NG-D05 — the day's headline finding).** The scripted inventory (reconciled 2026-11-02, PR #9 review correction F2) found **48 `appendAudit` call-sites total, only 5 passing the tx client (`q: c`)** before the fix — the break-glass route, appointment-status (2 actions), booking-cancel, and doctor-verify. The other 43 ran **after** the business `COMMIT` as an independent autocommit. Failure mode: consent approved (committed) → process killed / append times out → the doctor has live access, the patient's transparency log has no `GRANT_CONSENT` row, and `ledger_verify()` still reports *intact* (a missing row is not a chain break) — a silent evidence gap in the product's trust core, with no automated detection. The inconsistency itself (break-glass atomic, ordinary grant not) showed the pattern was accidental, not designed; no comment anywhere documented the choice. | Moved the audit append **inside** the existing `tx()` (passing the tx client) on the core trust-critical paths: consent grant + revoke (`patient/consents`), appointment book (`patient/appointments`), clinical encounter + prescribe-override (`doctor/patients/[id]/encounter`), document delete (`documents/[id]`), emergency-review verdict + auto-suspend (`admin/emergencies/[id]/review`), and account creation (`auth/signup`). Semantics change only on failure: a failed append now rolls the whole operation back (all-or-nothing) instead of committing state without its receipt; success responses are byte-identical. Purge/retention-sweep keep the after-tx receipt **by design** (erasure is a right that must never be blocked by a ledger hiccup — see A97). Mechanism pinned in e2e §18.1b (grant ⇒ exactly one ledger row for that consent id), §18.2b (booking ⇒ ledger row committed), §18.2d–e (refused re-cancel ⇒ 400 and *still exactly one* cancel row — the failed operation wrote nothing), and — added in review-correction F1 — §18.9 **fault injection** (a `BEFORE INSERT` trigger on `AuditLog` makes the append fail *after* the business mutation inside the tx: the API returns 5xx, the real DB transaction rolls back the consent row, zero partial ledger rows, chain intact, cleanup verified in `finally`, success path re-proven after). | The remaining 33 post-commit sites are **not** one risk class (reconciled 2026-11-02, F2): **21 state-mutating workflows (D74 follow-up)** + 4 read/export + 4 denied-op + 4 erasure-receipts (by design; of these, 2 cron/daily-sweep receipts still swallow silently — D74 scope). A full pass is a deliberate approved follow-up, not mixed into other feature days. |
| A96 | **Document delete could orphan the patient's encrypted bytes (found 2026-11-02, Day 3 database audit, NG-D04).** `DELETE /api/documents/[id]` ran `UPDATE "Document" SET "isDeleted"=true` and `DELETE FROM "DocumentBlob"` as **two separate autocommits**. A crash between them left the document "deleted" (flag set, un-downloadable) while the ciphertext row persisted — an erasure incompleteness for a DPDP right-to-erasure action. | The two statements now run in **one** `tx()` (flag + byte deletion + the `DELETE_DOC` audit row all atomic; the audit also moved in per A95). Pinned in e2e §18.8a–c (upload 201 → delete 200 → `isDeleted=true` AND zero `DocumentBlob` rows). | — |
| A97 | **Purge's `DATA_ERASED` ledger receipt swallowed its own failures (found 2026-11-02, Day 3 database audit, NG-D05).** The purge route appends the erasure receipt *after* the erasure transaction (deliberate — erasure must never roll back because a ledger insert hiccuped) with `.catch(() => null)`: if the append failed, nobody could ever tell. Same shape for the guardian's `DEPENDENT_ERASED` receipt. | Failure now **logs** (`console.error` with the error message) instead of vanishing; the semantics are unchanged (erasure still commits, receipt best-effort). The design rationale (erasure > receipt) is now written into the route comment so the next reader doesn't "fix" it into rolling back erasures. Scope note (reconciled 2026-11-02, F2): the **two cron/daily-sweep** erasure-receipt appends (demo-DB data-clearing path) share the after-tx design but were NOT touched this pass and still swallow silently — tracked inside D74. | Owner-side: alert on `[purge]` log lines in the serverless logs (a single occurrence = a patient erased without their ledger receipt; follow up by hand) |
| A98 | **The new fault-injection safety gate refused to arm on the local demo DB (found 2026-11-02, PR #9 review-correction F1 pass).** The e2e §18.9 gate decided "is this database injectable?" with a regex that assumed the host appears immediately after `://` — but the local demo URL is `postgres://citycare@127.0.0.1:5432/…` (a username sits in between), so the gate said "not loopback" and §18.9 **silently skipped on exactly the environment it was written for** (first run: 331 passed / 1 skipped). | Fixed: parse with `new URL()` and compare `hostname` against `127.0.0.1` / `localhost` / `::1`; any parse failure → refuse. Still fail-closed (a non-loopback or unparsable URL cannot arm the injection, in pilot/CI/production alike). Lesson (A78 family): wire-format assumptions must be checked against the actual config values; and a safety gate must print a reason when it skips the very test it guards, or a wrong-but-safe gate reads as a quiet pass. | — |

## B) Honest drawbacks of this build (and the mitigation / production path)

| # | Drawback | Why acceptable here | Production path |
|---|---|---|---|
| D1 | **No Prisma at runtime** — raw `pg` + hand-written SQL | The SQL files (`../schema/`) are already the single source of truth (partial indexes + triggers Prisma can't express); prisma 8 is still RC; engines add install weight | Keep SQL as truth, generate types with `pg-client-ts`/`kysely-codegen` in CI |
| ~~D2~~ | ~~scrypt via `crypto.scryptSync` blocks ~50–100 ms/login~~ **Closed (A59):** async `crypto.scrypt`, event loop free. argon2id deliberately *not* adopted: it is a native addon (build step on Vercel, no edge story) and OWASP rates scrypt N=2^17 as acceptable | — | argon2id only if a native build step is ever acceptable |
| ~~D3~~ | ~~Phone/email not verified~~ **Closed for e-mail (this round):** `POST /api/auth/verify-email/{request,confirm}` (6-digit, 15 min, 5 attempts, `EMAIL_VERIFIED` ledgered) and forgot/reset by e-mail code. Delivery goes through `src/lib/email.ts` → `Outbox` row + Resend when `RESEND_API_KEY`+`EMAIL_FROM` are set; without them the UI *says* e-mail is unavailable and recovery codes (D9) still work. Phone/SMS stays open: no provider, and DLT registration is a legal prerequisite for transactional SMS in India | needs a verified sending domain from the user | set `RESEND_API_KEY` + `EMAIL_FROM`; SMS after DLT registration |
| ~~D4~~ | ~~No file storage~~ **Closed:** real uploads (`POST /api/patient/documents`, multipart, PDF/JPEG/PNG sniffed by magic bytes, 3 MB/file under Vercel's 4.5 MB body limit, 30 MB/patient quota), AES-256-GCM per file under `DOCUMENT_KEY` (never in the DB; `/api/health` reports `env` vs `derived`), 60-second HMAC download links bound to the viewer, downloads only under `FULL_RECORD`, every open/upload/delete in the patient's ledger, blobs cascade on erasure. Storage is a `DocumentBlob` bytea table — the free stack has no bucket | Postgres bytea is fine at this scale (≤30 MB/patient); the key is outside the DB | S3/R2 with the same envelope encryption when volume demands; key rotation via `keyVersion` |
| D5 | OCR simulated | Real OCR changes the *accuracy* story, not the *safety* story — unparseable lines already go to a review queue and nothing enters as ACTIVE | Tesseract/Cloud OCR → same `parsePrescriptionPhoto` contract (draft rows + unparseable set) |
| ~~D6~~ | ~~`maxPerSlot` ignored~~ **Closed:** `maxPerSlot` (1–6, DB CHECK) is real capacity; `freeSlotsForDay` counts bookings per instant and returns `left`; booking picks the lowest free `seatNo` inside the transaction; unique index `(doctorId, scheduledAt, seatNo)`; picker shows "2 left"; 409 `slot_full` | — | `roomId` if rooms need names |
| ~~D7~~ | ~~Grid rendered eagerly~~ **Closed:** `SlotPicker` re-fetches `/api/patient/doctors/[id]/slots` every 45 s, on tab focus/visibility, and after any `slot_full`; a selection survives only if still open | — | Server-sent events if a doctor's page ever has hundreds of concurrent bookers |
| ~~D8~~ | ~~JWT has no server-side revocation list~~ **Closed (A60):** DB-backed sessions; a copied token dies on logout/purge/"sign out everywhere". The dev `SESSION_SECRET` in `.env.local` is still a *local* value — production has its own sensitive env var | — | rotate `SESSION_SECRET` per deployment environment |
| ~~D9~~ | ~~Lockout needs "contact support"~~ **Closed (A63 + this round):** admin unlock, plus **self-service**: 8 one-time recovery codes (Crockford base32, hashed per user, shown once; `RECOVERY_CODES_GENERATED` ledgered), `/recover` page, `POST /api/auth/recover`; any reset clears the lockout and revokes every session; e-mail reset when delivery is configured (D3) | — | passkeys as a second factor |
| D10 | ABDM/ABHA fields exist, **no live integration** | Certified ABDM = 6–9 months + STQC audit (researched; see main plan doc) — impossible for a college timeline | ABDM **sandbox** demo (M1/M2 flow) as a stretch showcase |
| D11 | Rule engine ships 2 drug classes + 4 rules | The *architecture* (deterministic checks, evidence, logged override) is the contribution; tables are data | RxNorm/RxNav lookups, state the drug-interaction list, MedScape API for severity |
| ~~D12~~ | ~~Registration not verified~~ **Closed as far as the law allows:** there is still no official lookup API, so approval is a *recorded human attestation*: the admin picks the register checked (NMC IMR / state council / HPR), ticks "name and number matched", and that sentence is stored on the doctor row and in the ledger; the badge text never says "NMC verified" | scraping registers is legally grey — deliberately not done | HPR/ABDM professional verification once credentials exist |
| ~~D13~~ | ~~No external anchor~~ **Closed:** the nightly cron signs `sha256(seq:headHash)` with an Ed25519 key (`ANCHOR_SIGNING_KEY`) and submits the digest to public OpenTimestamps calendars (best-effort, 5 s); heads + public key at `/legal/transparency` and `GET /api/ledger/anchors`, receipts at `/api/ledger/anchors/[seq]/ots`. Live anchor #9 was signed **and** accepted by `a.pool.opentimestamps.org` on 2026-09-29 | receipts are *pending* until a Bitcoin block confirms them (hours); the page says so | an `ots upgrade` job to store completed receipts |
| ~~D14~~ | ~~No pagination on the ledger~~ **Closed for the ledger (D37 UI):** `?before=<seq>&limit=` keyset pages + "Load older entries"; chain verdict computed once. Consent/appointment lists keep their small caps | Demo data ≪ limits | paginate the other lists when they grow |
| D15 | Erasure = delete patient-side data + **redact** doctor-side shells + keep the ledger | Legally correct tension: DPDP erasure vs MCI 7-yr retention (documented in `../DATA_AND_TRUST.md`) | data-processing-agreement language per hospital |
| ~~D16~~ | ~~e2e locks out `anita@demo.in`~~ **Closed (A63):** the suite now unlocks her through the admin API and proves she can sign in again | — | — |
| D17 | English-only UI | content strings are centralised enough (`onboard.ts`, page copy) to i18n later | next-intl dictionaries (hi/mr first) |
| D18 | Single Postgres, single node pool(10) | That's the scale of the actual user base (demo) | PgBouncer + replica for reads (records GET) |
| ~~D19~~ | ~~scope filter not unit-tested~~ **Closed (A58):** `applyScope()` is pure; `scope.test.ts` covers denied/FULL/SUMMARY/LAST_N/SPECIFIC_CONDITION/unknown — and found a real leak while being written | — | — |
| D20 | `next build` OOMs below ~1.5 GB free RAM | Dev + tests + e2e all pass in 2 GB; build just needs `NODE_OPTIONS=--max-old-space-size` | normal CI box |
| ~~D21~~ | ~~Stateless JWT; no "sign out everywhere"~~ **Closed (A60):** `Session` table, `sid` in every token, `POST /api/auth/logout {everywhere:true}`, `GET /api/auth/sessions` (device list). Cost: one indexed join per request (already on the same round-trip as the user row) | — | short-lived access token + refresh rotation if the 7-day window ever matters |
| ~~D22~~ | ~~CSRF = Origin + JSON content-type~~ **Closed (multipart included):** `guardSameOrigin` checks `Sec-Fetch-Site` (same-origin/none), Origin vs Host, and allows `multipart/form-data` only where a route opts in (`allowMultipart`), so a cross-site form post cannot reach the upload route (e2e: 403) | — | per-form tokens only if a legacy browser without Fetch Metadata ever matters |
| D23 | Third-party-cookie blocking (Safari ITP, strict privacy modes) can still refuse the partitioned cookie inside the iframe | Login page detects framing and offers "open in a new tab", where the cookie is first-party | Serve the app on its own top-level domain (normal deployment) |
| D24 | **Workers path opens a DB connection per query** (per transaction for `tx`) — no in-process pool is possible on workerd | Hyperdrive holds the real pool; measured 90–310 ms/page on workerd; smart placement puts the Worker next to the DB | Request-scoped client via `AsyncLocalStorage` + `after()`; or Neon serverless driver over HTTP for reads |
| D25 | **scrypt cost 4096 on Cloudflare** (10 ms CPU budget on the free plan) vs 16384 locally; OWASP says 2^17 | Cost is embedded in each hash; knob is one env var; documented as a demo trade-off | Paid plan + `SCRYPT_N=16384`, `limits.cpu_ms`; or offload auth to a Durable Object / external IdP |
| D26 | Free-plan CPU budget also brushes against SSR itself (Cloudflare: "10–20 ms typical") — sporadic 1102s possible under real traffic | College demo traffic is far below the throttle threshold; per-isolate tolerance for occasional overruns | Workers Paid ($5/mo) |
| D27 | Startup params (`statement_timeout`, `options`) are not sent on the Workers path | UTC is pinned per-database by the deploy script and asserted; ledger is timezone-proof by design | `SET LOCAL statement_timeout` inside `tx()`; Hyperdrive query timeout settings |
| D29 | ~~Real `vercel deploy` / Neon round-trip not executed~~ **Resolved 27 Sep 2026:** live at https://citycare-xi.vercel.app, e2e 52/0/5 ×2 against it, bootstrap + redeploy re-run idempotently | — | — |
| D30 | `pg` TLS to Neon relies on Node's default CA verification (`sslmode=require` → verified TLS in node-postgres) — not exercised here | Neon presents publicly trusted certificates; failure mode is a loud connect error, not silent insecurity | Pin `sslrootcert` to Neon's CA |
| ~~D31~~ | ~~Cold start on first request~~ **Mitigated:** `/` and `/login` fire one `/api/health` on mount (`<Warmup/>`, no data, ignored on failure) so the Neon compute and the pool are awake by the time the user submits; the nightly cron is the second warm-up. The 0.5–3 s wake-up itself is a Neon Free property | free tier | paid compute with autosuspend off |
| D32 | The app runs on Neon's **direct** endpoint (`DATABASE_URL_UNPOOLED`), not the PgBouncer one; the pooled URL is untested because the Pool sends startup parameters a transaction pooler may reject | Hobby concurrency is small; each instance pools max 10; Neon allows ~100 direct connections | Drop the startup params (UTC is already pinned per database) and validate `-pooler` with the e2e |
| D33 | Per-deployment `*.vercel.app` URLs are behind Vercel SSO deployment protection; only the production aliases are public | Share `https://citycare-xi.vercel.app`; the script prints it | Disable protection for previews if reviewers need them (Project → Deployment Protection) |
| D34 | The Marketplace-managed env carries **18** variables incl. `POSTGRES_URL_NO_SSL`, `NEON_AUTH_BASE_URL` etc. that this app never reads; they are not secrets in the "sensitive" sense (readable in the dashboard) | Only `DATABASE_URL_UNPOOLED` is consumed; `SESSION_SECRET` is stored sensitive | Prune via the Neon integration settings if it bothers you |
| D35 | Landing ships GSAP + Motion (+97 KB gzip over the app baseline) | Landing-only chunk; app routes unaffected (measured) | `LazyMotion`/`domAnimation` would trim ~20 KB more |
| D36 | ~~Doctor signup is open~~ **fixed (A48/F1)**: registration number + admin approval gate on search/booking/consent/record | e2e `F1:` ×9 | Real check against the NMC IMR API/website is still manual |
| ~~D37~~ | ~~No per-IP rate limiting~~ **Closed (A61):** Postgres fixed-window limiter on login/signup (per IP) and emergency/grievance/acceptance/dependents (per user), 429 with `retryAfterSec`. Honest limit: fixed windows allow a 2× burst at the boundary; the DB is the counter (fine at demo scale, Upstash/WAF at scale) | — | edge WAF for volumetric attacks |
| D38 | Free Supabase pauses after 7 idle days (once we move there) | Daily cron → `/api/health` | UptimeRobot on the same URL as a second heartbeat |
| D40 | Startup parameters cannot be relied on behind managed proxies (see A46) | Role-level defaults set by bootstrap; `/api/health` exposes the effective values | Keep both; alert if health shows `statementTimeout: 0` |
| ~~D41~~ | ~~Break-glass depends on doctor honesty~~ **Closed (F7):** every override enters `/admin/emergencies` with read count and the doctor's 7-day tally; verdict JUSTIFIED/UNJUSTIFIED is ledgered, both parties notified; **2 unjustified verdicts auto-suspend** the doctor (`isVerified=false`); >3 overrides/7 d flagged | Still a *post-hoc* control — by design; blocking emergencies pre-hoc kills people | — |
| D42 | Inbox is polled (30 s), not pushed | Partial-index count ≈ 1 ms; pauses in hidden tabs | Web Push (VAPID) after PWA (F10) |
| ~~D43~~ | ~~No working grievance channel~~ **Closed (L-G1):** in-app grievance desk (`/legal/grievance` → `/admin/grievances`), 30-day SLA clock, overdue flag, ledgered, complainant notified. The officer **name/mailbox env vars are still unset** — that part needs the team, not code | Desk works without any mailbox | set `NEXT_PUBLIC_GRIEVANCE_OFFICER/EMAIL` |
| ~~D44~~ | ~~Legal documents English-only~~ **Partially closed (L-G2):** key-points summary in Hindi and Marathi (`/legal/privacy?lang=hi|mr`, `lang=` attribute, `hrefLang` links), English full text operative, translations flagged "pending legal-cell review"; a unit test keeps the numbers in sync with code | Summary ≠ full translation — stated on the page | full translation reviewed by a Marathi/Hindi-literate lawyer |
| ~~D45~~ | ~~Version bump does not force re-acceptance~~ **Closed (L2):** outdated notice ⇒ banner on every signed-in page + **428 `consent_outdated`** on mutations (reads, logout, grievances and switch-back stay allowed); `POST /api/legal/acceptance` clears it | — | — |
| D46 | Retention sweep runs **once a day** (Vercel Hobby cron cap), ≤200 accounts per run, and now stops after a 20 s budget (`deferred` count reported) so it can never hit `maxDuration` | Adequate for a demo; the 7-day window is disclosed; the cron also prunes sessions and rate-limit windows | External scheduler or Pro plan if volume ever matters |
| D47 | `vercel env pull` returns a placeholder for the *sensitive* `CRON_SECRET`; e2e now reads it (and `DATABASE_URL`) from `web/.env.local` automatically, so nothing is typed into a shell | Documented in `LEGAL_COMPLIANCE.md` §5 | Store secrets in the team vault; never in chat |
| D48 | Guardian adulthood for dependents (Rules r.10) is checked against a **self-declared** date of birth, not a DigiLocker/ID token | Honest about it in code and in the notice; the guardian attests, the child's DOB must be <18, everything is ledgered under the guardian | DigiLocker age token or ID upload when a verified-ID provider is available |
| ~~D49~~ | ~~No claim-your-account flow at 18~~ **Closed:** `POST /api/patient/dependents/[id]/handover {email, phone, password}` (409 `still_a_minor` / `email_or_phone_taken`) re-credentials the same User row, unlinks the guardian, revokes acting sessions, withdraws the guardian's on-behalf acceptance (A70), ledgers `DEPENDENT_HANDOVER`; the dashboard shows "Hand over (18+)"; the cron reminds guardians once per 30 days per adult dependent | — | e-mail the 18-year-old directly once delivery exists |
| D50 | Break-glass review, grievance desk and breach register are all **SUPER_ADMIN only**; there is one such account | Fits a college demo; every action is ledgered | HOSPITAL_ADMIN scoping + two-person rule for suspensions |
| D51 | The `RateLimit` counter lives in Postgres: one extra `INSERT … ON CONFLICT` per limited request | Same round-trip as the auth query on serverless; at scale this is the wrong place | Upstash / Vercel WAF |
| ~~D52~~ | ~~Fixed 7-day sessions~~ **Closed:** cookie 30 d; Session row slides 7 d from `lastSeenAt` (touched at most hourly) capped at `createdAt`+30 d; devices list shows the live expiry | — | refresh-token rotation if a native app appears |
| D39 | The plan's viva answers cite unbuilt features (argon2id, AES-GCM, signed URLs, break-glass) | Plan v2 rewritten; review doc lists exactly what exists | Build R2 (break-glass) before Seminar-II |
| D28 | The actual `wrangler deploy` and a real Hyperdrive→Neon round-trip were **not** executed here (no account credentials in the sandbox) | Everything up to that line runs on the identical runtime (workerd) locally; the deploy script asserts each step | Run `npm run cf:deploy` with the token — see DEPLOY_CLOUDFLARE.md |

| D53 | Uploaded files live in Postgres (`DocumentBlob` bytea) and count against Neon Free's 0.5 GB — ~15 patients at full quota would fill it | Quota (30 MB) + file cap (3 MB) are enforced; `/admin/system` should watch DB size | object storage (R2/S3) with the same envelope encryption |
| D54 | `DOCUMENT_KEY` is a single key with no rotation job; losing it loses every file | Key is generated once by the deploy script and printed for safe-keeping; `keyVersion` column exists | KMS-held key + re-wrap job |
| D55 | OTS receipts are stored as *pending* and never upgraded to Bitcoin-confirmed proofs; verification needs the `ots` client and a calendar that still holds the commitment | Signature verification is fully offline; the page states the OTS scope honestly | `ots upgrade` in the nightly cron once receipts are >24 h old |
| D56 | E-mail delivery is scaffolded, not live: no `RESEND_API_KEY`/verified domain → codes stay in `Outbox` and the UI says so; SMS/phone verification not started (DLT registration is a legal prerequisite) | Recovery codes give self-service without any provider | Resend/SES + DLT-registered SMS sender |
| D57 | Doctor verification is a *recorded attestation*, not a registry lookup; a careless admin can still tick the box | The attestation names the register + admin + date and is in the ledger — reviewable, not invisible | HPR-based verification when ABDM credentials exist |
| D58 | Hindi/Marathi cover the privacy key points and the record summary, not the app shell (D17 still open) | Copy is centralised; `legal-i18n.ts` shows the pattern | next-intl dictionaries for the shell |
| D59 | CI workflow (`.github/workflows/ci.yml`) is written but has never *completed a run*: the remote now exists (`github.com/aryanp685/citycare`, first push 2026-10-31) but that push produced a 0-second run failure with no logs, and the Actions permissions API answers 403 → GitHub Actions is disabled/unavailable for this repo | The exact sequence the workflow mirrors was re-run in full in the 2026-10-31 sandbox: lint clean, tsc clean, vitest 131/131, licence audit clean, schema bootstrap + seed, build clean, e2e 217/217 — all green | owner enables GitHub Actions (repo Settings → Actions → General) and pushes again; the first green run closes this |
| ~~D60~~ | ~~The `Observation` table existed but was completely unwired — no writer, no reader, no UI (a dead table)~~ **Closed (F5, 2026-11-01):** migration `0005` adds numeric reference bands (`refLow`/`refHigh`) + the trend index; `recordSections` returns `observations`; `applyScope` scopes them with the labs' exact rules; patient log/delete API (Zod + ledgered); Trends card (SVG sparkline + band) on the patient side, read-only on the doctor workspace; seed carries 21 rows over 4 realistic series | — | encounter-linked observations (logged by a clinician during a visit) still have no write path — the doctor side is read-only in F5 |
| D61 | The F18 print summary relies on CSS `:has()` to hide the rest of the page at print time. All evergreen browsers have supported it since 2023, but on an ancient engine the page would print with its normal chrome instead of the clean summary | The print *content* itself is plain CSS (no `:has`), so the block is always correct; only the "hide the app around it" step degrades | a JS print hook (add a class to `<body>` before `window.print()`) if an old-browser target ever appears |
| ~~D62~~ | ~~Vercel deploys never applied DB migrations — schema and code could (and did) drift; every new migration needed a human to re-run the bootstrap~~ **Closed (A76, 2026-11-01):** `prebuild` runs the idempotent bootstrap (migrations always; base SQL only on a fresh DB; seed only when there are no users) as part of every build — the first Vercel build after the fix self-healed production by applying `0005` | The build now depends on reaching `DATABASE_URL` from Vercel's build network — a network failure fails the build (visible, previous deployment stays up) rather than silently serving a broken one | if Vercel ever blocks build-time egress, move the sync to a post-deploy cron (the same script already supports it) |
| D63 | **`BACKUP_KEY` is a single long-lived key (v1, no rotation).** Losing it loses every backup file; rotating it means re-encrypting all retained files (not implemented). It is kept out of git/logs/DB, is separate from `SESSION_SECRET`, and lives only in the environment. | Acceptable for v1: the key-separation + private store + per-file GCM tag already bound the blast radius; rotation tooling is a known gap, not a hidden one (`BACKUP_CONFIGURATION.md` §1, `BACKUP_AND_DISASTER_RECOVERY.md` §5). | Add a `keyVersion` to the file header + a re-key script (re-encrypt retained files under the new key); test with the drill |
| D64 | **Backup run is budget-capped: 20 s soft limit inside a 30 s Vercel function.** A production database that outgrows the budget fails with `time_budget` — **no partial file** is written, and the attempt is recorded (`errorClass='time_budget'`). At the current size the run takes ~40 ms, so headroom is ~500×, but it is a hard ceiling. | All-or-nothing is the *safe* failure mode (a truncated backup is worse than no backup); the failure is observable in the `"Backup"` table and `/api/health` staleness. | When the DB outgrows the budget: move the dump to a longer-timeout worker (paid plan) or a scheduled runner with `pg_dump`-class tooling, keeping the same container format + drill |
| D65 | **Vercel Hobby allows ≤ 2 crons; exactly 2 are in use** (`/api/cron/daily` + `/api/cron/backup`). No headroom for a third scheduled job (e.g. a twice-daily backup to halve the RPO window) without a plan change. | The daily schedule already meets the RPO ≤ 24 h target; a tighter RPO is a business decision, not a correctness gap. | Upgrade the plan, or fold additional jobs into the existing daily cron |
| D66 | **Document storage DR gap (corrected 2026-11-02).** The original row of this batch was **factually wrong**: it claimed patient uploads live in Vercel Blob outside the database backup. They do **not** — the bytes live in Postgres (`DocumentBlob.data`, AES-256-GCM under `DOCUMENT_KEY`), so the 36-table backup *includes* them (the 2026-11-02 drill verified that section byte-identical). The **real** gaps: (a) losing `DOCUMENT_KEY` makes every document byte undecryptable (live + all backups); (b) the **dedicated document-level recovery drill** (decrypt + checksum a document from a restored scratch DB) has **not been executed** — the executed drill proves byte fidelity of the encrypted rows, not document-level decryptability; (c) the *backup files themselves* live in Vercel Blob in prod, whose durability is the provider's. | The clinical record and the document bytes are in the same DB and same backup; erasure cascades bytes with their rows, so restored data cannot resurrect erased documents. Key separation + escrow discipline documented (`BACKUP_CONFIGURATION.md` §6, `DOCUMENT_STORAGE_DISASTER_RECOVERY.md`). | Document-storage DR runbook written (2026-11-02). Sub-gap **(b) CLOSED 2026-11-02 (final technical verification):** the standalone document recovery drill exists (`restore-drill.mjs --verify-document`, gate 7) and is **executed + e2e-pinned** (§16d, synthetic canary, happy + negative paths — `RESTORE_DRILL_REPORT.md` §5); a real-document drill stays owner-run on request (correct PHI scope). Remaining: **(a)** escrow `DOCUMENT_KEY` like `BACKUP_KEY` (procedure documented in `BACKUP_CONFIGURATION.md` §6.3 — **documented, not yet executed**, owner action); **(c)** prod backup-store durability remains the provider's (manual private export if the owner decides to require it). |
| D67 | **`node-pg` 8.23 has no COPY protocol support** — the backup/restore path depends on a hand-written adapter (`src/lib/pg-copy.mjs`) that subclasses `pg.Query` and leans on `pg-protocol` internals (the `copyData` message shape, and the buffer-reuse behaviour behind A78). | Isolated: only the backup path (cron route, CLI, drill) uses it — the app pool is untouched. The three invariants (no-`then`, copy-chunks, no-callback) are pinned by regression tests **and** exercised end-to-end by the e2e backup section and the real-DB drill. | Revisit if `pg` ships native COPY support or the adapter proves fragile across `pg-protocol` releases (A78 is the warning: version-pinned behaviour can change) |
| D68 | **The demo sweep is now opt-in: a demo deployment that forgets `RETENTION_POLICY=demo` silently stops erasing demo accounts** (stale demo accounts accumulate; the banner may still claim "demo"). This is the deliberate fail-safe trade of A83/NG-S15 — an unknown environment must never erase data — but it moves the burden of *declaring* the demo onto the deployer. | The failure mode is **observable, not silent**: `/api/health` → `retention.enabled:false, reason:"missing_policy"`, the cron logs a warning on every run, and the notice copy switches to "does not auto-erase". The deploy script/doc checklist carries the variable (DEPLOY_VERCEL step 4). | Alert on `retention.reason in (missing_policy, invalid_policy, contradictory_policy)` from `/api/health` in any monitoring; consider a deploy-time check that a `demo`-bannered project has `RETENTION_POLICY=demo` set |
| D69 | ~~**Production backup store has a missing dependency (A85):** `backup-core.mjs`'s Vercel-Blob store imports `@vercel/blob`, which is not in the manifest as of 2026-11-02 — so the production backup cron cannot succeed until it is added. The local store (sandbox/dev) is unaffected, which is why the entire sandbox drill passed.~~ **CLOSED 2026-11-02 (final technical verification, owner-approved):** `@vercel/blob@^2.8.2` (2.8.2 = latest stable at install time) is now in `web/package.json` + `package-lock.json` — a real manifest dependency, not a temporary production-only install. Verified against the **installed** package's exports (which surfaced A86: 2.8.2 has `del`, not `delete`; prune is now version-tolerant + unit-pinned). Build + unit (216/216) + full e2e (286/286) re-run green on the change (2026-11-02). | The design made the missing dependency **fail loudly and audibly** (metadata row + `stale:true`, no partial file, no silent gap) — the worst case was "no backups on Vercel yet", visible within one cron cycle (03:00 IST), not "corrupted/missing backups". It was a deployment prerequisite, not a design flaw — and it is now satisfied. | ~~Owner-approved `npm i @vercel/blob` + rebuild before expecting the first production backup~~ **Executed 2026-11-02** (`BACKUP_CONFIGURATION.md` prod prerequisite 0 now ✅; `CITYCARE_DAY_1_REPORT.md` §11). Remaining owner-side: set `BLOB_READ_WRITE_TOKEN` + confirm the first production backup at deploy (NG-S09). |

| ~~D70~~ | ~~**Exact-duplicate index on `Observation`** (`…_patientId_name_takenOn_idx` from `citycare_init.sql` + `…_patient_name_taken_idx` from migration 0005 — identical columns, different name, so both present in every DB) (NG-D01-1)~~ **CLOSED 2026-11-02 (Day 3, A94):** migration `0007_dedup_observation_index.sql` drops the 0005 copy; e2e §18.7a–d pins it | — | — |
| ~~D71~~ | ~~**Document-delete orphan window:** `isDeleted=true` and `DELETE FROM "DocumentBlob"` were separate autocommits — a crash between them left the ciphertext behind after the patient erased the document (NG-D04-1)~~ **CLOSED 2026-11-02 (Day 3, A96):** both statements (plus the `DELETE_DOC` audit row) now run in one `tx()`; e2e §18.8a–c pins flag+bytes atomicity | — | — |
| ~~D72~~ | ~~**Purge's erasure receipt could fail invisibly** — `DATA_ERASED`/`DEPENDENT_ERASED` appends ran after the erasure tx with `.catch(() => null)` (NG-D05-2)~~ **CLOSED 2026-11-02 (Day 3, A97):** failures now log; the after-tx placement is kept **by design** (erasure must never be blocked by a ledger hiccup) and the rationale is documented in the route | Owner-side: alert on `[purge]` log lines | — |
| D73 | **Mixed timestamp types: 41 naive `timestamp` vs 28 `timestamptz` columns, mixed even within tables** (e.g. `Consent.reviewedAt` timestamptz, its siblings naive; base-era tables naive, post-migration tables timestamptz) (NG-D01-2). Naive↔timestamptz comparisons under a non-UTC session timezone would silently shift values. | Pinned convention, enforced at **three layers**: process TZ=UTC before first parse (`db.ts`), `options=-c timezone=UTC` on every pooled session, `ALTER DATABASE/ROLE SET timezone='UTC'` in bootstrap with a hard `die` unless `show timezone = UTC` (verified live on a fresh session, 2026-11-02). For every app session the two types behave consistently (naive = UTC wall time). A mass 41-column type migration was rejected as high-risk/zero-behaviour-gain. | If a non-Next executor (reporting tool, future service) ever connects, it MUST pin `timezone=UTC`; document in the service's connection setup |
| D74 | **Audit-append atomicity is not yet systemic (NG-D05-1, Day 3 headline finding).** The core trust-critical paths (consent grant/revoke ×3 call-sites, booking, clinical encounter, document delete, emergency review ×2, signup — 10 call-sites, A95) now commit their ledger row inside the business transaction, **fault-injection-tested** (e2e §18.9). **21 state-mutating sites still append after the COMMIT** (admin grievance/incident/unlock, auth recovery/verify/reset, patient-data dependent/upload/med/nominee/observation/profile sites): a crash in that millisecond-scale window leaves committed state without its ledger row, undetectable by `ledger_verify()` (a missing row is not a chain break). Plus 2 cron/daily-sweep erasure receipts that still swallow failures silently. The other 12 post-commit sites (read/export, denied-ops, by-design erasure receipts) are *not* in scope for this gap — see the four-category inventory in the Day-3 audit report §D. | All 48 sites were inventoried (scripted, by action name); the 15 in-tx ones are the template. Each remaining state-mutating site is a mechanical move-into-tx with the tx client — the e2e §18 mechanism (success ⇒ exactly one row; failure ⇒ zero rows; injected append failure ⇒ whole tx rolled back) generalizes. | Dedicated follow-up pass (not mixed into other feature days): move the 21 into their tx, add the §18.9-style check per site, log the 2 sweep receipts, re-run the gauntlet |
| D75 | **`ledger_verify()` is O(n) over the whole AuditLog and runs on every `/api/health` call** (NG-D04-2). LOCAL-DEMO evidence: 3.5 ms at 9 rows. At ~10⁵ audit rows (a busy pilot's year) a full walk under the 8 s `statement_timeout` is a real risk for the health endpoint — and the health endpoint is what uptime monitors hit. | At pilot volume (dozens of patients, ~1 audit row per visit action) the chain stays in the low thousands of rows — headroom of ~50× before the walk becomes a concern. The bootstrap + every e2e run re-verify the full chain, so a slow-but-working verify is caught in tests before it matters. | When `AuditLog` approaches ~10⁵ rows: verify-from-last-anchor (re-walk only since the last verified `LedgerAnchor.seq`, full walk weekly in the daily cron) — NG-I9 owner-side scale watch-item |
| D76 | **Clinic architecture is single-operator by construction (NG-D06, Day 3 assessment).** "Clinic" = a `Hospital` row + `HospitalAdmin` + doctors linked via nullable `hospitalId`. Data isolation is per-patient (profileId scoping + consent), **not per-organisation**: a second clinic signing up on the same deployment would see each other's patients in admin surfaces. | Correct for the pilot (one deployment = one city pilot, one operator); adding a clinic to the same operator = plain data, no schema change. The brief for Day 3 was assessment, not multi-tenant rewrite — and no premature infra (new DB, K8s, etc.) is introduced. | When a second *operator* actually signs up: decide the tenant boundary (separate deployments per operator is the cheap correct answer; row-level tenant scoping is the expensive one) |
| D77 | **Emergency (break-glass) 3-per-24h quota is a pre-tx `count(*)` read, not a DB constraint (NG-D05-3).** Two concurrent emergency requests from one doctor could both observe count=2 and both proceed (quota is a safety rail, not an invariant). | Mitigated by the `emergency` rate-limit bucket (10/h/doctor, atomic upsert) + the UI being single-operator + the override being ledgered, patient-notified, and admin-reviewed (D41) with auto-suspension at 2 UNJUSTIFIED verdicts — so even a quota race produces *reviewed, recorded, reversible* access, not silent overreach. A true sliding-window DB constraint needs a mechanism (e.g. a per-doctor-per-day counter table with its own unique guard) that didn't fit this day's safe-fix budget. | If break-glass abuse ever becomes a realistic threat model: add the counter-table constraint + e2e race check |

## What a critic should NOT be able to say

- ❌ "It's just CRUD" → booking is a **concurrency-correct** flow (re-validated grid,
  tx, DB partial index as authority, distinct 409s), consent is **server-enforced on
  every read**, the ledger is **DB-level append-only + hash-chained** and patient-verifiable.
- ❌ "You'll leak data" → denial is the default; refusals are *logged and visible*;
  erasure is real (tested), not a status flag.
- ❌ "AI hallucinates" → no LLM on any clinical path in this build; the summary is
  computed from stored rows (`digest.ts`), and the safety engine is the same one the
  python side verifies (`../ai_layer`).
- ❌ "Tests are theatre" → see §A1/A19: the log contains the vacuous tests I found and
  killed, and the exact assertions that pin each behaviour.
