import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ all: vi.fn() }));
vi.mock("@/lib/db", () => ({ all: state.all, one: vi.fn() }));
import { searchDoctors } from "@/lib/repo";
describe("doctor search query", () => {
 beforeEach(() => state.all.mockReset().mockResolvedValue([]));
 it("uses separately parameterized, normalized AND filters without treating wildcards or quotes as SQL", async () => {
  await searchDoctors({ q: "  Dr %_ ", city: " Pune ", specialty: " O'Neil " });
  const [sql, params] = state.all.mock.calls[0];
  expect(params).toEqual(["dr %_", "pune", "o'neil"]);
  expect(sql).not.toContain("O'Neil"); expect(sql).toContain('WHERE d."isVerified"');
  expect(sql).toContain("strpos(lower(COALESCE(h.city, '')), $2)");
  expect(sql).toContain('WHERE fs."doctorId" = d.id AND strpos(lower(ft.name), $3)');
  expect(sql).toContain('array_agg(DISTINCT s.name)'); expect(sql).toContain("LIMIT 40");
 });
 it("keeps filters optional and bounds each value", async () => {
  await searchDoctors({ q: "", city: "", specialty: "x".repeat(150) });
  expect(state.all.mock.calls[0][1]).toEqual(["", "", "x".repeat(120)]);
 });
});
