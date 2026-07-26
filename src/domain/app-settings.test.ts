import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  setPriceOverrides,
  unitPriceFor
} from "@/domain/app-settings";

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

describe("price overrides", () => {
  afterEach(() => setPriceOverrides({}));

  it("unitPriceFor returns the fallback when no override is set", () => {
    expect(unitPriceFor("blower", 4250)).toBe(4250);
  });

  it("unitPriceFor returns the override when set", () => {
    setPriceOverrides({ blower: 9000 });
    expect(unitPriceFor("blower", 4250)).toBe(9000);
    expect(unitPriceFor("terminal", 1850)).toBe(1850);
  });
});
