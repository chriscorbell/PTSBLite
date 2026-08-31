import { describe, expect, it } from "vitest";
import { designFromScene } from "@/domain/design-state";
import { inRoomFootprint } from "@/domain/floors";
import { autoBuildOpenPortPair, runBandVolume } from "@/domain/pathfinder";
import { placeTube } from "@/domain/tube-placement";
import { totalPathLength } from "@/domain/parts";
import { DEFAULT_ROOM } from "@/domain/sparse-grid";
import type { DesignMetadata, DesignState, Obstacle, Part, Vec3 } from "@/types";
import { routeWarnings } from "@/test/design-invariants";

/**
 * What Auto-Build does across the layouts it actually meets.
 *
 * The routing behaviour falls out of five interacting numbers — the bend
 * penalty, the two plenum penalties, the heuristic weight and the expansion
 * budget — and changing any one of them changes routing everywhere, silently.
 * Every Auto-Build defect found so far was caught by hand-writing a throwaway
 * reproduction for one layout, and twice a regression was only caught because
 * one specific test happened to exist.
 *
 * So this file is deliberately not a set of assertions about one behaviour. It
 * is a table: run the same set of representative layouts and record what comes
 * back. Its job is to make a change to any of those numbers show its full
 * consequences at once, in one diff, rather than one layout at a time.
 *
 * The recorded numbers are a snapshot of current behaviour, not a
 * specification. When one of them changes, decide whether the new value is
 * better before updating it — a moved number here is the question, not the
 * answer.
 *
 * Five rows lost exactly 2 ft when a terminal became 2 ft tall (ADR-0021).
 * Every route that climbs out of both terminals now leaves a foot higher at
 * each end, so it buys a foot less riser twice over — tube the terminal's own
 * second foot has taken over. No row changed its bend count, its band or its
 * warnings, which is what says the taller part moved the endpoints and not the
 * routing.
 *
 * Every 30 ft room row then climbed into its band when the client's "always
 * prefer the plenum when there is one" stopped being a preference the room
 * height could outvote (ADR-0023). They are longer, by the riser twice over,
 * and no row gained a bend. The four rows in the 12 ft room he actually builds
 * in did not move at all.
 *
 * Only the two-floor rows then moved again when the upper floor's band became
 * the only one (ADR-0025). Every one-floor row is untouched by that, which is
 * what says the change is about the building and not about the cost model.
 *
 * No existing row moved when the run band gained an outdoor side (ADR-0028):
 * every layout here is built inside the room, and a band outside the footprint
 * cannot reach them. The two rows that end past the wall are new.
 */

const ROOM: DesignMetadata["room"] = { width: 60, depth: 60, height: 30 };
const ONE_FLOOR = { room: ROOM, multiFloor: false, plenumHeightFeet: 3 };
const TWO_FLOOR = { room: ROOM, multiFloor: true, plenumHeightFeet: 3 };
const NO_PLENUM = { room: ROOM, multiFloor: false, plenumHeightFeet: null };

/** A blower with Terminal 1 on its outlet, and Terminal 2 wherever the case wants it. */
function system(terminalTwo: Vec3, terminalTwoAxis: Vec3 = [0, 1, 0]): Part[] {
  return [
    { id: "b1", type: "blower", cell: [-20, 0, 20], dir: [0, 1, 0] },
    { id: "t1", type: "terminal", cell: [-20, 1, 20], axis: [0, 1, 0] },
    { id: "t2", type: "terminal", cell: terminalTwo, axis: terminalTwoAxis }
  ];
}

/**
 * The room the setup form opens with — 40 x 60 x 12 — and the 2 ft plenum it
 * offers. Every row above works in a 30 ft room, where the band sits too high
 * to be worth reaching and the bias never fires. This is the shape the client
 * actually builds in, and the one where it does.
 */
const LOW_ROOM_PLENUM = { room: DEFAULT_ROOM, multiFloor: false, plenumHeightFeet: 2 };

/** The same system, stood inside the 40 ft width of the default room. */
function lowRoomSystem(terminalTwo: Vec3): Part[] {
  return [
    { id: "b1", type: "blower", cell: [-15, 0, 25], dir: [0, 1, 0] },
    { id: "t1", type: "terminal", cell: [-15, 1, 25], axis: [0, 1, 0] },
    { id: "t2", type: "terminal", cell: terminalTwo, axis: [0, 1, 0] }
  ];
}

type Outcome = {
  routed: boolean;
  bends: number;
  feet: number;
  /** Which run band the horizontal run sat in, or "none". */
  band: string;
  /** Warnings the finished design reports, so a route cannot pass by cheating. */
  warnings: number;
};

/**
 * Which run band a route's horizontal tubes ran in. Reported rather than
 * asserted directly: "did it use the plenum, and which floor's" is the question
 * the client cares about most and the one hardest to see in a length. A room
 * with no plenum has a band too — the ceiling, or the 12 ft ghost ceiling — so
 * "outside" now means outside whichever of the three applies.
 *
 * A run band has two sides since ADR-0028, so a tube is matched against the band
 * for the side of the footprint it is actually on: "outdoor band" is the low
 * height carried outside the building, and distinct from "outside", which still
 * means in no band at all.
 */
function bandUsed(design: DesignState, parts: Part[]): string {
  const { kind, rect, bands } = runBandVolume(design.metadata);
  // Tube endpoints sit at cell centers, so the cell is the point less a half.
  const runs = parts.flatMap((part) =>
    part.type === "tube" && part.from[1] === part.to[1]
      ? [
          {
            level: part.from[1] - 0.5,
            cell: [part.from[0] - 0.5, part.from[1] - 0.5, part.from[2] - 0.5] as Vec3
          }
        ]
      : []
  );
  if (runs.length === 0) return "none";
  const floors = new Set(
    runs.map(({ level, cell }) => {
      const side = inRoomFootprint(rect, cell) ? "inside" : "outside";
      const band = bands.find((b) => b.side === side && level >= b.base && level < b.top);
      if (!band) return "outside";
      return side === "outside" ? "outdoor band" : `${kind} floor ${band.floor}`;
    })
  );
  return [...floors].sort().join(" + ");
}

function run(design: DesignState): Outcome {
  const result = autoBuildOpenPortPair(design);
  if (!result.ok) {
    return { routed: false, bends: 0, feet: 0, band: "none", warnings: 0 };
  }
  return {
    routed: true,
    bends: result.parts.filter((part) => part.type === "bend").length,
    feet: Number(totalPathLength(result.parts).toFixed(2)),
    band: bandUsed(result.design, result.parts),
    warnings: routeWarnings(result.design).length
  };
}

function design(
  parts: Part[],
  metadata: Partial<DesignMetadata> = ONE_FLOOR,
  obstacles: Obstacle[] = []
): DesignState {
  return designFromScene({ parts, obstacles }, metadata);
}

/** The design with one manual tube run out of `sourcePartId`, starting at `cell`. */
function withStub(base: DesignState, sourcePartId: string, cell: Vec3): DesignState {
  const placed = placeTube(base, { id: "manual", cell, sourcePartId });
  if (!placed.ok) throw new Error(placed.message);
  return placed.design;
}

describe("what Auto-Build does, layout by layout", () => {
  it("climbs 27 ft into the plenum to cross a 6 ft gap between two upward ports", () => {
    // Both terminals default to facing up, so the run has to leave one going
    // up and arrive at the other coming down: up, over, and back down again.
    // It used to do that four bends and 31 ft above the floor. Now it does it
    // in the band, 27 ft up, for 73 ft — because the client was asked whether
    // a short run should stay direct and said no: "always prefer the plenum
    // when there is one", with no length below which it stops applying. He was
    // asked the same question about the 6 ft gap two rows down, in the room he
    // actually builds in, and answered "in real life, there would never be a
    // 6 ft run ... just let auto build do a 31 ft daft looking build".
    //
    // So this row is daft on purpose, and it is the row to bring him if the
    // daftness ever matters: it is the price of "always".
    expect(run(design(system([-14, 0, 20]), ONE_FLOOR))).toEqual({
      routed: true,
      bends: 5,
      feet: 72.56,
      band: "plenum floor 1",
      warnings: 0
    });
  });

  it("carries a long run in the plenum of a 30 ft room", () => {
    // The row this file was written to catch. The band sits 27 ft up, and a
    // riser charged by the foot made reaching it cost more than the 40 ft run
    // saved, so the route stayed on the floor — the identical route to
    // switching the plenum off. The riser is now a tie-breaker rather than a
    // cost, so the height of the room no longer votes.
    expect(run(design(system([20, 0, 20]), ONE_FLOOR))).toEqual({
      routed: true,
      bends: 2,
      feet: 85.42,
      band: "plenum floor 1",
      warnings: 0
    });
  });

  it("crosses a room diagonal in an L rather than a staircase", () => {
    // 42 ft longer than it was on the floor, and still three bends: the band
    // preference buys length, never turns.
    expect(run(design(system([20, 0, -20]), ONE_FLOOR))).toEqual({
      routed: true,
      bends: 3,
      feet: 123.14,
      band: "plenum floor 1",
      warnings: 0
    });
  });

  it("runs under a 12 ft ghost ceiling when the tall room has no plenum", () => {
    // The same 30 ft room with the plenum switched off. There is no band to
    // prefer, so the client's fallback applies: "If a system is 100% outside
    // ... default linear run heights to 12 ft" is the neighbouring case; this
    // one is a room too tall for its own ceiling to be worth reaching, and 12
    // ft is where he asked the run to stop. Ten feet more than the floor route
    // it used to build, rather than the 54 ft the real ceiling would cost.
    expect(run(design(system([20, 0, 20]), NO_PLENUM))).toEqual({
      routed: true,
      bends: 2,
      feet: 53.42,
      band: "ghost-ceiling floor 1",
      warnings: 0
    });
  });

  it("carries the run in the upstairs plenum on the way to the upper storey", () => {
    // The row that moved when the upper floor's band became the only one
    // (ADR-0025). It used to cross in the floor 1 plenum at 27 ft and climb to
    // the terminal afterwards; now it rises past the slab first and crosses at
    // 58 ft, which is the "straight up, across upstairs, then down" the client
    // described. Same two bends, and 53 ft more tube — the extra riser, twice.
    expect(run(design(system([20, 31, 20]), TWO_FLOOR))).toEqual({
      routed: true,
      bends: 2,
      feet: 116.42,
      band: "plenum floor 2",
      warnings: 0
    });
  });

  it("climbs to the upstairs plenum even when both ends are downstairs", () => {
    // The half of the client's rule that is easy to miss: the run band follows
    // the building, not the parts. Both terminals stand on floor 1 here and the
    // route still rises past the slab to cross at 58 ft, because "ignore the
    // 1st floor plenum and ceiling" is unconditional in a two-floor building.
    // The same layout on one floor is the 85.42 ft row below.
    expect(run(design(system([20, 0, 20]), TWO_FLOOR))).toEqual({
      routed: true,
      bends: 2,
      feet: 147.42,
      band: "plenum floor 2",
      warnings: 0
    });
  });

  it("drops to the outdoor band on the way out to a terminal past the wall", () => {
    // Terminal 2 stands 15 ft outside the 60 ft room's east wall, so the run is
    // in two parts and each has its own band (ADR-0028): the building's plenum
    // while it is inside the footprint, and the foot below 12 ft once it is out
    // in the open. Before, nothing outside the footprint was credited and the
    // whole run held the indoor height until it was over the terminal.
    expect(run(design(system([45, 0, 20]), ONE_FLOOR))).toEqual({
      routed: true,
      bends: 4,
      feet: 105.85,
      band: "outdoor band + plenum floor 1",
      warnings: 0
    });
  });

  it("takes the upstairs band inside and the outdoor band outside", () => {
    // The client's case for a terminal outside a two-storey building: the
    // outdoor leg at the lower of the 1st floor's ceiling and 12 ft, and the
    // upstairs band from the footprint onward. The same layout as the row
    // above, with the second storey that makes the two heights far apart.
    expect(run(design(system([45, 0, 20]), TWO_FLOOR))).toEqual({
      routed: true,
      bends: 4,
      feet: 167.85,
      band: "outdoor band + plenum floor 2",
      warnings: 0
    });
  });

  it("routes over an impenetrable obstacle rather than around it", () => {
    // The wall is 12 ft tall and the band is 27 ft up, so the detour that used
    // to cost 14 ft of horizontal dogleg now costs nothing: this row and the
    // unobstructed one above it are the same route, to the foot.
    const wall: Obstacle = { id: "o1", min: [0, 0, 14], max: [0, 12, 26] };
    expect(run(design(system([20, 0, 20]), ONE_FLOOR, [wall]))).toEqual({
      routed: true,
      bends: 2,
      feet: 85.42,
      band: "plenum floor 1",
      warnings: 0
    });
  });

  it("completes a system with a manual stub on the blower side", () => {
    const base = design(system([20, 0, 20]), ONE_FLOOR);
    expect(run(withStub(base, "t1", [-20, 2, 20]))).toEqual({
      routed: true,
      bends: 2,
      feet: 79.42,
      band: "plenum floor 1",
      warnings: 0
    });
  });

  it("crosses the same diagonal in an L when the plenum is reachable", () => {
    // The row above works in a 30 ft room, where the band sits too high to be
    // worth reaching and the route never enters it. This one drops the ceiling
    // to 12 ft so the band IS used, which is the case the client works in and
    // the one nothing here covered: it answered a diagonal with a twelve-bend
    // staircase through the plenum, and 84.55 ft. The estimate over-charged
    // horizontal travel inside the band, so turning looked like progress.
    //
    // Three bends now, for 10 ft more tube than the staircase spent. That is
    // the trade the client asked for in as many words: "the goal of auto-build
    // is to build with the fewest BENDS in a system, not shortest total length."
    expect(run(design(lowRoomSystem([15, 0, -25]), LOW_ROOM_PLENUM))).toEqual({
      routed: true,
      bends: 3,
      feet: 89.14,
      band: "plenum floor 1",
      warnings: 0
    });
  });

  it("carries a long run in the plenum of a 12 ft room", () => {
    // The room the client tests in, and the reason to read this file as a
    // whole: every figure in it moved when the run band became a rule rather
    // than a preference, and this one did not move at all. What he has already
    // approved at 12 ft is what he will still see.
    expect(run(design(lowRoomSystem([15, 0, 25]), LOW_ROOM_PLENUM))).toEqual({
      routed: true,
      bends: 2,
      feet: 41.42,
      band: "plenum floor 1",
      warnings: 0
    });
  });

  it("still takes five bends to cross a 6 ft gap when a plenum is in reach", () => {
    // The daft short hop, in the room the setup form actually opens with: the
    // run climbs into the band and comes back down for a 6 ft gap. The client
    // was asked and chose to leave it alone — "in real life, there would never
    // be a 6 ft run ... just let auto build do a 31 ft daft looking build" —
    // so this row exists to stop someone quietly optimising it away.
    expect(run(design(lowRoomSystem([-9, 0, 25]), LOW_ROOM_PLENUM))).toEqual({
      routed: true,
      bends: 5,
      feet: 38.56,
      band: "plenum floor 1",
      warnings: 0
    });
  });

  it("completes a system with a manual stub on the far side", () => {
    // This row recorded a failure until the pool started excluding ports that
    // point nowhere. Terminal 2 stands on the floor facing up, so its other
    // port aimed down into Y = -1; that port was nearer the blower side than
    // the stub's real open end, so it won the pairing, routed nowhere, and took
    // the pairing that would have worked down with it. 734 ms of futile search
    // became 12 ms and a route.
    const base = design(system([20, 0, 20]), ONE_FLOOR);
    expect(run(withStub(base, "t2", [20, 1, 20]))).toEqual({
      routed: true,
      bends: 2,
      feet: 79.42,
      band: "plenum floor 1",
      warnings: 0
    });
  });
});
