import { describe, expect, it } from "vitest";
import { designFromScene } from "@/domain/design-state";
import { heightMarkers, heightMarkersVisible } from "@/domain/renderer-affordances";
import type { Part } from "@/types";

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
