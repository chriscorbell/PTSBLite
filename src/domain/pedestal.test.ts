import { describe, expect, it } from "vitest";
import { partCells } from "@/domain/design-reconstruction";
import { emptyDesign } from "@/domain/design-state";
import { eraseAtCell } from "@/domain/erase-placement";
import { FREE_PLACEMENT_MESSAGES, placeFreePart } from "@/domain/free-placement";
import { FLOOR_SEPARATOR_FEET } from "@/domain/floors";
import { bomRows, totalPathLength } from "@/domain/parts";
import { hasPedestal, pedestalCells, pedestalHeightAt, pedestalSpan } from "@/domain/pedestal";
import { checkObstacleIntersections, MAX_CENTERLINE_FEET } from "@/domain/validation";
import { expectGridMatchesDesign } from "@/test/design-invariants";
import type { DesignState, Vec3 } from "@/types";

function placePedestalBlower(design: DesignState, cell: Vec3) {
  return placeFreePart(design, {
    id: "b1",
    type: "blowerPedestal",
    cell,
    orientation: [0, 1, 0]
  });
}

describe("pedestal geometry", () => {
  it("measures the mast from the floor of the storey the blower stands on", () => {
    const single = emptyDesign({ room: { width: 60, depth: 40, height: 12 } });
    expect(pedestalHeightAt(single.metadata, [0, 0, 0])).toBe(0);
    expect(pedestalHeightAt(single.metadata, [0, 2, 0])).toBe(2);

    // On floor 2 the mast stands on the slab, not on the ground 13 ft below.
    const two = emptyDesign({
      room: { width: 60, depth: 40, height: 12 },
      multiFloor: true
    });
    const floor2 = 12 + FLOOR_SEPARATOR_FEET;
    expect(pedestalHeightAt(two.metadata, [0, floor2, 0])).toBe(0);
    expect(pedestalHeightAt(two.metadata, [0, floor2 + 3, 0])).toBe(3);
  });

  it("claims the column between the blower and the floor, and nothing else", () => {
    expect(pedestalCells([4, 3, 5], 3)).toEqual([
      [4, 2, 5],
      [4, 1, 5],
      [4, 0, 5]
    ]);
    expect(pedestalCells([4, 0, 5], 0)).toEqual([]);
  });

  it("draws nothing when the blower sits on the floor", () => {
    expect(pedestalSpan([4, 0, 5], 0)).toBeNull();
    expect(pedestalSpan([4, 2, 5], 2)).toEqual({ from: [4.5, 0.5, 5.5], to: [4.5, 2.5, 5.5] });
  });

  it("reads a zero-foot mast as a pedestal blower, not a plain one", () => {
    // Presence marks the variant; a falsy check would demote a pedestal blower
    // standing on the floor back to an ordinary one.
    expect(hasPedestal({ id: "b", type: "blower", cell: [0, 0, 0], dir: [0, 1, 0] })).toBe(false);
    expect(
      hasPedestal({ id: "b", type: "blower", cell: [0, 0, 0], dir: [0, 1, 0], pedestalFeet: 0 })
    ).toBe(true);
  });
});

describe("placing a blower with a pedestal", () => {
  it("registers the mast on the grid with the blower", () => {
    const placed = placePedestalBlower(emptyDesign(), [0, 3, 0]);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    expect(partCells(placed.part)).toEqual([
      [0, 3, 0],
      [0, 2, 0],
      [0, 1, 0],
      [0, 0, 0]
    ]);
    expectGridMatchesDesign(placed.design);
    for (const y of [0, 1, 2, 3]) {
      expect(placed.design.grid.query([0, y, 0])).toBe("b1");
    }
  });

  it("refuses to place where the mast cannot reach the floor", () => {
    const design = emptyDesign();
    const under = placeFreePart(design, {
      id: "t1",
      type: "terminal",
      cell: [0, 1, 0],
      orientation: [1, 0, 0]
    });
    expect(under.ok).toBe(true);
    if (!under.ok) return;

    const blocked = placePedestalBlower(under.design, [0, 3, 0]);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    // Not "that cell is already occupied": the cell under the cursor is free,
    // and pointing at it would send the visitor looking in the wrong place.
    expect(blocked.message).toBe(FREE_PLACEMENT_MESSAGES.pedestalBlocked);
  });

  it("places on the floor with no mast at all", () => {
    const placed = placePedestalBlower(emptyDesign(), [0, 0, 0]);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(partCells(placed.part)).toEqual([[0, 0, 0]]);
    expectGridMatchesDesign(placed.design);
  });

  it("gives the mast's cells back when the blower is erased", () => {
    const placed = placePedestalBlower(emptyDesign(), [0, 3, 0]);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    // Clicking the mast erases the blower it holds up.
    const erased = eraseAtCell(placed.design, [0, 1, 0]);
    expect(erased.ok).toBe(true);
    expect(erased.design.parts).toEqual([]);
    expectGridMatchesDesign(erased.design);
    for (const y of [0, 1, 2, 3]) {
      expect(erased.design.grid.query([0, y, 0])).toBeUndefined();
    }
  });
});

describe("the mast is drawn but not counted", () => {
  it("adds nothing to the centerline", () => {
    const placed = placePedestalBlower(emptyDesign(), [0, 20, 0]);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    // 20 ft of mast would be a twelfth of the whole cap if it counted.
    expect(totalPathLength(placed.design)).toBe(0);
    expect(MAX_CENTERLINE_FEET).toBe(300);
  });

  it("adds no tube footage or stock to the BOM, and counts as its own part", () => {
    const placed = placePedestalBlower(emptyDesign(), [0, 20, 0]);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    const rows = bomRows(placed.design);
    const row = (key: string) => rows.find((r) => r.key === key);
    expect(row("blowerPedestal")?.qty).toBe(1);
    // The plain blower is a different catalog item and stays at zero.
    expect(row("blower")?.qty).toBe(0);
    expect(row("tube6")?.qty).toBe(0);
    expect(row("tube6")?.note).toBe("0.0ft total");
  });

  it("carries no price, like every other row", () => {
    const placed = placePedestalBlower(emptyDesign(), [0, 4, 0]);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    for (const row of bomRows(placed.design)) {
      expect(row).not.toHaveProperty("unitPrice");
      expect(JSON.stringify(row)).not.toMatch(/\$|price/i);
    }
  });
});

describe("the mast is solid", () => {
  it("is reported when it passes through an obstacle", () => {
    const design = emptyDesign();
    design.obstacles = [{ id: "o1", min: [0, 1, 0], max: [0, 1, 0] }];
    // The obstacle is placed after the blower, which is a state the model
    // allows and validation exists to report (ADR-0007).
    const placed = placePedestalBlower(design, [0, 3, 0]);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    const warnings = checkObstacleIntersections(placed.design);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].id).toBe("obstacle-intersection");
  });
});
