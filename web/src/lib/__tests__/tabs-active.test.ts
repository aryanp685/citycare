import { describe, it, expect } from "vitest";
import { activeTab } from "../../components/tabs";

const tabs = [
  { href: "/patient", label: "Dashboard" },
  { href: "/patient/doctors", label: "Find doctors" },
  { href: "/patient/records", label: "Records" },
  { href: "/patient/access", label: "Access & trust" },
];

describe("activeTab (A40: exactly one tab, longest prefix wins)", () => {
  it("root tab only on its own path", () => {
    expect(activeTab("/patient", tabs)).toBe("/patient");
  });
  it("sub-route lights the sub tab, not the root tab", () => {
    expect(activeTab("/patient/records", tabs)).toBe("/patient/records");
    expect(activeTab("/patient/doctors/123e4567-e89b-12d3-a456-426614174000", tabs)).toBe("/patient/doctors");
  });
  it("unknown sub-route under the root falls back to the root tab", () => {
    expect(activeTab("/patient/onboard", tabs)).toBe("/patient");
  });
  it("prefix collisions are not matches (/patients ≠ /patient)", () => {
    expect(activeTab("/patients", tabs)).toBeNull();
  });
});
