import type { BomRow } from "@/domain/parts";

/**
 * Money applied to a bill of materials.
 *
 * This module and everything else under `commercial/` exists so that a product
 * which must show no prices can be built without them. `BomRow` carries no
 * price; a quote needs one, so it decorates the rows here. Nothing outside a
 * quote path should import from this directory — see ADR-0011 for what enforces
 * that.
 */

/** Unit prices keyed by part-registry key. A key absent from the map has no price. */
export type Pricing = Readonly<Record<string, number>>;

/** A BOM row a price has been looked up for. `null` means none was entered. */
export type QuotedRow = BomRow & { unitPrice: number | null };

/** A row that has a price, and therefore a line total. */
export type PricedBomRow = BomRow & { unitPrice: number };

export function isPricedRow(row: QuotedRow): row is PricedBomRow {
  return row.unitPrice !== null;
}

/**
 * Apply `pricing` to a bill of materials.
 *
 * Prices are an argument rather than something this module reaches for. They
 * used to come from a mutable module-level global that `App` wrote on startup,
 * which meant the BOM was not a function of its inputs, could not be tested
 * without global setup, and leaked between tests by execution order.
 */
export function priceRows(rows: BomRow[], pricing: Pricing): QuotedRow[] {
  return rows.map((row) => ({ ...row, unitPrice: pricing[row.key] ?? null }));
}
