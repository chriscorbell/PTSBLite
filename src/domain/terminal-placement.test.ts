import { describe, expect, it } from "vitest";
import { emptyDesign } from "@/domain/design-state";
import { DEFAULT_FREE_PLACEMENT_MEMORY } from "@/domain/free-placement";
import {
  placeTerminal,
  terminalLandingCells,
  terminalPlacementGhost,
  terminalOneLanding,
  terminalPlacementMode
} from "@/domain/terminal-placement";
import type { BlowerPart, Vec3 } from "@/types";

function designWithBlower(dir: Vec3) {
  const design = emptyDesign();
  const blower: BlowerPart = { id: `b-${dir.join(",")}`, type: "blower", cell: [10, 0, 10], dir };
  design.parts = [blower];
  design.grid.place(blower.cell, blower.id);
  return design;
}

describe("Terminal 1 inline placement", () => {
  it("computes the blower outlet landing cell and inline orientation under horizontal and vertical blower orientations", () => {
    const cases: Array<{ dir: Vec3; cell: Vec3 }> = [
      { dir: [1, 0, 0], cell: [11, 0, 10] },
      { dir: [0, 0, 1], cell: [10, 0, 11] },
      { dir: [-1, 0, 0], cell: [9, 0, 10] },
      { dir: [0, 0, -1], cell: [10, 0, 9] },
      { dir: [0, 1, 0], cell: [10, 1, 10] },
      { dir: [0, -1, 0], cell: [10, -1, 10] }
    ];

    for (const { dir, cell } of cases) {
      expect(terminalOneLanding(designWithBlower(dir))).toEqual({ cell, axis: dir });
    }
  });

  it("flips from Terminal 1 inline mode to Terminal 2 free-placement mode once T1 exists", () => {
    const design = designWithBlower([1, 0, 0]);

    expect(terminalPlacementMode(design)).toEqual({
      kind: "terminal-1",
      landing: { cell: [11, 0, 10], axis: [1, 0, 0] }
    });

    design.parts.push({ id: "t1", type: "terminal", cell: [11, 0, 10], axis: [1, 0, 0] });
    design.grid.place([11, 0, 10], "t1");

    expect(terminalPlacementMode(design)).toEqual({ kind: "terminal-2" });
  });

  it("shows the Terminal 1 ghost only on the blower outlet landing cell with locked inline orientation", () => {
    const design = designWithBlower([0, 0, 1]);

    expect(
      terminalPlacementGhost({
        design,
        cell: [10, 0, 12],
        memory: DEFAULT_FREE_PLACEMENT_MEMORY,
        rotationSteps: 1
      })
    ).toBeNull();

    expect(
      terminalPlacementGhost({
        design,
        cell: [10, 0, 11],
        memory: DEFAULT_FREE_PLACEMENT_MEMORY,
        rotationSteps: 1
      })
    ).toEqual({ type: "terminal", cell: [10, 0, 11], axis: [0, 0, 1] });
  });

  it("highlights only the valid Terminal 1 landing cell while it remains available", () => {
    const design = designWithBlower([-1, 0, 0]);

    expect(terminalLandingCells(design)).toEqual([[9, 0, 10]]);

    design.grid.place([9, 0, 10], "blocker");

    expect(terminalLandingCells(design)).toEqual([]);
  });

  it("rejects Terminal 1 clicks outside the highlighted blower-outlet landing cell", () => {
    expect(
      placeTerminal(designWithBlower([1, 0, 0]), {
        id: "t1",
        cell: [12, 0, 10],
        memory: DEFAULT_FREE_PLACEMENT_MEMORY,
        rotationSteps: 0
      })
    ).toEqual({
      ok: false,
      message: "Place Terminal 1 on the highlighted blower-outlet cell."
    });
  });

  it("uses Terminal 2 free-placement after Terminal 1 has been committed", () => {
    const design = designWithBlower([1, 0, 0]);
    const t1 = placeTerminal(design, {
      id: "t1",
      cell: [11, 0, 10],
      memory: DEFAULT_FREE_PLACEMENT_MEMORY,
      rotationSteps: 1
    });
    expect(t1.ok).toBe(true);
    if (!t1.ok) return;

    const t2 = placeTerminal(t1.design, {
      id: "t2",
      cell: [20, 0, 10],
      memory: DEFAULT_FREE_PLACEMENT_MEMORY,
      rotationSteps: 1
    });

    expect(t2.ok).toBe(true);
    if (!t2.ok) return;
    expect(t2.design.parts.at(-1)).toMatchObject({
      id: "t2",
      type: "terminal",
      cell: [20, 0, 10],
      axis: [0, 0, 1]
    });
  });

  it("snaps Terminal 2 to a vertical elevated path endpoint", () => {
    const design = designWithBlower([1, 0, 0]);
    design.parts.push(
      { id: "t1", type: "terminal", cell: [11, 0, 10], axis: [1, 0, 0] },
      { id: "riser", type: "tube", from: [20.5, 0.5, 10.5], to: [20.5, 5.5, 10.5], length: 5 }
    );
    design.grid.place([11, 0, 10], "t1");
    for (let y = 0; y < 5; y++) {
      design.grid.place([20, y, 10], "riser");
    }

    expect(terminalLandingCells(design)).toContainEqual([20, 5, 10]);

    const t2 = placeTerminal(design, {
      id: "t2",
      cell: [20, 5, 10],
      memory: DEFAULT_FREE_PLACEMENT_MEMORY,
      rotationSteps: 0
    });

    expect(t2.ok).toBe(true);
    if (!t2.ok) return;
    expect(t2.part).toMatchObject({
      id: "t2",
      type: "terminal",
      cell: [20, 5, 10],
      axis: [0, 1, 0]
    });
  });
});
