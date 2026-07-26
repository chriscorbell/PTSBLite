import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  bendRenderCurve,
  bendRenderPath,
  bendRenderSpan,
  bendConnectorSpans,
  cellFromWorldPoint,
  clearGroup,
  clickCellForTool,
  createViewportDragState,
  moveViewportDrag,
  tubeRenderSpan,
  tubeSectionJointPoints
} from "@/renderer/Viewport";

const vec = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

describe("Viewport click cell resolution", () => {
  it("uses the clicked part's world cell for erase instead of the active plane cell", () => {
    expect(clickCellForTool("erase", [2, 0, 3], { x: 2.45, y: 7.82, z: 3.5 })).toEqual([2, 7, 3]);
  });

  it("keeps non-erase clicks on the active placement plane", () => {
    expect(clickCellForTool("tube", [2, 0, 3], { x: 2.45, y: 7.82, z: 3.5 })).toEqual([2, 0, 3]);
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
    expect(tubeSectionJointPoints([4.5, 0.5, 4.5], [4.5, 0.5, 10.5])[0]).toEqual(exitExtension.to);
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

describe("clearGroup", () => {
  it("disposes nested geometries, materials, and material textures", () => {
    const group = new THREE.Group();

    const meshGeometry = new THREE.BoxGeometry(1, 1, 1);
    const meshMaterial = new THREE.MeshStandardMaterial();
    const texture = new THREE.Texture();
    meshMaterial.map = texture;
    const mesh = new THREE.Mesh(meshGeometry, meshMaterial);

    // Nested one level down, so we know the traversal recurses rather than only
    // touching direct children.
    const childGeometry = new THREE.BufferGeometry();
    const childMaterial = new THREE.LineBasicMaterial();
    mesh.add(new THREE.LineSegments(childGeometry, childMaterial));
    group.add(mesh);

    const disposals = [meshGeometry, meshMaterial, texture, childGeometry, childMaterial].map(
      (resource) => vi.spyOn(resource, "dispose")
    );

    clearGroup(group);

    expect(group.children).toHaveLength(0);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalled();
  });

  it("disposes every element of a multi-material mesh", () => {
    const group = new THREE.Group();
    const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials));

    const disposals = materials.map((material) => vi.spyOn(material, "dispose"));

    clearGroup(group);

    for (const dispose of disposals) expect(dispose).toHaveBeenCalled();
  });
});

describe("three.js integration points", () => {
  // Nothing else exercises three at runtime -- the helpers above are pure math and
  // App mocks the Viewport -- so these pin the two APIs most likely to churn
  // across a three upgrade. Constructing geometries and materials needs no WebGL
  // context; only rendering does.
  it("builds tube geometry from a bend path", () => {
    const path = bendRenderPath({
      entry: vec(1.5, 0.5, 0.5),
      exit: vec(4.5, 0.5, 3.5),
      center: vec(1.5, 0.5, 3.5),
      inDir: vec(1, 0, 0),
      outDir: vec(0, 0, 1),
      radius: 3
    });
    const geometry = new THREE.TubeGeometry(path, 40, 0.22, 14, false);
    const position = geometry.getAttribute("position");

    expect(position.count).toBeGreaterThan(0);
    expect(Number.isFinite(position.array[0])).toBe(true);
  });

  it("builds fat-line geometry and material for obstacle edges", () => {
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2));
    const geometry = new LineSegmentsGeometry().fromEdgesGeometry(edges);

    expect(geometry.getAttribute("instanceStart").count).toBeGreaterThan(0);

    // linewidth is interpreted in pixels via the resolution uniform, so both have
    // to keep working or obstacle outlines render at the wrong thickness.
    const material = new LineMaterial({
      color: 0xc23a48,
      linewidth: 1.5,
      resolution: new THREE.Vector2(800, 600)
    });

    expect(material.linewidth).toBe(1.5);
    expect(material.resolution.x).toBe(800);
  });
});
