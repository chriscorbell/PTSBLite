import { describe, expect, it } from "vitest";
import { emptyDesign } from "@/domain/design-state";
import {
  clampRoom,
  floorAtElevation,
  floorBaseElevation,
  floorSeparatorY,
  inRoomFootprint,
  maxRoomHeightFeet,
  plenumBands,
  roomHeightFeet,
  roomRect,
  roomWalls
} from "@/domain/floors";
import { BUILD_AREA } from "@/domain/sparse-grid";

describe("roomHeightFeet", () => {
  it("is the typed height for a single-floor room", () => {
    const { metadata } = emptyDesign({ room: { width: 40, depth: 20, height: 30 } });
    expect(roomHeightFeet(metadata)).toBe(30);
  });

  it("doubles the height plus the separator for a two-floor room", () => {
    // The example from the requirement: 30 ft per floor becomes 61 ft in all.
    const { metadata } = emptyDesign({
      room: { width: 40, depth: 20, height: 30 },
      multiFloor: true
    });
    expect(roomHeightFeet(metadata)).toBe(61);
  });
});

describe("the room in the build area", () => {
  it("centers the room's footprint like the build area's own", () => {
    const { metadata } = emptyDesign({ room: { width: 40, depth: 20, height: 30 } });
    expect(roomRect(metadata)).toEqual({ xMin: -20, xMax: 20, zMin: -10, zMax: 10 });
  });

  it("lands a build-area-sized room exactly on the build area", () => {
    const { metadata } = emptyDesign({ room: { ...BUILD_AREA } });
    expect(roomRect(metadata)).toEqual({ xMin: -150, xMax: 150, zMin: -150, zMax: 150 });
  });

  it("answers whether a cell lies in the footprint at any height", () => {
    const rect = roomRect(emptyDesign({ room: { width: 40, depth: 20, height: 30 } }).metadata);
    expect(inRoomFootprint(rect, [0, 0, 0])).toBe(true);
    expect(inRoomFootprint(rect, [19, 99, 9])).toBe(true);
    expect(inRoomFootprint(rect, [20, 0, 0])).toBe(false);
    expect(inRoomFootprint(rect, [0, 0, -11])).toBe(false);
  });

  it("caps a two-floor room so both floors fit inside the build area", () => {
    expect(maxRoomHeightFeet(false)).toBe(BUILD_AREA.height);
    // Two 49 ft floors plus the 1 ft separator is 99; 50 would need 101.
    expect(maxRoomHeightFeet(true)).toBe(49);
    expect(clampRoom({ width: 40, depth: 20, height: 100 }, true).height).toBe(49);
    expect(clampRoom({ width: 40, depth: 20, height: 100 }, false).height).toBe(100);
  });
});

describe("roomWalls", () => {
  it("rings the footprint with 1 ft walls the room's full height", () => {
    const { metadata } = emptyDesign({ room: { width: 6, depth: 4, height: 10 } });
    // Footprint x -3..2, z -2..1; walls one cell thick inside it, 10 ft tall.
    expect(roomWalls(metadata)).toEqual([
      { min: [-3, 0, -2], max: [2, 9, -2] },
      { min: [-3, 0, 1], max: [2, 9, 1] },
      { min: [-3, 0, -1], max: [-3, 9, 0] },
      { min: [2, 0, -1], max: [2, 9, 0] }
    ]);
  });

  it("raises the walls over both floors of a two-floor room", () => {
    const { metadata } = emptyDesign({
      room: { width: 6, depth: 4, height: 10 },
      multiFloor: true
    });
    for (const wall of roomWalls(metadata)) {
      expect(wall.max[1]).toBe(20); // two 10 ft floors plus the separator, minus one
    }
  });
});

describe("floorSeparatorY", () => {
  it("is null for a single-floor design", () => {
    expect(floorSeparatorY(emptyDesign().metadata)).toBeNull();
  });

  it("sits at the first floor's ceiling for a two-floor design", () => {
    const { metadata } = emptyDesign({
      room: { width: 40, depth: 20, height: 30 },
      multiFloor: true
    });
    expect(floorSeparatorY(metadata)).toBe(30);
  });
});

describe("the grid around the room", () => {
  it("spans the fixed build area, not the room", () => {
    // Placement outside the room is the point of the fixed build area: a part
    // may sit beyond the room's walls, anywhere inside 300 x 300 x 100.
    const design = emptyDesign({ room: { width: 20, depth: 20, height: 30 } });
    expect(design.grid.withinBounds([140, 90, -140])).toBe(true);
    expect(design.grid.withinBounds([150, 0, 0])).toBe(false);
    expect(design.grid.withinBounds([0, 100, 0])).toBe(false);
  });

  it("leaves the separator layer penetrable rather than occupied", () => {
    // The slab is drawn, not placed: a tube must be able to cross Y = 30 to
    // reach the second floor, so no cell in that layer may be taken.
    const design = emptyDesign({
      room: { width: 20, depth: 20, height: 30 },
      multiFloor: true
    });
    expect(design.grid.query([0, 30, 0])).toBeUndefined();
    expect(design.grid.withinBounds([0, 30, 0])).toBe(true);
  });
});

describe("floor elevations", () => {
  const twoFloor = emptyDesign({
    room: { width: 20, depth: 20, height: 30 },
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

describe("plenumBands", () => {
  it("is empty when the design has no plenum", () => {
    expect(plenumBands(emptyDesign().metadata)).toEqual([]);
    expect(plenumBands(emptyDesign({ multiFloor: true }).metadata)).toEqual([]);
  });

  it("occupies the top of a single floor", () => {
    const { metadata } = emptyDesign({
      room: { width: 20, depth: 20, height: 30 },
      plenumHeightFeet: 4
    });
    expect(plenumBands(metadata)).toEqual([{ floor: 1, base: 26, top: 30 }]);
  });

  it("puts floor 1's band directly under the separator slab", () => {
    const { metadata } = emptyDesign({
      room: { width: 20, depth: 20, height: 30 },
      multiFloor: true,
      plenumHeightFeet: 4
    });
    // The slab starts at 30, so floor 1's plenum tops out exactly there; floor
    // 2 (base 31) carries the same band at its own top.
    expect(plenumBands(metadata)).toEqual([
      { floor: 1, base: 26, top: 30 },
      { floor: 2, base: 57, top: 61 }
    ]);
  });

  it("stops a too-tall plenum at the floor it belongs to", () => {
    const { metadata } = emptyDesign({
      room: { width: 20, depth: 20, height: 30 },
      plenumHeightFeet: 99
    });
    expect(plenumBands(metadata)).toEqual([{ floor: 1, base: 0, top: 30 }]);
  });
});
