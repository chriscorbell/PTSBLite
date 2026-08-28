import { describe, expect, it } from "vitest";
import { designFromScene } from "@/domain/design-state";
import { plenumBands } from "@/domain/floors";
import { autoBuildOpenPortPair } from "@/domain/pathfinder";
import { placeTube } from "@/domain/tube-placement";
import { totalPathLength } from "@/domain/parts";
import { validate } from "@/domain/validation";
import type { DesignMetadata, DesignState, Obstacle, Part, Vec3 } from "@/types";

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

type Outcome = {
  routed: boolean;
  bends: number;
  feet: number;
  /** Which plenum band the horizontal run sat in, or "none". */
  band: string;
  /** Warnings the finished design reports, so a route cannot pass by cheating. */
  warnings: number;
};

/**
 * Which plenum band a route's horizontal tubes ran in. Reported rather than
 * asserted directly: "did it use the plenum, and which floor's" is the question
 * the client cares about most and the one hardest to see in a length.
 */
function bandUsed(design: DesignState, parts: Part[]): string {
  const bands = plenumBands(design.metadata);
  const levels = parts.flatMap((part) =>
    part.type === "tube" && part.from[1] === part.to[1] ? [part.from[1] - 0.5] : []
  );
  if (levels.length === 0) return "none";
  const floors = new Set(
    levels.map((level) => {
      const band = bands.find((b) => level >= b.base && level < b.top);
      return band ? `floor ${band.floor}` : "outside";
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
    warnings: validate(result.design).length
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
  it("takes four bends to cross a 6 ft gap between two upward ports", () => {
    // Both terminals default to facing up, so the run has to leave one going
    // up and arrive at the other coming down: up, over, and back down again.
    // Four bends and 31 ft to span 6 ft is the honest cost of that, but it is
    // also the layout a visitor gets by accepting every default, so it is
    // worth watching.
    expect(run(design(system([-14, 0, 20]), ONE_FLOOR))).toEqual({
      routed: true,
      bends: 4,
      feet: 30.85,
      band: "outside",
      warnings: 0
    });
  });

  it("does NOT carry a long run in the plenum of a 30 ft room", () => {
    // Worth staring at. The bias works in an 8 ft room, where reaching the band
    // costs a 4 ft climb — that is what `pathfinder.test.ts` exercises. Here the
    // band sits 27 ft up and the climb is never repaid, so a 40 ft run stays on
    // the floor. The client praised Auto-Build for obeying the plenum, so
    // either he was working in a shallow room or he has not hit this yet.
    expect(run(design(system([20, 0, 20]), ONE_FLOOR))).toEqual({
      routed: true,
      bends: 2,
      feet: 43.42,
      band: "outside",
      warnings: 0
    });
  });

  it("crosses a room diagonal in an L rather than a staircase", () => {
    expect(run(design(system([20, 0, -20]), ONE_FLOOR))).toEqual({
      routed: true,
      bends: 3,
      feet: 81.14,
      band: "outside",
      warnings: 0
    });
  });

  it("routes the same run identically when there is no plenum to prefer", () => {
    // Identical to the row above it, which is the evidence that the bias is
    // doing nothing at this room height rather than doing something small.
    expect(run(design(system([20, 0, 20]), NO_PLENUM))).toEqual({
      routed: true,
      bends: 2,
      feet: 43.42,
      band: "outside",
      warnings: 0
    });
  });

  it("uses the plenum on the way to the upper storey", () => {
    // Here the climb is on the way regardless, so riding the band costs
    // nothing extra and the bias finally shows.
    expect(run(design(system([20, 31, 20]), TWO_FLOOR))).toEqual({
      routed: true,
      bends: 2,
      feet: 64.42,
      band: "floor 1",
      warnings: 0
    });
  });

  it("routes around an impenetrable obstacle in the way", () => {
    const wall: Obstacle = { id: "o1", min: [0, 0, 14], max: [0, 12, 26] };
    expect(run(design(system([20, 0, 20]), ONE_FLOOR, [wall]))).toEqual({
      routed: true,
      bends: 2,
      feet: 59.42,
      band: "outside",
      warnings: 0
    });
  });

  it("completes a system with a manual stub on the blower side", () => {
    const base = design(system([20, 0, 20]), ONE_FLOOR);
    expect(run(withStub(base, "t1", [-20, 2, 20]))).toEqual({
      routed: true,
      bends: 2,
      feet: 49.42,
      band: "outside",
      warnings: 0
    });
  });

  it("gives up on a manual stub on the far side, 40 ft from the blower", () => {
    // A live bug, recorded rather than asserted as correct. The pairing is now
    // right — the stub is not joined back into its own terminal — but the
    // search still exhausts its expansion budget between two upward-facing
    // ports 40 ft apart and reports that it gave up. Same class of failure as
    // the one the heuristic fix addressed, so the heuristic is still not
    // guiding well enough in every geometry.
    const base = design(system([20, 0, 20]), ONE_FLOOR);
    expect(run(withStub(base, "t2", [20, 1, 20]))).toEqual({
      routed: false,
      bends: 0,
      feet: 0,
      band: "none",
      warnings: 0
    });
  });
});
