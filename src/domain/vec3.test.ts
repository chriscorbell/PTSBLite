import { describe, expect, it } from "vitest";
import { cellKey, dirOf, tubeCells, vAdd, vEq, vNeg, vScale } from "@/domain/vec3";
import type { Vec3 } from "@/types";

const vec = (x: number, y: number, z: number): Vec3 => [x, y, z];

describe("vec3 negative-zero normalization", () => {
  it("never emits -0 from the operations that can produce it", () => {
    // -0 arises from negation and from multiplying a negative by zero. These are
    // the cases where the pre-consolidation copies disagreed with each other.
    const produced = [
      vNeg(vec(0, 0, 0)),
      vScale(vec(-1, 0, 0), 0),
      vAdd(vNeg(vec(0, 0, 0)), vec(0, 0, 0))
    ];

    for (const v of produced) {
      for (const component of v) expect(Object.is(component, -0)).toBe(false);
    }
  });
});

describe("vec3 cell keys", () => {
  it("gives the same key regardless of which arithmetic path produced the cell", () => {
    expect(cellKey(vScale(vec(-1, 0, 0), 0))).toBe(cellKey(vec(0, 0, 0)));
    expect(cellKey(vAdd(vec(2, 0, 3), vNeg(vec(2, 0, 3))))).toBe(cellKey(vec(0, 0, 0)));
  });
});

describe("tubeCells", () => {
  it("walks from the start cell and excludes the end cell", () => {
    // A tube's `to` is the open port beyond its last occupied cell, so a 6ft run
    // occupies 6 cells, not 7.
    expect(tubeCells(vec(1.5, 0.5, 0.5), vec(7.5, 0.5, 0.5))).toEqual([
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
      [5, 0, 0],
      [6, 0, 0]
    ]);
  });

  it("walks negative directions without emitting -0", () => {
    const cells = tubeCells(vec(0.5, 0.5, 0.5), vec(-3.5, 0.5, 0.5));

    expect(cells).toEqual([
      [0, 0, 0],
      [-1, 0, 0],
      [-2, 0, 0],
      [-3, 0, 0]
    ]);
    for (const cell of cells) for (const c of cell) expect(Object.is(c, -0)).toBe(false);
  });

  it("returns nothing for a zero-length run", () => {
    expect(tubeCells(vec(1.5, 0.5, 0.5), vec(1.5, 0.5, 0.5))).toEqual([]);
  });
});

describe("dirOf", () => {
  it("reduces a span to unit steps per axis", () => {
    expect(dirOf(vec(0, 0, 0), vec(6, 0, -3))).toEqual([1, 0, -1]);
    expect(vEq(dirOf(vec(2, 2, 2), vec(2, 2, 2)), vec(0, 0, 0))).toBe(true);
  });
});
