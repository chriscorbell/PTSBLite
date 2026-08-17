import { describe, expect, it } from "vitest";
import { emptyDesign } from "@/domain/design-state";
import { openPortMarkers } from "@/domain/renderer-affordances";
import type { DesignState, Part } from "@/types";

function designWith(parts: Part[]): DesignState {
  return { ...emptyDesign(), parts };
}

describe("openPortMarkers", () => {
  it("returns empty for tools that don't depend on connections", () => {
    const design = designWith([{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }]);
    expect(openPortMarkers(design, "cursor")).toEqual([]);
    expect(openPortMarkers(design, "blower")).toEqual([]);
    expect(openPortMarkers(design, "terminal")).toEqual([]);
    expect(openPortMarkers(design, "obstacle")).toEqual([]);
    expect(openPortMarkers(design, "erase")).toEqual([]);
  });

  it("returns one marker per open port when tube tool is active", () => {
    const design = designWith([
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "t1", type: "terminal", cell: [10, 0, 0], axis: [1, 0, 0] }
    ]);
    const markers = openPortMarkers(design, "tube");
    expect(markers).toHaveLength(3);
    expect(markers.find((m) => m.partId === "b1")).toMatchObject({
      cell: [0, 0, 0],
      dir: [1, 0, 0]
    });
  });

  it("excludes already-connected ports", () => {
    const design = designWith([
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] }
    ]);
    const markers = openPortMarkers(design, "bend");
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ partId: "t1", index: 0 });
  });
});
