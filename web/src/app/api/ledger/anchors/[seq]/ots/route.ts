import { one } from "@/lib/db";
import { handler, err } from "@/lib/api";

/** GET /api/ledger/anchors/[seq]/ots — the raw OpenTimestamps receipt, verifiable with the `ots` CLI. */
export const GET = handler(async (_req, { params }) => {
  const { seq } = await params;
  if (!/^\d{1,18}$/.test(seq)) return err(400, "bad_seq", "numeric seq expected");
  const r = await one<{ proof: Buffer | null; digest: string }>(`SELECT "otsProof" AS proof, digest FROM "LedgerAnchor" WHERE seq = $1::bigint`, [seq]);
  if (!r) return err(404, "not_found", "no anchor for that seq");
  if (!r.proof) return err(404, "no_receipt", "this anchor has no calendar receipt (submission failed or was skipped)");
  return new Response(new Uint8Array(r.proof), { status: 200, headers: { "content-type": "application/vnd.opentimestamps.v1", "content-disposition": `attachment; filename="citycare-ledger-${seq}.ots"`, "x-digest-sha256": r.digest, "cache-control": "public, max-age=3600" } });
});
