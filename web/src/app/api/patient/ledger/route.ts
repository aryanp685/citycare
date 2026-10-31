import { requireRole } from "@/lib/session";
import { handler, ok } from "@/lib/api";
import { verifyChain, ledgerForPatient } from "@/lib/ledger";

const PAGE = 100;

/**
 * The patient's "who saw my data" screen — the transparency page.
 * Includes the chain verdict so the patient can PROVE the log is intact, not just read it.
 * D37: paginated — `?before=<seq>&limit=` walks older pages; the chain verdict and the
 * per-person summary are computed once (first page) so "Load more" is one cheap query.
 */
export const GET = handler(async (req) => {
  const v = await requireRole("PATIENT");
  const sp = new URL(req.url).searchParams;
  const before = sp.get("before");
  if (before !== null && !/^\d{1,18}$/.test(before)) return ok({ entries: [], nextBefore: null, hasMore: false });
  const limit = Math.min(PAGE, Math.max(1, Number(sp.get("limit") ?? PAGE) || PAGE));
  const [chain, entries] = await Promise.all([
    before ? Promise.resolve(null) : verifyChain(),
    ledgerForPatient(v.profileId, limit + 1, before),
  ]);
  const hasMore = entries.length > limit;
  const page = hasMore ? entries.slice(0, limit) : entries;
  const byDoctor = new Map<string, number>();
  if (!before) {
    for (const e of page) {
      if (e.action === "VIEW_RECORD" || e.action === "VIEW_DENIED" || e.action === "DOWNLOAD_DOC") {
        const key = e.actorName ?? "someone";
        byDoctor.set(key, (byDoctor.get(key) ?? 0) + 1);
      }
    }
  }
  return ok({
    entries: page.map((e) => ({ seq: e.seq, when: e.createdAt.toISOString(), who: e.actorName, role: e.actorRole, action: e.action, entityType: e.entityType, hash: e.entryHash.slice(0, 16) })),
    nextBefore: hasMore ? page[page.length - 1]!.seq : null,
    hasMore,
    ...(before ? {} : { chain, summary: [...byDoctor.entries()].map(([who, count]) => ({ who, count })) }),
  });
});
