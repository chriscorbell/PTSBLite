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

function buildTransportArrow(
  dir: THREE.Vector3 = new THREE.Vector3(1, 0, 0),
  from: Vec3 = [-0.38, 0.82, 0]
): THREE.ArrowHelper {
  return new THREE.ArrowHelper(
    dir,
    new THREE.Vector3(from[0], from[1], from[2]),
    0.82,
    VP.accent,
    0.22,
    0.14
  );
}

/**
 * A blower: the power unit at the foot of a Kel2020 stack.
 *
 * Modelled from the photographs and drawings at kellytubesystems.com/kel2020 —
 * a squat drum, a stepped neck, a metal collar where the tube leaves it, and a
 * green power light on its side. Approximate rather than dimensioned, which is
 * what the client accepted as the final Lite build (ADR-0026); the foot it
 * occupies still comes from the app, not from the media.
 *
 * The drum's axis is the port axis, because `dirToQuat` turns this whole group
 * to map +X onto the direction the blower faces. A blower with its hole up
 * therefore stands on the floor the way the real unit does, with the tube
 * leaving its top, and one turned to a side lies along its own run.
 */
export function buildBlowerMesh({ ghost = false } = {}): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({
    color: VP.blower,
    roughness: 0.62,
    metalness: 0.2,
    transparent: ghost,
    opacity: ghost ? 0.45 : 1
  });
  // A cylinder is built around +Y, so every piece of the unit turns a quarter
  // turn about Z to stand along the port axis instead.
  const drumGeom = new THREE.CylinderGeometry(0.45, 0.42, 0.56, 28);
  const drum = new THREE.Mesh(drumGeom, shell);
  drum.rotation.z = Math.PI / 2;
  drum.position.x = -0.18;
  g.add(drum);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.06, 28), shell);
  foot.rotation.z = Math.PI / 2;
  foot.position.x = -0.45;
  g.add(foot);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.34, 0.35, 24), shell);
  neck.rotation.z = Math.PI / 2;
  neck.position.x = 0.27;
  g.add(neck);
  // The green power light, near the top of the drum on the real unit.
  const light = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12),
    new THREE.MeshBasicMaterial({ color: VP.signal, transparent: ghost, opacity: ghost ? 0.6 : 1 })
  );
  light.rotation.x = Math.PI / 2;
  light.position.set(0.02, 0, 0.44);
  g.add(light);
  const flange = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.1, 24),
    new THREE.MeshStandardMaterial({ color: VP.blowerEdge, roughness: 0.35, metalness: 0.3 })
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
  // Threshold well above the 13° between neighbouring side faces, so the rims
  // are drawn and the seams down the barrel are not.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(drumGeom, 30),
    new THREE.LineBasicMaterial({
      color: VP.blowerEdge,
      transparent: ghost,
      opacity: ghost ? 0.6 : 0.8
    })
  );
  edges.rotation.z = Math.PI / 2;
  edges.position.x = -0.18;
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

/**
 * The mast under a blower with a pedestal: straight tube from the underside of
 * the unit down to the floor, with a foot plate where it lands.
 *
 * Built as a sibling of the blower rather than a child of it, because the
 * blower's group is turned to face its port and the mast must stay vertical
 * however the unit is pointed. Positioned by the caller at the blower's cell
 * centre, so `feet` runs downward from the origin.
 */
export function buildPedestalMesh(feet: number, { ghost = false } = {}): THREE.Group | null {
  if (feet <= 0) return null;
  const g = new THREE.Group();
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(TUBE_R, TUBE_R, feet, 18),
    new THREE.MeshStandardMaterial({
      color: VP.tube,
      roughness: 0.45,
      metalness: 0.25,
      transparent: ghost,
      opacity: ghost ? 0.6 : 1
    })
  );
  mast.position.y = -0.46 - feet / 2;
  g.add(mast);
  const foot = new THREE.Mesh(
    new THREE.CylinderGeometry(TUBE_R * 2.1, TUBE_R * 2.1, 0.12, 20),
    new THREE.MeshStandardMaterial({
      color: VP.blowerEdge,
      roughness: 0.5,
      metalness: 0.5,
      transparent: ghost,
      opacity: ghost ? 0.6 : 1
    })
  );
  foot.position.y = -0.46 - feet + 0.06;
  g.add(foot);
  return g;
}

/**
 * A terminal: one square of floor, two feet of it standing up.
 *
 * Modelled from the media at kellytubesystems.com/kel2020 (ADR-0026): a clear
 * barrel ribbed along its length, held between two brushed collars, with the
 * slatted door cage over the front and the green wordmark down it. The send
 * button sits on the lower collar, where it is on the real unit.
 *
 * Unlike a blower, the group is not turned to face its port — a terminal is a
 * cabinet on the floor, and turning the whole body would lie it on its side the
 * moment its ports ran vertically. The body stays upright and only the two port
 * fittings move: to the top and bottom faces for a vertical axis, and around to
 * the sides, yawed to the heading, for a horizontal one. Where they sit is the
 * geometry `terminalPortAnchor` reports, so the tube meets the fitting it is
 * drawn leaving.
 *
 * The door rides on the body rather than on the ports, so it turns with the
 * yaw a horizontal axis applies and ends up across the run — which is where it
 * belongs, since a carrier is loaded from the front while the tube leaves the
 * side.
 *
 * The group's origin is the centre of the cell the terminal was placed in, so
 * the body runs from that cell's floor to the top of the cell above it.
 */
export function buildTerminalMesh({
  axis = [0, 1, 0],
  ghost = false
}: { axis?: Vec3; ghost?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  const vertical = axis[1] !== 0;
  // Half a foot below the origin to the base, one and a half above it to the
  // top: two cells of body, inset a little as the blower's drum is.
  const topY = 1.45;
  const baseY = -0.45;
  const collarH = 0.2;

  // Metalness is kept low across the unit on purpose: the scene has no
  // environment map, so a metalness much above a third has nothing to reflect
  // and renders as near-black — which is how the brushed collars first came
  // out, indistinguishable from the barrel between them.
  const collarMat = new THREE.MeshStandardMaterial({
    color: VP.terminal,
    roughness: 0.32,
    metalness: 0.28,
    transparent: ghost,
    opacity: ghost ? 0.45 : 1
  });
  for (const y of [baseY + collarH / 2, topY - collarH / 2]) {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, collarH, 28), collarMat);
    collar.position.y = y;
    g.add(collar);
  }
  // The barrel a carrier is loaded into: clear on the real unit, so nearly
  // transparent here rather than tinted, which is what tells it apart from the
  // blower at a glance.
  const barrelGeom = new THREE.CylinderGeometry(0.34, 0.34, 1.5, 28);
  const barrel = new THREE.Mesh(
    barrelGeom,
    new THREE.MeshStandardMaterial({
      color: VP.terminalGlass,
      roughness: 0.12,
      metalness: 0.05,
      // A little of its own light, or the barrel takes the colour of whatever is
      // behind it — which in this scene is a nearly black floor, and a clear
      // barrel that renders black is worse than no barrel at all.
      emissive: VP.terminalGlass,
      emissiveIntensity: 0.14,
      transparent: true,
      opacity: ghost ? 0.18 : 0.42
    })
  );
  barrel.position.y = 0.5;
  g.add(barrel);
  const ribMat = new THREE.MeshStandardMaterial({
    color: VP.terminalEdge,
    roughness: 0.4,
    metalness: 0.22,
    transparent: ghost,
    opacity: ghost ? 0.5 : 1
  });
  for (const y of [-0.1, 0.28, 0.66, 1.04]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.012, 8, 24), ribMat);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = y;
    g.add(rib);
  }
  // The hinged door over the barrel: two uprights and the slats between them.
  // The door is a shell wrapped round the front of the barrel rather than a set
  // of separate bars: at the size a terminal is actually looked at, bars read as
  // a ladder leaning against the unit. Left part-transparent because the real
  // door is slotted and the carrier shows through it.
  const doorSpan = (100 * Math.PI) / 180;
  const doorR = 0.375;
  const door = new THREE.Mesh(
    new THREE.CylinderGeometry(doorR, doorR, 1.34, 24, 1, true, -doorSpan / 2, doorSpan),
    new THREE.MeshStandardMaterial({
      color: VP.terminalDoor,
      roughness: 0.5,
      metalness: 0.3,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: ghost ? 0.35 : 0.72
    })
  );
  door.position.y = 0.5;
  g.add(door);
  // The hinge and the latch, standing at the door's two edges.
  const doorEdgeMat = new THREE.MeshStandardMaterial({
    color: VP.terminalDoor,
    roughness: 0.5,
    metalness: 0.3,
    transparent: ghost,
    opacity: ghost ? 0.5 : 1
  });
  for (const side of [1, -1]) {
    const edgeAngle = (side * doorSpan) / 2;
    const stile = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.36, 0.06), doorEdgeMat);
    stile.position.set(doorR * Math.sin(edgeAngle), 0.5, doorR * Math.cos(edgeAngle));
    stile.rotation.y = edgeAngle;
    g.add(stile);
  }
  const mark = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.1, 0.02),
    new THREE.MeshBasicMaterial({ color: VP.signal, transparent: ghost, opacity: ghost ? 0.6 : 1 })
  );
  mark.position.set(0, 0.62, 0.358);
  g.add(mark);
  // Send button, on the lower collar where the drawing puts it.
  const send = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12),
    new THREE.MeshBasicMaterial({ color: VP.signal, transparent: ghost, opacity: ghost ? 0.6 : 1 })
  );
  send.rotation.x = Math.PI / 2;
  send.position.set(0, baseY + collarH / 2, 0.36);
  g.add(send);

  const mat = new THREE.MeshStandardMaterial({
    color: VP.terminalEdge,
    roughness: 0.4,
    metalness: 0.5
  });
  // Where each port leaves the body, and which way it faces. A vertical axis
  // puts them on the top and bottom faces of the 2 ft body; a horizontal one on
  // opposite sides of its lower foot, which is the cell those ports connect
  // from.
  const fittings: { at: THREE.Vector3; out: THREE.Vector3 }[] = vertical
    ? [
        { at: new THREE.Vector3(0, topY, 0), out: new THREE.Vector3(0, 1, 0) },
        { at: new THREE.Vector3(0, baseY, 0), out: new THREE.Vector3(0, -1, 0) }
      ]
    : [
        { at: new THREE.Vector3(0.5, 0, 0), out: new THREE.Vector3(1, 0, 0) },
        { at: new THREE.Vector3(-0.5, 0, 0), out: new THREE.Vector3(-1, 0, 0) }
      ];
  for (const { at, out } of fittings) {
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 24), mat);
    if (out.y === 0) flange.rotation.z = Math.PI / 2;
    flange.position.copy(at);
    g.add(flange);
    const hole = new THREE.Mesh(
      new THREE.CylinderGeometry(TUBE_R + 0.01, TUBE_R + 0.01, 0.12, 18),
      new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 1 })
    );
    if (out.y === 0) hole.rotation.z = Math.PI / 2;
    hole.position.copy(at).addScaledVector(out, 0.02);
    g.add(hole);
  }

  // Rims only: the threshold is well above the 13° between neighbouring side
  // faces, so the barrel keeps its outline without a seam down every segment.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(barrelGeom, 30),
    new THREE.LineBasicMaterial({
      color: VP.terminalEdge,
      transparent: ghost,
      opacity: ghost ? 0.6 : 0.75
    })
  );
  edges.position.y = 0.5;
  g.add(edges);
  if (ghost) {
    // The arrow says which way the run leaves, so it follows the ports rather
    // than the body: up the axis when they are vertical, out the side when not.
    const arrow = vertical
      ? buildTransportArrow(new THREE.Vector3(0, Math.sign(axis[1]), 0), [0.9, 0.5, 0])
      : buildTransportArrow(new THREE.Vector3(1, 0, 0), [-0.38, 0.82, 0]);
    g.add(arrow);
  }
  // Yaw only, so a horizontal axis turns the fittings to their heading while
  // the cabinet stays standing. A vertical axis needs no turn at all.
  if (!vertical) g.rotation.y = Math.atan2(-axis[2], axis[0]);
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

/** How much of a foot a sleeve covers, and how far it stands off the tube. */
const SLEEVE_LENGTH = 0.42;
const SLEEVE_R = TUBE_R + 0.045;

/**
 * A split sleeve: the bolted collar that joins one piece of tube to the next.
 *
 * Modelled from the Kel2020 media the client pointed at — a band a little wider
 * than the tube and about a diameter long, split along its length and closed by
 * a raised pair of flanges carrying three bolts. The shell is open at both ends
 * because it wraps a tube rather than capping it: the run stays visible running
 * through it.
 *
 * Shell and flange take the tube's own finish, not just a colour near it. A
 * standard material with no environment map loses diffuse as metalness rises,
 * so a sleeve finished more metallic than the tube renders darker than its hex
 * suggests — which is what made these read as a different material.
 *
 * Built along +Y like every cylinder here and turned onto the run's axis by the
 * caller's `along`. A real sleeve can be clocked any way round the tube the
 * installer likes, so the flange is aimed where it can be seen: upward on a
 * horizontal run, and out along +X on a vertical one. Turning by the axis alone
 * would leave it pointing at the floor on every east–west run, which is the
 * detail that says "split sleeve" rather than "band" hidden underneath.
 *
 * Sleeves are derived rather than placed (ADR-0022), so these carry no
 * `partId` and live outside the group the viewport picks against — clicking one
 * with the erase tool passes through to the tube it sits on.
 */
export function buildSplitSleeveMesh(at: Vec3, along: Vec3): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({
    color: VP.sleeve,
    roughness: 0.45,
    metalness: 0.25
  });
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(SLEEVE_R, SLEEVE_R, SLEEVE_LENGTH, 16, 1, true),
    body
  );
  g.add(shell);
  const flange = new THREE.Mesh(new THREE.BoxGeometry(0.1, SLEEVE_LENGTH * 0.94, 0.05), body);
  flange.position.x = SLEEVE_R + 0.04;
  g.add(flange);
  const boltGeom = new THREE.CylinderGeometry(0.019, 0.019, 0.11, 8);
  const boltMat = new THREE.MeshStandardMaterial({
    color: VP.sleeveBolt,
    roughness: 0.35,
    metalness: 0.8
  });
  for (const offset of [-0.13, 0, 0.13]) {
    const bolt = new THREE.Mesh(boltGeom, boltMat);
    // Through the flange, so the bolt runs tangentially rather than up the tube.
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(SLEEVE_R + 0.04, offset, 0);
    g.add(bolt);
  }
  g.position.set(at[0], at[1], at[2]);
  const axis = v3(along).normalize();
  // Local +Y onto the run, local +X onto the side the flange should face.
  const flangeOut =
    Math.abs(axis.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const third = new THREE.Vector3().crossVectors(flangeOut, axis);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(flangeOut, axis, third));
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
  // The kinds share their geometry, edges and hatching; color alone tells them
  // apart — red for a volume routing must avoid, steel blue for one it may
  // pass through.
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
  const hatchMat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: ghost ? 0.25 : 0.4
  });
  // 45° hatch lines on every face. Each face is a rectangle in some (u, v)
  // plane; a hatch line is the locus u - v = c. Sweep c across the rectangle
  // and clip each line to it by its v-parameter — clamping u and v
  // independently bends the diagonals. `place` lifts (u, v) into the face's
  // 3D plane, offset slightly outward so the lines never z-fight the box.
  const lines: number[] = [];
  // The hatch spacing grows with the box. A fixed 0.6 ft was tuned for
  // furniture-sized obstacles; across a 60 ft room wall it packs hundreds of
  // diagonals per face and dissolves into moiré at any distance.
  const step = Math.max(0.6, Math.max(sx, sy, sz) / 40);
  const hatchFace = (
    u0: number,
    u1: number,
    v0: number,
    v1: number,
    place: (u: number, v: number) => [number, number, number]
  ) => {
    const cMin = u0 - v1;
    const cMax = u1 - v0;
    for (let c = cMin; c < cMax; c += step) {
      const vLo = Math.max(v0, u0 - c);
      const vHi = Math.min(v1, u1 - c);
      if (vHi > vLo) lines.push(...place(vLo + c, vLo), ...place(vHi + c, vHi));
    }
  };
  const x0 = min[0],
    x1 = max[0] + 1;
  const y0 = min[1],
    y1 = max[1] + 1;
  const z0 = min[2],
    z1 = max[2] + 1;
  const lift = 0.002;
  hatchFace(x0, x1, z0, z1, (u, v) => [u, y1 + lift, v]); // top
  hatchFace(x0, x1, z0, z1, (u, v) => [u, y0 - lift, v]); // bottom
  hatchFace(x0, x1, y0, y1, (u, v) => [u, v, z1 + lift]); // south
  hatchFace(x0, x1, y0, y1, (u, v) => [u, v, z0 - lift]); // north
  hatchFace(z0, z1, y0, y1, (u, v) => [x1 + lift, v, u]); // east
  hatchFace(z0, z1, y0, y1, (u, v) => [x0 - lift, v, u]); // west
  if (lines.length) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    g.add(new THREE.LineSegments(lg, hatchMat));
  }
  return g;
}
