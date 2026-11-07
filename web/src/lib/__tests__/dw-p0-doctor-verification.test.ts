import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ row: null as null | { isVerified: boolean; rejectedAt: Date | null } }));
vi.mock("@/lib/db", () => ({ one: vi.fn(async () => state.row), fail: (status: number, code: string) => { throw Object.assign(new Error(code), { status, code }); } }));
import { requireVerifiedDoctor } from "../session";
const viewer = { profileId: "doctor-synthetic" } as Parameters<typeof requireVerifiedDoctor>[0];
describe("doctor verification guard", () => {
  beforeEach(() => { state.row = null; });
  it("allows verified and not rejected", async () => {
    state.row = { isVerified: true, rejectedAt: null };
    await expect(requireVerifiedDoctor(viewer)).resolves.toBeUndefined();
  });
  it.each([
    null, { isVerified: false, rejectedAt: null },
    { isVerified: false, rejectedAt: new Date() }, { isVerified: true, rejectedAt: new Date() },
  ])("denies missing, pending, rejected or inconsistent status %j", async (row) => {
    state.row = row; await expect(requireVerifiedDoctor(viewer)).rejects.toThrow();
  });
});
