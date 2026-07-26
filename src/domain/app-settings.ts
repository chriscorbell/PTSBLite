/**
 * Global, machine-wide application settings — the business values that used to be
 * hardcoded (parts pricing, tax rate, company/quote defaults). Persisted by the
 * Electron main process to a settings.json under the app's userData directory and
 * loaded once on startup. Per-document values (system name, revision) live in
 * design.metadata instead, not here.
 */

/** The seller identity printed on quote letterheads. Edited via Settings → Company. */
export type CompanyInfo = {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
};

export type QuoteDefaults = {
  billTo: { name: string; lines: string[] };
  project: { name: string; lines: string[] };
  quoteNumber: string;
  notes: string;
};

export type AppSettings = {
  /**
   * Unit prices keyed by part-registry key. The *only* source of prices — the
   * catalog carries none (ADR-0003). A key absent here has no price.
   */
  pricing: Record<string, number>;
  /** Sales tax rate as a fraction, e.g. 0.0825 for 8.25%. `null` until entered. */
  taxRate: number | null;
  /** The seller's own company details, shown on the quote letterhead. */
  company: CompanyInfo;
  quote: QuoteDefaults;
};

/**
 * Boilerplate offered in Settings behind an explicit "use suggested text"
 * action. Not a default: nothing about a quote is written for the installer,
 * because copy that arrives pre-filled is copy nobody reads before sending.
 */
export const SUGGESTED_QUOTE_NOTES =
  "Pricing reflects a single-direction system. Installation, electrical, and " +
  "site preparation quoted separately. Stock tube count includes 6ft sections that " +
  "will be cut on-site to required lengths; offcuts are not warranted.";

/**
 * Everything a quote prints starts empty.
 *
 * ADR-0003 required this for prices, on the grounds that a plausible-looking
 * invented number is worse than an obviously missing one. The same argument
 * applies to the tax rate — arguably more so, since "Tax (8.25%)" computed to
 * the cent reads as authoritative in a way "Your Company" never does — and to
 * every other field the customer sees. Export is blocked until they are filled
 * in; see `quote-readiness.ts`.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  pricing: {},
  taxRate: null,
  company: {
    name: "",
    tagline: "",
    address: "",
    phone: "",
    email: ""
  },
  quote: {
    billTo: { name: "", lines: [] },
    project: { name: "", lines: [] },
    quoteNumber: "",
    notes: ""
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
  const company = isRecord(loaded.company) ? loaded.company : {};

  const strings = (value: unknown, fallback: string[]): string[] =>
    Array.isArray(value) && value.every((v) => typeof v === "string") ? value : fallback;
  const str = (value: unknown, fallback: string): string =>
    typeof value === "string" ? value : fallback;

  return {
    pricing,
    taxRate,
    company: {
      name: str(company.name, defaults.company.name),
      tagline: str(company.tagline, defaults.company.tagline),
      address: str(company.address, defaults.company.address),
      phone: str(company.phone, defaults.company.phone),
      email: str(company.email, defaults.company.email)
    },
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
