import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { TUBE_R, v3, VP } from "@/renderer/three-utils";
import type { Vec3 } from "@/types";

/**
 * Meshes for the things a design is made of: blower, terminal, tube, bend and
 * obstacle. One module because they share the tube radius, the palette and the
 * ghost/solid convention, and because they are rebuilt together whenever the
 * design changes.
 *
 * Scene furniture — the ground, landing highlights, port glows, labels — lives
 * in scene-affordances.ts. It belongs to different scene groups with different
 * update lifecycles, which is the seam that matters here rather than file size.
 */

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

export function buildBlowerMesh({ ghost = false } = {}): THREE.Group {
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
    new THREE.LineBasicMaterial({
      color: VP.blowerEdge,
      transparent: ghost,
      opacity: ghost ? 0.6 : 0.8
    })
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

export function buildTerminalMesh({ ghost = false } = {}): THREE.Group {
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
  const mat = new THREE.MeshStandardMaterial({
    color: VP.terminalEdge,
    roughness: 0.4,
    metalness: 0.5
  });
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
    new THREE.LineBasicMaterial({
      color: VP.terminalEdge,
      transparent: ghost,
      opacity: ghost ? 0.6 : 0.75
    })
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

export type BendShape = {
  entry: Vec3;
  exit: Vec3;
  center: Vec3;
  inDir: Vec3;
  outDir: Vec3;
  radius?: number;
};

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

export function buildTubeMesh(
  from: Vec3,
  to: Vec3,
  {
    ghost = false,
    blocked = false,
    accent = false
  }: { ghost?: boolean; blocked?: boolean; accent?: boolean } = {}
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

export function buildBendMesh(
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

export function buildObstacleMesh(
  min: Vec3,
  max: Vec3,
  opts: { ghost?: boolean; penetrable?: boolean } = {}
): THREE.Group {
  const ghost = !!opts.ghost;
  // Penetrable volumes are steel blue and unhatched; the red diagonal hatching
  // stays the mark of a volume routing must keep out of.
  const color = opts.penetrable ? VP.obstaclePenetrable : VP.obstacle;
  const sx = max[0] - min[0] + 1;
  const sy = max[1] - min[1] + 1;
  const sz = max[2] - min[2] + 1;
  const cx = (min[0] + max[0] + 1) / 2;
  const cy = (min[1] + max[1] + 1) / 2;
  const cz = (min[2] + max[2] + 1) / 2;
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color,
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
      color,
      linewidth: 1.5,
      transparent: true,
      opacity: ghost ? 0.45 : 0.7,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
    })
  );
  edges.position.set(cx, cy, cz);
  g.add(edges);
  if (opts.penetrable) return g;
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
