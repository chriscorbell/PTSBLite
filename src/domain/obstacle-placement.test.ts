import { describe, expect, it } from "vitest";
import { emptyDesign } from "@/domain/design-state";
import { BUILD_AREA, GROUND_PLANE_Y } from "@/domain/sparse-grid";
import {
  cancelObstaclePlacement,
  moveObstaclePlacementBase,
  obstaclePlacementDraftBounds,
  obstaclePlacementGhost,
  resizeObstaclePlacementHeight,
  obstacleVolumeCells,
  placeObstacleVolume,
  restOnObstacles,
  setObstaclePlacementFootprint,
  startObstaclePlacement
} from "@/domain/obstacle-placement";
import { expectGridMatchesDesign } from "@/test/design-invariants";
import type { BuildArea } from "@/types";

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
    const raised = moveObstaclePlacementBase(footprint, 3, BUILD_AREA);
    const tall = resizeObstaclePlacementHeight(raised, 5, BUILD_AREA);

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

describe("obstacle draft bounds follow the design's build area", () => {
  const SHORT: BuildArea = { width: 20, depth: 20, height: 6 };

  function footprintDraft() {
    const started = startObstaclePlacement(emptyDesign(), [2, 0, 3]);
    if (!started.ok) throw new Error("expected a draft");
    return setObstaclePlacementFootprint(started.draft, [4, 0, 6]);
  }

  it("caps height at the ceiling rather than a hardcoded limit", () => {
    // The HUD used to offer up to 150 ft regardless of the design, and
    // placeObstacleVolume then refused whatever exceeded the build area.
    const tall = resizeObstaclePlacementHeight(footprintDraft(), 999, SHORT);
    expect(tall.height).toBe(SHORT.height);
  });

  it("keeps height at least one cell", () => {
    expect(resizeObstaclePlacementHeight(footprintDraft(), 0, SHORT).height).toBe(1);
    expect(resizeObstaclePlacementHeight(footprintDraft(), -5, SHORT).height).toBe(1);
  });

  it("caps the base so the whole volume stays inside the ceiling", () => {
    const tall = resizeObstaclePlacementHeight(footprintDraft(), 4, SHORT);
    const raised = moveObstaclePlacementBase(tall, 99, SHORT);
    const height = tall.height ?? 0;
    const baseY = raised.baseY ?? 0;
    expect(baseY).toBe(SHORT.height - height);
    expect(baseY + height).toBeLessThanOrEqual(SHORT.height);
  });

  it("never lets the base go below the ground plane", () => {
    expect(moveObstaclePlacementBase(footprintDraft(), -10, SHORT).baseY).toBe(GROUND_PLANE_Y);
  });

  it("produces a draft that placeObstacleVolume actually accepts", () => {
    // The point of clamping in the domain: a control cannot offer a value the
    // domain will then reject.
    const design = emptyDesign();
    const started = startObstaclePlacement(design, [2, 0, 3]);
    if (!started.ok) throw new Error("expected a draft");
    const draft = resizeObstaclePlacementHeight(
      moveObstaclePlacementBase(setObstaclePlacementFootprint(started.draft, [4, 0, 6]), 99, SHORT),
      999,
      SHORT
    );
    const bounds = obstaclePlacementDraftBounds(draft);
    const result = placeObstacleVolume(design, {
      id: "o1",
      cornerA: bounds.min,
      cornerB: bounds.max
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
  });
});

describe("penetrable obstacles", () => {
  it("claims no grid cells, so parts can be placed inside it", () => {
    const result = placeObstacleVolume(emptyDesign(), {
      id: "o1",
      cornerA: [0, 0, 0],
      cornerB: [2, 0, 2],
      kind: "penetrable"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.obstacles[0]).toMatchObject({ id: "o1", penetrable: true });
    expect(result.design.grid.query([1, 0, 1])).toBeUndefined();
    expectGridMatchesDesign(result.design);
  });

  it("may be drawn over occupied cells, which the impenetrable kind refuses", () => {
    const seeded = emptyDesign();
    seeded.grid.place([1, 0, 1], "blocker");

    const solid = placeObstacleVolume(seeded, {
      id: "o1",
      cornerA: [0, 0, 0],
      cornerB: [2, 0, 2]
    });
    expect(solid.ok).toBe(false);

    const penetrable = placeObstacleVolume(seeded, {
      id: "o1",
      cornerA: [0, 0, 0],
      cornerB: [2, 0, 2],
      kind: "penetrable"
    });
    expect(penetrable.ok).toBe(true);
    // The blocker keeps its cell; the obstacle claimed nothing.
    if (!penetrable.ok) return;
    expect(penetrable.design.grid.query([1, 0, 1])).toBe("blocker");
  });

  it("accepts a first corner on an occupied cell for the penetrable kind only", () => {
    const seeded = emptyDesign();
    seeded.grid.place([0, 0, 0], "blocker");
    expect(startObstaclePlacement(seeded, [0, 0, 0]).ok).toBe(false);
    expect(startObstaclePlacement(seeded, [0, 0, 0], "penetrable").ok).toBe(true);
  });

  it("marks the ghost so the preview can render the kind being drawn", () => {
    const draft = { cornerA: [0, 0, 0] as [number, number, number] };
    expect(obstaclePlacementGhost(draft, [2, 0, 2], "penetrable")).toMatchObject({
      penetrable: true
    });
    const solidGhost = obstaclePlacementGhost(draft, [2, 0, 2]);
    expect(solidGhost && "penetrable" in solidGhost).toBe(false);
  });
});

describe("resting on an obstacle", () => {
  /** A solid block from `baseY` up, three cells square around the origin. */
  function withShelf(baseY: number, height: number, penetrable = false) {
    const design = emptyDesign();
    const placed = placeObstacleVolume(design, {
      id: "o1",
      cornerA: [-1, baseY, -1],
      cornerB: [1, baseY + height - 1, 1],
      kind: penetrable ? "penetrable" : "impenetrable"
    });
    if (!placed.ok) throw new Error(placed.message);
    return placed.design;
  }

  it("steps a part up onto the obstacle it was aimed at", () => {
    // The client built a shelf out of an impenetrable volume and expected to
    // stand a blower on it; refusing the click answered nothing.
    const design = withShelf(0, 4);
    expect(restOnObstacles(design, [0, 0, 0], BUILD_AREA)).toEqual([0, 4, 0]);
  });

  it("leaves a clear cell alone", () => {
    const design = withShelf(0, 4);
    expect(restOnObstacles(design, [5, 0, 5], BUILD_AREA)).toEqual([5, 0, 5]);
    // Above the shelf is already clear; nothing to climb.
    expect(restOnObstacles(design, [0, 9, 0], BUILD_AREA)).toEqual([0, 9, 0]);
  });

  it("ignores penetrable volumes, which claim no cells", () => {
    const design = withShelf(0, 4, true);
    expect(restOnObstacles(design, [0, 0, 0], BUILD_AREA)).toEqual([0, 0, 0]);
  });

  it("climbs a stack rather than only its first volume", () => {
    let design = withShelf(0, 4);
    const second = placeObstacleVolume(design, {
      id: "o2",
      cornerA: [-1, 4, -1],
      cornerB: [1, 6, 1],
      kind: "impenetrable"
    });
    if (!second.ok) throw new Error(second.message);
    design = second.design;
    expect(restOnObstacles(design, [0, 0, 0], BUILD_AREA)).toEqual([0, 7, 0]);
  });

  it("refuses rather than lifting a part out of the build area", () => {
    // A volume reaching the ceiling has no top to stand on. The unchanged cell
    // goes on to be rejected the way it always was.
    const area: BuildArea = { width: 20, depth: 20, height: 8 };
    const design = withShelf(0, 8);
    expect(restOnObstacles(design, [0, 0, 0], area)).toEqual([0, 0, 0]);
  });
});
