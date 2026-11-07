import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { grievanceContact } from "../grievance-contact";
import { GrievanceContact } from "../../components/grievance-contact";

const env = (officer?: string, email?: string) => ({ NEXT_PUBLIC_GRIEVANCE_OFFICER: officer, NEXT_PUBLIC_GRIEVANCE_EMAIL: email });
describe("public grievance contact", () => {
  it("accepts and trims a synthetic Unicode name and mailbox", () => {
    expect(grievanceContact(env("  आशा पाटील  ", " test@example.org "))).toEqual({ status: "configured", officer: "आशा पाटील", email: "test@example.org" });
  });
  it.each([env(), env("", "test@example.org"), env("Test Officer", ""), env("  ", "test@example.org"), env("Test Officer")])("withholds partial or missing configuration", (value) => {
    expect(grievanceContact(value)).toEqual({ status: "unavailable" });
  });
  it.each(["bad", "a@example.org?subject=x", "a\n@example.org", "a..b@example.org", "a@-example.org", "a@example", "a@example.org\r\nBcc:x@y.in"])("rejects invalid mailbox %s", (email) => {
    expect(grievanceContact(env("Test Officer", email)).status).toBe("unavailable");
  });
  it.each(["<name>", "[placeholder]", "Test\nOfficer", "a".repeat(101), "123"])("rejects invalid officer %s", (name) => {
    expect(grievanceContact(env(name, "test@example.org")).status).toBe("unavailable");
  });
  it("renders unavailable rather than misleading partial details", () => {
    const oldName = process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER;
    const oldEmail = process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL;
    try {
      process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER = "Synthetic Officer";
      delete process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL;
      const html = renderToStaticMarkup(GrievanceContact());
      expect(html).toContain("not yet published");
      expect(html).not.toContain("Synthetic Officer");
      expect(html).not.toContain("mailto:");
    } finally {
      if (oldName === undefined) delete process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER; else process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER = oldName;
      if (oldEmail === undefined) delete process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL; else process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL = oldEmail;
    }
  });
});
