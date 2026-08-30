import { describe, expect, it } from "vitest";
import { designFromScene, emptyDesign } from "@/domain/design-state";
import { bomRows, partLength, totalPathLength, tubeFeet } from "@/domain/parts";
import type { DesignState, Part } from "@/types";

function designWith(parts: Part[]): DesignState {
  return designFromScene({ parts, obstacles: [] });
}

const sampleParts: Part[] = [
  { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
  { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
  { id: "t2", type: "terminal", cell: [30, 0, 0], axis: [1, 0, 0] },
  { id: "st1", type: "tube", from: [2, 0.5, 0], to: [8, 0.5, 0] },
  { id: "st2", type: "tube", from: [8, 0.5, 0], to: [14, 0.5, 0] },
  { id: "st3", type: "tube", from: [14, 0.5, 0], to: [17, 0.5, 0] },
  {
    id: "bn1",
    type: "bend",
    entry: [17, 0.5, 0],
    exit: [20, 0.5, 3],
    center: [20, 0.5, 0],
    inDir: [1, 0, 0],
    outDir: [0, 0, 1],
    radius: 3
  }
];

describe("BOM derivation", () => {
  it("partLength is zero for endpoint parts", () => {
    expect(partLength(sampleParts[0])).toBe(0);
    expect(partLength(sampleParts[1])).toBe(0);
  });

  it("partLength measures straight tubes by euclidean distance", () => {
    expect(partLength(sampleParts[3])).toBeCloseTo(6, 5);
    expect(partLength(sampleParts[5])).toBeCloseTo(3, 5);
  });

  it("partLength measures bends by quarter-circumference at the bend radius", () => {
    expect(partLength(sampleParts[6])).toBeCloseTo((Math.PI * 3) / 2, 5);
  });

  it("totalPathLength sums tube length and bend arc length", () => {
    const len = totalPathLength(sampleParts);
    expect(len).toBeCloseTo(6 + 6 + 3 + (Math.PI * 3) / 2, 5);
  });

  it("totalPathLength accepts a DesignState", () => {
    expect(totalPathLength(designWith(sampleParts))).toBeCloseTo(totalPathLength(sampleParts), 5);
  });

  it("tubeFeet counts only straight tube length", () => {
    expect(tubeFeet(sampleParts)).toBeCloseTo(15, 5);
  });

  it("bomRows aggregates parts into catalog rows", () => {
    const rows = bomRows(designWith(sampleParts));
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.blower.qty).toBe(1);
    expect(byKey.terminal.qty).toBe(2);
    expect(byKey.bend90.qty).toBe(1);
    expect(byKey.tube6.qty).toBe(Math.ceil(15 / 6));
    expect(byKey.tube6.note).toMatch(/15\.0ft total/);
    expect(byKey.tube6.note).toMatch(/1 cut on-site/);
    expect(byKey.blower.partNo).toBe("BL-2020-A");
  });

  it("bomRows yields zero quantities for an empty design", () => {
    const rows = bomRows(emptyDesign());
    expect(rows.every((r) => r.qty === 0)).toBe(true);
    expect(rows.map((r) => r.key).sort()).toEqual([
      "bend90",
      "blower",
      "blowerPedestal",
      "terminal",
      "tube6"
    ]);
  });
});
