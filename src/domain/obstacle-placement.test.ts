import { describe, expect, it } from "vitest";
import { emptyDesign } from "@/domain/design-state";
import {
  cancelObstaclePlacement,
  moveObstaclePlacementBase,
  obstaclePlacementGhost,
  resizeObstaclePlacementHeight,
  obstacleVolumeCells,
  placeObstacleVolume,
  setObstaclePlacementFootprint,
  startObstaclePlacement
} from "@/domain/obstacle-placement";
import { expectGridMatchesDesign } from "@/test/design-invariants";

describe("obstacle volume placement", () => {
  it("enumerates every one-cell-high grid cell inside two XZ corners", () => {
    expect(obstacleVolumeCells([4, 0, 6], [2, 0, 3])).toEqual([
      [2, 0, 3],
      [2, 0, 4],
      [2, 0, 5],
      [2, 0, 6],
      [3, 0, 3],
      [3, 0, 4],
      [3, 0, 5],
      [3, 0, 6],
      [4, 0, 3],
      [4, 0, 4],
      [4, 0, 5],
      [4, 0, 6]
    ]);
  });

  it("commits the volume and marks every footprint cell as occupied by the obstacle", () => {
    const result = placeObstacleVolume(emptyDesign(), {
      id: "o1",
      cornerA: [0, 0, 0],
      cornerB: [1, 0, 2]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
    expect(result.design.obstacles).toEqual([{ id: "o1", min: [0, 0, 0], max: [1, 0, 2] }]);
    for (const cell of obstacleVolumeCells([0, 0, 0], [1, 0, 2])) {
      expect(result.design.grid.query(cell)).toBe("o1");
    }
  });

  it("rejects a volume when any footprint cell is already occupied", () => {
    const design = emptyDesign();
    design.parts = [{ id: "b1", type: "blower", cell: [1, 0, 1], dir: [1, 0, 0] }];
    design.grid.place([1, 0, 1], "b1");

    const result = placeObstacleVolume(design, {
      id: "o1",
      cornerA: [0, 0, 0],
      cornerB: [2, 0, 2]
    });

    expect(result).toMatchObject({ ok: false, message: "Place obstacle on open grid cells." });
    expect(design.obstacles).toEqual([]);
    expect(design.grid.query([0, 0, 0])).toBeUndefined();
    expect(design.grid.query([1, 0, 1])).toBe("b1");
  });

  it("clears the in-progress first corner when placement is cancelled", () => {
    const started = startObstaclePlacement(emptyDesign(), [3, 0, 4]);

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(obstaclePlacementGhost(started.draft, [5, 0, 6])).toEqual({
      type: "obstacle",
      min: [3, 0, 4],
      max: [5, 0, 6]
    });
    expect(cancelObstaclePlacement(started.draft)).toBeNull();
  });

  it("adjusts an obstacle footprint's base elevation and height before commit", () => {
    const started = startObstaclePlacement(emptyDesign(), [2, 0, 3]);

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const footprint = setObstaclePlacementFootprint(started.draft, [4, 0, 6]);
    const raised = moveObstaclePlacementBase(footprint, 3);
    const tall = resizeObstaclePlacementHeight(raised, 5);

    expect(obstaclePlacementGhost(tall, [4, 0, 6])).toEqual({
      type: "obstacle",
      min: [2, 3, 3],
      max: [4, 7, 6]
    });
  });

  it("rejects the first corner when that cell is already occupied", () => {
    const design = emptyDesign();
    design.parts = [{ id: "b1", type: "blower", cell: [3, 0, 4], dir: [1, 0, 0] }];
    design.grid.place([3, 0, 4], "b1");

    expect(startObstaclePlacement(design, [3, 0, 4])).toMatchObject({
      ok: false,
      message: "Place obstacle on open grid cells."
    });
  });
});
