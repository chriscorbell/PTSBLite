import { describe, expect, it } from "vitest";
import { emptyDesign } from "@/domain/design-state";
import {
  DEFAULT_FREE_PLACEMENT_MEMORY,
  freePlacementGhost,
  freePlacementFootprint,
  placeFreePart,
  rememberFreePlacementOrientation,
  resolveFreePlacementOrientation,
  rotateOrientation,
  rotateOrientationVertically
} from "@/domain/free-placement";
import { computeTopology } from "@/domain/topology";
import type { DesignState, Vec3 } from "@/types";
import { expectGridMatchesDesign } from "@/test/design-invariants";

function withObstacle(cell: Vec3): DesignState {
  const design = emptyDesign();
  design.obstacles = [{ id: "o1", min: cell, max: cell }];
  design.grid.place(cell, "o1");
  return design;
}

describe("free placement orientation", () => {
  it("defaults to the last-used orientation per free-placement part type", () => {
    const memory = rememberFreePlacementOrientation(
      DEFAULT_FREE_PLACEMENT_MEMORY,
      "terminal",
      [0, 0, 1]
    );

    expect(
      freePlacementGhost({
        type: "terminal",
        design: emptyDesign(),
        cell: [5, 0, 5],
        memory,
        rotationSteps: 0
      })
    ).toMatchObject({ type: "terminal", axis: [0, 0, 1] });

    expect(
      freePlacementGhost({
        type: "blower",
        design: emptyDesign(),
        cell: [6, 0, 5],
        memory,
        rotationSteps: 0
      })
    ).toMatchObject({ type: "blower", dir: [1, 0, 0] });
  });

  it("auto-snaps to an adjacent open port when that orientation connects cleanly", () => {
    const design = emptyDesign();
    design.parts = [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }];
    design.grid.place([0, 0, 0], "b1");
    const memory = rememberFreePlacementOrientation(
      DEFAULT_FREE_PLACEMENT_MEMORY,
      "terminal",
      [0, 0, 1]
    );

    expect(
      freePlacementGhost({
        type: "terminal",
        design,
        cell: [1, 0, 0],
        memory,
        rotationSteps: 0
      })
    ).toMatchObject({ type: "terminal", axis: [1, 0, 0] });
  });

  it("cycles the visible orientation forward and backward from the current default", () => {
    expect(rotateOrientation([1, 0, 0], 1)).toEqual([0, 0, 1]);
    expect(rotateOrientation([1, 0, 0], -1)).toEqual([0, 0, -1]);
  });

  it("cycles vertical orientation up and down for Shift+R", () => {
    expect(rotateOrientationVertically(1)).toEqual([0, 1, 0]);
    expect(rotateOrientationVertically(2)).toEqual([0, -1, 0]);
    expect(rotateOrientationVertically(3)).toEqual([0, 1, 0]);
  });

  it("uses vertical rotation for free-placement previews without losing horizontal R", () => {
    expect(
      freePlacementGhost({
        type: "blower",
        design: emptyDesign(),
        cell: [5, 0, 5],
        memory: DEFAULT_FREE_PLACEMENT_MEMORY,
        rotationSteps: 0,
        verticalRotationSteps: 1
      })
    ).toMatchObject({ type: "blower", dir: [0, 1, 0] });

    expect(
      freePlacementGhost({
        type: "terminal",
        design: emptyDesign(),
        cell: [6, 0, 5],
        memory: DEFAULT_FREE_PLACEMENT_MEMORY,
        rotationSteps: 0,
        verticalRotationSteps: 2
      })
    ).toMatchObject({ type: "terminal", axis: [0, -1, 0] });

    expect(
      resolveFreePlacementOrientation([0, 1, 0], { horizontalSteps: 1, verticalSteps: 0 })
    ).toEqual([1, 0, 0]);
  });
});

describe("free placement commits", () => {
  it("uses the registry-backed endpoint footprint for occupancy", () => {
    expect(freePlacementFootprint("blower", [3, 0, 4])).toEqual([[3, 0, 4]]);
    expect(freePlacementFootprint("terminal", [4, 0, 4])).toEqual([[4, 0, 4]]);
  });

  it("commits a blower through the grid and leaves its topology port open", () => {
    const result = placeFreePart(emptyDesign(), {
      id: "b1",
      type: "blower",
      cell: [0, 0, 0],
      orientation: [1, 0, 0]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.design.parts).toMatchObject([
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }
    ]);
    expect(result.design.grid.query([0, 0, 0])).toBe("b1");
    expect(computeTopology(result.design).openPortsNear([1, 0, 0])).toHaveLength(1);
  });

  it("commits Terminal 2 using the same free-placement grid rules", () => {
    const design = emptyDesign();
    design.parts = [{ id: "t1", type: "terminal", cell: [0, 0, 0], axis: [1, 0, 0] }];
    design.grid.place([0, 0, 0], "t1");

    const result = placeFreePart(design, {
      id: "t2",
      type: "terminal",
      cell: [8, 0, 0],
      orientation: [0, 0, 1]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.design.parts.at(-1)).toMatchObject({
      id: "t2",
      type: "terminal",
      cell: [8, 0, 0],
      axis: [0, 0, 1]
    });
    expect(result.design.grid.query([8, 0, 0])).toBe("t2");
  });

  it("rejects occupied, out-of-bounds, and obstacle cells with corrective messages", () => {
    const occupied = emptyDesign();
    occupied.parts = [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }];
    occupied.grid.place([0, 0, 0], "b1");

    expect(
      placeFreePart(occupied, {
        id: "b2",
        type: "blower",
        cell: [0, 0, 0],
        orientation: [1, 0, 0]
      })
    ).toMatchObject({ ok: false, message: "That cell is already occupied." });

    expect(
      placeFreePart(emptyDesign(), {
        id: "b3",
        type: "blower",
        cell: [150, 0, 0],
        orientation: [1, 0, 0]
      })
    ).toMatchObject({ ok: false, message: "Place inside the build area." });

    expect(
      placeFreePart(withObstacle([2, 0, 0]), {
        id: "b4",
        type: "blower",
        cell: [2, 0, 0],
        orientation: [1, 0, 0]
      })
    ).toMatchObject({ ok: false, message: "Place on an open grid cell, not an obstacle." });
  });
});
