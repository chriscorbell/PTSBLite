import { describe, expect, it } from "vitest";
import {
  boundsFromBuildArea,
  clampBuildArea,
  BUILD_AREA_LIMITS,
  DEFAULT_BUILD_AREA,
  SparseGrid
} from "@/domain/sparse-grid";

describe("SparseGrid.withinBounds", () => {
  it("returns true for the origin", () => {
    const g = new SparseGrid();
    expect(g.withinBounds([0, 0, 0])).toBe(true);
  });

  it("returns true for cells inside the default 60×60×30 area", () => {
    const g = new SparseGrid();
    // X/Z span [-30, 30); Y rises from the ground (0) up to 30.
    expect(g.withinBounds([29, 29, 29])).toBe(true);
    expect(g.withinBounds([-30, 0, -30])).toBe(true);
  });

  it("returns false when X or Z is >= 30, or Y reaches the ceiling (>= 30)", () => {
    const g = new SparseGrid();
    expect(g.withinBounds([30, 0, 0])).toBe(false);
    expect(g.withinBounds([0, 30, 0])).toBe(false);
    expect(g.withinBounds([0, 0, 30])).toBe(false);
  });

  it("returns false below the X/Z edge (< -30) or below the ground (Y < 0)", () => {
    const g = new SparseGrid();
    expect(g.withinBounds([-31, 0, 0])).toBe(false);
    expect(g.withinBounds([0, 0, -31])).toBe(false);
    expect(g.withinBounds([0, -1, 0])).toBe(false);
  });
});

describe("configurable build area", () => {
  it("derives centered X/Z bounds and ground-up Y bounds from a build area", () => {
    const b = boundsFromBuildArea({ width: 20, depth: 40, height: 10 });
    expect([b.xMin, b.xMax]).toEqual([-10, 10]);
    expect([b.zMin, b.zMax]).toEqual([-20, 20]);
    expect([b.yMin, b.yMax]).toEqual([0, 10]);
  });

  it("honors custom bounds in withinBounds", () => {
    const g = new SparseGrid(boundsFromBuildArea({ width: 10, depth: 10, height: 4 }));
    expect(g.withinBounds([4, 3, 4])).toBe(true);
    expect(g.withinBounds([5, 0, 0])).toBe(false); // X past the smaller edge
    expect(g.withinBounds([0, 4, 0])).toBe(false); // Y at the lower ceiling
  });

  it("clamps build areas to whole feet within limits, falling back on bad input", () => {
    expect(clampBuildArea({ width: 80.6, depth: 40, height: 12 })).toEqual({
      width: 81,
      depth: 40,
      height: 12
    });
    expect(clampBuildArea({ width: 5000, depth: 1, height: -3 })).toEqual({
      width: BUILD_AREA_LIMITS.width.max,
      depth: BUILD_AREA_LIMITS.depth.min,
      height: BUILD_AREA_LIMITS.height.min
    });
    expect(clampBuildArea(undefined)).toEqual(DEFAULT_BUILD_AREA);
  });
});

describe("SparseGrid.query", () => {
  it("returns undefined for an empty cell", () => {
    const g = new SparseGrid();
    expect(g.query([0, 0, 0])).toBeUndefined();
  });
});

describe("SparseGrid.place and query", () => {
  it("query returns the occupant id after place", () => {
    const g = new SparseGrid();
    g.place([0, 0, 0], "b1");
    expect(g.query([0, 0, 0])).toBe("b1");
  });

  it("query at a different cell still returns undefined", () => {
    const g = new SparseGrid();
    g.place([0, 0, 0], "b1");
    expect(g.query([1, 0, 0])).toBeUndefined();
  });

  it("throws when placing out-of-bounds", () => {
    const g = new SparseGrid();
    expect(() => g.place([30, 0, 0], "b1")).toThrow();
    expect(() => g.place([-31, 0, 0], "b1")).toThrow();
  });

  it("throws when placing on an already-occupied cell", () => {
    const g = new SparseGrid();
    g.place([5, 5, 5], "b1");
    expect(() => g.place([5, 5, 5], "b2")).toThrow();
  });
});

describe("SparseGrid.remove", () => {
  it("query returns undefined after removing an occupant", () => {
    const g = new SparseGrid();
    g.place([0, 0, 0], "b1");
    g.remove([0, 0, 0]);
    expect(g.query([0, 0, 0])).toBeUndefined();
  });

  it("remove is a no-op for an empty cell (does not throw)", () => {
    const g = new SparseGrid();
    expect(() => g.remove([0, 0, 0])).not.toThrow();
  });

  it("cell can be re-occupied after removal", () => {
    const g = new SparseGrid();
    g.place([0, 0, 0], "b1");
    g.remove([0, 0, 0]);
    g.place([0, 0, 0], "b2");
    expect(g.query([0, 0, 0])).toBe("b2");
  });
});

describe("SparseGrid.clone", () => {
  it("copies occupied cells without sharing later mutations", () => {
    const g = new SparseGrid();
    g.place([1, 0, 0], "b1");

    const clone = g.clone();
    clone.place([2, 0, 0], "t2");

    expect(clone.query([1, 0, 0])).toBe("b1");
    expect(clone.query([2, 0, 0])).toBe("t2");
    expect(g.query([2, 0, 0])).toBeUndefined();
  });
});

describe("SparseGrid.neighbors", () => {
  it("returns 6 face-adjacent cells for an interior cell", () => {
    const g = new SparseGrid();
    // Above the ground plane so both vertical neighbors stay in bounds.
    const n = g.neighbors([0, 1, 0]);
    expect(n).toHaveLength(6);
    expect(n).toContainEqual([1, 1, 0]);
    expect(n).toContainEqual([-1, 1, 0]);
    expect(n).toContainEqual([0, 2, 0]);
    expect(n).toContainEqual([0, 0, 0]);
    expect(n).toContainEqual([0, 1, 1]);
    expect(n).toContainEqual([0, 1, -1]);
  });

  it("clips neighbors at the positive boundary", () => {
    const g = new SparseGrid();
    const n = g.neighbors([29, 1, 0]);
    const xs = n.map((c) => c[0]);
    expect(xs).not.toContain(30);
    expect(xs).toContain(28);
  });

  it("clips neighbors at the negative boundary", () => {
    const g = new SparseGrid();
    const n = g.neighbors([-30, 1, 0]);
    const xs = n.map((c) => c[0]);
    expect(xs).not.toContain(-31);
    expect(xs).toContain(-29);
  });

  it("clips the downward neighbor at the ground plane", () => {
    const g = new SparseGrid();
    const ys = g.neighbors([0, 0, 0]).map((c) => c[1]);
    expect(ys).not.toContain(-1);
    expect(ys).toContain(1);
  });
});
