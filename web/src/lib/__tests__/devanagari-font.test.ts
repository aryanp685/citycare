import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("self-hosted Devanagari fallback", () => {
  it("ships a WOFF2 font with local CSS fallback, glyph range and OFL attribution", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const font = readFileSync("src/app/fonts/NotoSansDevanagariVariable.woff2");
    const licence = readFileSync("public/licenses/NotoSansDevanagari-OFL.txt", "utf8");
    expect(font.subarray(0, 4).toString()).toBe("wOF2");
    expect(css).toContain('url("./fonts/NotoSansDevanagariVariable.woff2")');
    expect(css).toContain('var(--font-inter), "CityCare Devanagari"');
    expect(css).toContain("U+0900-097F");
    expect(licence).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(licence).toContain("Noto Project Authors");
  });
});
