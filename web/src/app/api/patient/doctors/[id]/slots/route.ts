import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { getViewer } from "@/lib/session";
import { freeSlotGrid } from "@/lib/repo";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/patient/doctors/[id]/slots — D7: the picker re-fetches this so a tab left open never offers stale seats. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v || v.role !== "PATIENT") return err(401, "unauthorized", "sign in as a patient");
  const { id } = await ctx.params;
  const d = await one<{ id: string; isVerified: boolean }>(`SELECT id, "isVerified" FROM "Doctor" WHERE id = $1`, [id]);
  if (!d) return err(404, "no_doctor", "doctor not found");
  if (!d.isVerified) return err(403, "doctor_unverified", "not verified");
  return ok({ grid: await freeSlotGrid(id, 14), at: new Date().toISOString() });
}
