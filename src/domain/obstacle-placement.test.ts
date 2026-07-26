import { describe, expect, it } from "vitest";
import { emptyDesign } from "@/domain/design-state";
import { DEFAULT_BUILD_AREA, GROUND_PLANE_Y } from "@/domain/sparse-grid";
import {
  cancelObstaclePlacement,
  moveObstaclePlacementBase,
  obstaclePlacementDraftBounds,
  obstaclePlacementGhost,
  resizeObstaclePlacementHeight,
  obstacleVolumeCells,
  placeObstacleVolume,
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
    const raised = moveObstaclePlacementBase(footprint, 3, DEFAULT_BUILD_AREA);
    const tall = resizeObstaclePlacementHeight(raised, 5, DEFAULT_BUILD_AREA);

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
    const started = startObstaclePlacement(emptyDesign({ buildArea: SHORT }), [2, 0, 3]);
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
    const design = emptyDesign({ buildArea: SHORT });
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
