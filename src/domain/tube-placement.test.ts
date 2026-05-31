import { describe, expect, it } from "vitest";
import { bendFootprint } from "@/domain/bend-placement";
import { emptyDesign } from "@/domain/design-state";
import { computeTopology } from "@/domain/topology";
import {
  TUBE_PLACEMENT_MESSAGE,
  placeTube,
  tubeLandingCells,
  tubePlacementGhost
} from "@/domain/tube-placement";
import type { BendPart } from "@/types";

describe("Straight tube snap placement", () => {
  it("computes landing cells adjacent to every open port", () => {
    const design = emptyDesign();
    design.parts = [
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "t2", type: "terminal", cell: [10, 0, 0], axis: [1, 0, 0] }
    ];
    design.grid.place([0, 0, 0], "b1");
    design.grid.place([10, 0, 0], "t2");

    expect(tubeLandingCells(design)).toEqual([
      [1, 0, 0],
      [11, 0, 0],
      [9, 0, 0]
    ]);
  });

  it("snaps the ghost to the open port direction for a highlighted landing cell", () => {
    const design = emptyDesign();
    design.parts = [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }];
    design.grid.place([0, 0, 0], "b1");

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
    const design = emptyDesign();
    design.parts = [bend];
    for (const cell of bendFootprint(bend)) {
      design.grid.place(cell, bend.id);
    }

    expect(tubePlacementGhost(design, [4, 0, 4], { sourcePartId: "bn1" })).toEqual({
      type: "tube",
      from: [4.5, 0.5, 4.5],
      to: [4.5, 0.5, 10.5]
    });
  });

  it("commits a 6-cell tube and registers the near connected port plus far open port", () => {
    const design = emptyDesign();
    design.parts = [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }];
    design.grid.place([0, 0, 0], "b1");

    const result = placeTube(design, { id: "st1", cell: [1, 0, 0] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
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
    const design = emptyDesign();
    design.parts = [{ id: "b1", type: "blower", cell: [0, 3, 0], dir: [0, -1, 0] }];
    design.grid.place([0, 3, 0], "b1");

    expect(tubePlacementGhost(design, [0, 2, 0])).toEqual({
      type: "tube",
      from: [0.5, 2.5, 0.5],
      to: [0.5, -0.5, 0.5]
    });

    const result = placeTube(design, { id: "st1", cell: [0, 2, 0] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
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
    const design = emptyDesign();
    design.parts = [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }];
    design.grid.place([0, 0, 0], "b1");

    expect(tubePlacementGhost(design, [3, 0, 0])).toBeNull();
    expect(placeTube(design, { id: "st1", cell: [3, 0, 0] })).toEqual({
      ok: false,
      message: TUBE_PLACEMENT_MESSAGE
    });
  });

  it("uses the clicked source part to resolve a multi-candidate landing cell", () => {
    const design = emptyDesign();
    design.parts = [
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "b2", type: "blower", cell: [1, 0, 1], dir: [0, 0, -1] }
    ];
    design.grid.place([0, 0, 0], "b1");
    design.grid.place([1, 0, 1], "b2");

    expect(tubePlacementGhost(design, [1, 0, 0])).toBeNull();
    expect(tubePlacementGhost(design, [1, 0, 0], { sourcePartId: "b2" })).toEqual({
      type: "tube",
      from: [1.5, 0.5, 0.5],
      to: [1.5, 0.5, -5.5]
    });

    const result = placeTube(design, { id: "st1", cell: [1, 0, 1], sourcePartId: "b2" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.part).toMatchObject({
      from: [1.5, 0.5, 0.5],
      to: [1.5, 0.5, -5.5]
    });
  });
});
