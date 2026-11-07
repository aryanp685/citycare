/** Presentation-only validation; never parse or rewrite the machine-readable bundle. */
export function exportResponseProblem(status: number, contentType: string | null): "auth" | "failed" | "invalid" | null {
  if (status === 401 || status === 403) return "auth";
  if (status < 200 || status >= 300) return "failed";
  if (!contentType || !/^application\/fhir\+json(?:\s*;|\s*$)/i.test(contentType)) return "invalid";
  return null;
}
export function exportFilename(disposition: string | null): string {
  const name = disposition?.match(/filename="(citycare-[a-f0-9-]+-fhir-r4\.json)"/i)?.[1];
  return name ?? "citycare-fhir-r4.json";
}
