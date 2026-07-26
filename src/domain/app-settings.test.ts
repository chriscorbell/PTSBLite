import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "@/domain/app-settings";

describe("mergeSettings", () => {
  it("returns defaults when the loaded value is not an object", () => {
    expect(mergeSettings(DEFAULT_SETTINGS, null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(DEFAULT_SETTINGS, "nope")).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(DEFAULT_SETTINGS, [])).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid loaded values and fills missing keys from defaults", () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      pricing: { blower: 5000 },
      taxRate: 0.1,
      quote: { billTo: { name: "Acme" } }
    });
    expect(merged.pricing).toEqual({ blower: 5000 });
    expect(merged.taxRate).toBe(0.1);
    expect(merged.quote.billTo.name).toBe("Acme");
    // Unspecified fields fall back to defaults.
    expect(merged.quote.billTo.lines).toEqual(DEFAULT_SETTINGS.quote.billTo.lines);
    expect(merged.quote.quoteNumber).toBe(DEFAULT_SETTINGS.quote.quoteNumber);
  });

  it("drops invalid pricing entries and a negative/non-number tax rate", () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      pricing: { blower: -1, terminal: "x", bend90: 200 },
      taxRate: -0.5
    });
    expect(merged.pricing).toEqual({ bend90: 200 });
    expect(merged.taxRate).toBe(DEFAULT_SETTINGS.taxRate);
  });
});

describe("shipped defaults", () => {
  // ADR-0003: nothing a customer sees may arrive pre-filled with an invented
  // value. The gate in quote-readiness.ts is only meaningful if this holds.
  it("ships no prices, no tax rate, and no quote copy", () => {
    expect(DEFAULT_SETTINGS.pricing).toEqual({});
    expect(DEFAULT_SETTINGS.taxRate).toBeNull();
    expect(Object.values(DEFAULT_SETTINGS.company).every((v) => v === "")).toBe(true);
    expect(DEFAULT_SETTINGS.quote.quoteNumber).toBe("");
    expect(DEFAULT_SETTINGS.quote.notes).toBe("");
    expect(DEFAULT_SETTINGS.quote.billTo).toEqual({ name: "", lines: [] });
  });
});
