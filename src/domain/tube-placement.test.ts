import { describe, expect, it } from "vitest";
import { designFromScene } from "@/domain/design-state";
import { computeTopology } from "@/domain/topology";
import {
  TUBE_BLOCKED_MESSAGE,
  TUBE_PLACEMENT_MESSAGE,
  placeTube,
  tubeLandingCells,
  tubePlacementGhost
} from "@/domain/tube-placement";
import type { BendPart, Obstacle, Part } from "@/types";
import { expectGridMatchesDesign } from "@/test/design-invariants";

function designWith(parts: Part[], obstacles: Obstacle[] = []) {
  return designFromScene({ parts, obstacles });
}

describe("Straight tube snap placement", () => {
  it("computes landing cells adjacent to every open port", () => {
    const design = designWith([
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "t2", type: "terminal", cell: [10, 0, 0], axis: [1, 0, 0] }
    ]);

    expect(tubeLandingCells(design)).toEqual([
      [1, 0, 0],
      [11, 0, 0],
      [9, 0, 0]
    ]);
  });

  it("snaps the ghost to the open port direction for a highlighted landing cell", () => {
    const design = designWith([{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }]);

    expect(tubePlacementGhost(design, [1, 0, 0])).toEqual({
      type: "tube",
      from: [1.5, 0.5, 0.5],
      to: [7.5, 0.5, 0.5]
    });
  });

  it("starts a tube after a bend from the cell beyond the bend exit sleeve", () => {
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
    const design = designWith([bend]);

    expect(tubePlacementGhost(design, [4, 0, 4], { sourcePartId: "bn1" })).toEqual({
      type: "tube",
      from: [4.5, 0.5, 4.5],
      to: [4.5, 0.5, 10.5]
    });
  });

  it("commits a 6-cell tube and registers the near connected port plus far open port", () => {
    const design = designWith([{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }]);

    const result = placeTube(design, { id: "st1", cell: [1, 0, 0] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.part).toEqual({
      id: "st1",
      type: "tube",
      from: [1.5, 0.5, 0.5],
      to: [7.5, 0.5, 0.5],
      length: 6
    });
    for (let x = 1; x <= 6; x++) {
      expect(result.design.grid.query([x, 0, 0])).toBe("st1");
    }

    const openPorts = computeTopology(result.design).openPorts();
    expect(openPorts).toMatchObject([{ partId: "st1", cell: [7, 0, 0], dir: [1, 0, 0] }]);
  });

  it("truncates downward vertical tubes at the ground plane", () => {
    const design = designWith([{ id: "b1", type: "blower", cell: [0, 3, 0], dir: [0, -1, 0] }]);

    expect(tubePlacementGhost(design, [0, 2, 0])).toEqual({
      type: "tube",
      from: [0.5, 2.5, 0.5],
      to: [0.5, -0.5, 0.5]
    });

    const result = placeTube(design, { id: "st1", cell: [0, 2, 0] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.part).toEqual({
      id: "st1",
      type: "tube",
      from: [0.5, 2.5, 0.5],
      to: [0.5, -0.5, 0.5],
      length: 3
    });
    expect(result.design.grid.query([0, 2, 0])).toBe("st1");
    expect(result.design.grid.query([0, 1, 0])).toBe("st1");
    expect(result.design.grid.query([0, 0, 0])).toBe("st1");
    expect(result.design.grid.query([0, -1, 0])).toBeUndefined();
  });

  it("rejects non-landing cells with the PRD corrective message and no ghost", () => {
    const design = designWith([{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }]);

    expect(tubePlacementGhost(design, [3, 0, 0])).toBeNull();
    expect(placeTube(design, { id: "st1", cell: [3, 0, 0] })).toEqual({
      ok: false,
      message: TUBE_PLACEMENT_MESSAGE
    });
  });

  it("uses the clicked source part to resolve a multi-candidate landing cell", () => {
    const design = designWith([
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "b2", type: "blower", cell: [1, 0, 1], dir: [0, 0, -1] }
    ]);

    expect(tubePlacementGhost(design, [1, 0, 0])).toBeNull();
    expect(tubePlacementGhost(design, [1, 0, 0], { sourcePartId: "b2" })).toEqual({
      type: "tube",
      from: [1.5, 0.5, 0.5],
      to: [1.5, 0.5, -5.5]
    });

    const result = placeTube(design, { id: "st1", cell: [1, 0, 1], sourcePartId: "b2" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.part).toMatchObject({
      from: [1.5, 0.5, 0.5],
      to: [1.5, 0.5, -5.5]
    });
  });
});

describe("Straight tube partial placement", () => {
  it("places as many segments as fit when an obstacle blocks the path", () => {
    const design = designWith(
      [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }],
      [{ id: "o1", min: [4, 0, 0], max: [4, 0, 0] }]
    );

    // Ghost previews the truncated run (cells 1..3) up to the obstacle.
    expect(tubePlacementGhost(design, [1, 0, 0])).toEqual({
      type: "tube",
      from: [1.5, 0.5, 0.5],
      to: [4.5, 0.5, 0.5]
    });

    const result = placeTube(design, { id: "st1", cell: [1, 0, 0] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.part.length).toBe(3);
    expect(result.part.to).toEqual([4.5, 0.5, 0.5]);
    for (let x = 1; x <= 3; x++) expect(result.design.grid.query([x, 0, 0])).toBe("st1");
    expect(result.design.grid.query([4, 0, 0])).toBe("o1"); // obstacle untouched
  });

  it("places as many segments as fit before the build-area edge", () => {
    // The build area is fixed at 300 ft: X spans [-150, 150), so a blower at
    // 145 leaves exactly cells 146..149 before the edge.
    const design = designWith([{ id: "b1", type: "blower", cell: [145, 0, 0], dir: [1, 0, 0] }]);

    const result = placeTube(design, { id: "st1", cell: [146, 0, 0] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.part.length).toBe(4);
    expect(result.part.to).toEqual([150.5, 0.5, 0.5]);
  });

  it("places as many segments as fit before an existing part", () => {
    const design = designWith([
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "t2", type: "terminal", cell: [3, 0, 0], axis: [1, 0, 0] }
    ]);

    const result = placeTube(design, { id: "st1", cell: [1, 0, 0] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.part.length).toBe(2); // cells 1..2 fit; cell 3 holds the terminal
    expect(result.part.to).toEqual([3.5, 0.5, 0.5]);
  });

  it("reports blocked when not even one segment fits", () => {
    // Blower at the +X edge facing out: its only port is already out of bounds.
    const design = designWith([{ id: "b1", type: "blower", cell: [149, 0, 0], dir: [1, 0, 0] }]);

    expect(placeTube(design, { id: "st1", cell: [150, 0, 0] })).toEqual({
      ok: false,
      message: TUBE_BLOCKED_MESSAGE
    });
  });
});
