import { Pool, Client, type PoolClient, type QueryResultRow } from "pg";
import { onWorkers } from "./env";

// Pin the NODE side too: node-postgres parses naive timestamps using the
// process timezone, so an IST laptop would read every stored time 5.5 h early.
// (Only takes effect before the first Date is parsed; this module loads at boot.
//  Wrapped: workerd's process.env can be read-only and is UTC anyway.)
try {
  if (!process.env.TZ) process.env.TZ = "UTC";
} catch {
  /* read-only env (Workers) — already UTC */
}

/**
 * Two connection strategies, one API (`one/all/run/tx`):
 *
 *  • Node (`next start`, tests, scripts): one long-lived Pool (max 10), every
 *    session pinned to UTC via a startup option.
 *
 *  • Cloudflare Workers (OpenNext): NO module-level pool. A TCP socket opened in
 *    one request cannot be touched from another request in workerd ("Cannot
 *    perform I/O on behalf of a different request"), so a shared pg.Pool would
 *    randomly explode. Instead each operation (or whole transaction) opens a
 *    Client against the Hyperdrive binding and closes it. Hyperdrive is the
 *    pool: it keeps warm, authenticated connections to the real Postgres, so a
 *    per-operation connect is cheap. Startup params are NOT sent on this path
 *    (Hyperdrive does not forward them) — the deploy script pins the timezone at
 *    the database level instead (`ALTER DATABASE ... SET timezone = 'UTC'`).
 */

// Next dev hot-reload would otherwise leak a new Pool on every edit.
const globalForDb = globalThis as unknown as { ccPool?: Pool };

function nodeConnectionString(): string {
  // The Neon ⇄ Vercel Marketplace integration injects BOTH a pooled URL
  // (DATABASE_URL, via PgBouncer in transaction mode) and a direct one
  // (DATABASE_URL_UNPOOLED). This Pool sends startup parameters
  // (statement_timeout, options=-c timezone=UTC) that a transaction pooler may
  // reject or ignore, and it already keeps its own small pool — so the direct
  // endpoint is the correct one here. Plain DATABASE_URL stays the default for
  // local dev, Docker, or a hand-pasted Neon string.
  //
  // A42: the old rule was "UNPOOLED always wins". That silently pins the app to Neon even
  // after DATABASE_URL has been pointed at Supabase (the Marketplace var lingers until the
  // integration is removed). New rule: DATABASE_URL wins unless it is a *transaction* pooler
  // (Neon "-pooler." host or pgbouncer=true), in which case the direct sibling is used.
  const url = process.env.DATABASE_URL;
  const direct = process.env.DATABASE_URL_UNPOOLED;
  const isTxPooler = !!url && (/-pooler\./.test(url) || /pgbouncer=true/i.test(url) || /:6543\//.test(url));
  const pick = url && !isTxPooler ? url : direct || url;
  if (!pick) throw new Error("DATABASE_URL is not set (Node runtime needs it; Workers use the HYPERDRIVE binding)");
  return pick;
}

function makePool(): Pool {
  const p = new Pool({
    connectionString: nodeConnectionString(),
    max: 10,
    // a hung query should surface as an error, not a hung tab
    statement_timeout: 8000,
    // Serverless Postgres (Neon) scales to zero and drops idle sockets; a wake-up
    // can take 0.5–3 s. Close our idle clients first, wait long enough on connect.
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    // CRITICAL: Prisma maps DateTime to NAIVE timestamp(3). The whole app
    // therefore treats "stored naive == UTC" as its convention. Pin every DB
    // session to UTC so a stray server-side TimeZone can never shift
    // now()::timestamp comparisons (consent expiry, slot windows, ledger).
    options: "-c timezone=UTC",
  });
  // Without this listener an idle client whose socket the server closed (Neon
  // suspend, PG restart, LB timeout) raises an unhandled 'error' event and takes
  // the whole Node process / serverless instance down. With it, pg just evicts
  // the dead client. (Bug A29)
  p.on("error", (e) => console.error("[pg pool] idle client error (evicted):", e.message));
  return p;
}

/**
 * Connection-level failures worth ONE transparent retry on a fresh client:
 * the server went away between two requests (serverless DB suspend, failover,
 * admin shutdown). Never retried: SQL errors, constraint violations, timeouts
 * of a query that actually ran — those are real answers.
 */
export function isTransientConnError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: unknown }).code;
  if (code === "ECONNRESET" || code === "EPIPE" || code === "ETIMEDOUT" || code === "ECONNREFUSED") return true;
  if (code === "57P01" || code === "57P02" || code === "57P03" || code === "08006" || code === "08003" || code === "08001") return true;
  const msg = (e as { message?: unknown }).message;
  return typeof msg === "string" && /Connection terminated|terminating connection|server closed the connection|socket hang up/i.test(msg);
}

async function poolQuery(text: string, params: unknown[]) {
  try {
    return await pool().query(text, params);
  } catch (e) {
    if (!isTransientConnError(e)) throw e;
    console.warn("[pg] transient connection error, retrying once:", (e as Error).message);
    return await pool().query(text, params);
  }
}

export function pool(): Pool {
  if (onWorkers) throw new Error("pool() is Node-only; on Workers use one/all/run/tx");
  if (!globalForDb.ccPool) globalForDb.ccPool = makePool();
  return globalForDb.ccPool;
}

type HyperdriveLike = { connectionString: string };
type CfContextFn = () => { env: Record<string, unknown> };
let cfContext: CfContextFn | null = null;

/** Connection string for the Workers path: Hyperdrive binding first, DATABASE_URL secret as fallback. */
async function workersConnectionString(): Promise<string> {
  if (!cfContext) {
    // dynamic import: the Node build/tests never evaluate the adapter
    const mod = await import("@opennextjs/cloudflare");
    cfContext = () => mod.getCloudflareContext() as unknown as { env: Record<string, unknown> };
  }
  try {
    const hd = cfContext().env.HYPERDRIVE as HyperdriveLike | undefined;
    if (hd?.connectionString) return hd.connectionString;
  } catch {
    /* outside a request scope (e.g. static generation) — fall through */
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("No database on Workers: bind Hyperdrive as HYPERDRIVE or set the DATABASE_URL secret");
  return url;
}

export type Q = PoolClient | Pool | Client;

/** Run `fn` with a dedicated connection: pool checkout on Node, fresh Client on Workers. */
async function withClient<T>(fn: (c: PoolClient | Client) => Promise<T>): Promise<T> {
  if (onWorkers) {
    const c = new Client({ connectionString: await workersConnectionString() });
    await c.connect();
    try {
      return await fn(c);
    } finally {
      await c.end().catch(() => undefined);
    }
  }
  const c = await pool().connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

export async function all<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  q?: Q,
): Promise<T[]> {
  if (q) return (await q.query(text, params)).rows as T[];
  if (!onWorkers) return (await poolQuery(text, params)).rows as T[];
  return withClient(async (c) => (await c.query(text, params)).rows as T[]);
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  q?: Q,
): Promise<T | null> {
  const rows = await all<T>(text, params, q);
  return rows[0] ?? null;
}

export async function run(
  text: string,
  params: unknown[] = [],
  q?: Q,
): Promise<number> {
  if (q) return (await q.query(text, params)).rowCount ?? 0;
  if (!onWorkers) return (await poolQuery(text, params)).rowCount ?? 0;
  return withClient(async (c) => (await c.query(text, params)).rowCount ?? 0);
}

export async function tx<T>(fn: (c: PoolClient | Client) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    }
  });
}

/** Well-known Postgres error codes we translate into HTTP semantics. */
export function pgErrorCode(e: unknown): string | null {
  if (e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function fail(status: number, code: string, message: string, extra?: Record<string, unknown>): never {
  throw new ApiError(status, code, message, extra);
}

/** Map a DB error thrown inside a handler to a clean ApiError. */
export function translatePgError(e: unknown): never {
  const code = pgErrorCode(e);
  if (code === "23505") fail(409, "conflict", e instanceof Error ? e.message : "conflict");
  if (code === "23503") fail(400, "invalid_reference", "referenced record does not exist");
  if (code === "42501") fail(403, "db_forbidden", e instanceof Error ? e.message : "refused by database");
  throw e;
}
