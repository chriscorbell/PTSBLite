import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILENAME,
  DEFAULT_REVISION,
  designFromScene,
  emptyDesign,
  newOccupantId,
  partsWithinBuildArea
} from "@/domain/design-state";
import { bendFootprint } from "@/domain/bend-placement";
import { DEFAULT_BUILD_AREA, SparseGrid } from "@/domain/sparse-grid";
import type { BendPart, Part, Scene } from "@/types";

describe("DesignState", () => {
  it("emptyDesign returns an empty design with default metadata", () => {
    const d = emptyDesign();
    expect(d.parts).toEqual([]);
    expect(d.obstacles).toEqual([]);
    expect(d.metadata).toEqual({
      filename: DEFAULT_FILENAME,
      revision: DEFAULT_REVISION,
      buildArea: DEFAULT_BUILD_AREA
    });
  });

  it("emptyDesign accepts metadata overrides", () => {
    const d = emptyDesign({ filename: "house.ptsb", revision: "1.2" });
    expect(d.metadata.filename).toBe("house.ptsb");
    expect(d.metadata.revision).toBe("1.2");
  });

  it("designFromScene clones parts and obstacles", () => {
    const scene: Scene = {
      parts: [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }],
      obstacles: [{ id: "o1", min: [0, 0, 0], max: [1, 1, 1] }]
    };
    const d = designFromScene(scene);
    expect(d.parts).toHaveLength(1);
    expect(d.obstacles).toHaveLength(1);
    expect(d.parts[0]).not.toBe(scene.parts[0]);
    expect(d.obstacles[0]).not.toBe(scene.obstacles[0]);
  });

  it("designFromScene does not mutate the scene when design is later edited", () => {
    const scene: Scene = {
      parts: [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }],
      obstacles: []
    };
    const d = designFromScene(scene);
    d.parts.push({ id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] });
    expect(scene.parts).toHaveLength(1);
  });

  it("designFromScene applies metadata overrides", () => {
    const scene: Scene = { parts: [], obstacles: [] };
    const d = designFromScene(scene, { filename: "x.ptsb" });
    expect(d.metadata.filename).toBe("x.ptsb");
    expect(d.metadata.revision).toBe(DEFAULT_REVISION);
  });
});

describe("DesignState grid", () => {
  it("emptyDesign provides a SparseGrid instance", () => {
    const d = emptyDesign();
    expect(d.grid).toBeInstanceOf(SparseGrid);
  });

  it("emptyDesign grid is empty", () => {
    const d = emptyDesign();
    expect(d.grid.query([0, 0, 0])).toBeUndefined();
  });

  it("designFromScene registers blower anchor cells in the grid", () => {
    const scene: Scene = {
      parts: [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }],
      obstacles: []
    };
    const d = designFromScene(scene);
    expect(d.grid.query([0, 0, 0])).toBe("b1");
  });

  it("designFromScene registers terminal anchor cells in the grid", () => {
    const scene: Scene = {
      parts: [{ id: "t1", type: "terminal", cell: [5, 0, 0], axis: [1, 0, 0] }],
      obstacles: []
    };
    const d = designFromScene(scene);
    expect(d.grid.query([5, 0, 0])).toBe("t1");
  });

  it("designFromScene registers straight tube footprint cells in the grid", () => {
    const scene: Scene = {
      parts: [{ id: "st1", type: "tube", from: [2.5, 0.5, 3.5], to: [8.5, 0.5, 3.5] }],
      obstacles: []
    };
    const d = designFromScene(scene);
    for (let x = 2; x <= 7; x++) {
      expect(d.grid.query([x, 0, 3])).toBe("st1");
    }
    expect(d.grid.query([8, 0, 3])).toBeUndefined();
  });

  it("designFromScene registers bend footprint cells in the grid", () => {
    const bend: BendPart = {
      id: "bn1",
      type: "bend",
      entry: [1.5, 0.5, 0.5],
      exit: [4.5, 0.5, 3.5],
      center: [1.5, 0.5, 3.5],
      inDir: [1, 0, 0],
      outDir: [0, 0, 1],
      radius: 3
    };
    const scene: Scene = {
      parts: [bend],
      obstacles: []
    };
    const d = designFromScene(scene);

    for (const cell of bendFootprint(bend)) {
      expect(d.grid.query(cell)).toBe("bn1");
    }
  });

  it("designFromScene marks all integer cells inside obstacle bounding boxes", () => {
    const scene: Scene = {
      parts: [],
      obstacles: [{ id: "o1", min: [2, 0, 3], max: [4, 1, 5] }]
    };
    const d = designFromScene(scene);
    expect(d.grid.query([2, 0, 3])).toBe("o1");
    expect(d.grid.query([4, 1, 5])).toBe("o1");
    expect(d.grid.query([3, 0, 4])).toBe("o1");
    expect(d.grid.query([5, 0, 3])).toBeUndefined();
  });
});

describe("partsWithinBuildArea", () => {
  it("keeps parts inside the area and drops those outside", () => {
    const parts: Part[] = [
      { id: "in", type: "blower", cell: [2, 0, 2], dir: [1, 0, 0] },
      { id: "outX", type: "blower", cell: [20, 0, 0], dir: [1, 0, 0] },
      { id: "outY", type: "terminal", cell: [0, 9, 0], axis: [1, 0, 0] }
    ];
    // width/depth 10 → X/Z in [-5, 5); height 4 → Y in [0, 4).
    const kept = partsWithinBuildArea(parts, { width: 10, depth: 10, height: 4 });
    expect(kept.map((p) => p.id)).toEqual(["in"]);
  });

  it("drops a tube whose footprint extends past the bounds", () => {
    const parts: Part[] = [{ id: "t", type: "tube", from: [0, 0, 0], to: [8, 0, 0] }];
    // The tube occupies cells x = 0..7, which exceed the [-5, 5) X bound.
    expect(partsWithinBuildArea(parts, { width: 10, depth: 10, height: 4 })).toEqual([]);
  });
});

describe("newOccupantId", () => {
  /** Hands out the given values in order, so a collision can be forced. */
  function sequence(...values: string[]): () => string {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
  }

  it("prefixes parts with p and obstacles with o", () => {
    const design = emptyDesign();
    expect(newOccupantId(design, "p", sequence("abc"))).toBe("pabc");
    expect(newOccupantId(design, "o", sequence("abc"))).toBe("oabc");
  });

  it("retries when the candidate is already taken by a part", () => {
    const design = designFromScene({
      parts: [{ id: "ptaken", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }],
      obstacles: []
    });
    expect(newOccupantId(design, "p", sequence("taken", "free"))).toBe("pfree");
  });

  it("retries when a part's candidate collides with an obstacle", () => {
    // Parts and obstacles share one occupant namespace, so a part id must avoid
    // obstacle ids too — the grid stores both under the same keys.
    const design = designFromScene({
      parts: [],
      obstacles: [{ id: "ptaken", min: [0, 0, 0], max: [1, 1, 1] }]
    });
    expect(newOccupantId(design, "p", sequence("taken", "free"))).toBe("pfree");
  });
});
