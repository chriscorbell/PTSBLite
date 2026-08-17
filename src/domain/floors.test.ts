import { describe, expect, it } from "vitest";
import { emptyDesign } from "@/domain/design-state";
import {
  effectiveBuildArea,
  floorAtElevation,
  floorBaseElevation,
  floorSeparatorY
} from "@/domain/floors";

describe("effectiveBuildArea", () => {
  it("is the stored build area for a single-floor design", () => {
    const { metadata } = emptyDesign({ buildArea: { width: 40, depth: 20, height: 30 } });
    expect(effectiveBuildArea(metadata)).toEqual({ width: 40, depth: 20, height: 30 });
  });

  it("doubles the height plus the separator for a two-floor design", () => {
    // The example from the requirement: 30 ft per floor becomes 61 ft in all.
    const { metadata } = emptyDesign({
      buildArea: { width: 40, depth: 20, height: 30 },
      multiFloor: true
    });
    expect(effectiveBuildArea(metadata)).toEqual({ width: 40, depth: 20, height: 61 });
  });

  it("keeps the footprint unchanged either way", () => {
    const { metadata } = emptyDesign({ multiFloor: true });
    const effective = effectiveBuildArea(metadata);
    expect(effective.width).toBe(metadata.buildArea.width);
    expect(effective.depth).toBe(metadata.buildArea.depth);
  });
});

describe("floorSeparatorY", () => {
  it("is null for a single-floor design", () => {
    expect(floorSeparatorY(emptyDesign().metadata)).toBeNull();
  });

  it("sits at the first floor's ceiling for a two-floor design", () => {
    const { metadata } = emptyDesign({
      buildArea: { width: 40, depth: 20, height: 30 },
      multiFloor: true
    });
    expect(floorSeparatorY(metadata)).toBe(30);
  });
});

describe("the two-floor grid", () => {
  it("accepts a part on the second floor that a single floor would reject", () => {
    // Y = 35 is above a 30 ft single floor but well inside the second storey.
    const twoFloor = emptyDesign({
      buildArea: { width: 20, depth: 20, height: 30 },
      multiFloor: true
    });
    expect(twoFloor.grid.withinBounds([0, 35, 0])).toBe(true);

    const oneFloor = emptyDesign({ buildArea: { width: 20, depth: 20, height: 30 } });
    expect(oneFloor.grid.withinBounds([0, 35, 0])).toBe(false);
  });

  it("leaves the separator layer penetrable rather than occupied", () => {
    // The slab is drawn, not placed: a tube must be able to cross Y = 30 to
    // reach the second floor, so no cell in that layer may be taken.
    const design = emptyDesign({
      buildArea: { width: 20, depth: 20, height: 30 },
      multiFloor: true
    });
    expect(design.grid.query([0, 30, 0])).toBeUndefined();
    expect(design.grid.withinBounds([0, 30, 0])).toBe(true);
  });
});

describe("floor elevations", () => {
  const twoFloor = emptyDesign({
    buildArea: { width: 20, depth: 20, height: 30 },
    multiFloor: true
  }).metadata;

  it("places each floor's base at its own floor level", () => {
    expect(floorBaseElevation(twoFloor, 1)).toBe(0);
    // Above the 30 ft first floor and its 1 ft slab.
    expect(floorBaseElevation(twoFloor, 2)).toBe(31);
  });

  it("assigns elevations to floors, counting the slab as floor 1", () => {
    expect(floorAtElevation(twoFloor, 0)).toBe(1);
    expect(floorAtElevation(twoFloor, 29)).toBe(1);
    // The slab layer is the first floor's ceiling.
    expect(floorAtElevation(twoFloor, 30)).toBe(1);
    expect(floorAtElevation(twoFloor, 31)).toBe(2);
    expect(floorAtElevation(twoFloor, 60)).toBe(2);
  });
});
