import { describe, expect, it } from "vitest";
import { emptyDesign } from "@/domain/design-state";
import { partRegistry } from "@/domain/part-registry";
import { computeTopology } from "@/domain/topology";
import {
  BEND_BLOCKED_MESSAGE,
  BEND_PLACEMENT_MESSAGE,
  bendFootprint,
  bendLandingCells,
  bendPlacementGhost,
  placeBend,
  validBendOrientations
} from "@/domain/bend-placement";
import type { Vec3 } from "@/types";

function designWithBlower(dir: Vec3 = [1, 0, 0], cell: Vec3 = [0, 0, 0]) {
  const design = emptyDesign();
  design.parts = [{ id: "b1", type: "blower", cell, dir }];
  design.grid.place(cell, "b1");
  return design;
}

function cellKey(cell: Vec3): string {
  return cell.join(",");
}

function uniqueNonEntryCell(
  orientation: { cells: Vec3[] },
  others: Array<{ cells: Vec3[] }>
): Vec3 {
  const otherCells = new Set(others.flatMap((other) => other.cells.map(cellKey)));
  const cell = orientation.cells.find(
    (candidate) => cellKey(candidate) !== "1,0,0" && !otherCells.has(cellKey(candidate))
  );
  if (!cell) throw new Error("expected bend orientation to include a unique non-entry cell");
  return cell;
}

describe("90 degree bend snap placement", () => {
  it("enumerates valid bend orientations around an open port direction", () => {
    // Elevated so the downward exit has headroom above the ground plane.
    const design = designWithBlower([1, 0, 0], [0, 5, 0]);

    const orientations = validBendOrientations(design, [1, 5, 0]);

    expect(orientations.map((o) => o.outDir.join(","))).toEqual(
      expect.arrayContaining(["0,0,1", "0,0,-1", "0,1,0", "0,-1,0"])
    );
    expect(orientations).toHaveLength(4);
    expect(orientations.every((o) => o.inDir.join(",") === "1,0,0")).toBe(true);
    expect(bendLandingCells(design)).toEqual([[1, 5, 0]]);
  });

  it("includes vertical bend exits for horizontal entries", () => {
    // Elevated so the downward exit has headroom above the ground plane.
    const design = designWithBlower([1, 0, 0], [0, 5, 0]);

    const orientations = validBendOrientations(design, [1, 5, 0]);
    const verticalOutDirs = orientations
      .filter((o) => o.outDir[1] !== 0)
      .map((o) => o.outDir.join(","))
      .sort();

    expect(verticalOutDirs).toEqual(["0,-1,0", "0,1,0"]);
    const upBend = orientations.find((o) => o.outDir[1] === 1);
    expect(upBend).toBeDefined();
    if (!upBend) return;
    expect(upBend.exit[1]).toBeGreaterThan(0);
  });

  it("cycles through only orientations whose footprint is unoccupied", () => {
    const design = designWithBlower([1, 0, 0]);
    const all = validBendOrientations(design, [1, 0, 0]);
    for (const orientation of all) {
      if (orientation.outDir.join(",") === "0,0,-1") continue;
      const blocker = uniqueNonEntryCell(
        orientation,
        all.filter(
          (candidate) => candidate !== orientation && candidate.outDir.join(",") === "0,0,-1"
        )
      );
      if (!design.grid.query(blocker)) {
        design.grid.place(blocker, `blocker-${orientation.outDir.join(",")}`);
      }
    }

    const orientations = validBendOrientations(design, [1, 0, 0]);

    expect(orientations).toHaveLength(1);
    expect(orientations[0].outDir).toEqual([0, 0, -1]);
    const ghost = bendPlacementGhost(design, [1, 0, 0], { rotationIndex: 99 });
    expect(ghost?.type).toBe("bend");
    if (ghost?.type !== "bend") return;
    expect(ghost.outDir).toEqual([0, 0, -1]);
  });

  it("rejects bend preview and commit when all candidate footprints collide", () => {
    const design = designWithBlower([1, 0, 0]);
    const orientations = validBendOrientations(design, [1, 0, 0]);
    for (const orientation of orientations) {
      const blocker = uniqueNonEntryCell(
        orientation,
        orientations.filter((candidate) => candidate !== orientation)
      );
      if (!design.grid.query(blocker)) {
        design.grid.place(blocker, `obstacle-${orientation.outDir.join(",")}`);
      }
    }

    expect(validBendOrientations(design, [1, 0, 0])).toEqual([]);
    expect(bendPlacementGhost(design, [1, 0, 0])).toBeNull();
    expect(placeBend(design, { id: "bn1", cell: [1, 0, 0] })).toEqual({
      ok: false,
      message: BEND_BLOCKED_MESSAGE
    });
  });

  it("rejects non-landing cells with the PRD corrective message", () => {
    const design = designWithBlower([1, 0, 0]);

    expect(bendPlacementGhost(design, [3, 0, 0])).toBeNull();
    expect(placeBend(design, { id: "bn1", cell: [3, 0, 0] })).toEqual({
      ok: false,
      message: BEND_PLACEMENT_MESSAGE
    });
  });

  it("commits the full precomputed footprint and registers the bend exit port", () => {
    const design = designWithBlower([1, 0, 0]);

    const result = placeBend(design, { id: "bn1", cell: [1, 0, 0] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const expectedFootprint = bendFootprint(result.part, partRegistry);
    expect(expectedFootprint.length).toBeGreaterThan(1);
    for (const cell of expectedFootprint) {
      expect(result.design.grid.query(cell)).toBe("bn1");
    }
    const exitCell = [
      Math.floor(result.part.exit[0]),
      Math.floor(result.part.exit[1]),
      Math.floor(result.part.exit[2])
    ] as [number, number, number];
    expect(result.design.grid.query(exitCell)).toBe("bn1");

    const openPorts = computeTopology(result.design).openPorts();
    expect(openPorts).toMatchObject([{ partId: "bn1", index: 1, cell: [4, 0, 4], dir: [0, 0, 1] }]);
  });
});
