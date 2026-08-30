import { describe, expect, it } from "vitest";
import { designFromScene } from "@/domain/design-state";
import { partCells } from "@/domain/occupant-footprints";
import { partRegistry } from "@/domain/part-registry";
import { terminalCells, terminalPortAnchor } from "@/domain/terminal";
import { computePartPorts, computeTopology } from "@/domain/topology";
import type { TerminalPart, Vec3 } from "@/types";
import { expectGridMatchesDesign } from "@/test/design-invariants";

function terminal(cell: Vec3, axis: Vec3): TerminalPart {
  return { id: "t1", type: "terminal", cell, axis };
}

describe("a terminal is two feet tall", () => {
  it("claims the cell it stands in and the one above it", () => {
    expect(terminalCells([4, 0, 6])).toEqual([
      [4, 0, 6],
      [4, 1, 6]
    ]);
    expect(partCells(terminal([4, 0, 6], [0, 1, 0]))).toEqual([
      [4, 0, 6],
      [4, 1, 6]
    ]);
  });

  it("stands upright whichever way its ports face", () => {
    // 1 ft of floor, 2 ft of height, as the client put it: the footprint is
    // one square however the unit is turned.
    for (const axis of [
      [0, 1, 0],
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, -1]
    ] as Vec3[]) {
      expect(partCells(terminal([4, 3, 6], axis))).toEqual([
        [4, 3, 6],
        [4, 4, 6]
      ]);
    }
  });

  it("agrees with the count the catalog declares", () => {
    // The field is load bearing — free placement checks its footprint against
    // it — so a catalog edit that disagreed would be caught rather than
    // quietly believed.
    expect(partRegistry.get("terminal").cells).toBe(terminalCells([0, 0, 0]).length);
  });

  it("leaves an upward port from the top of the body, not the middle of it", () => {
    // The cell above the terminal is the terminal, so a port measured from the
    // base would open inside the unit: nothing could ever be placed there.
    expect(terminalPortAnchor([4, 0, 6], [0, 1, 0])).toEqual([4, 1, 6]);
    expect(terminalPortAnchor([4, 0, 6], [0, -1, 0])).toEqual([4, 0, 6]);
    expect(terminalPortAnchor([4, 0, 6], [1, 0, 0])).toEqual([4, 0, 6]);

    const ports = computePartPorts(terminal([4, 0, 6], [0, 1, 0]));
    expect(ports.map((port) => port.cell)).toEqual([
      [4, 2, 6],
      [4, -1, 6]
    ]);
    for (const port of ports) {
      expect(terminalCells([4, 0, 6])).not.toContainEqual(port.cell);
    }
  });

  it("keeps a horizontal port on the foot it always sat on", () => {
    // Nothing about a taller body moves these, which is what lets a design
    // built before the change keep the connections it had.
    const ports = computePartPorts(terminal([4, 0, 6], [0, 0, 1]));
    expect(ports.map((port) => port.cell)).toEqual([
      [4, 0, 7],
      [4, 0, 5]
    ]);
  });

  it("mates with a blower under it and a tube above it", () => {
    // The two ends of the commonest arrangement there is: a blower blowing up
    // into a terminal, and the run leaving the top of the terminal. Both joins
    // have to survive the body growing a foot.
    const design = designFromScene({
      parts: [
        { id: "b1", type: "blower", cell: [0, 0, 0], dir: [0, 1, 0] },
        terminal([0, 1, 0], [0, 1, 0]),
        { id: "u1", type: "tube", from: [0, 3, 0], to: [0, 9, 0] }
      ],
      obstacles: []
    });
    expectGridMatchesDesign(design);
    expect(design.grid.query([0, 2, 0])).toBe("t1");
    // Only the far end of the tube is left dangling: both of the terminal's
    // ports found their neighbour.
    expect(
      computeTopology(design)
        .openPorts()
        .map((port) => port.cell)
    ).toEqual([[0, 9, 0]]);
  });
});
