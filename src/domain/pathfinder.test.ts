import { describe, expect, it } from "vitest";
import { designFromScene } from "@/domain/design-state";
import {
  autoBuildOpenPortPair,
  MAX_RUN_HEIGHT_FEET,
  PATHFINDER_NO_ROUTE_MESSAGE,
  PATHFINDER_SEARCH_LIMIT_MESSAGE,
  runBandVolume
} from "@/domain/pathfinder";
import { GROUND_PLANE_Y } from "@/domain/sparse-grid";
import { placeTube } from "@/domain/tube-placement";
import { isAutoBuildPart, totalPathLength } from "@/domain/parts";
import type { DesignState, Obstacle, Part, Vec3 } from "@/types";
import { routeWarnings } from "@/test/design-invariants";

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
  it("Auto-Builds a straight-shot route between the open system port and Terminal 2", () => {
    const result = autoBuildOpenPortPair(designWith(basicParts([8, 0, 0])));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.map((part) => part.type)).toEqual(["tube"]);
    expect(result.parts[0]).toMatchObject({
      type: "tube",
      from: [2.5, 0.5, 0.5],
      to: [8.5, 0.5, 0.5],
      length: 6,
      source: "auto-build"
    });
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("marks every part it places, so Clear Auto-Build can find them again", () => {
    const result = autoBuildOpenPortPair(designWith(basicParts([5, 0, 4], [0, 0, 1])));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Bends as well as tubes; the manually placed blower and terminals are not.
    expect(result.parts.length).toBeGreaterThan(0);
    expect(result.parts.some((part) => part.type === "bend")).toBe(true);
    expect(result.parts.every((part) => isAutoBuildPart(part))).toBe(true);
    const manual = result.design.parts.filter(
      (part) => part.type === "blower" || part.type === "terminal"
    );
    expect(manual.length).toBe(3);
    expect(manual.some((part) => isAutoBuildPart(part))).toBe(false);
  });

  it("Auto-Builds a single-bend L route", () => {
    const result = autoBuildOpenPortPair(designWith(basicParts([5, 0, 4], [0, 0, 1])));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.map((part) => part.type)).toEqual(["bend"]);
    expect(result.parts[0]).toMatchObject({
      type: "bend",
      inDir: [1, 0, 0],
      outDir: [0, 0, 1]
    });
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("routes through multiple bends when the target port faces back toward the system", () => {
    const result = autoBuildOpenPortPair(designWith(basicParts([5, 0, 6], [1, 0, 0])));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.filter((part) => part.type === "bend").length).toBeGreaterThanOrEqual(2);
    expect(result.parts.some((part) => part.type === "tube")).toBe(true);
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("routes across elevation changes when target terminal faces upward", () => {
    const result = autoBuildOpenPortPair(designWith(basicParts([8, 4, 0], [0, 1, 0])));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.some((part) => part.type === "bend" && part.outDir[1] !== 0)).toBe(true);
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("returns a typed no-route result when the open ports cannot be connected", () => {
    const design = designWith(basicParts([5, 0, 4], [0, 0, 1]), [
      { id: "blocker", min: [3, 0, 0], max: [3, 0, 0] }
    ]);

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
    expect(routeWarnings(result.design)).toEqual([]);
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
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("routes straight through a penetrable obstacle instead of around it", () => {
    // The obstacle the "routes around" test above detours for, now penetrable:
    // no wall at all, so the route is the same straight shot as open space —
    // all tube, no bends — and validation has nothing to say about it.
    const obstacle: Obstacle = { id: "obs1", min: [5, 0, 0], max: [5, 0, 0], penetrable: true };
    const result = autoBuildOpenPortPair(designWith(basicParts([16, 0, 0]), [obstacle]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.every((part) => part.type === "tube")).toBe(true);
    expect(routeWarnings(result.design)).toEqual([]);
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
    expect(routeWarnings(result.design)).toEqual([]);
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
    expect(routeWarnings(result.design)).toEqual([]);
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
    expect(routeWarnings(result.design)).toEqual([]);
  });

  // Explicit timeout, not the 5s default. This one runs a full Auto-Build twice
  // over a 40x22 area with a floor-to-ceiling obstacle in the way, and takes
  // ~2.2s locally against ~5.1s on a CI runner — close enough to the default to
  // fail on a loaded machine, which it did. Raising it here rather than
  // globally: everything else in the suite finishing inside 5s is information
  // worth keeping.
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

    const result = autoBuildOpenPortPair(design);
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
    expect(routeWarnings(result.design)).toEqual([]);
  }, 20_000);

  it("reports unrouted pairs when the budget would be exceeded", () => {
    const result = autoBuildOpenPortPair(designWith(basicParts([10, 0, 0])), {
      maxBudgetFeet: 4
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no-route");
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

describe("where a horizontal run belongs", () => {
  // The client's three cases, in his order: a plenum is used whenever there is
  // one, however high the ceiling; without one the run rides next to a ceiling
  // of 12 ft or lower; and a taller room is routed under a ghost ceiling at
  // 12 ft instead.
  const bandOf = (room: { width: number; depth: number; height: number }, plenum: number | null) =>
    runBandVolume({ room, multiFloor: false, plenumHeightFeet: plenum });

  it("uses the plenum whenever the design has one", () => {
    const shallow = bandOf({ width: 60, depth: 60, height: 8 }, 4);
    const tall = bandOf({ width: 60, depth: 60, height: 30 }, 3);

    expect(shallow.kind).toBe("plenum");
    expect(shallow.bands).toEqual([{ floor: 1, base: 4, top: 8 }]);
    // The same answer 22 ft higher: nothing about the room talks it out of it.
    expect(tall.kind).toBe("plenum");
    expect(tall.bands).toEqual([{ floor: 1, base: 27, top: 30 }]);
  });

  it("runs next to the ceiling of a room 12 ft or lower with no plenum", () => {
    const band = bandOf({ width: 60, depth: 60, height: MAX_RUN_HEIGHT_FEET }, null);

    expect(band.kind).toBe("ceiling");
    expect(band.bands).toEqual([{ floor: 1, base: 11, top: 12 }]);
  });

  it("runs under a 12 ft ghost ceiling in a taller room with no plenum", () => {
    const band = bandOf({ width: 60, depth: 60, height: MAX_RUN_HEIGHT_FEET + 1 }, null);

    expect(band.kind).toBe("ghost-ceiling");
    expect(band.bands).toEqual([{ floor: 1, base: 11, top: 12 }]);
  });

  it("gives each floor of a two-floor room its own band", () => {
    const band = runBandVolume({
      room: { width: 60, depth: 60, height: 30 },
      multiFloor: true,
      plenumHeightFeet: null
    });

    // 12 ft above each floor's own floor, the second measured from the slab.
    expect(band.bands).toEqual([
      { floor: 1, base: 11, top: 12 },
      { floor: 2, base: 42, top: 43 }
    ]);
  });
});

describe("Pathfinder run band preference", () => {
  // An 8 ft floor whose top half is plenum: the band spans Y 4..8. Both ports
  // face sideways along the ground, so reaching the band costs four bends the
  // route would not otherwise place — the long fixture is far enough across for
  // the run to buy them, the short hop below is not.
  const PLENUM_META = {
    room: { width: 60, depth: 60, height: 8 },
    plenumHeightFeet: 4
  };
  const farParts: Part[] = [
    { id: "b1", type: "blower", cell: [-25, 0, 0], dir: [1, 0, 0] },
    { id: "t1", type: "terminal", cell: [-24, 0, 0], axis: [1, 0, 0] },
    { id: "t2", type: "terminal", cell: [20, 0, 0], axis: [1, 0, 0] }
  ];

  /** Y cell levels a horizontal tube runs at (its centerline sits at Y + 0.5). */
  function horizontalTubeLevels(parts: Part[]): number[] {
    return parts.flatMap((part) =>
      part.type === "tube" && part.from[1] === part.to[1] ? [part.from[1] - 0.5] : []
    );
  }

  it("carries a long horizontal run in the plenum", () => {
    const result = autoBuildOpenPortPair(
      designFromScene({ parts: farParts, obstacles: [] }, PLENUM_META)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The bulk of the run rides in the band; nothing sneaks above or below it.
    expect(horizontalTubeLevels(result.parts).some((y) => y >= 4)).toBe(true);
    expect(result.unroutedPairs).toEqual([]);
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("carries the same fixture under the ceiling when there is no plenum", () => {
    // A room with no plenum still has somewhere for a long run to go. The
    // client: no plenum and a ceiling of 12 ft or lower means "run next to the
    // ceiling", so this 8 ft room carries it in the foot below 8 — four bends
    // to climb out and back, bought by 44 ft of run out of the walkway.
    const meta = { ...PLENUM_META, plenumHeightFeet: null };
    const result = autoBuildOpenPortPair(designFromScene({ parts: farParts, obstacles: [] }, meta));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runBand).toBe("ceiling");
    expect(horizontalTubeLevels(result.parts).every((y) => y === 7)).toBe(true);
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("leaves a short hop between two sideways ports on the ground", () => {
    const result = autoBuildOpenPortPair(
      designFromScene({ parts: basicParts([8, 0, 0]), obstacles: [] }, PLENUM_META)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Room height no longer votes on the band, but bends still do: both ports
    // face along the ground and are six feet apart, so climbing into the band
    // would add four bends to save six feet of penalty. The hop stays a
    // straight shot. Between two upward-facing ports — the defaults a visitor
    // actually gets — the bends are paid either way and the band always wins;
    // `pathfinder-behaviour.test.ts` records that case.
    expect(result.parts.every((part) => part.type === "tube")).toBe(true);
    expect(horizontalTubeLevels(result.parts)).toEqual([0]);
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("gives no plenum credit outside the room", () => {
    // The same long run, at plenum height for a room it is nowhere near:
    // drop-ceiling space exists only over the room's footprint, so out there
    // the bias has nothing to prefer and the route stays flat on the ground.
    const meta = { room: { width: 20, depth: 20, height: 8 }, plenumHeightFeet: 4 };
    const outside: Part[] = [
      { id: "b1", type: "blower", cell: [40, 0, 40], dir: [1, 0, 0] },
      { id: "t1", type: "terminal", cell: [41, 0, 40], axis: [1, 0, 0] },
      { id: "t2", type: "terminal", cell: [105, 0, 40], axis: [1, 0, 0] }
    ];
    const result = autoBuildOpenPortPair(designFromScene({ parts: outside, obstacles: [] }, meta));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.every((part) => part.type === "tube")).toBe(true);
    expect(horizontalTubeLevels(result.parts).every((y) => y === 0)).toBe(true);
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("carries a run in the plenum of a room too tall for the climb to repay", () => {
    // The client's rule has no ceiling height above which the plenum stops
    // applying: "always prefer the plenum when there is one". A 30 ft room is
    // where that used to break, because a riser charged by the foot cost more
    // than the run saved.
    const tall = { room: { width: 60, depth: 60, height: 30 }, plenumHeightFeet: 3 };
    const result = autoBuildOpenPortPair(designFromScene({ parts: farParts, obstacles: [] }, tall));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runBand).toBe("plenum");
    expect(horizontalTubeLevels(result.parts).every((y) => y >= 27)).toBe(true);
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("stops a run at the ghost ceiling in a tall room with no plenum", () => {
    // No plenum and a ceiling too high to be worth reaching: the run rides at
    // MAX_RUN_HEIGHT_FEET, and the summary box tells the visitor to build by
    // hand if they need more rise than that.
    const tall = { room: { width: 60, depth: 60, height: 30 }, plenumHeightFeet: null };
    const result = autoBuildOpenPortPair(designFromScene({ parts: farParts, obstacles: [] }, tall));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runBand).toBe("ghost-ceiling");
    expect(horizontalTubeLevels(result.parts).every((y) => y === MAX_RUN_HEIGHT_FEET - 1)).toBe(
      true
    );
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("keeps the geometric cost honest while the search is biased", () => {
    const result = autoBuildOpenPortPair(
      designFromScene({ parts: farParts, obstacles: [] }, PLENUM_META)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Penalties steer the route; the budget must still be charged real feet.
    // Precision 1, not exact: the planner prices a bend at the catalog's 4.71
    // while totalPathLength computes the true arc, 4.7124 — a gap that predates
    // the bias and is a few hundredths across a whole route.
    expect(result.cost).toBeCloseTo(totalPathLength(result.parts), 1);
  });
});

describe("completing a system that already has manual tubing", () => {
  const base: Part[] = [
    { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
    { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
    { id: "t2", type: "terminal", cell: [20, 0, 0], axis: [1, 0, 0] }
  ];

  /** The design with one manual tube run out of `sourcePartId` from `cell`. */
  function withStub(sourcePartId: string, cell: Vec3): DesignState {
    const placed = placeTube(designWith(base), { id: "manual", cell, sourcePartId });
    if (!placed.ok) throw new Error(placed.message);
    return placed.design;
  }

  it("joins a manual stub on the far side to the rest of the system", () => {
    // Running tube out of Terminal 2 leaves that stub's free end and the
    // terminal's own outer port 8 ft apart, closer to each other than either is
    // to the blower side 11 ft away. Choosing purely on proximity turned the
    // stub back into the terminal it came from — a U-turn of four bends — and
    // left the blower side unconnected. The client hit exactly this: manual
    // tubing on the "A" side worked, the same tubing on the "B" side did not.
    const result = autoBuildOpenPortPair(withStub("t2", [19, 0, 0]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unroutedPairs).toEqual([]);
    expect(result.parts.filter((part) => part.type === "bend")).toEqual([]);
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("still joins a manual stub on the blower side", () => {
    const result = autoBuildOpenPortPair(withStub("t1", [2, 0, 0]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unroutedPairs).toEqual([]);
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("never joins two ends of the same run to each other", () => {
    // Only one run exists, so there is nothing to connect it to and nothing
    // sensible to do — closing it into a loop is not an improvement.
    const stub = withStub("t2", [19, 0, 0]);
    const lone = designWith(stub.parts.filter((part) => part.id !== "b1" && part.id !== "t1"));

    const result = autoBuildOpenPortPair(lone);

    expect(result.ok).toBe(false);
  });
});

describe("routing across a room with a plenum", () => {
  it("crosses a diagonal in a handful of bends rather than a staircase", () => {
    // Out of the plenum a bend used to cost less than the six feet of straight
    // it stands in for, so a route got cheaper the more it turned and a
    // diagonal came back as ten bends. The client: "it seems to want to build
    // systems with shortest possible distance, but needs to be least bends".
    const parts: Part[] = [
      { id: "b1", type: "blower", cell: [-8, 0, 21], dir: [0, 1, 0] },
      { id: "t1", type: "terminal", cell: [-8, 1, 21], axis: [0, 1, 0] },
      { id: "t2", type: "terminal", cell: [24, 0, -16], axis: [0, 1, 0] }
    ];
    const design = designFromScene(
      { parts, obstacles: [] },
      { room: { width: 60, depth: 60, height: 30 }, multiFloor: true, plenumHeightFeet: 3 }
    );

    const result = autoBuildOpenPortPair(design);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // One turn per axis the route has to travel is the floor; ten is a
    // staircase. Fewer bends buys length, and that trade is the point.
    expect(result.parts.filter((part) => part.type === "bend").length).toBeLessThanOrEqual(4);
    expect(routeWarnings(result.design)).toEqual([]);
  });

  it("routes a pair the width of an ordinary room apart", () => {
    // Two terminals about 48 ft apart in a 60 ft room, which is what the
    // client's own layout looked like. The plenum bias made a horizontal step
    // outside the band cost three times what the distance estimate charged
    // for it, so the search lost its guidance, exhausted the expansion budget
    // and returned nothing at all — and told the visitor to move the endpoints
    // closer, in a room they had just sized.
    const parts: Part[] = [
      { id: "b1", type: "blower", cell: [-8, 0, 21], dir: [0, 1, 0] },
      { id: "t1", type: "terminal", cell: [-8, 1, 21], axis: [0, 1, 0] },
      { id: "t2", type: "terminal", cell: [24, 0, -16], axis: [0, 1, 0] }
    ];
    const design = designFromScene(
      { parts, obstacles: [] },
      { room: { width: 60, depth: 60, height: 30 }, multiFloor: true, plenumHeightFeet: 3 }
    );

    const result = autoBuildOpenPortPair(design);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unroutedPairs).toEqual([]);
    // The two ports are 48 ft apart on the floor plan, and the band they now
    // ride sits 27 ft up, so a sane route is that distance plus the riser twice
    // over — about 102 ft before the bend arcs. Anything well beyond it is a
    // detour rather than the climb.
    expect(totalPathLength(result.parts)).toBeLessThan(120);
    expect(routeWarnings(result.design)).toEqual([]);
  });
});

describe("why Auto-Build failed", () => {
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
    // ~2.0s locally; searching to the expansion budget is the point of the test,
    // so the cost is inherent rather than accidental.
  }, 20_000);

  it("still reports giving up when the budget is lowered", () => {
    const result = autoBuildOpenPortPair(designWith(nearby, nearShell), { maxExpansions: 20 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("search-limit");
  });
});
