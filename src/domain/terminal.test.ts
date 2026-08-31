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
    expect(terminalCells([4, 0, 6], [0, 1, 0])).toEqual([
      [4, 0, 6],
      [4, 1, 6]
    ]);
    expect(partCells(terminal([4, 0, 6], [0, 1, 0]))).toEqual([
      [4, 0, 6],
      [4, 1, 6]
    ]);
  });

  it("stands in the cell above it whichever way it points vertically", () => {
    // A terminal taking its delivery from below is the same box as one taking
    // it from above, standing in the same two cells. Only which end the run
    // leaves from differs.
    expect(partCells(terminal([4, 3, 6], [0, -1, 0]))).toEqual([
      [4, 3, 6],
      [4, 4, 6]
    ]);
  });

  it("stands up rather than claiming its own cell twice on a malformed axis", () => {
    // Nothing the app places produces one, but a stored design's axis is only
    // checked for three numbers, and two identical cells is a grid conflict.
    expect(partCells(terminal([4, 3, 6], [0, 0, 0]))).toEqual([
      [4, 3, 6],
      [4, 4, 6]
    ]);
  });

  it("agrees with the count the catalog declares", () => {
    // The field is load bearing — free placement checks its footprint against
    // it — so a catalog edit that disagreed would be caught rather than
    // quietly believed.
    expect(partRegistry.get("terminal").cells).toBe(terminalCells([0, 0, 0], [0, 1, 0]).length);
  });

  it("leaves an upward port from the top of the body, not the middle of it", () => {
    // The cell above the terminal is the terminal, so a port measured from the
    // base would open inside the unit: nothing could ever be placed there.
    const up: Vec3 = [0, 1, 0];
    expect(terminalPortAnchor([4, 0, 6], [0, 1, 0], up)).toEqual([4, 1, 6]);
    expect(terminalPortAnchor([4, 0, 6], [0, -1, 0], up)).toEqual([4, 0, 6]);

    const ports = computePartPorts(terminal([4, 0, 6], up));
    expect(ports.map((port) => port.cell)).toEqual([
      [4, 2, 6],
      [4, -1, 6]
    ]);
    for (const port of ports) {
      expect(terminalCells([4, 0, 6], up)).not.toContainEqual(port.cell);
    }
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

describe("a terminal turned on its side lies down", () => {
  it("takes two squares of floor and one of height", () => {
    // The client, 2026-08-31: R turns the whole unit, not just its ports. A
    // 2 ft body laid down is 2 ft of floor, and both squares are claimed for
    // the same reason both feet of a standing one are — see ADR-0027.
    expect(partCells(terminal([4, 3, 6], [1, 0, 0]))).toEqual([
      [4, 3, 6],
      [5, 3, 6]
    ]);
    expect(partCells(terminal([4, 3, 6], [0, 0, 1]))).toEqual([
      [4, 3, 6],
      [4, 3, 7]
    ]);
  });

  it("lies in the same two cells turned end for end", () => {
    // The same box on the floor either way round: pointing it backwards turns
    // the unit, it does not move it into the cell behind.
    expect(partCells(terminal([4, 3, 6], [-1, 0, 0]))).toEqual([
      [4, 3, 6],
      [5, 3, 6]
    ]);
  });

  it("leaves each port from its own end of the body", () => {
    // Both ends of a lying terminal are 2 ft apart, so the far port opens
    // beyond the second square rather than out of the first one — which is a
    // square the terminal itself is standing in.
    const ports = computePartPorts(terminal([4, 0, 6], [1, 0, 0]));
    expect(ports.map((port) => port.cell)).toEqual([
      [6, 0, 6],
      [3, 0, 6]
    ]);
    for (const port of ports) {
      expect(terminalCells([4, 0, 6], [1, 0, 0])).not.toContainEqual(port.cell);
    }
  });

  it("mates with a tube running into the end it faces", () => {
    // The lying-down counterpart of the standing case above: the run leaves the
    // far end of the body, two feet along, rather than the cell it was placed
    // in — and the grid holds both squares it lies across.
    const design = designFromScene({
      parts: [
        terminal([0, 0, 0], [1, 0, 0]),
        { id: "u1", type: "tube", from: [2, 0, 0], to: [7, 0, 0] }
      ],
      obstacles: []
    });
    expectGridMatchesDesign(design);
    expect(design.grid.query([1, 0, 0])).toBe("t1");
    expect(
      computeTopology(design)
        .openPorts()
        .map((port) => port.cell)
    ).toEqual([
      [-1, 0, 0],
      [7, 0, 0]
    ]);
  });
});
