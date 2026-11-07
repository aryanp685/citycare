import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Terms, { dynamic } from "@/app/legal/terms/page";

const original = process.env.RETENTION_POLICY;
afterEach(() => {
  if (original === undefined) delete process.env.RETENTION_POLICY;
  else process.env.RETENTION_POLICY = original;
});

describe("terms retention disclosure", () => {
  it("is rendered per request and reflects runtime retention configuration", () => {
    expect(dynamic).toBe("force-dynamic");
    process.env.RETENTION_POLICY = "demo";
    const demo = renderToStaticMarkup(createElement(Terms));
    expect(demo).toMatch(/accounts you create are erased after/);
    expect(demo).not.toMatch(/this deployment does not auto-erase accounts/);
    process.env.RETENTION_POLICY = "pilot";
    const pilot = renderToStaticMarkup(createElement(Terms));
    expect(pilot).toMatch(/this deployment does not auto-erase accounts/);
    expect(pilot).not.toMatch(/accounts you create are erased after/);
  });
});
