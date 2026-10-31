import crypto from "node:crypto";
import { one, run, all } from "./db";

/**
 * D13 / F20 — a witness OUTSIDE the database for the ledger's chain head.
 * Daily (cron) we take the newest ledger row, hash `seq:entryHash`, sign that digest with an
 * Ed25519 key (public half published at /api/ledger/anchors) and — best effort — submit the digest
 * to a public OpenTimestamps calendar, which later commits it to Bitcoin. Anyone who keeps a copy
 * of an anchor (the page invites people to) can prove later whether the ledger below that seq was
 * rewritten, even by someone with full database access. Honest scope: the signature proves the
 * *server* vouched for the head at that time; the OTS receipt is what puts it beyond the server.
 */
const OTS_CALENDARS = ["https://a.pool.opentimestamps.org", "https://b.pool.opentimestamps.org", "https://alice.btc.calendar.opentimestamps.org"];

export function signingKeys(): { priv: crypto.KeyObject; pubB64: string } | null {
  const raw = process.env.ANCHOR_SIGNING_KEY;
  if (!raw) return null;
  try {
    const priv = crypto.createPrivateKey({ key: Buffer.from(raw, "base64"), format: "der", type: "pkcs8" });
    const pubB64 = crypto.createPublicKey(priv).export({ format: "der", type: "spki" }).toString("base64");
    return { priv, pubB64 };
  } catch { return null; }
}
/** For the deploy script / local setup: a fresh Ed25519 keypair (private as base64 PKCS8). */
export function generateSigningKey(): string {
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  return privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
}

export function anchorDigest(seq: string, headHash: string): Buffer {
  return crypto.createHash("sha256").update(`${seq}:${headHash}`).digest();
}
export function verifyAnchorSignature(digestHex: string, signatureB64: string, publicKeyB64: string): boolean {
  try {
    const pub = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(digestHex, "hex"), pub, Buffer.from(signatureB64, "base64"));
  } catch { return false; }
}

async function submitToCalendar(digest: Buffer): Promise<{ calendar: string; proof: Buffer } | null> {
  for (const base of OTS_CALENDARS) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 5000);
      const res = await fetch(`${base}/digest`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/vnd.opentimestamps.v1", "user-agent": "citycare-anchor/1" }, body: new Uint8Array(digest), signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const proof = Buffer.from(await res.arrayBuffer());
      if (proof.length > 0 && proof.length < 4096) return { calendar: base, proof };
    } catch { /* next calendar */ }
  }
  return null;
}

export type AnchorResult = { anchored: boolean; seq: string | null; reason?: string; signed?: boolean; ots?: string | null };

/** Called by the daily cron. Idempotent per seq. Set ots=false in tests / offline runs. */
export async function anchorLedgerHead(opts: { ots?: boolean } = {}): Promise<AnchorResult> {
  const head = await one<{ seq: string; hash: string }>(`SELECT seq::text AS seq, "entryHash" AS hash FROM "AuditLog" ORDER BY seq DESC LIMIT 1`);
  if (!head) return { anchored: false, seq: null, reason: "empty_ledger" };
  const exists = await one<{ id: string }>(`SELECT id FROM "LedgerAnchor" WHERE seq = $1::bigint`, [head.seq]);
  if (exists) return { anchored: false, seq: head.seq, reason: "already_anchored" };
  const digest = anchorDigest(head.seq, head.hash);
  const keys = signingKeys();
  const sig = keys ? crypto.sign(null, digest, keys.priv).toString("base64") : null;
  const ots = opts.ots === false ? null : await submitToCalendar(digest);
  await run(
    `INSERT INTO "LedgerAnchor" (seq, "headHash", digest, signature, "publicKey", "otsCalendar", "otsProof") VALUES ($1::bigint, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (seq) DO NOTHING`,
    [head.seq, head.hash, digest.toString("hex"), sig, keys?.pubB64 ?? null, ots?.calendar ?? null, ots?.proof ?? null],
  );
  return { anchored: true, seq: head.seq, signed: !!sig, ots: ots?.calendar ?? null };
}

export type AnchorRow = { id: string; seq: string; headHash: string; digest: string; signature: string | null; publicKey: string | null; otsCalendar: string | null; hasOts: boolean; anchoredAt: Date };
export async function recentAnchors(limit = 30): Promise<AnchorRow[]> {
  return all<AnchorRow>(
    `SELECT id, seq::text AS seq, "headHash", digest, signature, "publicKey", "otsCalendar", ("otsProof" IS NOT NULL) AS "hasOts", "anchoredAt"
       FROM "LedgerAnchor" ORDER BY seq DESC LIMIT $1`,
    [limit],
  );
}
