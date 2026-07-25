import { useEffect, useRef } from "react";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  type PartLabel,
  type PortMarker
} from "@/domain/renderer-affordances";
import { boundsFromBuildArea, DEFAULT_BUILD_AREA } from "@/domain/sparse-grid";
import type { BuildArea, Camera, Ghost, Scene, ToolId, Vec3 } from "@/types";

const VP = {
  bg: 0x0b0e13,
  grid: 0x1f2530,
  gridStrong: 0x2a3140,
  ground: 0x10141b,
  accent: 0x5eead4,
  accentDim: 0x2e7e78,
  warn: 0xf4b43a,
  danger: 0xef5667,
  blower: 0x3f4a60,
  blowerEdge: 0x6a7691,
  terminal: 0x5b6477,
  terminalEdge: 0x8b95a7,
  tube: 0x8e96a5,
  tubeEdge: 0xb8bfcd,
  bend: 0x8e96a5,
  obstacle: 0xc23a48,
  port: 0x5eead4
};

const TUBE_R = 0.22;

const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);

function buildTransportArrow(): THREE.ArrowHelper {
  return new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-0.38, 0.82, 0),
    0.82,
    VP.accent,
    0.22,
    0.14
  );
}

function buildBlowerMesh({ ghost = false } = {}): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.92, 0.92),
    new THREE.MeshStandardMaterial({
      color: VP.blower,
      roughness: 0.55,
      metalness: 0.25,
      transparent: ghost,
      opacity: ghost ? 0.45 : 1
    })
  );
  g.add(box);
  const motor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.36, 0.34, 20),
    new THREE.MeshStandardMaterial({
      color: 0x2a3140,
      roughness: 0.4,
      metalness: 0.55,
      transparent: ghost,
      opacity: ghost ? 0.5 : 1
    })
  );
  motor.position.set(0, 0.6, 0);
  g.add(motor);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.06, 20),
    new THREE.MeshStandardMaterial({ color: VP.blowerEdge, roughness: 0.3, metalness: 0.7 })
  );
  cap.position.set(0, 0.8, 0);
  g.add(cap);
  for (let i = -1; i <= 1; i++) {
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.1, 0.62),
      new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.9 })
    );
    slat.position.set(-0.475, i * 0.16, 0);
    g.add(slat);
  }
  const flange = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.1, 24),
    new THREE.MeshStandardMaterial({ color: VP.blowerEdge, roughness: 0.4, metalness: 0.6 })
  );
  flange.rotation.z = Math.PI / 2;
  flange.position.set(0.5, 0, 0);
  g.add(flange);
  const hole = new THREE.Mesh(
    new THREE.CylinderGeometry(TUBE_R + 0.02, TUBE_R + 0.02, 0.14, 20),
    new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 1 })
  );
  hole.rotation.z = Math.PI / 2;
  hole.position.set(0.52, 0, 0);
  g.add(hole);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.92, 0.92, 0.92)),
    new THREE.LineBasicMaterial({ color: VP.blowerEdge, transparent: ghost, opacity: ghost ? 0.6 : 0.8 })
  );
  g.add(edges);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(TUBE_R * 1.35, 0.018, 8, 24),
    new THREE.MeshBasicMaterial({ color: VP.accent, transparent: true, opacity: ghost ? 0.5 : 0.9 })
  );
  ring.position.set(0.56, 0, 0);
  ring.rotation.y = Math.PI / 2;
  g.add(ring);
  if (ghost) g.add(buildTransportArrow());
  return g;
}

function buildTerminalMesh({ ghost = false } = {}): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.78, 0.92),
    new THREE.MeshStandardMaterial({
      color: VP.terminal,
      roughness: 0.5,
      metalness: 0.15,
      transparent: ghost,
      opacity: ghost ? 0.45 : 1
    })
  );
  box.position.y = -0.07;
  g.add(box);
  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(0.84, 0.18, 0.84),
    new THREE.MeshStandardMaterial({
      color: 0x29303d,
      roughness: 0.5,
      metalness: 0.25,
      transparent: ghost,
      opacity: ghost ? 0.5 : 1
    })
  );
  hood.position.y = 0.4;
  g.add(hood);
  const display = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.18, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x0a0f18 })
  );
  display.position.set(0, 0.05, 0.465);
  g.add(display);
  const pixel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.04, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x4ade80 })
  );
  pixel.position.set(0.1, 0.05, 0.477);
  g.add(pixel);
  const mat = new THREE.MeshStandardMaterial({ color: VP.terminalEdge, roughness: 0.4, metalness: 0.5 });
  const f1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 24), mat);
  f1.rotation.z = Math.PI / 2;
  f1.position.set(0.5, -0.07, 0);
  g.add(f1);
  const f2 = f1.clone();
  f2.position.set(-0.5, -0.07, 0);
  g.add(f2);
  for (const x of [0.52, -0.52]) {
    const h = new THREE.Mesh(
      new THREE.CylinderGeometry(TUBE_R + 0.01, TUBE_R + 0.01, 0.12, 18),
      new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 1 })
    );
    h.rotation.z = Math.PI / 2;
    h.position.set(x, -0.07, 0);
    g.add(h);
  }
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.92, 0.78, 0.92)),
    new THREE.LineBasicMaterial({ color: VP.terminalEdge, transparent: ghost, opacity: ghost ? 0.6 : 0.75 })
  );
  edges.position.y = -0.07;
  g.add(edges);
  if (ghost) g.add(buildTransportArrow());
  return g;
}

export function tubeRenderSpan(from: Vec3, to: Vec3): { from: Vec3; to: Vec3; length: number } {
  const a = v3(from);
  const b = v3(to);
  const length = a.distanceTo(b);
  if (length < 1e-4) return { from, to, length: 0 };
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const renderFrom = a.clone().addScaledVector(dir, -0.5);
  const renderTo = b.clone().addScaledVector(dir, -0.5);
  return {
    from: [renderFrom.x, renderFrom.y, renderFrom.z],
    to: [renderTo.x, renderTo.y, renderTo.z],
    length
  };
}

export function tubeSectionJointPoints(from: Vec3, to: Vec3): Vec3[] {
  const span = tubeRenderSpan(from, to);
  if (span.length < 1e-4) return [];
  const a = v3(span.from);
  const b = v3(span.to);
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const joints: Vec3[] = [];
  const sectionCount = Math.round(span.length);
  for (let i = 0; i <= sectionCount; i++) {
    const point = a.clone().addScaledVector(dir, i);
    joints.push([point.x, point.y, point.z]);
  }
  return joints;
}

type BendShape = {
  entry: Vec3;
  exit: Vec3;
  center: Vec3;
  inDir: Vec3;
  outDir: Vec3;
  radius?: number;
};

export function bendRenderSpan(bend: BendShape): { from: Vec3; to: Vec3 } {
  return {
    from: bend.entry,
    to: bend.exit
  };
}

export function bendConnectorSpans(bend: BendShape): Array<{ from: Vec3; to: Vec3 }> {
  const entry = v3(bend.entry);
  const exit = v3(bend.exit);
  const inDir = v3(bend.inDir).normalize();
  const outDir = v3(bend.outDir).normalize();
  const entryStart = entry.clone().addScaledVector(inDir, -0.5);
  const exitEnd = exit.clone().addScaledVector(outDir, 0.5);
  return [
    { from: [entryStart.x, entryStart.y, entryStart.z], to: bend.entry },
    { from: bend.exit, to: [exitEnd.x, exitEnd.y, exitEnd.z] }
  ];
}

function buildTubeMesh(
  from: Vec3,
  to: Vec3,
  { ghost = false, blocked = false, accent = false }: { ghost?: boolean; blocked?: boolean; accent?: boolean } = {}
): THREE.Group {
  const g = new THREE.Group();
  const span = tubeRenderSpan(from, to);
  const a = v3(span.from);
  const b = v3(span.to);
  const len = span.length;
  if (len < 1e-4) return g;
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const geom = new THREE.CylinderGeometry(TUBE_R, TUBE_R, len, 18, 1, false);
  const color = blocked ? VP.danger : accent ? VP.accent : VP.tube;
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.25,
    transparent: ghost,
    opacity: ghost ? 0.6 : 1
  });
  const tube = new THREE.Mesh(geom, mat);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  tube.quaternion.copy(quat);
  tube.position.copy(a).addScaledVector(dir, len / 2);
  g.add(tube);
  if (!ghost) {
    const ringGeom = new THREE.TorusGeometry(TUBE_R * 1.04, 0.012, 6, 18);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x05080c });
    for (const point of tubeSectionJointPoints(from, to)) {
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.copy(v3(point));
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      g.add(ring);
    }
  }
  return g;
}

class BendArc extends THREE.Curve<THREE.Vector3> {
  c: THREE.Vector3;
  r: number;
  inDir: THREE.Vector3;
  outDir: THREE.Vector3;
  constructor(center: THREE.Vector3, radius: number, inDir: Vec3, outDir: Vec3) {
    super();
    this.c = center;
    this.r = radius;
    this.inDir = new THREE.Vector3(inDir[0], inDir[1], inDir[2]);
    this.outDir = new THREE.Vector3(outDir[0], outDir[1], outDir[2]);
  }
  override getPoint(t: number, target: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    const ang = (Math.PI / 2) * t;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return target.set(
      this.c.x + this.r * (-this.outDir.x * c + this.inDir.x * s),
      this.c.y + this.r * (-this.outDir.y * c + this.inDir.y * s),
      this.c.z + this.r * (-this.outDir.z * c + this.inDir.z * s)
    );
  }
}

export function bendRenderCurve(bend: BendShape): BendArc {
  return new BendArc(v3(bend.center), bend.radius ?? 3, bend.inDir, bend.outDir);
}

export function bendRenderPath(bend: BendShape): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const [entryExtension, exitExtension] = bendConnectorSpans(bend);
  path.add(new THREE.LineCurve3(v3(entryExtension.from), v3(entryExtension.to)));
  path.add(bendRenderCurve(bend));
  path.add(new THREE.LineCurve3(v3(exitExtension.from), v3(exitExtension.to)));
  return path;
}

function buildBendMesh(
  bend: BendShape,
  { ghost = false, accent = false }: { ghost?: boolean; accent?: boolean } = {}
): THREE.Group {
  const g = new THREE.Group();
  const geom = new THREE.TubeGeometry(bendRenderPath(bend), 40, TUBE_R, 14, false);
  const color = accent ? VP.accent : VP.bend;
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.25,
    transparent: ghost,
    opacity: ghost ? 0.6 : 1
  });
  g.add(new THREE.Mesh(geom, mat));
  return g;
}

function buildObstacleMesh(min: Vec3, max: Vec3, opts: { ghost?: boolean } = {}): THREE.Group {
  const ghost = !!opts.ghost;
  const sx = max[0] - min[0] + 1;
  const sy = max[1] - min[1] + 1;
  const sz = max[2] - min[2] + 1;
  const cx = (min[0] + max[0] + 1) / 2;
  const cy = (min[1] + max[1] + 1) / 2;
  const cz = (min[2] + max[2] + 1) / 2;
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: VP.obstacle,
    transparent: true,
    opacity: ghost ? 0.035 : 0.07,
    roughness: 0.95,
    depthWrite: false
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  box.position.set(cx, cy, cz);
  g.add(box);
  // Fat lines (screen-space width) so edges never drop sub-pixel segments the
  // way 1px gl.LINES do. resolution is corrected on resize by updateLineResolutions.
  const edgeGeom = new LineSegmentsGeometry().fromEdgesGeometry(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz))
  );
  const edges = new LineSegments2(
    edgeGeom,
    new LineMaterial({
      color: VP.obstacle,
      linewidth: 1.5,
      transparent: true,
      opacity: ghost ? 0.45 : 0.7,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
    })
  );
  edges.position.set(cx, cy, cz);
  g.add(edges);
  const hatchMat = new THREE.LineBasicMaterial({
    color: VP.obstacle,
    transparent: true,
    opacity: ghost ? 0.25 : 0.4
  });
  const topY = max[1] + 1 + 0.002;
  const lines: number[] = [];
  const step = 0.6;
  const x0 = min[0],
    x1 = max[0] + 1;
  const z0 = min[2],
    z1 = max[2] + 1;
  // 45° hatch lines run in direction (1, 1), so each line is the locus
  // x - z = c. Sweep c across the face and clip each line to the rectangle by
  // its parameter (z) — clamping x and z independently bends the diagonals.
  const cMin = x0 - z1;
  const cMax = x1 - z0;
  for (let c = cMin; c < cMax; c += step) {
    const zLo = Math.max(z0, x0 - c);
    const zHi = Math.min(z1, x1 - c);
    if (zHi > zLo) lines.push(zLo + c, topY, zLo, zHi + c, topY, zHi);
  }
  if (lines.length) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    g.add(new THREE.LineSegments(lg, hatchMat));
  }
  return g;
}

function buildGroundLines(positions: number[], color: number, opacity: number, y: number): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const lines = new THREE.LineSegments(geo, mat);
  lines.position.y = y;
  return lines;
}

function buildGround(area: BuildArea): THREE.Group {
  const g = new THREE.Group();
  const b = boundsFromBuildArea(area);
  // Footprint may be off-center for odd dimensions; center the plane on it.
  const cx = (b.xMin + b.xMax) / 2;
  const cz = (b.zMin + b.zMax) / 2;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(area.width, area.depth),
    // Unlit so the plane is a flat, uniform color — MeshStandardMaterial would
    // pick up the directional lights and shade a gradient across the ground.
    new THREE.MeshBasicMaterial({ color: VP.ground })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, -0.005, cz);
  g.add(ground);

  // Build the grid lines by hand (THREE.GridHelper only draws square grids):
  // a faint 1 ft minor line at every cell boundary, with a stronger line every
  // 5 ft (and at the origin axes).
  const minor: number[] = [];
  const major: number[] = [];
  for (let x = b.xMin; x <= b.xMax; x++) {
    (x % 5 === 0 ? major : minor).push(x, 0, b.zMin, x, 0, b.zMax);
  }
  for (let z = b.zMin; z <= b.zMax; z++) {
    (z % 5 === 0 ? major : minor).push(b.xMin, 0, z, b.xMax, 0, z);
  }
  g.add(buildGroundLines(minor, VP.grid, 0.45, 0));
  g.add(buildGroundLines(major, VP.gridStrong, 0.7, 0.001));
  return g;
}

function buildLandingCellHighlight(cell: Vec3, tool: ToolId): THREE.Group {
  const g = new THREE.Group();
  g.userData.landingCell = cell;
  const isBend = tool === "bend";
  const fillColor = isBend ? VP.warn : VP.accent;
  const outlineColor = isBend ? VP.warn : VP.accent;
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.94, 0.94),
    new THREE.MeshBasicMaterial({
      color: fillColor,
      transparent: true,
      opacity: isBend ? 0.13 : 0.2,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.set(cell[0] + 0.5, cell[1] + 0.018, cell[2] + 0.5);
  fill.userData.landingCell = cell;
  g.add(fill);

  if (isBend) {
    // Distinct from straight tube: corner brackets + a hint of arc direction.
    const cornerLen = 0.22;
    const x0 = cell[0] + 0.06;
    const x1 = cell[0] + 0.94;
    const z0 = cell[2] + 0.06;
    const z1 = cell[2] + 0.94;
    const y = cell[1] + 0.028;
    const verts: number[] = [];
    const corners: Array<[number, number, number, number]> = [
      [x0, z0, 1, 1],
      [x1, z0, -1, 1],
      [x1, z1, -1, -1],
      [x0, z1, 1, -1]
    ];
    for (const [cx, cz, dx, dz] of corners) {
      verts.push(cx, y, cz, cx + cornerLen * dx, y, cz);
      verts.push(cx, y, cz, cx, y, cz + cornerLen * dz);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.add(
      new THREE.LineSegments(
        bg,
        new THREE.LineBasicMaterial({ color: outlineColor, transparent: true, opacity: 0.95 })
      )
    );
  } else {
    const outlineGeometry = new THREE.BufferGeometry();
    outlineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          cell[0] + 0.05, cell[1] + 0.026, cell[2] + 0.05,
          cell[0] + 0.95, cell[1] + 0.026, cell[2] + 0.05,
          cell[0] + 0.95, cell[1] + 0.026, cell[2] + 0.05,
          cell[0] + 0.95, cell[1] + 0.026, cell[2] + 0.95,
          cell[0] + 0.95, cell[1] + 0.026, cell[2] + 0.95,
          cell[0] + 0.05, cell[1] + 0.026, cell[2] + 0.95,
          cell[0] + 0.05, cell[1] + 0.026, cell[2] + 0.95,
          cell[0] + 0.05, cell[1] + 0.026, cell[2] + 0.05
        ],
        3
      )
    );
    g.add(
      new THREE.LineSegments(
        outlineGeometry,
        new THREE.LineBasicMaterial({ color: outlineColor, transparent: true, opacity: 0.95 })
      )
    );
  }
  return g;
}

/**
 * Fat lines (LineMaterial) convert their pixel linewidth using a resolution
 * uniform, so it must track the canvas size or the lines render at the wrong
 * thickness. Call this after every resize for every fat line in the scene.
 */
function updateLineResolutions(root: THREE.Object3D, width: number, height: number): void {
  root.traverse((child) => {
    const mat = (child as THREE.Mesh).material;
    if (mat instanceof LineMaterial) mat.resolution.set(width, height);
  });
}

/** Any node that may own GPU resources: Mesh, LineSegments, LineSegments2, Sprite. */
type ResourceNode = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

/**
 * Release the GPU resources held by `object` and everything below it. Detaching
 * an object from the scene graph does not free its geometries, materials, or
 * textures, so anything we rebuild has to be disposed explicitly or the buffers
 * accumulate for the lifetime of the WebGL context.
 */
export function disposeObject(object: THREE.Object3D): void {
  object.traverse((node) => {
    const { geometry, material } = node as ResourceNode;
    geometry?.dispose();
    if (Array.isArray(material)) {
      for (const single of material) disposeMaterial(single);
    } else if (material) {
      disposeMaterial(material);
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  // Label sprites carry a CanvasTexture that has to go with the material.
  const { map } = material as THREE.Material & { map?: THREE.Texture | null };
  map?.dispose();
  material.dispose();
}

/** Detach and dispose every child of `group`, leaving the group itself in place. */
export function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject(child);
  }
}

function buildPortGlow(marker: PortMarker): THREE.Group {
  const g = new THREE.Group();
  const cx = marker.cell[0] + 0.5 + marker.dir[0] * 0.5;
  const cy = marker.cell[1] + 0.5 + marker.dir[1] * 0.5;
  const cz = marker.cell[2] + 0.5 + marker.dir[2] * 0.5;

  const ringGeom = new THREE.TorusGeometry(TUBE_R * 1.55, 0.045, 10, 28);
  const ringMat = new THREE.MeshBasicMaterial({
    color: VP.accent,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  const dirVec = new THREE.Vector3(marker.dir[0], marker.dir[1], marker.dir[2]);
  // TorusGeometry lives in the XY plane (normal = +Z). Align +Z to the port direction.
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirVec.clone().normalize());
  ring.position.set(cx, cy, cz);
  g.add(ring);

  const haloGeom = new THREE.TorusGeometry(TUBE_R * 2.1, 0.025, 8, 28);
  const haloMat = new THREE.MeshBasicMaterial({
    color: VP.accent,
    transparent: true,
    opacity: 0.35,
    depthWrite: false
  });
  const halo = new THREE.Mesh(haloGeom, haloMat);
  halo.quaternion.copy(ring.quaternion);
  halo.position.copy(ring.position);
  g.add(halo);
  return g;
}

function buildLabelSprite(label: PartLabel): THREE.Sprite {
  const text = label.text;
  const padX = 12;
  const padY = 6;
  const fontPx = 22;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff }));
  }
  ctx.font = `600 ${fontPx}px Geist, system-ui, -apple-system, sans-serif`;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width) + padX * 2;
  const h = fontPx + padY * 2;
  canvas.width = w;
  canvas.height = h;
  ctx.font = `600 ${fontPx}px Geist, system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = "rgba(11,14,19,0.85)";
  const r = 6;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(94,234,212,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#e6ecf5";
  ctx.textBaseline = "middle";
  ctx.fillText(text, padX, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: false
  });
  const sprite = new THREE.Sprite(mat);
  const worldH = 0.46;
  sprite.scale.set((w / h) * worldH, worldH, 1);
  sprite.position.set(label.anchor[0], label.anchor[1], label.anchor[2]);
  sprite.renderOrder = 999;
  return sprite;
}

function cellCenter(c: Vec3): Vec3 {
  return [c[0] + 0.5, c[1] + 0.5, c[2] + 0.5];
}

function dirToQuat(dir: Vec3): THREE.Quaternion {
  const target = new THREE.Vector3(dir[0], dir[1], dir[2]);
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), target);
}

type ViewportState = {
  renderer?: THREE.WebGLRenderer;
  scene3?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  cam?: { yaw: number; pitch: number; distance: number; target: THREE.Vector3 };
  applyCamera?: () => void;
  partsGroup?: THREE.Group;
  obstaclesGroup?: THREE.Group;
  ghostGroup?: THREE.Group;
  hoverGroup?: THREE.Group;
  overlayGroup?: THREE.Group;
  planeGroup?: THREE.Group;
  portsGroup?: THREE.Group;
  labelsGroup?: THREE.Group;
  groundGroup?: THREE.Group;
  hoverPlane?: THREE.Mesh;
  cleanup?: () => void;
};

type PointerPoint = {
  x: number;
  y: number;
};

export type ViewportDragState = {
  active: boolean;
  dragging: boolean;
  dragX: number;
  dragY: number;
  downX: number;
  downY: number;
};

export function createViewportDragState(): ViewportDragState {
  return {
    active: false,
    dragging: false,
    dragX: 0,
    dragY: 0,
    downX: 0,
    downY: 0
  };
}

export function beginViewportDrag(state: ViewportDragState, point: PointerPoint): ViewportDragState {
  return {
    ...state,
    active: true,
    dragging: false,
    dragX: point.x,
    dragY: point.y,
    downX: point.x,
    downY: point.y
  };
}

export function moveViewportDrag(
  state: ViewportDragState,
  point: PointerPoint,
  buttons: number
): { state: ViewportDragState; delta: PointerPoint | null } {
  if (!state.active || !(buttons & 1)) return { state, delta: null };

  const dx = point.x - state.dragX;
  const dy = point.y - state.dragY;
  const dragging = state.dragging || Math.abs(dx) + Math.abs(dy) > 3;
  const next = { ...state, dragging };

  if (!dragging) return { state: next, delta: null };

  next.dragX = point.x;
  next.dragY = point.y;
  return { state: next, delta: { x: dx, y: dy } };
}

export function isViewportClick(state: ViewportDragState, point: PointerPoint): boolean {
  return Math.abs(point.x - state.downX) + Math.abs(point.y - state.downY) < 4 && !state.dragging;
}

export function endViewportDrag(state: ViewportDragState): ViewportDragState {
  return {
    ...state,
    active: false,
    dragging: false
  };
}

export type ViewportPlaceTarget = {
  partId?: string;
};

export type ViewportProps = {
  scene: Scene;
  buildArea?: BuildArea;
  ghost: Ghost | null;
  tool: ToolId;
  camera?: Camera;
  onPlace?: (cell: Vec3, e: MouseEvent, target?: ViewportPlaceTarget) => void;
  onHover?: (cell: Vec3) => void;
  autoBuildPulse?: boolean;
  landingCells?: Vec3[];
  activeElevation?: number;
  portMarkers?: PortMarker[];
  labels?: PartLabel[];
  showLabels?: boolean;
};

function partIdForObject(object: THREE.Object3D): string | undefined {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (typeof current.userData.partId === "string") return current.userData.partId;
    current = current.parent;
  }
  return undefined;
}

function landingCellForObject(object: THREE.Object3D): Vec3 | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const cell = current.userData.landingCell as Vec3 | undefined;
    if (Array.isArray(cell) && cell.length === 3) return cell;
    current = current.parent;
  }
  return null;
}

export function cellFromWorldPoint(point: Pick<THREE.Vector3, "x" | "y" | "z">): Vec3 {
  return [Math.floor(point.x), Math.floor(point.y), Math.floor(point.z)];
}

export function clickCellForTool(
  tool: ToolId,
  fallbackCell: Vec3 | null,
  partHitPoint?: Pick<THREE.Vector3, "x" | "y" | "z">
): Vec3 | null {
  if (tool === "erase" && partHitPoint) return cellFromWorldPoint(partHitPoint);
  return fallbackCell;
}

export function Viewport({
  scene,
  buildArea = DEFAULT_BUILD_AREA,
  ghost,
  tool,
  camera: camCfg,
  onPlace,
  onHover,
  landingCells = [],
  activeElevation = 0,
  portMarkers = [],
  labels = [],
  showLabels = false
}: ViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<ViewportState>({});
  const toolRef = useRef<ToolId>(tool);
  const callbacksRef = useRef<Pick<ViewportProps, "onPlace" | "onHover">>({ onPlace, onHover });

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    callbacksRef.current = { onPlace, onHover };
  }, [onPlace, onHover]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(VP.bg, 1);
    mount.appendChild(renderer.domElement);

    const scene3 = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 200);
    const cam = { yaw: 0.55, pitch: 0.55, distance: 38, target: new THREE.Vector3(0, 0.5, 1) };
    function applyCamera() {
      const r = cam.distance;
      camera.position.set(
        cam.target.x + r * Math.cos(cam.pitch) * Math.sin(cam.yaw),
        cam.target.y + r * Math.sin(cam.pitch),
        cam.target.z + r * Math.cos(cam.pitch) * Math.cos(cam.yaw)
      );
      camera.lookAt(cam.target);
    }
    applyCamera();

    scene3.add(new THREE.AmbientLight(0x9eb4d4, 0.55));
    const key = new THREE.DirectionalLight(0xfff5e0, 0.7);
    key.position.set(8, 16, 6);
    scene3.add(key);
    const rim = new THREE.DirectionalLight(0x6ae0d0, 0.35);
    rim.position.set(-10, 8, -6);
    scene3.add(rim);

    // Initial ground/grid for the mount-time build area; a dedicated effect
    // rebuilds it whenever the build area changes.
    const groundGroup = buildGround(buildArea);
    scene3.add(groundGroup);

    const partsGroup = new THREE.Group();
    scene3.add(partsGroup);
    const obstaclesGroup = new THREE.Group();
    scene3.add(obstaclesGroup);
    const ghostGroup = new THREE.Group();
    scene3.add(ghostGroup);
    const hoverGroup = new THREE.Group();
    scene3.add(hoverGroup);
    const overlayGroup = new THREE.Group();
    scene3.add(overlayGroup);
    const planeGroup = new THREE.Group();
    scene3.add(planeGroup);
    const portsGroup = new THREE.Group();
    scene3.add(portsGroup);
    const labelsGroup = new THREE.Group();
    scene3.add(labelsGroup);

    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const hoverPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hoverPlane.rotation.x = -Math.PI / 2;
    scene3.add(hoverPlane);

    stateRef.current = {
      renderer,
      scene3,
      camera,
      cam,
      applyCamera,
      partsGroup,
      obstaclesGroup,
      ghostGroup,
      hoverGroup,
      overlayGroup,
      planeGroup,
      portsGroup,
      labelsGroup,
      groundGroup,
      hoverPlane
    };

    let drag = createViewportDragState();
    let lastHoverCell: Vec3 | null = null;
    // Right-drag pans the camera rig: we translate cam.target (and therefore the
    // camera with it) along the camera's screen-space right/up axes.
    let panning = false;
    let panX = 0;
    let panY = 0;
    const panRight = new THREE.Vector3();
    const panUp = new THREE.Vector3();

    const onDown = (e: MouseEvent) => {
      if (e.button === 2) {
        panning = true;
        panX = e.clientX;
        panY = e.clientY;
        return;
      }
      if (e.button !== 0) return;
      drag = beginViewportDrag(drag, { x: e.clientX, y: e.clientY });
    };
    const onMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (panning && e.buttons & 2) {
        const dx = e.clientX - panX;
        const dy = e.clientY - panY;
        panX = e.clientX;
        panY = e.clientY;
        // World units per screen pixel at the target plane, so the scene tracks
        // the cursor 1:1 and panning feels consistent at any zoom level.
        const worldPerPixel =
          (2 * cam.distance * Math.tan(((camera.fov * Math.PI) / 180) / 2)) / rect.height;
        camera.updateMatrixWorld();
        camera.matrixWorld.extractBasis(panRight, panUp, new THREE.Vector3());
        cam.target.addScaledVector(panRight, -dx * worldPerPixel);
        cam.target.addScaledVector(panUp, dy * worldPerPixel);
        applyCamera();
        return;
      }
      const moved = moveViewportDrag(drag, { x: e.clientX, y: e.clientY }, e.buttons);
      drag = moved.state;
      if (moved.delta) {
        cam.yaw -= moved.delta.x * 0.008;
        cam.pitch = Math.max(0.12, Math.min(1.45, cam.pitch + moved.delta.y * 0.005));
        applyCamera();
      }
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(mouse, camera);
      const cell = pickCell(ray);
      if (cell) {
        if (
          !lastHoverCell ||
          cell[0] !== lastHoverCell[0] ||
          cell[1] !== lastHoverCell[1] ||
          cell[2] !== lastHoverCell[2]
        ) {
          lastHoverCell = cell;
          callbacksRef.current.onHover?.(cell);
        }
      }
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 2) {
        panning = false;
        return;
      }
      if (drag.active && isViewportClick(drag, { x: e.clientX, y: e.clientY })) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        ray.setFromCamera(mouse, camera);
        const pickedPart = ray.intersectObjects(partsGroup.children, true)[0];
        const partId = pickedPart ? partIdForObject(pickedPart.object) : undefined;
        const cell = clickCellForTool(toolRef.current, pickCell(ray), pickedPart?.point);
        if (cell) {
          callbacksRef.current.onPlace?.(cell, e, partId ? { partId } : undefined);
        }
      }
      drag = endViewportDrag(drag);
    };

    function pickCell(rayInstance: THREE.Raycaster): Vec3 | null {
      const landingHit = rayInstance.intersectObjects(overlayGroup.children, true)[0];
      if (landingHit) {
        const landing = landingCellForObject(landingHit.object);
        if (landing) return landing;
      }
      const planeHit = rayInstance.intersectObject(hoverPlane)[0];
      if (planeHit) {
        return [
          Math.floor(planeHit.point.x),
          Math.floor(hoverPlane.position.y),
          Math.floor(planeHit.point.z)
        ];
      }
      return null;
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.distance = Math.max(8, Math.min(80, cam.distance * (1 + e.deltaY * 0.0015)));
      applyCamera();
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const dom = renderer.domElement;
    dom.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("contextmenu", onContextMenu);

    const onExternalZoom = (ev: Event) => {
      const delta = (ev as CustomEvent<number>).detail ?? 0;
      cam.distance = Math.max(8, Math.min(80, cam.distance * (1 + delta)));
      applyCamera();
    };
    const onResetView = () => {
      cam.yaw = 0.55;
      cam.pitch = 0.55;
      cam.distance = 32;
      cam.target.set(0, 0.5, 1);
      applyCamera();
    };
    window.addEventListener("ptsb-zoom", onExternalZoom);
    window.addEventListener("ptsb-reset-view", onResetView);

    let raf = 0;
    const tick = () => {
      renderer.render(scene3, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => {
      const W = mount.clientWidth;
      const H = mount.clientHeight;
      renderer.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      updateLineResolutions(scene3, W, H);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    stateRef.current.cleanup = () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("ptsb-zoom", onExternalZoom);
      window.removeEventListener("ptsb-reset-view", onResetView);
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      // Everything we built hangs off scene3 — including whichever ground group
      // the build-area effect installed most recently — so one traversal frees it
      // all. StrictMode remounts this effect in dev, so it runs more than once.
      disposeObject(scene3);
      renderer.dispose();
    };
    return () => stateRef.current.cleanup?.();
  }, []);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.cam || !s.applyCamera || !camCfg) return;
    s.cam.yaw = camCfg.yaw ?? s.cam.yaw;
    s.cam.pitch = camCfg.pitch ?? s.cam.pitch;
    s.cam.distance = camCfg.distance ?? s.cam.distance;
    s.applyCamera();
  }, [camCfg?.yaw, camCfg?.pitch, camCfg?.distance]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.partsGroup || !s.obstaclesGroup) return;
    clearGroup(s.partsGroup);
    clearGroup(s.obstaclesGroup);
    for (const o of scene.obstacles ?? []) {
      s.obstaclesGroup.add(buildObstacleMesh(o.min, o.max));
    }
    for (const p of scene.parts ?? []) {
      let mesh: THREE.Group | null = null;
      if (p.type === "blower") {
        mesh = buildBlowerMesh();
        const c = cellCenter(p.cell);
        mesh.position.set(c[0], c[1], c[2]);
        mesh.quaternion.copy(dirToQuat(p.dir));
      } else if (p.type === "terminal") {
        mesh = buildTerminalMesh();
        const c = cellCenter(p.cell);
        mesh.position.set(c[0], c[1], c[2]);
        mesh.quaternion.copy(dirToQuat(p.axis));
      } else if (p.type === "tube") {
        mesh = buildTubeMesh(p.from, p.to);
      } else if (p.type === "bend") {
        mesh = buildBendMesh(p);
      }
      if (mesh) {
        mesh.userData.partId = p.id;
        s.partsGroup.add(mesh);
      }
    }
    if (s.renderer) {
      const size = s.renderer.getSize(new THREE.Vector2());
      updateLineResolutions(s.obstaclesGroup, size.x, size.y);
    }
  }, [scene]);

  // Rebuild the ground plane + grid when the configured build area changes.
  useEffect(() => {
    const s = stateRef.current;
    if (!s.scene3) return;
    if (s.groundGroup) {
      s.scene3.remove(s.groundGroup);
      disposeObject(s.groundGroup);
    }
    const ground = buildGround(buildArea);
    s.scene3.add(ground);
    s.groundGroup = ground;
  }, [buildArea.width, buildArea.depth, buildArea.height]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.ghostGroup) return;
    clearGroup(s.ghostGroup);
    if (!ghost) return;
    let mesh: THREE.Group | null = null;
    if (ghost.type === "blower") {
      mesh = buildBlowerMesh({ ghost: true });
      const c = cellCenter(ghost.cell);
      mesh.position.set(c[0], c[1], c[2]);
      mesh.quaternion.copy(dirToQuat(ghost.dir));
    } else if (ghost.type === "terminal") {
      mesh = buildTerminalMesh({ ghost: true });
      const c = cellCenter(ghost.cell);
      mesh.position.set(c[0], c[1], c[2]);
      mesh.quaternion.copy(dirToQuat(ghost.axis));
    } else if (ghost.type === "tube") {
      mesh = buildTubeMesh(ghost.from, ghost.to, {
        ghost: true,
        blocked: ghost.blocked,
        accent: !ghost.blocked
      });
    } else if (ghost.type === "bend") {
      mesh = buildBendMesh(ghost, { ghost: true, accent: true });
    } else if (ghost.type === "obstacle") {
      mesh = buildObstacleMesh(ghost.min, ghost.max, { ghost: true });
    }
    if (mesh) s.ghostGroup.add(mesh);
    if (s.renderer) {
      const size = s.renderer.getSize(new THREE.Vector2());
      updateLineResolutions(s.ghostGroup, size.x, size.y);
    }
  }, [ghost]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.overlayGroup) return;
    clearGroup(s.overlayGroup);
    for (const cell of landingCells) {
      s.overlayGroup.add(buildLandingCellHighlight(cell, tool));
    }
  }, [landingCells, tool]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.planeGroup || !s.hoverPlane) return;
    clearGroup(s.planeGroup);
    s.hoverPlane.position.y = activeElevation;
  }, [activeElevation]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.portsGroup) return;
    const group = s.portsGroup;
    clearGroup(group);
    for (const marker of portMarkers) {
      group.add(buildPortGlow(marker));
    }
  }, [portMarkers]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.labelsGroup) return;
    const group = s.labelsGroup;
    clearGroup(group);
    if (!showLabels) return;
    for (const label of labels) {
      group.add(buildLabelSprite(label));
    }
  }, [labels, showLabels]);

  return (
    <div
      ref={mountRef}
      style={{ position: "absolute", inset: 0, cursor: tool && tool !== "cursor" ? "crosshair" : "grab" }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
