import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ verified: false, query: "", filters: {} as Record<string, string>, grid: vi.fn(async () => []) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/repo", () => ({ doctorById: async () => ({ fullName: "Synthetic Doctor", qualification: "Test", hospital: null, city: null, isVerified: state.verified, rating: null, experienceYrs: 0, consultationFee: 500, languages: [], bio: null }), freeSlotGrid: state.grid, searchDoctors: async (filters: { q: string; city: string; specialty: string }) => { state.query = filters.q; state.filters = filters; return []; } }));
import DoctorsPage from "@/app/patient/doctors/page";
import DoctorDetail from "@/app/patient/doctors/[id]/page";
describe("doctor discovery", () => {
 beforeEach(() => { state.verified = false; state.grid.mockClear(); state.query = ""; });
 it("does not offer booking or load slots for a doctor not approved", async () => { const html = renderToStaticMarkup(await DoctorDetail({ params: Promise.resolve({ id: "synthetic" }) })); expect(html).toContain("Bookings are unavailable"); expect(html).not.toContain("Pick a slot"); expect(state.grid).not.toHaveBeenCalled(); });
 it("shows slots for an admin-approved doctor", async () => { state.verified = true; const html = renderToStaticMarkup(await DoctorDetail({ params: Promise.resolve({ id: "synthetic" }) })); expect(state.grid).toHaveBeenCalledWith("synthetic", 14); expect(html).toContain("Refresh availability"); });
 it("sanitizes repeated search query params and bounds search length", async () => { await DoctorsPage({ searchParams: Promise.resolve({ q: ["one", "two"] as unknown as string }) }); expect(state.query).toBe(""); await DoctorsPage({ searchParams: Promise.resolve({ q: "a".repeat(150) }) }); expect(state.query).toHaveLength(120); await DoctorsPage({ searchParams: Promise.resolve({ city: "Pune", specialty: "Cardiology" }) }); expect(state.filters).toEqual({ q: "", city: "Pune", specialty: "Cardiology" }); await DoctorsPage({ searchParams: Promise.resolve({ city: ["Pune", "Mumbai"], specialty: "x".repeat(150) }) }); expect(state.filters.city).toBe(""); expect(state.filters.specialty).toHaveLength(120); });
});
