import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  bendConnectorSpans,
  bendRenderCurve,
  bendRenderPath,
  tubeRenderSpan,
  tubeSectionJointPoints
} from "@/renderer/design-meshes";
import {
  cellFromWorldPoint,
  clickCellForTool,
  createViewportDragState,
  moveViewportDrag
} from "@/renderer/interaction";
import { clearGroup } from "@/renderer/three-utils";
import {
  cameraFarPlane,
  heightMarkerScale,
  maxCameraDistance,
  openingCameraDistance
} from "@/renderer/Viewport";
import { BUILD_AREA, DEFAULT_ROOM } from "@/domain/sparse-grid";

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
    // Spans feeding and leaving a +X -> +Z bend that enters at [1.5, 0.5, 0.5]
    // and exits at [4.5, 0.5, 3.5]: both must still land on whole cells.
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

describe("how far the camera may pull back", () => {
  it("pulls back far enough to frame the whole build area", () => {
    // A 38 degree vertical field needs span / (2 * tan(19deg)) to fit a span.
    const needed =
      Math.hypot(BUILD_AREA.width, BUILD_AREA.depth) / (2 * Math.tan((19 * Math.PI) / 180));
    expect(maxCameraDistance(BUILD_AREA)).toBeGreaterThan(needed);
  });

  it("keeps the far plane clear of the build area at full pull-back", () => {
    // The regression this guards: a fixed far plane of 200 clipped the back
    // off anything larger than the old default build area.
    const halfDiagonal = Math.hypot(BUILD_AREA.width, BUILD_AREA.depth) / 2;
    expect(cameraFarPlane(BUILD_AREA)).toBeGreaterThan(
      maxCameraDistance(BUILD_AREA) + halfDiagonal
    );
  });
});

describe("where the camera opens", () => {
  const LARGEST = { width: BUILD_AREA.width, depth: BUILD_AREA.depth };

  it("opens outside the default room's walls, not inside them", () => {
    // The regression this guards: the wall-less era's opening distance of 38
    // sat inside the room once walls existed, filling the frame with hatch.
    // 1.6 diagonals — maxCameraDistance's own see-it-whole multiple — stands
    // clear of the room's footprint with margin, whatever that footprint is.
    const { width, depth } = DEFAULT_ROOM;
    const opening = openingCameraDistance(DEFAULT_ROOM);
    expect(opening).toBeCloseTo(Math.hypot(width, depth) * 1.6, 5);
    // Past the near corner, so the camera is outside the walls rather than in.
    expect(opening).toBeGreaterThan(Math.hypot(width / 2, depth / 2));
  });

  it("stands further back for a larger room", () => {
    expect(openingCameraDistance(LARGEST)).toBeGreaterThan(openingCameraDistance(DEFAULT_ROOM));
  });

  it("frames every room at the same multiple of its diagonal", () => {
    const ratio =
      Math.hypot(LARGEST.width, LARGEST.depth) / Math.hypot(DEFAULT_ROOM.width, DEFAULT_ROOM.depth);
    expect(openingCameraDistance(LARGEST)).toBeCloseTo(
      openingCameraDistance(DEFAULT_ROOM) * ratio,
      5
    );
  });

  it("never opens beyond where the visitor could scroll back to", () => {
    // The wheel's limit is the build area's; no room may open past it.
    for (const room of [DEFAULT_ROOM, LARGEST, { width: 4, depth: 4 }]) {
      expect(openingCameraDistance(room)).toBeLessThanOrEqual(maxCameraDistance(BUILD_AREA));
    }
  });

  it("keeps a degenerate footprint off the camera's nose", () => {
    // The smallest legal room (4 x 4) already clears the 8 ft minimum at 1.6
    // diagonals; the floor still guards anything smaller reaching this code.
    expect(openingCameraDistance({ width: 4, depth: 4 })).toBeCloseTo(Math.hypot(4, 4) * 1.6, 5);
    expect(openingCameraDistance({ width: 1, depth: 1 })).toBe(8);
  });
});

describe("how big a height marker draws", () => {
  const VIEWPORT = 760;
  /** What the marker's on-screen height works out to at a given distance. */
  const pixels = (distance: number) => {
    const { feet } = heightMarkerScale(distance, VIEWPORT);
    const perPixel = (2 * distance * Math.tan((38 * Math.PI) / 360)) / VIEWPORT;
    return feet / perPixel;
  };

  it("shrinks with the part it labels through the working range", () => {
    // The regression this guards: markers held a constant pixel size, so
    // zooming out grew them relative to the part until they covered it.
    // Doubling the distance must halve the marker on screen.
    expect(pixels(120)).toBeCloseTo(pixels(60) / 2, 4);
  });

  it("still draws a marker at the default opening, small as it is", () => {
    // The client traded legibility here away for smaller markers — "that's
    // what zoom is for" — so this no longer asks for a readable 11 px. What it
    // does hold is that shrinking them did not make them vanish from the view
    // every design opens on.
    const opening = openingCameraDistance(DEFAULT_ROOM);
    expect(heightMarkerScale(opening, VIEWPORT).visible).toBe(true);
    expect(pixels(opening)).toBeLessThan(11);
  });

  it("keeps a marker smaller than the cell it labels", () => {
    // The complaint that started this: markers were bigger than some parts. A
    // part is one 1 ft cell, so beyond the near clamp a marker must be under a
    // cell tall at every distance it is drawn at.
    for (const distance of [40, 80, openingCameraDistance(DEFAULT_ROOM), 140]) {
      expect(heightMarkerScale(distance, VIEWPORT).feet).toBeLessThan(1);
    }
  });

  it("keeps markers through a good pull-back past the opening view", () => {
    // Dropping the legibility floor with the size would have swapped one
    // complaint for another: markers disappearing the moment you zoom out.
    expect(heightMarkerScale(openingCameraDistance(DEFAULT_ROOM) * 1.4, VIEWPORT).visible).toBe(
      true
    );
  });

  it("keeps the far cut-off where it was when markers stood taller", () => {
    // The trap in shrinking a marker: the minimum is a pixel count, so leaving
    // it alone moves the point markers vanish at *towards* the camera — the
    // client asked for smaller, not for gone sooner. What holds is a distance,
    // and it belongs either side of the pull-back the row above checks.
    const opening = openingCameraDistance(DEFAULT_ROOM);
    expect(heightMarkerScale(opening * 1.45, VIEWPORT).visible).toBe(true);
    expect(heightMarkerScale(opening * 1.7, VIEWPORT).visible).toBe(false);
  });

  it("stops drawing once there is nothing left of a marker to read", () => {
    // Pulled right back over the build area a label is fuzz; the elevation is
    // still shown beside the armed tool, so nothing is actually lost.
    expect(heightMarkerScale(maxCameraDistance(BUILD_AREA), VIEWPORT).visible).toBe(false);
  });

  it("never lets a marker cover the part at close range", () => {
    // Without the cap a world-sized marker fills a third of the screen at the
    // closest the wheel allows.
    for (const distance of [8, 12, 20]) {
      expect(pixels(distance)).toBeLessThanOrEqual(64.001);
    }
    expect(heightMarkerScale(8, VIEWPORT).visible).toBe(true);
  });
});
