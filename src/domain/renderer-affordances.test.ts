import { describe, expect, it } from "vitest";
import { designFromScene } from "@/domain/design-state";
import {
  floorShadows,
  ghostElevation,
  heightMarkers,
  heightMarkersAutomatic,
  heightMarkersVisible,
  placedPartShadows
} from "@/domain/renderer-affordances";
import type { Ghost, Part } from "@/types";

describe("when height markers show", () => {
  it("shows them while a placement tool is armed", () => {
    // The client asked for markers that "auto toggle on when you are elevating
    // something"; arming a tool that places is when elevation starts mattering.
    for (const tool of ["blower", "terminal", "tube", "bend", "obstacle"] as const) {
      expect(heightMarkersVisible({ tool })).toBe(true);
    }
  });

  it("hides them for tools that place nothing", () => {
    expect(heightMarkersVisible({ tool: "cursor" })).toBe(false);
    expect(heightMarkersVisible({ tool: "erase" })).toBe(false);
  });

  it("keeps them once Auto-Build has placed a run", () => {
    // The client: "When auto-build is used, height markers disappear. Make them
    // stay." Auto-Build disarms the tool as it finishes, so following the tool
    // alone put the markers out over a screenful of new parts.
    expect(heightMarkersVisible({ tool: "cursor", autoBuilt: true })).toBe(true);
    expect(heightMarkersVisible({ tool: "erase", autoBuilt: true })).toBe(true);
  });

  it("shows them for any tool once the View menu turns them on", () => {
    // The client asked for the automatic behaviour *and* a manual override.
    expect(heightMarkersVisible({ tool: "cursor" }, true)).toBe(true);
    expect(heightMarkersVisible({ tool: "erase" }, true)).toBe(true);
  });

  it("hides them for a placement tool once the View menu turns them off", () => {
    expect(heightMarkersVisible({ tool: "blower" }, false)).toBe(false);
  });

  it("lets the View menu turn off an Auto-Build run's markers too", () => {
    // Auto-Build does not turn them off on the visitor's behalf, and does not
    // turn them back on over an answer he gave: the tick is his either way.
    expect(heightMarkersVisible({ tool: "cursor", autoBuilt: true }, false)).toBe(false);
  });

  it("follows the tool again once the override is spent", () => {
    expect(heightMarkersVisible({ tool: "blower" }, null)).toBe(true);
    expect(heightMarkersVisible({ tool: "cursor" }, null)).toBe(false);
  });

  it("says what the app would decide on its own, so callers can spot a toggle", () => {
    // The override lasts until this value changes: arming or disarming a
    // placement tool is the automatic toggle that takes control back. Finishing
    // an Auto-Build is not one — the value it decides is true either side of it.
    expect(heightMarkersAutomatic({ tool: "blower" })).toBe(true);
    expect(heightMarkersAutomatic({ tool: "tube" })).toBe(true);
    expect(heightMarkersAutomatic({ tool: "cursor" })).toBe(false);
    expect(heightMarkersAutomatic({ tool: "erase" })).toBe(false);
    expect(heightMarkersAutomatic({ tool: "tube", autoBuilt: true })).toBe(true);
    expect(heightMarkersAutomatic({ tool: "cursor", autoBuilt: true })).toBe(true);
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

  it("hangs it clear of the cell it labels, not merely overhanging it", () => {
    // The client asked for markers "smaller and more offset" so they stop
    // covering parts. A blower fills the cell from 0 to 1 in X and Z, so an
    // anchor inside that span sits over the part however small the label is.
    const marker = heightMarkers(designFromScene({ parts, obstacles: [] })).find(
      (m) => m.key === "b1"
    );
    expect(marker?.at[0]).toBeGreaterThan(1);
    expect(marker?.at[2]).toBeGreaterThan(1);
  });

  it("labels the room's own levels, not just what is placed in it", () => {
    const design = designFromScene(
      { parts: [], obstacles: [] },
      { room: { width: 20, depth: 20, height: 30 }, multiFloor: true, plenumHeightFeet: 4 }
    );
    const markers = heightMarkers(design);
    const byKey = new Map(markers.map((m) => [m.key, m]));
    // Floor 1's drop ceiling is 4 ft below the 30 ft slab; the room's own top
    // is both floors plus the 1 ft slab between them.
    expect(byKey.get("plenum-1")?.feet).toBe(26);
    expect(byKey.get("plenum-2")?.feet).toBe(57);
    expect(byKey.get("separator")?.feet).toBe(30);
    expect(byKey.get("ceiling")?.feet).toBe(61);
  });

  it("names the structural levels, so stacked numbers are not a guess", () => {
    const design = designFromScene(
      { parts: [], obstacles: [] },
      { room: { width: 20, depth: 20, height: 30 }, multiFloor: true, plenumHeightFeet: 4 }
    );
    const byKey = new Map(heightMarkers(design).map((m) => [m.key, m.label]));
    expect(byKey.get("plenum-1")).toBe("Drop ceiling");
    expect(byKey.get("separator")).toBe("Floor 1 ceiling");
    expect(byKey.get("ceiling")).toBe("Floor 2 ceiling");
  });

  it("marks the ceiling even when there is no plenum or second floor", () => {
    // Every room has a top, and the client asked for the ceiling by name.
    const markers = heightMarkers(
      designFromScene({ parts: [], obstacles: [] }, { room: { width: 20, depth: 20, height: 12 } })
    );
    expect(markers).toEqual([{ key: "ceiling", at: [10, 12, 10], feet: 12, label: "Ceiling" }]);
  });

  it("labels a riser at its top, where the marker hangs", () => {
    // A vertical tube used to float its marker at mid-height while reporting
    // the elevation of its foot: two different numbers in one label. How far
    // up the riser reaches is the number worth having.
    const riser: Part[] = [
      { id: "r1", type: "tube", from: [0.5, 0.5, 0.5], to: [0.5, 6.5, 0.5], length: 6 }
    ];
    const marker = heightMarkers(designFromScene({ parts: riser, obstacles: [] }))[0];
    expect(marker.feet).toBe(6);
    expect(marker.at[1]).toBeGreaterThan(6);
  });

  it("still labels a horizontal run at the level it runs on", () => {
    const flat: Part[] = [
      { id: "f1", type: "tube", from: [2.5, 6.5, 0.5], to: [8.5, 6.5, 0.5], length: 6 }
    ];
    expect(heightMarkers(designFromScene({ parts: flat, obstacles: [] }))[0].feet).toBe(6);
  });

  it("measures an obstacle by the surface you could stand something on", () => {
    // A 5 ft volume standing on the floor occupies cells 0..4; its top is 5 ft
    // up, which is also what a blower resting on it reports.
    const design = designFromScene({
      parts: [],
      obstacles: [{ id: "o1", min: [0, 0, 0], max: [2, 4, 2] }]
    });
    const marker = heightMarkers(design).find((m) => m.key === "o1");
    expect(marker?.feet).toBe(5);
  });

  it("leaves a part's marker unlabelled", () => {
    const markers = heightMarkers(designFromScene({ parts, obstacles: [] }));
    expect(markers.find((m) => m.key === "b1")?.label).toBeUndefined();
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
    expect(floorShadows(ghost, oneFloor)).toEqual([{ y: 0, live: true, cells: [[3, 0, -4]] }]);
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

describe("placedPartShadows", () => {
  const oneFloor = { room: { width: 20, depth: 20, height: 30 }, multiFloor: false };
  const twoFloor = { room: { width: 20, depth: 20, height: 30 }, multiFloor: true };

  it("shades the floor under a part that is above it", () => {
    const parts: Part[] = [{ id: "b1", type: "blower", cell: [3, 9, -4], dir: [1, 0, 0] }];
    expect(placedPartShadows(designFromScene({ parts, obstacles: [] }, oneFloor))).toEqual([
      { y: 0, live: false, cells: [[3, 0, -4]] }
    ]);
  });

  it("shades nothing for a part sitting on the floor", () => {
    // "if it's not on the ground obviously" -- a part on the floor is already
    // where its shadow would be.
    const parts: Part[] = [{ id: "b1", type: "blower", cell: [3, 0, -4], dir: [1, 0, 0] }];
    expect(placedPartShadows(designFromScene({ parts, obstacles: [] }, oneFloor))).toEqual([]);
  });

  it("merges the columns of every part on one plane", () => {
    // Two parts sharing a column produce one square, not two overlapping ones.
    // The terminal lies along X, so it casts two squares on its own — and the
    // blower under one end of it adds none.
    const parts: Part[] = [
      { id: "b1", type: "blower", cell: [0, 5, 0], dir: [1, 0, 0] },
      { id: "t1", type: "terminal", cell: [0, 9, 0], axis: [1, 0, 0] }
    ];
    const [ground] = placedPartShadows(designFromScene({ parts, obstacles: [] }, oneFloor));
    expect(ground.cells).toEqual([
      [0, 0, 0],
      [1, 0, 0]
    ]);
  });

  it("casts onto the floor a part stands over, not every floor below it", () => {
    // Floor 2 starts at 31 in a 30 ft room. A part up there belongs to that
    // floor's plan; repeating it on the ground would double the marks.
    const parts: Part[] = [{ id: "b1", type: "blower", cell: [2, 35, 2], dir: [1, 0, 0] }];
    expect(placedPartShadows(designFromScene({ parts, obstacles: [] }, twoFloor))).toEqual([
      { y: 31, live: false, cells: [[2, 31, 2]] }
    ]);
  });

  it("traces every column of an elevated run", () => {
    const parts: Part[] = [
      { id: "st1", type: "tube", from: [0.5, 5.5, 0.5], to: [3.5, 5.5, 0.5], length: 3 }
    ];
    const [ground] = placedPartShadows(designFromScene({ parts, obstacles: [] }, oneFloor));
    expect(ground.cells).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0]
    ]);
  });
});

describe("ghostElevation", () => {
  it("reports where the armed part would land", () => {
    expect(ghostElevation({ type: "blower", cell: [0, 7, 0], dir: [1, 0, 0] })).toBe(7);
    expect(ghostElevation({ type: "tube", from: [0.5, 0.5, 0.5], to: [0.5, 4.5, 0.5] })).toBe(4);
  });

  it("reports an obstacle draft's own top, not the placement plane", () => {
    // The plane stays where the elevation keys left it while the HUD steppers
    // move the box; reading the plane reported 0 however tall the box was.
    expect(ghostElevation({ type: "obstacle", min: [0, 0, 0], max: [2, 4, 2] })).toBe(5);
  });
});
