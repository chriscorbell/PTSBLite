import { describe, expect, it } from "vitest";
import { designFromScene } from "@/domain/design-state";
import { floorShadows, heightMarkers, heightMarkersVisible } from "@/domain/renderer-affordances";
import type { Ghost, Part } from "@/types";

describe("when height markers show", () => {
  it("shows them while a placement tool is armed", () => {
    // The client asked for markers that "auto toggle on when you are elevating
    // something"; arming a tool that places is when elevation starts mattering.
    for (const tool of ["blower", "terminal", "tube", "bend", "obstacle"] as const) {
      expect(heightMarkersVisible(tool)).toBe(true);
    }
  });

  it("hides them for tools that place nothing", () => {
    expect(heightMarkersVisible("cursor")).toBe(false);
    expect(heightMarkersVisible("erase")).toBe(false);
  });
});

describe("heightMarkers", () => {
  const parts: Part[] = [
    { id: "b1", type: "blower", cell: [0, 4, 0], dir: [1, 0, 0] },
    { id: "t1", type: "terminal", cell: [1, 4, 0], axis: [1, 0, 0] },
    { id: "st1", type: "tube", from: [2.5, 6.5, 0.5], to: [8.5, 6.5, 0.5], length: 6 }
  ];

  it("labels each part with the elevation of its own cell", () => {
    const markers = heightMarkers(designFromScene({ parts, obstacles: [] }));
    const byKey = new Map(markers.map((m) => [m.key, m]));
    expect(byKey.get("b1")?.feet).toBe(4);
    expect(byKey.get("t1")?.feet).toBe(4);
    // A tube's endpoints sit at cell centres; the label reports the cell, which
    // is the number the visitor actually chose.
    expect(byKey.get("st1")?.feet).toBe(6);
  });

  it("hangs a part's marker above the part", () => {
    const markers = heightMarkers(designFromScene({ parts, obstacles: [] }));
    const blower = markers.find((m) => m.key === "b1");
    expect(blower?.at[1]).toBeGreaterThan(4);
  });

  it("labels the room's own levels, not just what is placed in it", () => {
    const design = designFromScene(
      { parts: [], obstacles: [] },
      { room: { width: 20, depth: 20, height: 30 }, multiFloor: true, plenumHeightFeet: 4 }
    );
    const markers = heightMarkers(design);
    const keys = markers.map((m) => m.key);
    expect(keys).toContain("plenum-1");
    expect(keys).toContain("plenum-2");
    expect(keys).toContain("separator");
    // Floor 1's drop ceiling is 4 ft below the 30 ft slab.
    expect(markers.find((m) => m.key === "plenum-1")?.feet).toBe(26);
    expect(markers.find((m) => m.key === "separator")?.feet).toBe(30);
  });

  it("omits plenum and separator levels a design does not have", () => {
    const markers = heightMarkers(designFromScene({ parts: [], obstacles: [] }));
    expect(markers).toEqual([]);
  });
});

describe("floorShadows", () => {
  const oneFloor = designFromScene(
    { parts: [], obstacles: [] },
    { room: { width: 20, depth: 20, height: 30 } }
  ).metadata;
  const twoFloor = designFromScene(
    { parts: [], obstacles: [] },
    { room: { width: 20, depth: 20, height: 30 }, multiFloor: true }
  ).metadata;

  it("casts nothing when no part is armed", () => {
    expect(floorShadows(null, oneFloor)).toEqual([]);
  });

  it("shades the cell under a single-cell part, on the ground", () => {
    const ghost: Ghost = { type: "blower", cell: [3, 9, -4], dir: [1, 0, 0] };
    expect(floorShadows(ghost, oneFloor)).toEqual([{ y: 0, cells: [[3, 0, -4]] }]);
  });

  it("shades every column a multi-cell part occupies", () => {
    // A 3 ft tube at elevation lays three squares on the floor below it, which
    // is what says where it runs rather than merely where it starts.
    const ghost: Ghost = { type: "tube", from: [0.5, 5.5, 0.5], to: [3.5, 5.5, 0.5] };
    const [ground] = floorShadows(ghost, oneFloor);
    expect(ground.y).toBe(0);
    expect(ground.cells).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0]
    ]);
  });

  it("collapses a vertical run to the single column it stands in", () => {
    // A shadow is a footprint: stacked cells share one square, not three.
    const ghost: Ghost = { type: "tube", from: [0.5, 0.5, 0.5], to: [0.5, 3.5, 0.5] };
    expect(floorShadows(ghost, oneFloor)[0].cells).toEqual([[0, 0, 0]]);
  });

  it("adds the upper storey once the part has reached it", () => {
    // Floor 2 starts at 31 in a 30 ft room. Below that only the ground is lit;
    // at or above it, both floors are — the room says where in the room, the
    // ground says where in the building.
    const below: Ghost = { type: "blower", cell: [2, 30, 2], dir: [1, 0, 0] };
    expect(floorShadows(below, twoFloor).map((s) => s.y)).toEqual([0]);

    const atFloor: Ghost = { type: "blower", cell: [2, 31, 2], dir: [1, 0, 0] };
    expect(floorShadows(atFloor, twoFloor).map((s) => s.y)).toEqual([0, 31]);

    const above: Ghost = { type: "blower", cell: [2, 40, 2], dir: [1, 0, 0] };
    expect(floorShadows(above, twoFloor).map((s) => s.y)).toEqual([0, 31]);
  });

  it("never lights an upper storey a single-floor design does not have", () => {
    const high: Ghost = { type: "blower", cell: [2, 40, 2], dir: [1, 0, 0] };
    expect(floorShadows(high, oneFloor).map((s) => s.y)).toEqual([0]);
  });
});
