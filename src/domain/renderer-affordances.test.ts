import { describe, expect, it } from "vitest";
import { emptyDesign } from "@/domain/design-state";
import {
  BUILD_VOLUME_HALF_EXTENT,
  labelTextForPart,
  openPortMarkers,
  partLabels
} from "@/domain/renderer-affordances";
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

describe("partLabels", () => {
  it("produces one label per part with the catalog part number", () => {
    const design = designWith([
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "t1", type: "terminal", cell: [10, 0, 0], axis: [1, 0, 0] },
      { id: "st1", type: "tube", from: [2, 0.5, 0], to: [8, 0.5, 0] },
      {
        id: "bn1",
        type: "bend",
        entry: [8, 0.5, 0],
        exit: [11, 0.5, 3],
        center: [11, 0.5, 0],
        inDir: [1, 0, 0],
        outDir: [0, 0, 1],
        radius: 3
      }
    ]);
    const labels = partLabels(design);
    expect(labels.map((l) => l.text)).toEqual(["BL-2020-A", "TM-2020-S", "ST-06-4OD", "BN-90-3R"]);
    expect(labels.every((l) => l.anchor.length === 3)).toBe(true);
  });

  it("anchors tube labels at the midpoint", () => {
    const design = designWith([{ id: "st1", type: "tube", from: [0, 0, 0], to: [6, 0, 0] }]);
    const [label] = partLabels(design);
    expect(label.anchor[0]).toBeCloseTo(3, 5);
    expect(label.anchor[2]).toBeCloseTo(0, 5);
  });
});

describe("labelTextForPart", () => {
  it("returns catalog part numbers verbatim", () => {
    expect(labelTextForPart({ id: "b", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] })).toBe(
      "BL-2020-A"
    );
    expect(labelTextForPart({ id: "t", type: "terminal", cell: [0, 0, 0], axis: [1, 0, 0] })).toBe(
      "TM-2020-S"
    );
  });
});

describe("build volume constants", () => {
  it("define a working half-extent around the origin", () => {
    expect(BUILD_VOLUME_HALF_EXTENT).toBeGreaterThan(0);
  });
});
