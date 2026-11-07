import { describe, expect, it } from "vitest";
import { exportFilename, exportResponseProblem } from "../fhir-download";
describe("FHIR download response handling", () => {
  it("only accepts successful FHIR responses", () => {
    expect(exportResponseProblem(200, "application/fhir+json; charset=utf-8")).toBeNull();
    expect(exportResponseProblem(401, "application/json")).toBe("auth");
    expect(exportResponseProblem(403, null)).toBe("auth");
    expect(exportResponseProblem(500, "application/json")).toBe("failed");
    expect(exportResponseProblem(200, "text/html")).toBe("invalid");
  });
  it("accepts only the safe server filename", () => {
    expect(exportFilename('attachment; filename="citycare-abcd1234-fhir-r4.json"')).toBe("citycare-abcd1234-fhir-r4.json");
    expect(exportFilename('attachment; filename="../../bad.json"')).toBe("citycare-fhir-r4.json");
  });
});
