import { describe, expect, it } from "vitest";
import { reconstructDesign } from "@/domain/design-reconstruction";
import { deserializeDesign, serializeDesign } from "@/domain/design-file";
import { emptyDesign } from "@/domain/design-state";
import { expectGridMatchesDesign } from "@/test/design-invariants";
import type { BlowerPart, DesignMetadata, Obstacle, Part } from "@/types";

const META: DesignMetadata = emptyDesign().metadata;

function rebuild(parts: Part[], obstacles: Obstacle[] = []) {
  return reconstructDesign({ parts, obstacles }, META);
}

const BLOWER: Part = { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] };
const TERMINAL: Part = { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] };
// The terminal lies along X across [1] and [2], so the run leaves at [3]
// rather than butting against the cell it was placed in (ADR-0027).
const TUBE: Part = { id: "st1", type: "tube", from: [3, 0, 0], to: [9, 0, 0] };

describe("reconstructDesign", () => {
  it("rebuilds a valid design with parts, obstacles and grid in agreement", () => {
    const result = rebuild(
      [BLOWER, TERMINAL, TUBE],
      [{ id: "o1", min: [0, 0, 5], max: [2, 1, 6] }]
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
  });

  it("copies parts and their vectors instead of retaining input references", () => {
    const blower: BlowerPart = { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] };
    const result = rebuild([blower]);
    if (!result.ok) throw new Error("expected success");
    expect(result.design.parts[0]).not.toBe(blower);
    expect((result.design.parts[0] as BlowerPart).cell).not.toBe(blower.cell);
  });
});

describe("reconstructDesign rejects parts it cannot represent", () => {
  it("rejects a part outside the build area, naming the part and the cell", () => {
    // The bug this replaces: the part stayed in `parts` and was simply absent
    // from `grid`, so it rendered and appeared in the BOM but could not be erased.
    const result = rebuild([{ id: "far", type: "blower", cell: [999, 0, 0], dir: [1, 0, 0] }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ kind: "part", id: "far", reason: "out-of-bounds" });
    expect(result.issues[0].message).toContain("outside the build area");
  });

  it("rejects two parts claiming the same cell", () => {
    const result = rebuild([BLOWER, { ...BLOWER, id: "b2" }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatchObject({
      id: "b2",
      reason: "overlap",
      occupiedBy: "b1"
    });
  });

  it("rejects a tube crossing a part rather than throwing", () => {
    // Blowers and terminals used to be registered with no occupancy guard at
    // all, so SparseGrid.place threw and the load crashed outright.
    const result = rebuild([TERMINAL, { id: "st", type: "tube", from: [0, 0, 0], to: [4, 0, 0] }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatchObject({ reason: "overlap", occupiedBy: "t1" });
  });

  it("reports every offending part, not only the first", () => {
    const result = rebuild([
      { id: "a", type: "blower", cell: [900, 0, 0], dir: [1, 0, 0] },
      { id: "b", type: "blower", cell: [901, 0, 0], dir: [1, 0, 0] }
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("rejects duplicate ids across the shared part and obstacle namespace", () => {
    const result = rebuild([BLOWER], [{ id: "b1", min: [5, 0, 5], max: [5, 0, 5] }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toMatchObject([{ kind: "obstacle", id: "b1", reason: "duplicate-id" }]);
  });

  it("leaves no partial trace of a rejected part", () => {
    // A rejected part must not have registered the cells it did fit into
    // before hitting the one it did not.
    const result = rebuild([
      { id: "half-out", type: "tube", from: [0, 0, 0], to: [999, 0, 0] },
      BLOWER
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The blower is only reported if the rejected tube wrongly kept cell 0,0,0.
    expect(result.issues.map((i) => i.id)).toEqual(["half-out"]);
  });
});

describe("reconstructDesign treats obstacles as volumes, not objects", () => {
  it("accepts overlapping obstacles and represents their union", () => {
    const result = rebuild(
      [],
      [
        { id: "o1", min: [0, 0, 0], max: [3, 0, 0] },
        { id: "o2", min: [2, 0, 0], max: [5, 0, 0] }
      ]
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (let x = 0; x <= 5; x++) {
      expect(result.design.grid.query([x, 0, 0])).toBeDefined();
    }
    expectGridMatchesDesign(result.design);
  });

  it("accepts an obstacle over a part, leaving validation to flag it", () => {
    // checkObstacleIntersections reports this at level "error". Refusing to
    // open the file would leave the user unable to fix the problem the
    // validator exists to tell them about.
    const result = rebuild([TUBE], [{ id: "o1", min: [4, 0, 0], max: [4, 0, 0] }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.grid.query([4, 0, 0])).toBe("st1");
    expectGridMatchesDesign(result.design);
  });

  it("clips an obstacle to the build area instead of rejecting the design", () => {
    const result = rebuild([], [{ id: "o1", min: [-5, 0, 0], max: [999, 0, 0] }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.grid.query([0, 0, 0])).toBe("o1");
    expect(result.design.grid.query([999, 0, 0])).toBeUndefined();
    expectGridMatchesDesign(result.design);
  });
});

describe("restoring geometry the app cannot represent", () => {
  function fileWith(parts: Part[], obstacles: Obstacle[] = []): string {
    return JSON.stringify({
      ...serializeDesign(emptyDesign(), "9.9.9"),
      parts,
      obstacles
    });
  }

  it("reports the problem instead of loading a design with parts missing from the grid", () => {
    const result = deserializeDesign(
      fileWith([{ id: "far", type: "blower", cell: [999, 0, 0], dir: [1, 0, 0] }])
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("far");
    expect(result.message).toContain("outside the build area");
  });

  it("says how many further problems there are", () => {
    const result = deserializeDesign(
      fileWith([
        { id: "a", type: "blower", cell: [900, 0, 0], dir: [1, 0, 0] },
        { id: "b", type: "blower", cell: [901, 0, 0], dir: [1, 0, 0] },
        { id: "c", type: "blower", cell: [902, 0, 0], dir: [1, 0, 0] }
      ])
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("and 2 more");
  });

  it("round-trips a valid design with the invariant intact", () => {
    const result = deserializeDesign(fileWith([BLOWER, TERMINAL, TUBE]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectGridMatchesDesign(result.design);
  });
});
