import { describe, expect, it } from "vitest";
import { designFromScene } from "@/domain/design-state";
import {
  autoBuildOpenPortPair,
  PATHFINDER_NO_ROUTE_MESSAGE,
  PATHFINDER_SEARCH_LIMIT_MESSAGE
} from "@/domain/pathfinder";
import { GROUND_PLANE_Y } from "@/domain/sparse-grid";
import { totalPathLength } from "@/domain/parts";
import { validate } from "@/domain/validation";
import type { DesignState, Obstacle, Part, Vec3 } from "@/types";

function designWith(parts: Part[], obstacles: Obstacle[] = []): DesignState {
  return designFromScene({ parts, obstacles });
}

function basicParts(targetCell: Vec3, targetAxis: Vec3 = [1, 0, 0]): Part[] {
  return [
    { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
    { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
    { id: "t2", type: "terminal", cell: targetCell, axis: targetAxis }
  ];
}

describe("Pathfinder MVP", () => {
  it("auto-builds a straight-shot route between the open system port and Terminal 2", () => {
    const result = autoBuildOpenPortPair(designWith(basicParts([8, 0, 0])));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.map((part) => part.type)).toEqual(["tube"]);
    expect(result.parts[0]).toMatchObject({
      type: "tube",
      from: [2.5, 0.5, 0.5],
      to: [8.5, 0.5, 0.5],
      length: 6
    });
    expect(validate(result.design)).toEqual([]);
  });

  it("auto-builds a single-bend L route", () => {
    const result = autoBuildOpenPortPair(designWith(basicParts([5, 0, 4], [0, 0, 1])));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.map((part) => part.type)).toEqual(["bend"]);
    expect(result.parts[0]).toMatchObject({
      type: "bend",
      inDir: [1, 0, 0],
      outDir: [0, 0, 1]
    });
    expect(validate(result.design)).toEqual([]);
  });

  it("routes through multiple bends when the target port faces back toward the system", () => {
    const result = autoBuildOpenPortPair(designWith(basicParts([5, 0, 6], [1, 0, 0])));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.filter((part) => part.type === "bend").length).toBeGreaterThanOrEqual(2);
    expect(result.parts.some((part) => part.type === "tube")).toBe(true);
    expect(validate(result.design)).toEqual([]);
  });


  it("routes across elevation changes when target terminal faces upward", () => {
    const result = autoBuildOpenPortPair(designWith(basicParts([8, 4, 0], [0, 1, 0])));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.some((part) => part.type === "bend" && part.outDir[1] !== 0)).toBe(true);
    expect(validate(result.design)).toEqual([]);
  });

  it("returns a typed no-route result when the open ports cannot be connected", () => {
    const design = designWith(basicParts([5, 0, 4], [0, 0, 1]));
    design.grid.place([3, 0, 0], "blocker");

    const result = autoBuildOpenPortPair(design);

    expect(result).toEqual({
      ok: false,
      reason: "no-route",
      message: "No route exists between the open ports."
    });
  });

  it("emits 6ft stock tubes where possible and 1ft cut tubes at seams", () => {
    const result = autoBuildOpenPortPair(designWith(basicParts([15, 0, 0])));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tubeLengths = result.parts
      .filter((part) => part.type === "tube")
      .map((part) => part.length);
    expect(tubeLengths).toEqual([6, 6, 1]);
    expect(totalPathLength(result.design)).toBe(13);
    expect(validate(result.design)).toEqual([]);
  });
});

describe("Pathfinder with obstacles, partial systems, and budget", () => {
  it("routes around an obstacle in the straight path", () => {
    const obstacle: Obstacle = { id: "obs1", min: [5, 0, 0], max: [5, 0, 0] };
    const result = autoBuildOpenPortPair(designWith(basicParts([16, 0, 0]), [obstacle]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.some((part) => part.type === "bend")).toBe(true);
    expect(result.unroutedPairs).toEqual([]);
    expect(validate(result.design)).toEqual([]);
  });

  it("threads a route between obstacles when the straight path is blocked", () => {
    const obstacles: Obstacle[] = [
      { id: "wall-a", min: [5, 0, 0], max: [5, 0, 0] },
      { id: "wall-b", min: [5, 0, 2], max: [5, 0, 2] }
    ];
    const result = autoBuildOpenPortPair(designWith(basicParts([16, 0, 0]), obstacles));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unroutedPairs).toEqual([]);
    expect(validate(result.design)).toEqual([]);
  });

  it("completes a partially-built system preserving placed parts", () => {
    const filler: Part = {
      id: "midtube",
      type: "tube",
      from: [5.5, 0.5, 0.5],
      to: [11.5, 0.5, 0.5],
      length: 6
    };
    const design = designWith([
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
      filler,
      { id: "t2", type: "terminal", cell: [14, 0, 0], axis: [1, 0, 0] }
    ]);
    const existingPartIds = design.parts.map((part) => part.id);

    const result = autoBuildOpenPortPair(design);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const id of existingPartIds) {
      expect(result.design.parts.some((part) => part.id === id)).toBe(true);
    }
    expect(result.parts.length).toBeGreaterThan(0);
    expect(result.unroutedPairs).toEqual([]);
    expect(validate(result.design)).toEqual([]);
  });

  it("routes two open-port pairs in a single pass", () => {
    const filler: Part = {
      id: "midtube",
      type: "tube",
      from: [5.5, 0.5, 0.5],
      to: [11.5, 0.5, 0.5],
      length: 6
    };
    const design = designWith([
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
      filler,
      { id: "t2", type: "terminal", cell: [14, 0, 0], axis: [1, 0, 0] }
    ]);

    const result = autoBuildOpenPortPair(design);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.length).toBeGreaterThanOrEqual(2);
    const finalGapsBeforeFiller = result.design.parts.filter(
      (part) => part.type === "tube" && part.id !== "midtube"
    );
    expect(finalGapsBeforeFiller.length).toBeGreaterThanOrEqual(2);
    expect(result.unroutedPairs).toEqual([]);
    expect(validate(result.design)).toEqual([]);
  });

  it("never routes below the ground plane to reach a down-facing terminal behind a tall obstacle", () => {
    // Regression: a down-facing destination terminal plus a floor-to-ceiling
    // obstacle between the endpoints used to tempt the planner into burrowing
    // under the floor (Y < 0) — a connected-but-buried route that manual
    // placement would never allow. Mirrors BUILDING_07.
    const design = designWith(
      [
        { id: "blower", type: "blower", cell: [-23, 0, 7], dir: [0, 1, 0] },
        { id: "t1", type: "terminal", cell: [-23, 1, 7], axis: [0, 1, 0] },
        { id: "t2", type: "terminal", cell: [17, 0, -4], axis: [0, -1, 0] }
      ],
      [{ id: "obs", min: [-13, 0, -7], max: [9, 13, 15] }]
    );

    for (const mode of ["shortest", "fewest-bends"] as const) {
      const result = autoBuildOpenPortPair(design, { mode });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const routeYs = result.parts.flatMap((part) =>
        part.type === "tube"
          ? [part.from[1], part.to[1]]
          : part.type === "bend"
            ? [part.entry[1], part.exit[1]]
            : []
      );
      expect(Math.min(...routeYs)).toBeGreaterThanOrEqual(GROUND_PLANE_Y);
      expect(result.unroutedPairs).toEqual([]);
      expect(validate(result.design)).toEqual([]);
    }
  });

  it("reports unrouted pairs when the budget would be exceeded", () => {
    const result = autoBuildOpenPortPair(designWith(basicParts([10, 0, 0])), {
      maxBudgetFeet: 4
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no-route");
  });

  it("defaults to shortest mode when no option is provided", () => {
    const design = designWith(basicParts([15, 0, 10], [0, 0, 1]));

    const explicit = autoBuildOpenPortPair(design, { mode: "shortest" });
    const implicit = autoBuildOpenPortPair(design);

    expect(implicit.ok).toBe(true);
    expect(explicit.ok).toBe(true);
    if (!implicit.ok || !explicit.ok) return;
    expect(implicit.parts.filter((p) => p.type === "bend").length).toBe(
      explicit.parts.filter((p) => p.type === "bend").length
    );
    expect(implicit.cost).toBe(explicit.cost);
  });

  it("fewest-bends mode returns a valid route on a far-diagonal fixture", () => {
    const design = designWith(basicParts([15, 0, 10], [0, 0, 1]));

    const shortest = autoBuildOpenPortPair(design, { mode: "shortest" });
    const fewest = autoBuildOpenPortPair(design, { mode: "fewest-bends" });

    expect(shortest.ok).toBe(true);
    expect(fewest.ok).toBe(true);
    if (!shortest.ok || !fewest.ok) return;

    const shortestBends = shortest.parts.filter((p) => p.type === "bend").length;
    const fewestBends = fewest.parts.filter((p) => p.type === "bend").length;

    expect(fewestBends).toBeLessThanOrEqual(shortestBends);
    expect(validate(shortest.design)).toEqual([]);
    expect(validate(fewest.design)).toEqual([]);
  });

  it("commits routes within budget and flags only the over-budget pair", () => {
    const filler: Part = {
      id: "midtube",
      type: "tube",
      from: [5.5, 0.5, 0.5],
      to: [11.5, 0.5, 0.5],
      length: 6
    };
    const design = designWith([
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
      filler,
      { id: "t2", type: "terminal", cell: [14, 0, 0], axis: [1, 0, 0] }
    ]);

    const result = autoBuildOpenPortPair(design, { maxBudgetFeet: totalPathLength(design) + 3 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unroutedPairs.length).toBe(1);
    expect(result.unroutedPairs[0].reason).toBe("over-budget");
    expect(result.parts.length).toBeGreaterThan(0);
  });
});

describe("why auto-build failed", () => {
  const farApart: Part[] = [
    { id: "b1", type: "blower", cell: [-25, 0, -25], dir: [1, 0, 0] },
    { id: "t1", type: "terminal", cell: [-24, 0, -25], axis: [1, 0, 0] },
    { id: "t2", type: "terminal", cell: [25, 0, 25], axis: [1, 0, 0] }
  ];
  const farShell: Obstacle[] = [
    { id: "s1", min: [22, 0, 22], max: [28, 5, 23] },
    { id: "s2", min: [22, 0, 27], max: [28, 5, 28] },
    { id: "s3", min: [22, 0, 23], max: [23, 5, 27] },
    { id: "s4", min: [27, 0, 23], max: [28, 5, 27] }
  ];

  // Terminal 2 walled in at close range, so the bounded search space is small
  // enough to exhaust outright rather than run out of expansion budget.
  const nearby: Part[] = [
    { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
    { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
    { id: "t2", type: "terminal", cell: [6, 0, 6], axis: [1, 0, 0] }
  ];
  const nearShell: Obstacle[] = [
    { id: "n1", min: [5, 0, 5], max: [7, 1, 5] },
    { id: "n2", min: [5, 0, 7], max: [7, 1, 7] },
    { id: "n3", min: [5, 0, 6], max: [5, 1, 6] },
    { id: "n4", min: [7, 0, 6], max: [7, 1, 6] }
  ];

  it("claims no route only after exhausting the reachable space", () => {
    const result = autoBuildOpenPortPair(designWith(nearby, nearShell));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no-route");
    expect(result.message).toBe(PATHFINDER_NO_ROUTE_MESSAGE);
  });

  it("says it gave up when it stopped on the expansion budget", () => {
    // Distant endpoints with the target sealed: the reachable space is large
    // enough that the search hits its budget long before exhausting it, so
    // nothing has been proved and the message must not claim otherwise.
    const result = autoBuildOpenPortPair(designWith(farApart, farShell));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("search-limit");
    expect(result.message).toBe(PATHFINDER_SEARCH_LIMIT_MESSAGE);
  });

  it("still reports giving up when the budget is lowered", () => {
    const result = autoBuildOpenPortPair(designWith(nearby, nearShell), { maxExpansions: 20 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("search-limit");
  });
});
