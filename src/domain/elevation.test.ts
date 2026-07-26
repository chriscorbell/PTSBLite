import { describe, expect, it } from "vitest";
import { validBendOrientations } from "@/domain/bend-placement";
import { emptyDesign } from "@/domain/design-state";
import { placeFreePart } from "@/domain/free-placement";
import { placeObstacleVolume } from "@/domain/obstacle-placement";
import { placeTube } from "@/domain/tube-placement";

describe("active build plane elevation", () => {
  it("commits free-placed parts at the hover cell's Y when the active plane is elevated", () => {
    const result = placeFreePart(emptyDesign(), {
      id: "b1",
      type: "blower",
      cell: [0, 5, 0],
      orientation: [1, 0, 0]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.part).toMatchObject({ type: "blower", cell: [0, 5, 0] });
    expect(result.design.grid.query([0, 5, 0])).toBe("b1");
    expect(result.design.grid.query([0, 0, 0])).toBeUndefined();
  });

  it("commits obstacle volumes spanning vertically across elevated cells", () => {
    const result = placeObstacleVolume(emptyDesign(), {
      id: "o1",
      cornerA: [4, 0, 4],
      cornerB: [4, 3, 4]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.obstacles).toEqual([{ id: "o1", min: [4, 0, 4], max: [4, 3, 4] }]);
    for (let y = 0; y <= 3; y++) {
      expect(result.design.grid.query([4, y, 4])).toBe("o1");
    }
  });

  it("snaps tube placement to the source port's actual Y even when the hover cell is on a different plane", () => {
    const design = emptyDesign();
    design.parts = [{ id: "b1", type: "blower", cell: [0, 5, 0], dir: [1, 0, 0] }];
    design.grid.place([0, 5, 0], "b1");

    const result = placeTube(design, {
      id: "t1",
      cell: [1, 0, 0], // misleading Y — sourcePartId should override
      sourcePartId: "b1"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.part).toMatchObject({ type: "tube", from: [1.5, 5.5, 0.5] });
    expect(result.design.grid.query([1, 5, 0])).toBe("t1");
  });

  it("enumerates vertical bend exits for a horizontal source port", () => {
    // Elevated so the downward exit has headroom above the ground plane.
    const design = emptyDesign();
    design.parts = [{ id: "b1", type: "blower", cell: [0, 5, 0], dir: [1, 0, 0] }];
    design.grid.place([0, 5, 0], "b1");

    const outDirs = validBendOrientations(design, [1, 5, 0]).map((o) => o.outDir.join(","));

    expect(outDirs).toContain("0,1,0");
    expect(outDirs).toContain("0,-1,0");
    expect(outDirs).toContain("0,0,1");
    expect(outDirs).toContain("0,0,-1");
  });
});
