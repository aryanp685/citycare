import { handler, ok } from "@/lib/api";
import { appendSessionExpiry } from "@/lib/auth";
import { guardSameOrigin, getViewer } from "@/lib/session";
import { revokeSession, revokeAllSessions } from "@/lib/sessions";

/**
 * POST /api/auth/logout            → revokes THIS session server-side (D21) and clears the cookie
 * POST /api/auth/logout {everywhere:true} → revokes every live session of the user ("sign out everywhere")
 */
export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowStaleConsent: true }); // leaving must always be possible
  const body = (await req.json().catch(() => ({}))) as { everywhere?: boolean };
  const v = await getViewer();
  let revoked = 0;
  if (v) {
    if (body?.everywhere === true) revoked = await revokeAllSessions(v.uid);
    else { await revokeSession(v.sid); revoked = 1; }
  }
  const res = ok({ loggedOut: true, revoked });
  appendSessionExpiry(res, req);
  return res;
});
