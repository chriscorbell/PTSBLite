import { describe, expect, it } from "vitest";
import { designFromScene, emptyDesign } from "@/domain/design-state";
import { BUILD_AREA } from "@/domain/sparse-grid";
import {
  cancelObstaclePlacement,
  obstacleHeightLimit,
  obstaclePlacementDraftBounds,
  obstaclePlacementGhost,
  resizeObstaclePlacementHeight,
  placeObstacleVolume,
  prospectiveObstacleDraft,
  restOnObstacles,
  setObstaclePlacementFootprint,
  startObstaclePlacement
} from "@/domain/obstacle-placement";
import { obstacleVolumeCells } from "@/domain/occupant-footprints";
import { expectGridMatchesDesign } from "@/test/design-invariants";
import type { BuildArea, DesignMetadata } from "@/types";

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
    const design = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [1, 0, 1], dir: [1, 0, 0] }],
      obstacles: []
    });

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

  it("grows a footprint upward from the floor it was drawn on", () => {
    const design = emptyDesign();
    const started = startObstaclePlacement(design, [2, 0, 3]);

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const footprint = setObstaclePlacementFootprint(started.draft, [4, 0, 6]);
    // One foot tall until the HUD says otherwise.
    expect(footprint.height).toBe(1);
    const tall = resizeObstaclePlacementHeight(footprint, 5, design.metadata, BUILD_AREA);

    expect(obstaclePlacementGhost(tall, [4, 0, 6])).toEqual({
      type: "obstacle",
      min: [2, 0, 3],
      max: [4, 4, 6]
    });
  });

  it("rejects the first corner when that cell is already occupied", () => {
    const design = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [3, 0, 4], dir: [1, 0, 0] }],
      obstacles: []
    });

    expect(startObstaclePlacement(design, [3, 0, 4])).toMatchObject({
      ok: false,
      message: "Place obstacle on open grid cells."
    });
  });
});

describe("an obstacle sits on the floor of the storey it was drawn on", () => {
  const TWO_FLOOR: Partial<DesignMetadata> = {
    multiFloor: true,
    room: { width: 60, depth: 40, height: 12 }
  };
  // The floor 2 slab sits on top of floor 1, one foot thick.
  const FLOOR_2_BASE = 13;

  it("anchors the first corner to the ground however high the plane is", () => {
    // `[` and `]` move the placement plane, which is what a part is placed on.
    // An obstacle has a height instead: it stands on the floor.
    const started = startObstaclePlacement(emptyDesign(), [2, 7, 3]);

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.draft.cornerA).toEqual([2, 0, 3]);
  });

  it("draws the drag preview flat on that floor rather than up to the pointer", () => {
    const started = startObstaclePlacement(emptyDesign(), [2, 7, 3]);
    if (!started.ok) throw new Error("expected a draft");

    expect(obstaclePlacementGhost(started.draft, [5, 7, 6])).toEqual({
      type: "obstacle",
      min: [2, 0, 3],
      max: [5, 0, 6]
    });
  });

  it("stands on the upper floor when that is the one being worked on", () => {
    const design = emptyDesign(TWO_FLOOR);
    const started = startObstaclePlacement(design, [2, FLOOR_2_BASE + 4, 3]);

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const footprint = setObstaclePlacementFootprint(started.draft, [4, 0, 6]);
    expect(footprint.baseY).toBe(FLOOR_2_BASE);
  });
});

describe("obstacle height stops at what is above it", () => {
  const SHORT: BuildArea = { width: 20, depth: 20, height: 6 };

  /** A draft inside the room, which the default 60 x 40 x 12 metadata covers. */
  function footprintDraft(meta?: Partial<DesignMetadata>, corner: [number, number] = [2, 3]) {
    const design = emptyDesign(meta);
    const started = startObstaclePlacement(design, [corner[0], 0, corner[1]]);
    if (!started.ok) throw new Error("expected a draft");
    return {
      design,
      draft: setObstaclePlacementFootprint(started.draft, [corner[0] + 2, 0, corner[1] + 3])
    };
  }

  it("caps height at the build area rather than a hardcoded limit", () => {
    // The HUD used to offer up to 150 ft regardless of the design, and
    // placeObstacleVolume then refused whatever exceeded the build area.
    const { design, draft } = footprintDraft();
    const tall = resizeObstaclePlacementHeight(draft, 999, design.metadata, SHORT);
    expect(tall.height).toBe(SHORT.height);
  });

  it("keeps height at least one cell", () => {
    const { design, draft } = footprintDraft();
    expect(resizeObstaclePlacementHeight(draft, 0, design.metadata, SHORT).height).toBe(1);
    expect(resizeObstaclePlacementHeight(draft, -5, design.metadata, SHORT).height).toBe(1);
  });

  it("stops at the room's ceiling for an obstacle drawn inside it", () => {
    // A 12 ft room: a shelf in it reaches the ceiling and no further, whatever
    // room the build area has above.
    const { design, draft } = footprintDraft();
    const tall = resizeObstaclePlacementHeight(draft, 999, design.metadata, BUILD_AREA);
    expect(tall.height).toBe(12);
    expect(obstacleHeightLimit(draft, design.metadata, BUILD_AREA)).toBe(12);
  });

  it("stops at the slab for an obstacle on the lower floor of a two-floor room", () => {
    const design = emptyDesign({ multiFloor: true, room: { width: 60, depth: 40, height: 12 } });
    const started = startObstaclePlacement(design, [2, 0, 3]);
    if (!started.ok) throw new Error("expected a draft");
    const draft = setObstaclePlacementFootprint(started.draft, [4, 0, 6]);

    const tall = resizeObstaclePlacementHeight(draft, 999, design.metadata, BUILD_AREA);
    expect(tall.height).toBe(12);
    // Top cell 11, directly under the separator at 12.
    expect(obstaclePlacementDraftBounds(tall).max[1]).toBe(11);
  });

  it("has only the build area to stop it outside the room", () => {
    // The room is 60 x 40 centred on the origin; x = 50 is well outside it, and
    // out there nothing has a ceiling.
    const { design, draft } = footprintDraft(undefined, [50, 50]);
    const tall = resizeObstaclePlacementHeight(draft, 999, design.metadata, BUILD_AREA);
    expect(tall.height).toBe(BUILD_AREA.height);
  });

  it("produces a draft that placeObstacleVolume actually accepts", () => {
    // The point of clamping in the domain: a control cannot offer a value the
    // domain will then reject.
    const { design, draft } = footprintDraft();
    const grown = resizeObstaclePlacementHeight(draft, 999, design.metadata, SHORT);
    const bounds = obstaclePlacementDraftBounds(grown);
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
    const seeded = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [1, 0, 1], dir: [1, 0, 0] }],
      obstacles: []
    });

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
    // The blower keeps its cell; the obstacle claimed nothing.
    if (!penetrable.ok) return;
    expect(penetrable.design.grid.query([1, 0, 1])).toBe("b1");
  });

  it("accepts a first corner on an occupied cell for the penetrable kind only", () => {
    const seeded = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }],
      obstacles: []
    });
    expect(startObstaclePlacement(seeded, [0, 0, 0]).ok).toBe(false);
    expect(startObstaclePlacement(seeded, [0, 0, 0], "penetrable").ok).toBe(true);
  });

  it("offers the draft a first click would start, anchored where that click anchors", () => {
    const design = emptyDesign();
    const draft = prospectiveObstacleDraft(design, [3, 6, 4]);
    const started = startObstaclePlacement(design, [3, 6, 4]);

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(draft).toEqual(started.draft);
  });

  it("has no prospective draft off the grid", () => {
    expect(prospectiveObstacleDraft(emptyDesign(), [900, 0, 0])).toBeNull();
  });

  it("keeps the prospective draft over an occupied cell, where the square still lights", () => {
    // `startObstaclePlacement` refuses this corner for an impenetrable volume,
    // but the highlight square shows there regardless; the preview matching the
    // square is what stops the two affordances contradicting each other.
    const seeded = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }],
      obstacles: []
    });
    expect(prospectiveObstacleDraft(seeded, [0, 0, 0])).toEqual({ cornerA: [0, 0, 0] });
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
