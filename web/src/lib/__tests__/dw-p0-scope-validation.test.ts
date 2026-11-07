import { describe, expect, it } from "vitest";
import { GrantSchema } from "../validate";

const grant = { doctorId: "00000000-0000-4000-8000-000000000001", expiryDays: 7 };
describe("new grant scope validation", () => {
  it.each([
    { scope: "NO_SUCH_SCOPE" }, { scope: "SPECIFIC_DOCUMENTS" },
    { scope: "SPECIFIC_CONDITION" }, { scope: "SPECIFIC_CONDITION", conditionName: "  " },
    { scope: "SPECIFIC_CONDITION", conditionName: "x".repeat(81) },
    { scope: "LAST_N_ENCOUNTERS", lastNEncounters: 0 },
    { scope: "LAST_N_ENCOUNTERS", lastNEncounters: 51 },
    { scope: "LAST_N_ENCOUNTERS", lastNEncounters: 2.5 },
    { scope: "LAST_N_ENCOUNTERS", lastNEncounters: "3" },
  ])("rejects %j", (scope) => expect(GrantSchema.safeParse({ ...grant, ...scope }).success).toBe(false));
  it.each([
    { scope: "FULL_RECORD" }, { scope: "SUMMARY_ONLY" },
    { scope: "LAST_N_ENCOUNTERS" }, { scope: "LAST_N_ENCOUNTERS", lastNEncounters: 50 },
    { scope: "SPECIFIC_CONDITION", conditionName: "diabetes" },
  ])("preserves supported %j", (scope) => expect(GrantSchema.safeParse({ ...grant, ...scope }).success).toBe(true));
});
