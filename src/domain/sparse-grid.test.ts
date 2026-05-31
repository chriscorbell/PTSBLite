import { describe, expect, it } from "vitest";
import { SparseGrid } from "@/domain/sparse-grid";

describe("SparseGrid.withinBounds", () => {
  it("returns true for the origin", () => {
    const g = new SparseGrid();
    expect(g.withinBounds([0, 0, 0])).toBe(true);
  });

  it("returns true for cells within [-30, 30)", () => {
    const g = new SparseGrid();
    expect(g.withinBounds([29, 29, 29])).toBe(true);
    expect(g.withinBounds([-30, -30, -30])).toBe(true);
  });

  it("returns false when any coordinate is >= 30", () => {
    const g = new SparseGrid();
    expect(g.withinBounds([30, 0, 0])).toBe(false);
    expect(g.withinBounds([0, 30, 0])).toBe(false);
    expect(g.withinBounds([0, 0, 30])).toBe(false);
  });

  it("returns false when any coordinate is < -30", () => {
    const g = new SparseGrid();
    expect(g.withinBounds([-31, 0, 0])).toBe(false);
    expect(g.withinBounds([0, -31, 0])).toBe(false);
    expect(g.withinBounds([0, 0, -31])).toBe(false);
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
    const n = g.neighbors([0, 0, 0]);
    expect(n).toHaveLength(6);
    expect(n).toContainEqual([1, 0, 0]);
    expect(n).toContainEqual([-1, 0, 0]);
    expect(n).toContainEqual([0, 1, 0]);
    expect(n).toContainEqual([0, -1, 0]);
    expect(n).toContainEqual([0, 0, 1]);
    expect(n).toContainEqual([0, 0, -1]);
  });

  it("clips neighbors at the positive boundary", () => {
    const g = new SparseGrid();
    const n = g.neighbors([29, 0, 0]);
    const xs = n.map((c) => c[0]);
    expect(xs).not.toContain(30);
    expect(xs).toContain(28);
  });

  it("clips neighbors at the negative boundary", () => {
    const g = new SparseGrid();
    const n = g.neighbors([-30, 0, 0]);
    const xs = n.map((c) => c[0]);
    expect(xs).not.toContain(-31);
    expect(xs).toContain(-29);
    expect(n.length).toBe(5);
  });
});
