import { describe, expect, it } from "vitest";
import { isPricedRow, priceRows, type Pricing } from "@/domain/commercial/pricing";
import { emptyDesign } from "@/domain/design-state";
import { bomRows } from "@/domain/parts";
import type { DesignState, Part } from "@/types";

// Explicit fixture rather than catalog values: the catalog ships no prices
// (ADR-0003), and a test that asserted against shipped numbers would be
// asserting against invented ones.
const PRICES: Pricing = { blower: 4250, terminal: 1850, tube6: 78, bend90: 142 };

const sampleParts: Part[] = [
  { id: "b", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
  { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
  { id: "t2", type: "terminal", cell: [9, 0, 0], axis: [1, 0, 0] },
  { id: "u1", type: "tube", from: [2, 0, 0], to: [8, 0, 0] },
  { id: "u2", type: "tube", from: [8, 0, 0], to: [17, 0, 0] },
  {
    id: "n1",
    type: "bend",
    entry: [3, 0, 0],
    exit: [6, 0, 3],
    center: [3, 0, 3],
    inDir: [1, 0, 0],
    outDir: [0, 0, 1]
  }
];

function pricedByKey(pricing: Pricing): Record<string, ReturnType<typeof priceRows>[number]> {
  const design: DesignState = { ...emptyDesign(), parts: sampleParts };
  return Object.fromEntries(priceRows(bomRows(design), pricing).map((r) => [r.key, r]));
}

describe("priceRows", () => {
  it("prices each row from the supplied map, keyed by registry key", () => {
    const byKey = pricedByKey({ blower: 9999, tube6: 100, bend90: 200 });
    expect(byKey.blower.unitPrice).toBe(9999);
    expect(byKey.tube6.unitPrice).toBe(100);
    expect(byKey.bend90.unitPrice).toBe(200);
  });

  it("reports a part absent from the map as unpriced rather than free", () => {
    const byKey = pricedByKey({ blower: 9999 });
    expect(byKey.terminal.unitPrice).toBeNull();
    expect(byKey.tube6.unitPrice).toBeNull();
  });

  it("is a pure function of its arguments", () => {
    const rows = bomRows({ ...emptyDesign(), parts: sampleParts });
    expect(priceRows(rows, PRICES)).toEqual(priceRows(rows, PRICES));
    expect(priceRows(rows, {})[0].unitPrice).toBeNull();
    expect(priceRows(rows, PRICES)[0].unitPrice).toBe(4250);
  });

  it("leaves the bill of materials it was given untouched", () => {
    const rows = bomRows({ ...emptyDesign(), parts: sampleParts });
    priceRows(rows, PRICES);
    // The whole point of the split: a BOM cannot acquire a price by being
    // quoted. If this ever fails, some consumer that must show no money is
    // holding a row that has one.
    expect(rows.every((row) => !("unitPrice" in row))).toBe(true);
  });
});

describe("isPricedRow", () => {
  it("narrows a quoted row to one that has a price", () => {
    const [priced] = priceRows(bomRows(emptyDesign()), { blower: 10 });
    const [unpriced] = priceRows(bomRows(emptyDesign()), {});
    expect(isPricedRow(priced)).toBe(true);
    expect(isPricedRow(unpriced)).toBe(false);
  });
});
