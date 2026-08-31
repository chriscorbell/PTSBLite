import { describe, expect, it } from "vitest";
import { designFromScene, emptyDesign } from "@/domain/design-state";
import {
  DEFAULT_FREE_PLACEMENT_MEMORY,
  freePlacementGhost,
  freePlacementFootprint,
  placeFreePart,
  rememberFreePlacementOrientation,
  resolveFreePlacementOrientation,
  rotateOrientation,
  UP
} from "@/domain/free-placement";
import { computeTopology } from "@/domain/topology";
import type { DesignState, Vec3 } from "@/types";
import { expectGridMatchesDesign } from "@/test/design-invariants";

function withObstacle(cell: Vec3): DesignState {
  return designFromScene({
    parts: [],
    obstacles: [{ id: "o1", min: cell, max: cell }]
  });
}

describe("free placement orientation", () => {
  it("faces a blower and a terminal up before anyone rotates them", () => {
    // A tube system is mostly risers, so up is the useful first guess. This is
    // a placement default, not a spec fact — nothing in ADR-0001 constrains
    // which way a port may face.
    for (const type of ["blower", "terminal"] as const) {
      const ghost = freePlacementGhost({
        type,
        design: emptyDesign(),
        cell: [5, 0, 5],
        memory: DEFAULT_FREE_PLACEMENT_MEMORY,
        rotationSteps: 0
      });
      const facing =
        ghost?.type === "blower" ? ghost.dir : ghost?.type === "terminal" ? ghost.axis : null;
      expect(facing).toEqual([0, 1, 0]);
    }
  });

  it("rotates out of vertical onto the horizontal headings", () => {
    // R from a vertical base lands on +X and then cycles the four compass
    // directions, so the default costs no reachable orientation.
    const facings = [1, 2, 3, 4].map((rotationSteps) => {
      const ghost = freePlacementGhost({
        type: "blower",
        design: emptyDesign(),
        cell: [5, 0, 5],
        memory: DEFAULT_FREE_PLACEMENT_MEMORY,
        rotationSteps
      });
      return ghost?.type === "blower" ? ghost.dir : null;
    });
    expect(facings).toEqual([
      [1, 0, 0],
      [0, 0, 1],
      [-1, 0, 0],
      [0, 0, -1]
    ]);
  });

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
      // Untouched, so still the default: memory is per type, not shared.
    ).toMatchObject({ type: "blower", dir: [0, 1, 0] });
  });

  it("auto-snaps to an adjacent open port when that orientation connects cleanly", () => {
    const design = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }],
      obstacles: []
    });
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
    // Backwards off the first heading lands on up, which is the ring's start.
    expect(rotateOrientation([1, 0, 0], -1)).toEqual([0, 1, 0]);
  });

  it("cycles R through up and the four headings, and back to up", () => {
    // The client's rule: five positions, hole up plus each side, never down.
    // Turning a blower sideways used to strand it there — R only cycled the
    // four horizontal headings and nothing brought it back up.
    const seen = [0, 1, 2, 3, 4, 5].map((steps) =>
      freePlacementGhost({
        type: "blower",
        design: emptyDesign(),
        cell: [5, 0, 5],
        memory: DEFAULT_FREE_PLACEMENT_MEMORY,
        rotationSteps: steps
      })
    );
    expect(seen.map((ghost) => (ghost?.type === "blower" ? ghost.dir : null))).toEqual([
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 1],
      [-1, 0, 0],
      [0, 0, -1],
      [0, 1, 0]
    ]);
  });

  it("never faces a part down", () => {
    const down: Vec3 = [0, -1, 0];
    for (let steps = -5; steps <= 5; steps++) {
      expect(resolveFreePlacementOrientation([0, 1, 0], steps)).not.toEqual(down);
    }
  });

  it("turns the other way on shift-R", () => {
    expect(resolveFreePlacementOrientation([0, 1, 0], -1)).toEqual([0, 0, -1]);
    expect(resolveFreePlacementOrientation([0, 1, 0], 1)).toEqual([1, 0, 0]);
  });

  it("brings an orientation the ring does not hold into it on the first press", () => {
    // A part snapped to a downward-facing port starts outside the ring; a
    // rotate key must still visibly do something.
    expect(rotateOrientation([0, -1, 0], 1)).toEqual([0, 1, 0]);
    expect(rotateOrientation([0, -1, 0], 0)).toEqual([0, -1, 0]);
  });
});

describe("free placement commits", () => {
  it("uses the registry-backed endpoint footprint for occupancy", () => {
    const { metadata } = emptyDesign();
    expect(freePlacementFootprint("blower", [3, 0, 4], metadata)).toEqual([[3, 0, 4]]);
    // A terminal is 2 ft tall, and the catalog says so: both feet are claimed.
    expect(freePlacementFootprint("terminal", [4, 0, 4], metadata)).toEqual([
      [4, 0, 4],
      [4, 1, 4]
    ]);
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
    const design = designFromScene({
      parts: [{ id: "t1", type: "terminal", cell: [0, 0, 0], axis: [1, 0, 0] }],
      obstacles: []
    });

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
    const occupied = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }],
      obstacles: []
    });

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

  it("refuses a terminal with no headroom, and says so rather than blaming the cell", () => {
    // A terminal is 2 ft tall, so the cell above the cursor has to be free.
    // "That cell is already occupied" would point at the wrong square: the one
    // under the cursor is empty, and the blocked one is above it.
    const lowCeiling = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [4, 1, 4], dir: [1, 0, 0] }],
      obstacles: []
    });
    const attempt = {
      id: "t1",
      type: "terminal",
      cell: [4, 0, 4],
      orientation: [0, 1, 0]
    } as const;

    expect(placeFreePart(lowCeiling, attempt)).toMatchObject({
      ok: false,
      message: "A terminal stands 2ft tall — there is no room above that cell."
    });
    // Nothing previews either, so the refusal is visible before the click.
    expect(
      freePlacementGhost({
        type: "terminal",
        design: lowCeiling,
        cell: [4, 0, 4],
        memory: DEFAULT_FREE_PLACEMENT_MEMORY,
        rotationSteps: 0
      })
    ).toBeNull();

    // A blower is 1 ft tall and is not troubled by any of this.
    expect(
      placeFreePart(lowCeiling, { id: "b2", type: "blower", cell: [4, 0, 4], orientation: UP })
    ).toMatchObject({ ok: true });
  });
});
