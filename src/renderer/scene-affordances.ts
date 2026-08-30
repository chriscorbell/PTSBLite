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
    // polygonOffset pushes the ground back in depth so the room's floor wins
    // cleanly where they overlap: the two planes are 0.002 ft apart, which the
    // depth buffer cannot resolve at distance now that the far plane spans the
    // fixed build area, and relying on the Y gap alone striped the floor with
    // z-fighting. The offset works in depth space, so it holds at any zoom.
    new THREE.MeshBasicMaterial({
      color: VP.ground,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2
    })
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
      opacity: dimmed ? 0.5 : 1,
      // One step of offset, against the ground's two: behind the grid lines,
      // in front of the ground, whatever the camera distance. See buildGround.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
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
 * an obstacle a visitor placed. Fill sits well below the slab's opacity: a
 * viewer looks through two walls at once from outside, so their tint compounds,
 * and the walls exist to say where the room is rather than to be looked at. No
 * depth writes either, so the interior stays legible from any angle. Like penetrable obstacles the walls
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
        opacity: 0.07,
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
      // The edges carry the room's shape now that the faces barely tint, so
      // they stay stronger than the fill rather than fading with it.
      new THREE.LineBasicMaterial({ color: VP.gridStrong, transparent: true, opacity: 0.55 })
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
 * Solid enough to read as structure — it is a real concrete floor, unlike the
 * walls, which only mark where the room is — but still translucent and without
 * depth writes, so the storey below stays legible through it from above. Its
 * top face carries the same grid as the ground, because it is the second
 * storey's floor and placement happens on it.
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
      opacity: 0.5 * fade,
      depthWrite: false
    })
  );
  slab.position.set(cx, separatorY + 0.5, cz);
  g.add(slab);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(slab.geometry),
    new THREE.LineBasicMaterial({ color: VP.gridStrong, transparent: true, opacity: 0.9 * fade })
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
 * The room's ceiling: the lid on the box its four walls make.
 *
 * Drawn in the walls' material rather than the separator's, and deliberately
 * so. The slab between two floors is a real concrete floor you build on, and
 * reads as one; this is the top of the room, and an opaque lid would hide the
 * whole design from every angle above the horizon — including the top-down
 * view the PDF is rendered from. Faint enough to look straight through, strong
 * enough at the edges to close the shape.
 */
export function buildRoomCeiling(rect: RoomRect, top: number): THREE.Group {
  const g = new THREE.Group();
  const cx = (rect.xMin + rect.xMax) / 2;
  const cz = (rect.zMin + rect.zMax) / 2;
  const geom = new THREE.BoxGeometry(
    rect.xMax - rect.xMin,
    ROOM_CEILING_FEET,
    rect.zMax - rect.zMin
  );

  const slab = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({
      color: VP.gridStrong,
      transparent: true,
      opacity: 0.07,
      depthWrite: false
    })
  );
  slab.position.set(cx, top + ROOM_CEILING_FEET / 2, cz);
  g.add(slab);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({ color: VP.gridStrong, transparent: true, opacity: 0.55 })
  );
  edges.position.copy(slab.position);
  g.add(edges);
  return g;
}

/** How thick the ceiling is drawn. Scenery, so it claims no cells. */
const ROOM_CEILING_FEET = 1;

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

/**
 * The shadow an armed part casts onto a floor below it: one square per column
 * it occupies, drawn on the floor plane itself.
 *
 * Deliberately quieter than a landing highlight and outlined rather than
 * filled. A landing cell is somewhere you may click; this is only a statement
 * about where something already is, and the two must not be confused at a
 * glance.
 */
/**
 * The squares under a part, on the floor it stands over.
 *
 * `live` is the armed part's own shadow: accent-coloured and brighter, so the
 * one the visitor is aiming stands out from the ones already placed. A placed
 * part's takes the neutral grey of the parts themselves and stays quiet — a
 * finished design can have hundreds of these, and they are a reference, not
 * the subject.
 */
export function buildFloorShadow(
  cells: Vec3[],
  y: number,
  opts: { live?: boolean } = {}
): THREE.Group {
  const g = new THREE.Group();
  if (cells.length === 0) return g;

  const live = opts.live ?? true;
  const color = live ? VP.accent : VP.tube;
  const fillOpacity = live ? 0.1 : 0.09;
  const lineOpacity = live ? 0.6 : 0.45;
  const outline: number[] = [];
  for (const cell of cells) {
    const x0 = cell[0] + 0.08;
    const x1 = cell[0] + 0.92;
    const z0 = cell[2] + 0.08;
    const z1 = cell[2] + 0.92;
    outline.push(x0, 0, z0, x1, 0, z0);
    outline.push(x1, 0, z0, x1, 0, z1);
    outline.push(x1, 0, z1, x0, 0, z1);
    outline.push(x0, 0, z1, x0, 0, z0);

    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.84, 0.84),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: fillOpacity,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    fill.rotation.x = -Math.PI / 2;
    // Above the floor's own grid lines, which are drawn at the plane itself.
    fill.position.set(cell[0] + 0.5, y + 0.02, cell[2] + 0.5);
    g.add(fill);
  }
  g.add(buildGroundLines(outline, color, lineOpacity, y + 0.022));
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

/**
 * A height marker: the elevation of something, drawn beside it in feet.
 *
 * A sprite carrying canvas-rendered text, so it always faces the camera and
 * stays legible from any orbit — the elevation is a number to read, not a
 * shape to interpret. It replaced a translucent plane spanning the whole build
 * area, which showed *where* the placement height was without ever saying what
 * it was, and which the client found harder to read than a label would be.
 *
 * Sized in world units, so a marker shrinks with the part it labels. The
 * viewport rescales it as the camera moves — see `heightMarkerScale` — which
 * is what stops a label swallowing a part that has zoomed away to a few
 * pixels. `markerAspect` is stashed here because that rescaling has to keep
 * the text's proportions and cannot re-measure the canvas.
 *
 * Note for anyone extending this: sprites share one geometry across the whole
 * library, so a sprite must never have its geometry disposed. `disposeObject`
 * knows that; a bespoke teardown would not.
 */
export function buildHeightMarker(
  at: Vec3,
  feet: number,
  opts: { accent?: boolean; label?: string } = {}
): THREE.Sprite | null {
  const height = `${Number.isInteger(feet) ? feet : feet.toFixed(1)} ft`;
  // Structural levels say what they are; a part's marker is just the number,
  // read next to the part it belongs to.
  const label = opts.label ? `${opts.label} · ${height}` : height;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  // happy-dom has no 2D context. Markers are decoration, so the scene builds
  // without them rather than the viewport failing to mount under test.
  if (!ctx) return null;

  const scale = 4;
  const font = `600 ${13 * scale}px ${MARKER_FONT}`;
  ctx.font = font;
  const padX = 7 * scale;
  const padY = 4 * scale;
  const textWidth = ctx.measureText(label).width;
  canvas.width = Math.ceil(textWidth + padX * 2);
  canvas.height = Math.ceil(18 * scale + padY * 2);

  // Re-set after resizing: changing width/height resets the context state.
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const accent = !!opts.accent;
  ctx.fillStyle = accent ? "rgba(11, 14, 19, 0.92)" : "rgba(11, 14, 19, 0.78)";
  roundedRect(ctx, 0, 0, canvas.width, canvas.height, 5 * scale);
  ctx.fill();
  ctx.strokeStyle = accent ? "rgba(94, 234, 212, 0.85)" : "rgba(139, 149, 167, 0.5)";
  ctx.lineWidth = 1.5 * scale;
  roundedRect(ctx, 0, 0, canvas.width, canvas.height, 5 * scale);
  ctx.stroke();
  ctx.fillStyle = accent ? "#5eead4" : "#c8d0de";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + scale * 0.5);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    })
  );
  const aspect = canvas.width / canvas.height;
  sprite.userData.markerAspect = aspect;
  sprite.scale.set(aspect * HEIGHT_MARKER_FEET, HEIGHT_MARKER_FEET, 1);
  sprite.position.set(at[0], at[1], at[2]);
  // Drawn after the design so a marker is never buried inside the part it labels.
  sprite.renderOrder = 10;
  return sprite;
}

const MARKER_FONT = "'Geist Variable', system-ui, -apple-system, sans-serif";

/**
 * How tall a height marker stands in the world, in feet, before the viewport
 * clamps it at either end of the zoom range. Shorter than the 1 ft cell it
 * labels, so a marker can no longer be the biggest thing on the grid.
 *
 * 1.8 came down to 1.5 and the client still found them too big — "markers are
 * actually bigger than some parts" — and told us what to trade away to fix it:
 * "let's ignore legibility at the default zoom distance, that's what zoom is
 * for". So this is no longer held up by a legibility floor at the opening
 * view; `MARKER_MIN_PIXELS` in the viewport came down with it, and only stops
 * a marker being drawn once it carries no information at all.
 *
 * 0.9 was that step, and the client asked for one more: "let's make the height
 * markers a bit smaller still, but we are headed in the right direction". A
 * marker now stands seven tenths of the cell it labels. Size alone — he called
 * the direction right, so `MARKER_ASIDE` keeps the offset it has.
 */
export const HEIGHT_MARKER_FEET = 0.7;

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
