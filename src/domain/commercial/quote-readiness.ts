import type { AppSettings, CompanyInfo } from "@/domain/app-settings";
import {
  isPricedRow,
  priceRows,
  type PricedBomRow,
  type QuotedRow
} from "@/domain/commercial/pricing";
import { bomRows } from "@/domain/parts";
import { partRegistry } from "@/domain/part-registry";
import type { DesignState } from "@/types";

/**
 * A quote whose every customer-visible value has been entered by the installer.
 *
 * This type is the gate. `generateQuotePdf` accepts only this, so a quote built
 * from placeholder data is not something the code can express — as opposed to
 * something a dialog discourages. See ADR-0003.
 */
export type ReadyQuote = {
  company: CompanyInfo;
  billTo: { name: string; lines: string[] };
  project: { name: string; lines: string[] };
  quoteNumber: string;
  notes: string;
  taxRate: number;
  rows: PricedBomRow[];
};

/** Which Settings screen fixes a given blocker. */
export type QuoteBlockerTab = "company" | "quote" | "pricing";

export type QuoteBlocker = {
  tab: QuoteBlockerTab;
  /** What is missing, phrased for display: "Company address", "Price for Bend 90°". */
  label: string;
};

export type QuoteReadiness =
  { ready: true; quote: ReadyQuote } | { ready: false; blockers: QuoteBlocker[] };

const COMPANY_FIELDS: Array<{ key: keyof CompanyInfo; label: string }> = [
  { key: "name", label: "Company name" },
  { key: "tagline", label: "Company tagline" },
  { key: "address", label: "Company address" },
  { key: "phone", label: "Company phone" },
  { key: "email", label: "Company email" }
];

function blank(value: string): boolean {
  return value.trim().length === 0;
}

/**
 * Decide whether `design` can be quoted under `settings`, and if so hand back
 * the resolved quote.
 *
 * Every blocker is reported, not just the first: an installer setting the app
 * up for the first time should see the whole list once rather than discover it
 * one field at a time.
 */
export function quoteReadiness(design: DesignState, settings: AppSettings): QuoteReadiness {
  const rows = priceRows(bomRows(design), settings.pricing);
  const blockers: QuoteBlocker[] = [];

  for (const { key, label } of COMPANY_FIELDS) {
    if (blank(settings.company[key])) blockers.push({ tab: "company", label });
  }

  const { billTo, project, quoteNumber, notes } = settings.quote;
  if (blank(billTo.name)) blockers.push({ tab: "quote", label: "Customer name" });
  if (billTo.lines.length === 0) blockers.push({ tab: "quote", label: "Customer address" });
  if (blank(project.name)) blockers.push({ tab: "quote", label: "Project name" });
  if (blank(quoteNumber)) blockers.push({ tab: "quote", label: "Quote number" });
  if (blank(notes)) blockers.push({ tab: "quote", label: "Quote notes" });

  const taxRate = settings.taxRate;
  if (taxRate === null) blockers.push({ tab: "pricing", label: "Tax rate" });

  // Every catalog part, not just the ones this design uses: pricing the catalog
  // is one-time setup rather than per-quote work, and a quote that lists a part
  // at zero quantity still prints its unit price.
  const priced: PricedBomRow[] = [];
  for (const row of rows) {
    if (isPricedRow(row)) priced.push(row);
    else blockers.push({ tab: "pricing", label: `Price for ${priceLabel(row)}` });
  }

  // `taxRate === null` implies a blocker was pushed, so this returns the same
  // answer either way — but testing it here is what narrows it to a number
  // below, without an assertion the compiler cannot check.
  if (blockers.length > 0 || taxRate === null) return { ready: false, blockers };

  return {
    ready: true,
    quote: { company: settings.company, billTo, project, quoteNumber, notes, taxRate, rows: priced }
  };
}

function priceLabel(row: QuotedRow): string {
  return partRegistry.tryGet(row.key)?.name ?? row.key;
}

export function quoteSubtotal(rows: PricedBomRow[]): number {
  return rows.reduce((sum, row) => sum + row.qty * row.unitPrice, 0);
}
