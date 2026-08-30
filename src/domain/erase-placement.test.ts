import { describe, expect, it } from "vitest";
import { bendFootprint } from "@/domain/occupant-footprints";
import { designFromScene, emptyDesign } from "@/domain/design-state";
import { ERASE_EMPTY_MESSAGE, eraseAtCell } from "@/domain/erase-placement";
import { computeTopology } from "@/domain/topology";
import type { BendPart, DesignState } from "@/types";
import { expectGridMatchesDesign } from "@/test/design-invariants";

describe("Erase placement", () => {
  it("rejects empty cells with the PRD corrective message", () => {
    const design = emptyDesign();

    expect(eraseAtCell(design, [0, 0, 0])).toEqual({
      ok: false,
      message: ERASE_EMPTY_MESSAGE,
      design
    });
  });

  it("does not erase from geometric part bounds when the grid cell has no owner", () => {
    // Deliberately bypass the checked constructor to model corrupt persisted state.
    const design: DesignState = {
      ...emptyDesign(),
      parts: [{ id: "st1", type: "tube", from: [1.5, 0.5, 0.5], to: [7.5, 0.5, 0.5], length: 6 }]
    };

    expect(eraseAtCell(design, [3, 0, 0])).toEqual({
      ok: false,
      message: ERASE_EMPTY_MESSAGE,
      design
    });
  });

  it("removes a blower instance and frees its grid cell", () => {
    const design = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [2, 0, 3], dir: [1, 0, 0] }],
      obstacles: []
    });

    const result = eraseAtCell(design, [2, 0, 3]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.design.parts).toEqual([]);
    expect(result.design.grid.query([2, 0, 3])).toBeUndefined();
  });

  it("removes a terminal instance and frees its grid cell", () => {
    const design = designFromScene({
      parts: [{ id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] }],
      obstacles: []
    });

    const result = eraseAtCell(design, [1, 0, 0]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.design.parts).toEqual([]);
    expect(result.design.grid.query([1, 0, 0])).toBeUndefined();
  });

  it("reopens a previously connected port after endpoint removal", () => {
    const design = designFromScene({
      parts: [
        { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
        { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] }
      ],
      obstacles: []
    });

    expect(computeTopology(design).openPortsNear([1, 0, 0])).toEqual([]);

    const result = eraseAtCell(design, [1, 0, 0]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(computeTopology(result.design).openPortsNear([1, 0, 0])).toMatchObject([
      { partId: "b1", ownerType: "blower" }
    ]);
  });

  it("removes only the targeted straight tube cell and exposes ports at a mid-tube cut", () => {
    const design = designFromScene({
      parts: [{ id: "st1", type: "tube", from: [1.5, 0.5, 0.5], to: [7.5, 0.5, 0.5], length: 6 }],
      obstacles: []
    });

    const result = eraseAtCell(design, [3, 0, 0]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.design.grid.query([3, 0, 0])).toBeUndefined();
    for (const x of [1, 2, 4, 5, 6]) {
      expect(result.design.grid.query([x, 0, 0])).toBeDefined();
    }

    const openPorts = computeTopology(result.design).openPorts();
    expect(openPorts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cell: [3, 0, 0], dir: [1, 0, 0] }),
        expect.objectContaining({ cell: [3, 0, 0], dir: [-1, 0, 0] })
      ])
    );
  });

  it("removes an entire bend when any constituent footprint cell is erased", () => {
    const bend: BendPart = {
      id: "bn1",
      type: "bend",
      entry: [1.5, 0.5, 0.5],
      exit: [4.5, 0.5, 3.5],
      center: [1.5, 0.5, 3.5],
      inDir: [1, 0, 0],
      outDir: [0, 0, 1],
      radius: 3
    };
    const footprint = bendFootprint(bend);
    const design = designFromScene({ parts: [bend], obstacles: [] });

    const result = eraseAtCell(design, footprint[footprint.length - 1]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.design.parts).toEqual([]);
    for (const cell of footprint) {
      expect(result.design.grid.query(cell)).toBeUndefined();
    }
  });

  it("removes an entire obstacle volume from any occupied obstacle cell", () => {
    const design = designFromScene({
      parts: [],
      obstacles: [{ id: "o1", min: [2, 0, 3], max: [4, 1, 5] }]
    });

    const result = eraseAtCell(design, [3, 1, 4]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.design.obstacles).toEqual([]);
    expect(result.design.grid.query([2, 0, 3])).toBeUndefined();
    expect(result.design.grid.query([4, 1, 5])).toBeUndefined();
  });

  it("keeps a surviving overlapping obstacle registered in the grid", () => {
    const design = designFromScene({
      parts: [],
      obstacles: [
        { id: "o1", min: [0, 0, 0], max: [2, 0, 0] },
        { id: "o2", min: [1, 0, 0], max: [3, 0, 0] }
      ]
    });

    const result = eraseAtCell(design, [0, 0, 0]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.obstacles.map((obstacle) => obstacle.id)).toEqual(["o2"]);
    expect(result.design.grid.query([1, 0, 0])).toBe("o2");
    expectGridMatchesDesign(result.design);
  });

  it("registers a surviving impenetrable obstacle after erasing a part over it", () => {
    const design = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [1, 0, 1], dir: [0, 1, 0] }],
      obstacles: [{ id: "o1", min: [1, 0, 1], max: [1, 0, 1] }]
    });

    const result = eraseAtCell(design, [1, 0, 1]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.parts).toEqual([]);
    expect(result.design.grid.query([1, 0, 1])).toBe("o1");
    expectGridMatchesDesign(result.design);
  });
});

describe("erasing penetrable obstacles", () => {
  it("finds a penetrable obstacle by containment, since it owns no grid cells", () => {
    const design = designFromScene({
      parts: [],
      obstacles: [{ id: "o1", min: [2, 0, 2], max: [4, 2, 4], penetrable: true }]
    });

    const result = eraseAtCell(design, [3, 1, 3]);
    expect(result.ok).toBe(true);
    expect(result.design.obstacles).toEqual([]);
    expectGridMatchesDesign(result.design);
  });

  it("erases the part on a shared cell, not the penetrable obstacle around it", () => {
    const design = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [1, 0, 1], dir: [0, 1, 0] }],
      obstacles: [{ id: "o1", min: [0, 0, 0], max: [2, 0, 2], penetrable: true }]
    });

    const result = eraseAtCell(design, [1, 0, 1]);
    expect(result.ok).toBe(true);
    expect(result.design.parts).toEqual([]);
    // The obstacle survives, and the blower's cell is actually freed.
    expect(result.design.obstacles.map((o) => o.id)).toEqual(["o1"]);
    expect(result.design.grid.query([1, 0, 1])).toBeUndefined();
  });
});
