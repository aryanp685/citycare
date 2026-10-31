import { handler, ok } from "@/lib/api";
import { getViewer } from "@/lib/session";

/**
 * "Who does the server think I am?" — the login page calls this right after a
 * 200 from /api/auth/login. If the browser refused to store the cookie
 * (third-party-cookie rules inside an iframe, a privacy extension, Safari ITP)
 * this returns {viewer:null} and the UI can say so instead of silently bouncing
 * the user back to /login. Never returns 401: anonymous is a valid answer here.
 */
export const GET = handler(async () => {
  const v = await getViewer();
  return ok(
    { viewer: v ? { role: v.role, profileId: v.profileId, actingFor: v.actingFor ?? null } : null },
    200,
  );
});
