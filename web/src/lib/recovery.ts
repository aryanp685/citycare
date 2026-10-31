import crypto from "node:crypto";
import { all, one, run, type Q } from "./db";
import { hashPassword } from "./auth";
import { revokeAllSessions } from "./sessions";
import { appendAudit } from "./ledger";
import { notify } from "./notify";

/**
 * D9 / D3 — account recovery that works without SMS or email.
 * Recovery codes: 8 per set, Crockford-base32, 50 bits each, shown once, stored as
 * sha256(code:userId), single-use. Email codes: 6 digits, 15 minutes, 5 attempts.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32 (no I, L, O, U)
export const RECOVERY_SET_SIZE = 8;
export const EMAIL_CODE_TTL_MIN = 15;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

export function newRecoveryCode(): string {
  const b = crypto.randomBytes(10);
  let s = "";
  for (let i = 0; i < 10; i++) s += ALPHABET[b[i]! % 32];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}
/** Users type codes with/without the dash, lower-case, or with O/I confusions — normalise first. */
export function normaliseRecoveryCode(raw: string): string {
  const s = raw.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return s.length === 10 ? `${s.slice(0, 5)}-${s.slice(5)}` : s;
}
export function hashCode(code: string, userId: string): string {
  return crypto.createHash("sha256").update(`${code}:${userId}`).digest("hex");
}

export async function issueRecoveryCodes(userId: string, q?: Q): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_SET_SIZE }, newRecoveryCode);
  await run(`DELETE FROM "RecoveryCode" WHERE "userId" = $1`, [userId], q);
  for (const c of codes) await run(`INSERT INTO "RecoveryCode" ("userId", "codeHash") VALUES ($1, $2)`, [userId, hashCode(c, userId)], q);
  return codes;
}

export async function remainingRecoveryCodes(userId: string): Promise<number> {
  const r = await one<{ n: number }>(`SELECT count(*)::int AS n FROM "RecoveryCode" WHERE "userId" = $1 AND "usedAt" IS NULL`, [userId]);
  return r?.n ?? 0;
}

/** Consumes the code if it matches; false otherwise. */
export async function consumeRecoveryCode(userId: string, raw: string): Promise<boolean> {
  const code = normaliseRecoveryCode(raw);
  const r = await one<{ id: string }>(
    `UPDATE "RecoveryCode" SET "usedAt" = now() WHERE id = (
       SELECT id FROM "RecoveryCode" WHERE "userId" = $1 AND "codeHash" = $2 AND "usedAt" IS NULL LIMIT 1
     ) RETURNING id`,
    [userId, hashCode(code, userId)],
  );
  return !!r;
}

export function newEmailCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}
export async function issueEmailCode(userId: string, purpose: "RESET" | "VERIFY"): Promise<string> {
  const code = newEmailCode();
  await run(`UPDATE "EmailCode" SET "consumedAt" = now() WHERE "userId" = $1 AND purpose = $2 AND "consumedAt" IS NULL`, [userId, purpose]);
  await run(
    `INSERT INTO "EmailCode" ("userId", purpose, "codeHash", "expiresAt") VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [userId, purpose, hashCode(code, userId), EMAIL_CODE_TTL_MIN],
  );
  return code;
}
/** Verifies + consumes. Counts attempts so the 6-digit space cannot be walked. */
export async function consumeEmailCode(userId: string, purpose: "RESET" | "VERIFY", raw: string): Promise<"ok" | "bad" | "expired" | "locked"> {
  const code = raw.replace(/\D/g, "");
  const rows = await all<{ id: string; codeHash: string; expiresAt: Date; attempts: number }>(
    `SELECT id, "codeHash", "expiresAt", attempts FROM "EmailCode" WHERE "userId" = $1 AND purpose = $2 AND "consumedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1`,
    [userId, purpose],
  );
  const r = rows[0];
  if (!r) return "bad";
  if (r.expiresAt.getTime() < Date.now()) return "expired";
  if (r.attempts >= EMAIL_CODE_MAX_ATTEMPTS) return "locked";
  if (r.codeHash !== hashCode(code, userId)) {
    await run(`UPDATE "EmailCode" SET attempts = attempts + 1 WHERE id = $1`, [r.id]);
    return "bad";
  }
  await run(`UPDATE "EmailCode" SET "consumedAt" = now() WHERE id = $1`, [r.id]);
  return "ok";
}

/** The one place a password is reset: new hash, lockout cleared, every session revoked, ledgered, user told. */
export async function resetPasswordAndUnlock(userId: string, newPassword: string, via: "recovery_code" | "email_code"): Promise<void> {
  const hash = await hashPassword(newPassword);
  await run(`UPDATE "User" SET "passwordHash" = $2, "failedAttempts" = 0, "updatedAt" = now() WHERE id = $1`, [userId, hash]);
  await revokeAllSessions(userId);
  await appendAudit(userId, "PASSWORD_RESET", "User", userId, { meta: { via } }).catch(() => null);
  await notify(userId, { title: "Your password was reset", body: `Reset via ${via.replace("_", " ")}. All devices were signed out. If this was not you, raise a grievance immediately.`, href: "/legal/grievance", severity: "WARNING" }).catch(() => null);
}
