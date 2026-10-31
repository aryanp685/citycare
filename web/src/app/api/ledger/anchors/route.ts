import { one } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { recentAnchors, signingKeys } from "@/lib/anchors";

/**
 * GET /api/ledger/anchors — PUBLIC. The last 30 chain-head anchors, the current signing public key,
 * and the live head so anyone can compare. No personal data: sequence numbers and hashes only.
 * Save a copy; if a future head for a seq ≤ yours ever differs, the ledger was rewritten.
 */
export const GET = handler(async () => {
  const [anchors, head] = await Promise.all([
    recentAnchors(30),
    one<{ seq: string; hash: string; at: Date }>(`SELECT seq::text AS seq, "entryHash" AS hash, "createdAt" AS at FROM "AuditLog" ORDER BY seq DESC LIMIT 1`),
  ]);
  return ok({
    publicKey: signingKeys()?.pubB64 ?? null,
    algorithm: "Ed25519 over sha256(seq || ':' || headHash); OpenTimestamps receipt when present",
    head: head ? { seq: head.seq, hash: head.hash, at: head.at.toISOString() } : null,
    anchors: anchors.map((a) => ({ ...a, anchoredAt: a.anchoredAt.toISOString() })),
  });
});
