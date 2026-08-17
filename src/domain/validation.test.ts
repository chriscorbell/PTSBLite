import { describe, expect, it } from "vitest";
import { designFromScene } from "@/domain/design-state";
import {
  checkBlowerTerminalAdjacency,
  checkConnectivity,
  checkObstacleIntersections,
  checkPathLength,
  checkTerminalCount,
  validate
} from "@/domain/validation";
import type { BuildArea, DesignState, Part } from "@/types";

const baseParts: Part[] = [
  { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
  { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
  { id: "st1", type: "tube", from: [2, 0, 0], to: [8, 0, 0] },
  { id: "t2", type: "terminal", cell: [8, 0, 0], axis: [1, 0, 0] }
];

function designWith(
  parts: Part[],
  obstacles: DesignState["obstacles"] = [],
  buildArea?: BuildArea
): DesignState {
  return designFromScene({ parts, obstacles }, buildArea ? { buildArea } : undefined);
}

/**
 * The largest build area the app allows is 200 ft on a side, but the centerline
 * cap is 300 ft — so any design that trips the cap has to fold back on itself.
 * A single straight run long enough to exceed it does not fit in any legal
 * design, which is why these fixtures use parallel runs rather than one tube.
 */
const LARGE_AREA: BuildArea = { width: 200, depth: 200, height: 30 };
const LONG_RUN: Part[] = [
  { id: "st-a", type: "tube", from: [-98, 0, 5], to: [98, 0, 5] },
  { id: "st-b", type: "tube", from: [-98, 0, 10], to: [98, 0, 10] }
];

describe("validation engine", () => {
  it("warns when centerline path length exceeds 300ft", () => {
    const design = designWith(
      [
        baseParts[0],
        baseParts[1],
        ...LONG_RUN,
        { id: "t2", type: "terminal", cell: [20, 0, 0], axis: [1, 0, 0] }
      ],
      [],
      LARGE_AREA
    );

    const warnings = checkPathLength(design);
    expect(warnings.map((w) => w.id)).toEqual(["path-length"]);
    expect(warnings[0]).toMatchObject({
      level: "error",
      title: "Exceeds 300ft centerline"
    });
  });

  it("warns when the system does not have exactly 2 terminals", () => {
    const design = designWith([baseParts[0], baseParts[1], baseParts[2]]);

    const warnings = checkTerminalCount(design);
    expect(warnings.map((w) => w.id)).toEqual(["terminal-count"]);
    expect(warnings[0].detail).toContain("exactly 2 terminals");
  });

  it("warns when the blower is not directly adjacent to Terminal 1", () => {
    const design = designWith([
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "st1", type: "tube", from: [1, 0, 0], to: [7, 0, 0] },
      { id: "t1", type: "terminal", cell: [7, 0, 0], axis: [1, 0, 0] },
      { id: "t2", type: "terminal", cell: [8, 0, 0], axis: [1, 0, 0] }
    ]);

    const warnings = checkBlowerTerminalAdjacency(design);
    expect(warnings.map((w) => w.id)).toEqual(["blower-terminal-adjacency"]);
    expect(warnings[0].detail).toContain("directly adjacent");

    expect(
      checkBlowerTerminalAdjacency(
        designWith([
          { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
          { id: "t2", type: "terminal", cell: [8, 0, 0], axis: [1, 0, 0] }
        ])
      ).map((w) => w.id)
    ).toEqual(["blower-terminal-adjacency"]);
  });

  it("warns when open ports indicate the system is not fully connected", () => {
    const design = designWith([
      baseParts[0],
      baseParts[1],
      { id: "t2", type: "terminal", cell: [8, 0, 0], axis: [1, 0, 0] }
    ]);

    const warnings = checkConnectivity(design);
    expect(warnings.map((w) => w.id)).toEqual(["connectivity"]);
    expect(warnings[0].detail).toContain("gap");
  });

  it("warns when any path footprint passes through an obstacle cell", () => {
    const design = designWith(baseParts, [{ id: "o1", min: [4, 0, 0], max: [4, 0, 0] }]);

    const warnings = checkObstacleIntersections(design);
    expect(warnings.map((w) => w.id)).toEqual(["obstacle-intersection"]);
    expect(warnings[0].detail).toContain("obstacle");
  });

  it("does not fault a path passing through a penetrable obstacle", () => {
    const design = designWith(baseParts, [
      { id: "o1", min: [4, 0, 0], max: [4, 0, 0], penetrable: true }
    ]);
    expect(checkObstacleIntersections(design)).toEqual([]);
  });

  it("returns no warnings for a valid blower to T1 to tubing to T2 system", () => {
    expect(validate(designWith(baseParts))).toEqual([]);
  });

  it("aggregates multiple validation warnings in rule order", () => {
    const design = designWith(
      [
        { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
        ...LONG_RUN,
        { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] }
      ],
      [],
      LARGE_AREA
    );

    expect(validate(design).map((w) => w.id)).toEqual(["path-length", "terminal-count"]);
  });
});
