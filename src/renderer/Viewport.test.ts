import { describe, expect, it } from "vitest";
import {
  bendRenderCurve,
  bendRenderPath,
  bendRenderSpan,
  bendConnectorSpans,
  cellFromWorldPoint,
  clickCellForTool,
  createViewportDragState,
  moveViewportDrag,
  tubeRenderSpan,
  tubeSectionJointPoints
} from "@/renderer/Viewport";

const vec = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

describe("Viewport click cell resolution", () => {
  it("uses the clicked part's world cell for erase instead of the active plane cell", () => {
    expect(clickCellForTool("erase", [2, 0, 3], { x: 2.45, y: 7.82, z: 3.5 })).toEqual([
      2,
      7,
      3
    ]);
  });

  it("keeps non-erase clicks on the active placement plane", () => {
    expect(clickCellForTool("tube", [2, 0, 3], { x: 2.45, y: 7.82, z: 3.5 })).toEqual([
      2,
      0,
      3
    ]);
  });

  it("floors world hit coordinates to grid cells, including negative coordinates", () => {
    expect(cellFromWorldPoint({ x: -1.05, y: 4.99, z: -0.01 })).toEqual([-2, 4, -1]);
  });
});

describe("Viewport orbit drag handling", () => {
  it("ignores window mouse movement when the drag did not start in the viewport", () => {
    const drag = createViewportDragState();
    const moved = moveViewportDrag(drag, { x: 240, y: 120 }, 1);

    expect(moved.delta).toBeNull();
    expect(moved.state.dragging).toBe(false);
  });
});

describe("Viewport tube and bend render alignment", () => {
  it("draws tube geometry on occupied grid-cell boundaries instead of centerline endpoints", () => {
    expect(tubeRenderSpan([1.5, 0.5, 0.5], [7.5, 0.5, 0.5])).toEqual({
      from: [1, 0.5, 0.5],
      to: [7, 0.5, 0.5],
      length: 6
    });
  });

  it("aligns visible tube section joints with grid lines", () => {
    expect(tubeSectionJointPoints([1.5, 0.5, 0.5], [7.5, 0.5, 0.5])).toEqual([
      [1, 0.5, 0.5],
      [2, 0.5, 0.5],
      [3, 0.5, 0.5],
      [4, 0.5, 0.5],
      [5, 0.5, 0.5],
      [6, 0.5, 0.5],
      [7, 0.5, 0.5]
    ]);
  });

  it("keeps negative-direction tube joints on grid lines too", () => {
    expect(tubeRenderSpan([1.5, 0.5, 0.5], [1.5, 0.5, -5.5])).toEqual({
      from: [1.5, 0.5, 1],
      to: [1.5, 0.5, -5],
      length: 6
    });
  });

  it("keeps straight tube render spans grid-bound at bend connections", () => {
    const bend = {
      entry: vec(1.5, 0.5, 0.5),
      exit: vec(4.5, 0.5, 3.5),
      center: vec(1.5, 0.5, 3.5),
      inDir: vec(1, 0, 0),
      outDir: vec(0, 0, 1),
      radius: 3
    };

    expect(bendRenderSpan(bend)).toEqual({ from: bend.entry, to: bend.exit });
    expect(tubeRenderSpan([-4.5, 0.5, 0.5], [1.5, 0.5, 0.5])).toEqual({
      from: [-5, 0.5, 0.5],
      to: [1, 0.5, 0.5],
      length: 6
    });
    expect(tubeRenderSpan([4.5, 0.5, 4.5], [4.5, 0.5, 10.5])).toEqual({
      from: [4.5, 0.5, 4],
      to: [4.5, 0.5, 10],
      length: 6
    });
  });

  it("starts a tube placed after a bend at the bend extension boundary", () => {
    const bend = {
      entry: vec(1.5, 0.5, 0.5),
      exit: vec(4.5, 0.5, 3.5),
      center: vec(1.5, 0.5, 3.5),
      inDir: vec(1, 0, 0),
      outDir: vec(0, 0, 1),
      radius: 3
    };
    const [, exitExtension] = bendConnectorSpans(bend);

    expect(tubeRenderSpan([4.5, 0.5, 4.5], [4.5, 0.5, 10.5])).toEqual({
      from: exitExtension.to,
      to: [4.5, 0.5, 10],
      length: 6
    });
    expect(tubeSectionJointPoints([4.5, 0.5, 4.5], [4.5, 0.5, 10.5])[0]).toEqual(
      exitExtension.to
    );
  });

  it("adds bend tangent extensions without shifting straight tube boundaries", () => {
    const bend = {
      entry: vec(1.5, 0.5, 0.5),
      exit: vec(4.5, 0.5, 3.5),
      center: vec(1.5, 0.5, 3.5),
      inDir: vec(1, 0, 0),
      outDir: vec(0, 0, 1),
      radius: 3
    };

    expect(bendConnectorSpans(bend)).toEqual([
      { from: [1, 0.5, 0.5], to: [1.5, 0.5, 0.5] },
      { from: [4.5, 0.5, 3.5], to: [4.5, 0.5, 4] }
    ]);
  });

  it("draws bend extensions and the circular arc as one continuous visual path", () => {
    const bend = {
      entry: vec(1.5, 0.5, 0.5),
      exit: vec(4.5, 0.5, 3.5),
      center: vec(1.5, 0.5, 3.5),
      inDir: vec(1, 0, 0),
      outDir: vec(0, 0, 1),
      radius: 3
    };
    const path = bendRenderPath(bend);
    const start = path.getPoint(0);
    const end = path.getPoint(1);

    expect(path.curves).toHaveLength(3);
    expect([start.x, start.y, start.z]).toEqual([1, 0.5, 0.5]);
    expect([end.x, end.y, end.z]).toEqual([4.5, 0.5, 4]);
  });

  it("keeps a full six feet visible when a tube leaves a bend", () => {
    const tube = { from: vec(4.5, 7.5, 0.5), to: vec(10.5, 7.5, 0.5) };

    expect(tubeRenderSpan(tube.from, tube.to)).toEqual({
      from: [4, 7.5, 0.5],
      to: [10, 7.5, 0.5],
      length: 6
    });
    expect(tubeSectionJointPoints(tube.from, tube.to)).toEqual([
      [4, 7.5, 0.5],
      [5, 7.5, 0.5],
      [6, 7.5, 0.5],
      [7, 7.5, 0.5],
      [8, 7.5, 0.5],
      [9, 7.5, 0.5],
      [10, 7.5, 0.5]
    ]);
  });

  it("keeps a full six feet visible when a tube enters a bend", () => {
    const tube = { from: vec(4.5, 7.5, 0.5), to: vec(10.5, 7.5, 0.5) };

    expect(tubeRenderSpan(tube.from, tube.to)).toEqual({
      from: [4, 7.5, 0.5],
      to: [10, 7.5, 0.5],
      length: 6
    });
    expect(tubeSectionJointPoints(tube.from, tube.to)).toEqual([
      [4, 7.5, 0.5],
      [5, 7.5, 0.5],
      [6, 7.5, 0.5],
      [7, 7.5, 0.5],
      [8, 7.5, 0.5],
      [9, 7.5, 0.5],
      [10, 7.5, 0.5]
    ]);
  });

  it("keeps vertical tube rings grid-bound when a bend is placed at the tube end", () => {
    const tube = { from: vec(0.5, 1.5, 0.5), to: vec(0.5, 7.5, 0.5) };

    expect(tubeRenderSpan(tube.from, tube.to)).toEqual({
      from: [0.5, 1, 0.5],
      to: [0.5, 7, 0.5],
      length: 6
    });
    expect(tubeSectionJointPoints(tube.from, tube.to)).toEqual([
      [0.5, 1, 0.5],
      [0.5, 2, 0.5],
      [0.5, 3, 0.5],
      [0.5, 4, 0.5],
      [0.5, 5, 0.5],
      [0.5, 6, 0.5],
      [0.5, 7, 0.5]
    ]);
  });

  it("keeps bend centerlines circular", () => {
    const bend = {
      entry: vec(1.5, 0.5, 0.5),
      exit: vec(4.5, 0.5, 3.5),
      center: vec(1.5, 0.5, 3.5),
      inDir: vec(1, 0, 0),
      outDir: vec(0, 0, 1),
      radius: 3
    };
    const curve = bendRenderCurve(bend);

    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const point = curve.getPoint(t);
      expect(Math.hypot(point.x - 1.5, point.y - 0.5, point.z - 3.5)).toBeCloseTo(3, 5);
    }
  });
});
