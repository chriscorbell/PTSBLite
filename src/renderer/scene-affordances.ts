import * as THREE from "three";
import { TUBE_R, VP } from "@/renderer/three-utils";
import { boundsFromBuildArea } from "@/domain/sparse-grid";
import type { PortMarker } from "@/domain/renderer-affordances";
import type { RoomRect } from "@/domain/floors";
import type { BuildArea, ToolId, Vec3 } from "@/types";

/**
 * Everything the viewport draws that is not part of the design: the ground and
 * its grid, the highlighted cells a tool can land on, and the glowing open
 * ports.
 *
 * Separate from design-meshes.ts because these live in their own scene groups
 * and are rebuilt on different triggers — the ground on a build-area change,
 * highlights on a tool change — rather than with the design.
 */

function buildGroundLines(
  positions: number[],
  color: number,
  opacity: number,
  y: number
): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const lines = new THREE.LineSegments(geo, mat);
  lines.position.y = y;
  return lines;
}

/**
 * `dimmed` fades a level's grid when the other floor is active, so the screen
 * always says which floor placement happens on.
 */
export function buildGround(area: BuildArea, dimmed = false): THREE.Group {
  const g = new THREE.Group();
  const b = boundsFromBuildArea(area);
  // Footprint may be off-center for odd dimensions; center the plane on it.
  const cx = (b.xMin + b.xMax) / 2;
  const cz = (b.zMin + b.zMax) / 2;
  const fade = dimmed ? 0.35 : 1;

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
  g.add(buildGroundLines(minor, VP.grid, 0.45 * fade, 0));
  g.add(buildGroundLines(major, VP.gridStrong, 0.7 * fade, 0.001));
  return g;
}

/**
 * The room's floor: the same plane as the ground, a step brighter, over the
 * room's footprint only — the border between the two brightnesses is what
 * tells a visitor where the room ends and the rest of the build area begins.
 */
export function buildRoomFloor(rect: RoomRect, dimmed = false): THREE.Group {
  const g = new THREE.Group();
  const cx = (rect.xMin + rect.xMax) / 2;
  const cz = (rect.zMin + rect.zMax) / 2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(rect.xMax - rect.xMin, rect.zMax - rect.zMin),
    new THREE.MeshBasicMaterial({
      color: VP.groundRoom,
      transparent: dimmed,
      opacity: dimmed ? 0.5 : 1
    })
  );
  floor.rotation.x = -Math.PI / 2;
  // Between the ground plane (-0.005) and the grid lines (0), so the grid
  // stays visible across the room.
  floor.position.set(cx, -0.003, cz);
  g.add(floor);
  return g;
}

/**
 * The room's walls: faintly translucent slabs in the separator's material, so
 * walls and ceiling read as one structure. No hatch — that stays the mark of
 * an obstacle a visitor placed. Fill sits below the slab's opacity because a
 * viewer looks through two walls at once, and no depth writes, so the room's
 * interior stays legible from any angle. Like penetrable obstacles the walls
 * claim no grid cells; unlike them they are scenery — no part of the design,
 * not erasable, absent from the BOM.
 */
export function buildRoomWalls(walls: Array<{ min: Vec3; max: Vec3 }>): THREE.Group {
  const g = new THREE.Group();
  for (const wall of walls) {
    const sx = wall.max[0] - wall.min[0] + 1;
    const sy = wall.max[1] - wall.min[1] + 1;
    const sz = wall.max[2] - wall.min[2] + 1;
    const geom = new THREE.BoxGeometry(sx, sy, sz);
    const slab = new THREE.Mesh(
      geom,
      new THREE.MeshBasicMaterial({
        color: VP.gridStrong,
        transparent: true,
        opacity: 0.16,
        depthWrite: false
      })
    );
    slab.position.set(
      (wall.min[0] + wall.max[0] + 1) / 2,
      (wall.min[1] + wall.max[1] + 1) / 2,
      (wall.min[2] + wall.max[2] + 1) / 2
    );
    g.add(slab);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geom),
      new THREE.LineBasicMaterial({ color: VP.gridStrong, transparent: true, opacity: 0.7 })
    );
    edges.position.copy(slab.position);
    g.add(edges);
  }
  return g;
}

/**
 * The structural slab between the floors of a two-floor design, spanning one
 * foot upward from `separatorY`. Purely visual: it occupies no grid cells, so
 * tubes can pass through it to reach the storey above.
 *
 * Translucent, without depth writes, so the lower floor stays legible through
 * it from above. Its top face carries the same grid as the ground, because it
 * is the second storey's floor and placement happens on it.
 */
export function buildFloorSeparator(
  rect: RoomRect,
  separatorY: number,
  dimmed = false
): THREE.Group {
  const g = new THREE.Group();
  const b = rect;
  const cx = (b.xMin + b.xMax) / 2;
  const cz = (b.zMin + b.zMax) / 2;
  const fade = dimmed ? 0.45 : 1;

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(b.xMax - b.xMin, 1, b.zMax - b.zMin),
    new THREE.MeshBasicMaterial({
      color: VP.gridStrong,
      transparent: true,
      opacity: 0.28 * fade,
      depthWrite: false
    })
  );
  slab.position.set(cx, separatorY + 0.5, cz);
  g.add(slab);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(slab.geometry),
    new THREE.LineBasicMaterial({ color: VP.gridStrong, transparent: true, opacity: 0.8 * fade })
  );
  edges.position.copy(slab.position);
  g.add(edges);

  const minor: number[] = [];
  const major: number[] = [];
  for (let x = b.xMin; x <= b.xMax; x++) {
    (x % 5 === 0 ? major : minor).push(x, 0, b.zMin, x, 0, b.zMax);
  }
  for (let z = b.zMin; z <= b.zMax; z++) {
    (z % 5 === 0 ? major : minor).push(b.xMin, 0, z, b.xMax, 0, z);
  }
  g.add(buildGroundLines(minor, VP.grid, 0.3 * fade, separatorY + 1.001));
  g.add(buildGroundLines(major, VP.gridStrong, 0.5 * fade, separatorY + 1.002));
  return g;
}

/**
 * A floor's plenum: the space between its drop ceiling and its top, tinted so
 * it reads differently from the room below while remaining fully buildable.
 * The line along the bottom face marks the drop ceiling itself. Amber rather
 * than the accent teal, which is reserved for placement affordances.
 */
export function buildPlenumBand(
  rect: RoomRect,
  band: { base: number; top: number },
  dimmed = false
): THREE.Group {
  const g = new THREE.Group();
  const b = rect;
  const cx = (b.xMin + b.xMax) / 2;
  const cz = (b.zMin + b.zMax) / 2;
  const height = band.top - band.base;
  const fade = dimmed ? 0.4 : 1;

  const fill = new THREE.Mesh(
    new THREE.BoxGeometry(b.xMax - b.xMin, height, b.zMax - b.zMin),
    new THREE.MeshBasicMaterial({
      color: VP.warn,
      transparent: true,
      opacity: 0.05 * fade,
      depthWrite: false
    })
  );
  fill.position.set(cx, band.base + height / 2, cz);
  g.add(fill);

  const ceiling: number[] = [
    b.xMin,
    0,
    b.zMin,
    b.xMax,
    0,
    b.zMin,
    b.xMax,
    0,
    b.zMin,
    b.xMax,
    0,
    b.zMax,
    b.xMax,
    0,
    b.zMax,
    b.xMin,
    0,
    b.zMax,
    b.xMin,
    0,
    b.zMax,
    b.xMin,
    0,
    b.zMin
  ];
  g.add(buildGroundLines(ceiling, VP.warn, 0.4 * fade, band.base));
  return g;
}

/**
 * A visible stand-in for the invisible placement plane, drawn while a tool
 * that places on the plane is armed above the ground. Without it, moving the
 * elevation changed nothing on screen, and an elevated ghost was
 * indistinguishable from a grounded one a few cells away.
 */
export function buildElevationPlane(area: BuildArea, elevation: number): THREE.Group {
  const g = new THREE.Group();
  const b = boundsFromBuildArea(area);
  const cx = (b.xMin + b.xMax) / 2;
  const cz = (b.zMin + b.zMax) / 2;

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(area.width, area.depth),
    new THREE.MeshBasicMaterial({
      color: VP.accent,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.set(cx, elevation + 0.003, cz);
  g.add(fill);

  const outline: number[] = [
    b.xMin,
    0,
    b.zMin,
    b.xMax,
    0,
    b.zMin,
    b.xMax,
    0,
    b.zMin,
    b.xMax,
    0,
    b.zMax,
    b.xMax,
    0,
    b.zMax,
    b.xMin,
    0,
    b.zMax,
    b.xMin,
    0,
    b.zMax,
    b.xMin,
    0,
    b.zMin
  ];
  g.add(buildGroundLines(outline, VP.accent, 0.55, elevation + 0.004));
  return g;
}

export function buildLandingCellHighlight(cell: Vec3, tool: ToolId): THREE.Group {
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
          cell[0] + 0.05,
          cell[1] + 0.026,
          cell[2] + 0.05,
          cell[0] + 0.95,
          cell[1] + 0.026,
          cell[2] + 0.05,
          cell[0] + 0.95,
          cell[1] + 0.026,
          cell[2] + 0.05,
          cell[0] + 0.95,
          cell[1] + 0.026,
          cell[2] + 0.95,
          cell[0] + 0.95,
          cell[1] + 0.026,
          cell[2] + 0.95,
          cell[0] + 0.05,
          cell[1] + 0.026,
          cell[2] + 0.95,
          cell[0] + 0.05,
          cell[1] + 0.026,
          cell[2] + 0.95,
          cell[0] + 0.05,
          cell[1] + 0.026,
          cell[2] + 0.05
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

export function buildPortGlow(marker: PortMarker): THREE.Group {
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
