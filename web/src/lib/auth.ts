import crypto from "node:crypto";
import { promisify } from "node:util";
const scryptAsync = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

// ---------- passwords: scrypt, no native deps ----------
// stored format: scrypt$N$r$p$<saltB64>$<hashB64>

/**
 * scrypt work factor. Default 2^14 (≈80 ms on a 2-vCPU box). The Cloudflare
 * Workers FREE plan allows 10 ms CPU per request, so wrangler.jsonc sets
 * SCRYPT_N=4096 there (≈¼ the cost) — raise it on the paid plan. The cost is
 * stored inside every hash, so changing it never breaks existing passwords.
 */
// OWASP Password Storage Cheat Sheet (scrypt): N = 2^17, r = 8, p = 1 → 128 MiB, ~0.4–0.6 s.
// Node's scrypt refuses anything above 32 MiB unless maxmem is raised, hence SCRYPT_MAXMEM.
export const SCRYPT_DEFAULT_N = 131072;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

export function scryptCost(): number {
  const raw = Number(process.env.SCRYPT_N ?? SCRYPT_DEFAULT_N);
  const ok = Number.isInteger(raw) && raw >= 1024 && raw <= 1 << 20 && (raw & (raw - 1)) === 0;
  return ok ? raw : SCRYPT_DEFAULT_N; // silently-weak values are refused: fall back to the default
}

export async function hashPassword(pw: string): Promise<string> {
  const N = scryptCost(), r = 8, p = 1, keylen = 64;
  const salt = crypto.randomBytes(16);
  // D2: async — the libuv threadpool does the work, the event loop keeps serving other requests
  const hash = await scryptAsync(pw, salt, keylen, { N, r, p, maxmem: SCRYPT_MAXMEM });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}
export function needsRehash(stored: string): boolean {
  const [tag, n, r, p] = stored.split("$");
  if (tag !== "scrypt") return true;
  return Number(n) < scryptCost() || Number(r) < 8 || Number(p) < 1;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  try {
    const [tag, n, r, p, saltB64, hashB64] = stored.split("$");
    if (tag !== "scrypt") return false; // unknown format (incl. the '!' of erased/dependent users): never accept
    const salt = Buffer.from(saltB64, "base64");
    const want = Buffer.from(hashB64, "base64");
    const N = Number(n);
    if (!Number.isInteger(N) || N > 1 << 20) return false; // a corrupt/hostile N must not become a memory bomb
    const got = await scryptAsync(pw, salt, want.length, { N, r: Number(r), p: Number(p), maxmem: SCRYPT_MAXMEM });
    return want.length === got.length && crypto.timingSafeEqual(want, got);
  } catch {
    return false; // malformed hash => reject, do not 500
  }
}
export function passwordLooksUsable(pw: string): boolean {
  return pw.length >= 10 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
}

export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

// ---------- session: signed JWT in an httpOnly cookie ----------

export const SESSION_COOKIE = "cc_session";
/**
 * D52: the cookie/JWT may live 30 days, but the SERVER session row is the truth — it dies after
 * 7 idle days and slides forward on activity (see loadViewer), never past createdAt + 30 d.
 */
const MAX_AGE_S = 60 * 60 * 24 * 30;

export type SessionPayload = {
  uid: string; // User.id
  role: "PATIENT" | "DOCTOR" | "HOSPITAL_ADMIN" | "SUPER_ADMIN";
  profileId: string; // Patient.id | Doctor.id depending on role (the ACTING profile)
  sid: string; // Session.id — server-side row; revoked ⇒ token dead (D21)
  actingFor?: string | null; // F13: dependent Patient.id when a guardian is managing a minor
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

export async function signSession(p: SessionPayload): Promise<string> {
  return new SignJWT({ role: p.role, profileId: p.profileId, sid: p.sid, ...(p.actingFor ? { actingFor: p.actingFor } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.uid)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const role = payload.role;
    const profileId = payload.profileId;
    const sid = payload.sid;
    const actingFor = typeof payload.actingFor === "string" ? payload.actingFor : null;
    if (
      typeof payload.sub !== "string" ||
      typeof profileId !== "string" ||
      typeof sid !== "string" || // pre-0003 cookies (no server row) are simply anonymous now
      (role !== "PATIENT" && role !== "DOCTOR" && role !== "HOSPITAL_ADMIN" && role !== "SUPER_ADMIN")
    ) {
      return null;
    }
    return { uid: payload.sub, role, profileId, sid, actingFor };
  } catch {
    return null; // expired/garbage => anonymous, not a crash
  }
}

/**
 * Is this request reaching us over HTTPS *from the browser's point of view*?
 * Behind a TLS-terminating proxy (the sandbox preview, Cloudflare, nginx) Next only
 * sees plain http, so trust the first hop of x-forwarded-proto before the URL.
 */
export function requestIsHttps(req: Request): boolean {
  const xf = req.headers.get("x-forwarded-proto");
  const proto = (xf ? xf.split(",")[0] : new URL(req.url).protocol.replace(":", "")).trim().toLowerCase();
  return proto === "https";
}

/**
 * Cookie attributes are decided PER REQUEST, not per build (bug A20):
 *   • plain http (localhost dev)      → SameSite=Lax, not Secure (Chrome rejects None-without-Secure).
 *   • HTTPS, normal top-level page    → SameSite=Lax; Secure — the strongest CSRF posture.
 *   • HTTPS, page inside a cross-site iframe (`embedded`, reported by the login page
 *     which can see window.top) → SameSite=None; Secure; Partitioned. Lax cookies are
 *     silently refused in that context, which is what made "sign in" do nothing in the
 *     live preview. Partitioned (CHIPS) keeps it working when third-party cookies are
 *     blocked. `embedded` is client-supplied on purpose: a caller can only make its OWN
 *     cookie weaker, never someone else's.
 * Logout/purge must expire BOTH shapes — see appendSessionExpiry().
 */
export function sessionCookieOpts(req: Request, opts: { embedded?: boolean } = {}) {
  const https = requestIsHttps(req);
  const crossSite = https && opts.embedded === true;
  return {
    httpOnly: true,
    path: "/",
    maxAge: MAX_AGE_S,
    sameSite: (crossSite ? "none" : "lax") as "none" | "lax",
    secure: https,
    ...(crossSite ? { partitioned: true } : {}),
  };
}

/**
 * Expire the session cookie in every shape it could have been issued in. A
 * partitioned cookie is a different cookie from the unpartitioned one with the same
 * name, so a single delete only removes one of them; and cookies() keys by name, so
 * two headers have to be appended on the response directly.
 */
export function appendSessionExpiry(res: Response, req: Request): void {
  const https = requestIsHttps(req);
  const base = `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly`;
  res.headers.append("set-cookie", `${base}; SameSite=Lax${https ? "; Secure" : ""}`);
  if (https) res.headers.append("set-cookie", `${base}; SameSite=None; Secure; Partitioned`);
}

