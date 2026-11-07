import { describe, expect, it, vi } from "vitest";
import { LOCALES, translate } from "../i18n";
import { submitTrendReading, trendDateIso } from "../trend-submission";
const fields = { name: "Synthetic", valueNum: 12, unit: "mg" };
describe("trend date submission", () => {
  it("preserves 09:00 IST for a valid date", () => expect(trendDateIso("2024-02-29")).toBe("2024-02-29T03:30:00.000Z"));
  it.each(["", "2024-02-30", "invalid", "2024-13-01", "2024-1-01"])("rejects %j without calling API", async date => {
    const send = vi.fn();
    expect(await submitTrendReading(date, fields, send)).toBe("invalidDate");
    expect(send).not.toHaveBeenCalled();
  });
  it("handles clearing after a valid date without defaulting to today", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, data: {}, status: 200 });
    expect(await submitTrendReading("2025-02-10", fields, send)).toBe("saved");
    expect(await submitTrendReading("", fields, send)).toBe("invalidDate");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("returns failures and supports a later retry", async () => {
    const send = vi.fn().mockResolvedValueOnce({ ok: false, error: "failure", status: 500 }).mockResolvedValueOnce({ ok: true, data: {}, status: 200 });
    expect(await submitTrendReading("2025-02-10", fields, send)).toBe("saveError");
    expect(await submitTrendReading("2025-02-10", fields, send)).toBe("saved");
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("handles a thrown network failure without throwing", async () => {
    expect(await submitTrendReading("2025-02-10", fields, vi.fn().mockRejectedValue(new Error("offline")))).toBe("network");
  });
  it.each(LOCALES)("%s has a nonempty validation message", locale => expect(translate(locale, "records", "trendInvalidDate").trim()).toBeTruthy());
});
