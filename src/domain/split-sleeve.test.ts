import { describe, expect, it } from "vitest";
import { designFromScene, emptyDesign } from "@/domain/design-state";
import { computePartPorts } from "@/domain/topology";
import {
  SPLIT_SLEEVE_SPACING_FEET,
  splitSleeveCount,
  splitSleeves,
  type SplitSleeve
} from "@/domain/split-sleeve";
import type { Part, Vec3 } from "@/types";

const at = (s: SplitSleeve): string => s.at.join(",");
const positions = (parts: Part[]): string[] => splitSleeves(parts).map(at).sort();

/** Blower, terminal seated against it, six feet of tube, a bend, and tube out. */
const run: Part[] = [
  { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
  { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
  { id: "st1", type: "tube", from: [2.5, 0.5, 0.5], to: [8.5, 0.5, 0.5] },
  {
    id: "bn1",
    type: "bend",
    entry: [8.5, 0.5, 0.5],
    exit: [11.5, 0.5, 3.5],
    center: [11.5, 0.5, 0.5],
    inDir: [1, 0, 0],
    outDir: [0, 0, 1],
    radius: 3
  },
  { id: "st2", type: "tube", from: [11.5, 0.5, 4.5], to: [11.5, 0.5, 8.5] }
];

describe("split sleeve derivation", () => {
  it("puts a sleeve on the face between two mated parts", () => {
    expect(positions([run[0], run[1]])).toEqual(["1,0.5,0.5"]);
  });

  it("counts a joint once, not once per port", () => {
    // Both sides of a joint compute the same face. Without the dedupe every
    // count in the BOM would come out doubled.
    expect(splitSleeveCount([run[0], run[1]])).toBe(1);
  });

  it("gives each of the client's cases a sleeve", () => {
    // One between the blower and the terminal, one immediately after the
    // terminal, and one on each end of the bend — none of them special-cased.
    expect(positions(run)).toEqual(["1,0.5,0.5", "11.5,0.5,4", "2,0.5,0.5", "8,0.5,0.5"].sort());
  });

  it("leaves an open end alone: a sleeve joins two pieces", () => {
    const lonely: Part[] = [{ id: "st", type: "tube", from: [0.5, 0.5, 0.5], to: [4.5, 0.5, 0.5] }];
    expect(splitSleeves(lonely)).toEqual([]);
  });

  it("adds a sleeve every 6 ft inside a tube longer than stock", () => {
    const long: Part[] = [{ id: "st", type: "tube", from: [0.5, 0.5, 0.5], to: [14.5, 0.5, 0.5] }];
    // Both ends are open, so only the interior ones: 6 ft and 12 ft along.
    expect(positions(long)).toEqual(["12,0.5,0.5", "6,0.5,0.5"].sort());
  });

  it("leaves a tube of exactly one stock length with no interior sleeve", () => {
    const six: Part[] = [{ id: "st", type: "tube", from: [0.5, 0.5, 0.5], to: [6.5, 0.5, 0.5] }];
    expect(splitSleeves(six)).toEqual([]);
  });

  it("puts the remainder at the far end, as the client asked", () => {
    // Nick, 2026-08-26, on seven feet of tube between two pieces: "one end look
    // normal and the other end just has two couplings 1 grid unit (foot) apart.
    // This wouldn't happen in real life but I knew this question might come up."
    const seven: Part[] = [
      { id: "st", type: "tube", from: [0.5, 0.5, 0.5], to: [7.5, 0.5, 0.5] },
      { id: "b1", type: "blower", cell: [-1, 0, 0], dir: [1, 0, 0] },
      { id: "b2", type: "blower", cell: [7, 0, 0], dir: [-1, 0, 0] }
    ];
    expect(positions(seven)).toEqual(["0,0.5,0.5", "6,0.5,0.5", "7,0.5,0.5"]);
  });

  it("turns a sleeve onto its run, whichever side the joint is read from", () => {
    expect(splitSleeves([run[0], run[1]])[0].along).toEqual([1, 0, 0]);
    // The same joint built facing the other way is the same sleeve, turned the
    // same way: a collar looks identical from either end.
    const mirrored: Part[] = [
      { id: "b1", type: "blower", cell: [1, 0, 0], dir: [-1, 0, 0] },
      { id: "t1", type: "terminal", cell: [0, 0, 0], axis: [-1, 0, 0] }
    ];
    expect(splitSleeves(mirrored)[0].at).toEqual([1, 0.5, 0.5]);
    expect(splitSleeves(mirrored)[0].along).toEqual([1, 0, 0]);
  });

  it("finds a vertical joint as readily as a horizontal one", () => {
    const upright: Part[] = [
      { id: "t1", type: "terminal", cell: [0, 0, 0], axis: [0, 1, 0] },
      { id: "st", type: "tube", from: [0.5, 2.5, 0.5], to: [0.5, 6.5, 0.5] }
    ];
    // A terminal is 2 ft tall, so its upward port leaves the top of the body.
    expect(positions(upright)).toEqual(["0.5,2,0.5"]);
    expect(splitSleeves(upright)[0].along).toEqual([0, 1, 0]);
  });

  it("accepts a DesignState as readily as a parts list", () => {
    const design = designFromScene({ parts: run, obstacles: [] });
    expect(splitSleeveCount(design)).toBe(splitSleeveCount(run));
    expect(splitSleeveCount(emptyDesign())).toBe(0);
  });

  it("never leaves more than 6 ft between neighbouring sleeves on a run", () => {
    // The one hard rule the client gave: "it just has to show no more than 6 ft
    // between couplings." Measured along each part rather than through the air,
    // so the bend is judged on its 5.71 ft path and not its 4.95 ft chord.
    const sleeved = new Set(splitSleeves(run).map(at));
    for (const part of run) {
      for (const gap of sleeveGapsAlong(part, sleeved)) {
        expect(gap).toBeLessThanOrEqual(SPLIT_SLEEVE_SPACING_FEET + 1e-6);
      }
    }
    // And that the run was sleeved at all, rather than passing by having none.
    expect(sleeved.size).toBe(4);
  });
});

/**
 * The distances between consecutive sleeves sitting on one part, measured along
 * that part's own centerline.
 *
 * A tube is walked a foot at a time, so an interior sleeve is seen where it
 * really is. Anything else has sleeves only at its two ends, so there is at
 * most one gap: the path through the piece, which for a bend is its arc plus
 * the half-foot stub at each end.
 */
function sleeveGapsAlong(part: Part, sleeved: Set<string>): number[] {
  const ends = computePartPorts(part).map((port): Vec3 => [
    port.from[0] + 0.5 + port.dir[0] * 0.5,
    port.from[1] + 0.5 + port.dir[1] * 0.5,
    port.from[2] + 0.5 + port.dir[2] * 0.5
  ]);
  if (part.type !== "tube") {
    if (ends.length < 2 || ends.some((end) => !sleeved.has(end.join(",")))) return [];
    return [
      part.type === "bend" ? 1 + (Math.PI * (part.radius ?? 3)) / 2 : distance(ends[0], ends[1])
    ];
  }
  const [first, last] = ends;
  const feet = Math.round(distance(first, last));
  const along: number[] = [];
  for (let i = 0; i <= feet; i++) {
    const point: Vec3 = [
      first[0] + ((last[0] - first[0]) * i) / feet,
      first[1] + ((last[1] - first[1]) * i) / feet,
      first[2] + ((last[2] - first[2]) * i) / feet
    ];
    if (sleeved.has(point.join(","))) along.push(i);
  }
  return along.slice(1).map((foot, i) => foot - along[i]);
}

function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
