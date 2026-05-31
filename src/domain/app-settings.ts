/**
 * Global, machine-wide application settings — the business values that used to be
 * hardcoded (parts pricing, tax rate, company/quote defaults). Persisted by the
 * Electron main process to a settings.json under the app's userData directory and
 * loaded once on startup. Per-document values (system name, revision) live in
 * design.metadata instead, not here.
 */

export type QuoteDefaults = {
  billTo: { name: string; lines: string[] };
  project: { name: string; lines: string[] };
  quoteNumber: string;
  notes: string;
};

export type AppSettings = {
  /** Per-part unit-price overrides, keyed by part-registry key. */
  pricing: Record<string, number>;
  /** Sales tax rate as a fraction, e.g. 0.0825 for 8.25%. */
  taxRate: number;
  quote: QuoteDefaults;
};

export const DEFAULT_SETTINGS: AppSettings = {
  // Empty by default: prices fall back to the catalog (parts.json) until edited.
  pricing: {},
  taxRate: 0.0825,
  quote: {
    billTo: {
      name: "Mercy Regional Hospital",
      lines: ["Attn: David Choi, Facilities", "1212 Sherman Way, Akron OH 44303"]
    },
    project: { name: "Building 07 Lab Wing — KEL2020", lines: [] },
    quoteNumber: "Q-2026-0184",
    notes:
      "Pricing reflects KEL2020 single-direction system. Installation, electrical, and " +
      "site preparation quoted separately. Stock tube count includes 6ft sections that " +
      "will be cut on-site to required lengths; offcuts are not warranted."
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merge a loaded (possibly partial or stale) settings object onto the defaults so
 * older settings.json files keep working as the shape grows. Unknown keys are
 * ignored; missing keys fall back to defaults.
 */
export function mergeSettings(defaults: AppSettings, loaded: unknown): AppSettings {
  if (!isRecord(loaded)) return defaults;

  const pricing: Record<string, number> = {};
  if (isRecord(loaded.pricing)) {
    for (const [key, value] of Object.entries(loaded.pricing)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        pricing[key] = value;
      }
    }
  }

  const taxRate =
    typeof loaded.taxRate === "number" && Number.isFinite(loaded.taxRate) && loaded.taxRate >= 0
      ? loaded.taxRate
      : defaults.taxRate;

  const loadedQuote = isRecord(loaded.quote) ? loaded.quote : {};
  const billTo = isRecord(loadedQuote.billTo) ? loadedQuote.billTo : {};
  const project = isRecord(loadedQuote.project) ? loadedQuote.project : {};

  const strings = (value: unknown, fallback: string[]): string[] =>
    Array.isArray(value) && value.every((v) => typeof v === "string") ? value : fallback;
  const str = (value: unknown, fallback: string): string =>
    typeof value === "string" ? value : fallback;

  return {
    pricing,
    taxRate,
    quote: {
      billTo: {
        name: str(billTo.name, defaults.quote.billTo.name),
        lines: strings(billTo.lines, defaults.quote.billTo.lines)
      },
      project: {
        name: str(project.name, defaults.quote.project.name),
        lines: strings(project.lines, defaults.quote.project.lines)
      },
      quoteNumber: str(loadedQuote.quoteNumber, defaults.quote.quoteNumber),
      notes: str(loadedQuote.notes, defaults.quote.notes)
    }
  };
}

// --- Module-level price overrides -------------------------------------------
// The domain pricing path (bomRows) reads effective unit prices through these,
// mirroring the existing module-singleton pattern of partRegistry. App syncs the
// override map from settings on load and whenever the user edits pricing.

let priceOverrides: Record<string, number> = {};

export function setPriceOverrides(overrides: Record<string, number>): void {
  priceOverrides = { ...overrides };
}

export function getPriceOverrides(): Record<string, number> {
  return { ...priceOverrides };
}

/** Effective unit price for a part-registry key: an override if set, else the fallback. */
export function unitPriceFor(partKey: string, fallback: number): number {
  const override = priceOverrides[partKey];
  return typeof override === "number" ? override : fallback;
}
