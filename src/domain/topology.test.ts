import { describe, expect, it } from "vitest";
import { emptyDesign } from "@/domain/design-state";
import { Topology, computePartPorts, computeTopology, type Port } from "@/domain/topology";
import type { Vec3 } from "@/types";

function portCells(ports: Port[]): Vec3[] {
  return ports.map((p) => p.cell);
}

describe("Topology port computation", () => {
  it("computes blower outlet ports under horizontal and vertical orientations", () => {
    const cases: Array<[Vec3, Vec3]> = [
      [
        [1, 0, 0],
        [11, 0, 10]
      ],
      [
        [0, 0, 1],
        [10, 0, 11]
      ],
      [
        [-1, 0, 0],
        [9, 0, 10]
      ],
      [
        [0, 0, -1],
        [10, 0, 9]
      ],
      [
        [0, 1, 0],
        [10, 1, 10]
      ],
      [
        [0, -1, 0],
        [10, -1, 10]
      ]
    ];

    for (const [dir, expectedCell] of cases) {
      expect(
        computePartPorts({ id: `b-${dir.join(",")}`, type: "blower", cell: [10, 0, 10], dir })
      ).toMatchObject([{ ownerType: "blower", from: [10, 0, 10], cell: expectedCell, dir }]);
    }
  });

  it("computes terminal ports on both sides of its oriented axis", () => {
    const cases: Array<[Vec3, Vec3[]]> = [
      [
        [1, 0, 0],
        [
          [6, 0, 5],
          [4, 0, 5]
        ]
      ],
      [
        [0, 0, 1],
        [
          [5, 0, 6],
          [5, 0, 4]
        ]
      ],
      [
        [-1, 0, 0],
        [
          [4, 0, 5],
          [6, 0, 5]
        ]
      ],
      [
        [0, 0, -1],
        [
          [5, 0, 4],
          [5, 0, 6]
        ]
      ],
      [
        [0, 1, 0],
        [
          [5, 1, 5],
          [5, -1, 5]
        ]
      ],
      [
        [0, -1, 0],
        [
          [5, -1, 5],
          [5, 1, 5]
        ]
      ]
    ];

    for (const [axis, expectedCells] of cases) {
      const ports = computePartPorts({
        id: `t-${axis.join(",")}`,
        type: "terminal",
        cell: [5, 0, 5],
        axis
      });
      expect(portCells(ports)).toEqual(expectedCells);
      expect(ports).toHaveLength(2);
    }
  });

  it("computes straight tube ports from its start and far end cells", () => {
    expect(
      computePartPorts({ id: "st1", type: "tube", from: [2, 0.5, 3], to: [8, 0.5, 3] })
    ).toMatchObject([
      { ownerType: "tube", from: [2, 0, 3], cell: [1, 0, 3], dir: [-1, 0, 0] },
      { ownerType: "tube", from: [7, 0, 3], cell: [8, 0, 3], dir: [1, 0, 0] }
    ]);
  });

  it("computes bend exit ports from the bend exit cell to the next landing cell", () => {
    expect(
      computePartPorts({
        id: "bn1",
        type: "bend",
        entry: [1.5, 0.5, 0.5],
        exit: [4.5, 0.5, 3.5],
        center: [1.5, 0.5, 3.5],
        inDir: [1, 0, 0],
        outDir: [0, 0, 1],
        radius: 3
      })
    ).toMatchObject([
      { ownerType: "bend", from: [1, 0, 0], cell: [0, 0, 0], dir: [-1, 0, 0] },
      { ownerType: "bend", from: [4, 0, 3], cell: [4, 0, 4], dir: [0, 0, 1] }
    ]);
  });
});

describe("Topology open and connected ports", () => {
  it("reports open ports near a hover cell", () => {
    const design = emptyDesign();
    design.parts = [
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "t2", type: "terminal", cell: [10, 0, 0], axis: [1, 0, 0] }
    ];

    const topology = computeTopology(design);

    expect(topology.openPortsNear([1, 0, 0]).map((p) => p.partId)).toEqual(["b1"]);
    expect(topology.openPortsNear([9, 0, 0]).map((p) => p.partId)).toEqual(["t2"]);
    expect(topology.openPortsNear([5, 0, 0])).toEqual([]);
  });

  it("marks adjacent reciprocal ports as connected", () => {
    const design = emptyDesign();
    design.parts = [
      { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
      { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] }
    ];

    const topology = computeTopology(design);

    expect(topology.openPorts().map((p) => `${p.partId}:${p.index}`)).toEqual(["t1:0"]);
    expect(topology.openPortsNear([1, 0, 0])).toEqual([]);
  });
});
