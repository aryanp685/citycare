import { describe, expect, it } from "vitest";
import { CATALOGS, LOCALES } from "../i18n";
describe("records and documents catalog audit", () => {
  it("reports key coverage and missing values (does not audit hardcoded UI)", () => {
    const namespaces = ["records", "documents"] as const;
    const keys = namespaces.flatMap(ns => Object.keys(CATALOGS.en[ns]).map(key => [ns, key] as const));
    for (const locale of LOCALES) {
      const missing = keys.filter(([ns, key]) => !((CATALOGS[locale][ns] as Record<string, string | undefined>)[key] ?? "").trim()).map(([ns, key]) => `${ns}.${key}`);
      console.log(`RECORDS_CATALOG_AUDIT ${locale}: ${keys.length - missing.length}/${keys.length}; missing=${missing.join(",") || "none"}`);
      expect(missing).toEqual([]);
    }
  });
});
