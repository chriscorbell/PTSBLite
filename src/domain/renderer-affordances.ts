import { bendFootprint } from "@/domain/bend-placement";
import {
  floorBaseElevation,
  floorSeparatorY,
  plenumBands,
  roomHeightFeet,
  roomRect
} from "@/domain/floors";
import { obstacleVolumeCells } from "@/domain/obstacle-placement";
import { computeTopology, type Port } from "@/domain/topology";
import { tubeCells } from "@/domain/vec3";
import type { DesignMetadata, DesignState, Ghost, Part, ToolId, Vec3 } from "@/types";

export type PortMarker = {
  partId: string;
  index: number;
  cell: Vec3;
  dir: Vec3;
};

const PORT_GLOW_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(["tube", "bend"]);

export function openPortMarkers(design: DesignState, tool: ToolId): PortMarker[] {
  if (!PORT_GLOW_TOOLS.has(tool)) return [];
  const topology = computeTopology(design);
  return topology.openPorts().map((p) => portMarker(p));
}

function portMarker(p: Port): PortMarker {
  return { partId: p.partId, index: p.index, cell: p.from, dir: p.dir };
}

/** A height to show beside something, in feet, at a point in the scene. */
export type HeightMarker = {
  /** Stable across rebuilds, so a marker can be keyed rather than re-derived. */
  key: string;
  at: Vec3;
  feet: number;
  /**
   * What the level is, for the room's own structure. Parts carry none: a bare
   * number beside something you just placed is unambiguous, whereas three bare
   * numbers stacked in a corner of the room are not.
   */
  label?: string;
};

/**
 * Tools that place something, and so make elevation the question on screen.
 * Markers appear while one is armed and go quiet once it is not — the client
 * asked for them to "auto toggle on when you are elevating something", and
 * arming a placement tool is the moment elevation starts mattering.
 */
const ELEVATION_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>([
  "blower",
  "terminal",
  "tube",
  "bend",
  "obstacle"
]);

export function heightMarkersVisible(tool: ToolId): boolean {
  return ELEVATION_TOOLS.has(tool);
}

/**
 * Every height worth labelling: each placed part, and the room's own levels.
 *
 * Parts report the elevation of the cell they sit in, not the centre of their
 * geometry, because that is the number a visitor typed or nudged with `[` and
 * `]`. The room's structural levels — the drop ceilings and the slab between
 * floors — are labelled at a corner of the room so they read as properties of
 * the building rather than of anything placed in it.
 */
export function heightMarkers(design: DesignState): HeightMarker[] {
  const markers: HeightMarker[] = design.parts.map((part) => ({
    key: part.id,
    at: partMarkerAnchor(part),
    feet: partElevation(part)
  }));

  const { multiFloor } = design.metadata;
  const rect = roomRect(design.metadata);
  // The corner nearest the opening camera, so structural labels read at a
  // glance. The far corner put them at the top of the frame, where the HUD's
  // own banners sit over the canvas and hid them entirely.
  const cornerX = rect.xMax;
  const cornerZ = rect.zMax;
  const level = (key: string, feet: number, label: string) => {
    markers.push({ key, at: [cornerX, feet, cornerZ], feet, label });
  };

  for (const band of plenumBands(design.metadata)) {
    level(`plenum-${band.floor}`, band.base, "Drop ceiling");
  }
  const separator = floorSeparatorY(design.metadata);
  if (separator !== null) level("separator", separator, "Floor 1 ceiling");
  // The room's own top. Without it the upper plenum says where it begins and
  // nothing says where it ends, and "ceiling" was on the client's list.
  level("ceiling", roomHeightFeet(design.metadata), multiFloor ? "Floor 2 ceiling" : "Ceiling");
  return markers;
}

/** Where a part's marker hangs: just above it, at the cell it occupies. */
function partMarkerAnchor(part: Part): Vec3 {
  const lift = 1.1;
  switch (part.type) {
    case "blower":
    case "terminal":
      return [part.cell[0] + 0.5, part.cell[1] + lift, part.cell[2] + 0.5];
    case "tube":
      return [
        (part.from[0] + part.to[0]) / 2,
        (part.from[1] + part.to[1]) / 2 + lift,
        (part.from[2] + part.to[2]) / 2
      ];
    case "bend":
      return [part.entry[0], part.entry[1] + lift, part.entry[2]];
  }
}

/** The elevation a part reads as: the ground-relative Y of its own cell. */
function partElevation(part: Part): number {
  switch (part.type) {
    case "blower":
    case "terminal":
      return part.cell[1];
    case "tube":
      // Endpoints sit at cell centres (Y + 0.5); report the cell.
      return Math.floor(part.from[1]);
    case "bend":
      return Math.floor(part.entry[1]);
  }
}

/** Cells to shade on one horizontal plane, directly beneath a part. */
export type FloorShadow = {
  y: number;
  cells: Vec3[];
  /** The armed part's own shadow, which is drawn louder than a placed part's. */
  live: boolean;
};

/**
 * Where an armed part sits over the floors below it.
 *
 * A ghost hovering at elevation gives no sense of its position on the floor —
 * the perspective that makes a 3D view readable is the same one that makes
 * "which cell is that above?" unanswerable. Shading the columns it occupies,
 * down on the floor itself, answers it without the visitor moving the camera.
 *
 * A shadow is cast onto every floor at or below the part: always the ground,
 * and a two-floor room's upper storey once the part has reached it. Both,
 * deliberately — from above, the upper floor says where the part is in the
 * room it is being built in, and the ground says where it is in the building.
 */
export function floorShadows(ghost: Ghost | null, metadata: DesignMetadata): FloorShadow[] {
  if (!ghost) return [];
  const cells = ghostFootprint(ghost);
  if (cells.length === 0) return [];

  // One square per occupied column, however tall the part is: a shadow is a
  // footprint, so a vertical tube shades the single cell it stands in.
  const columns = new Map<string, Vec3>();
  let lowest = Infinity;
  for (const cell of cells) {
    columns.set(`${cell[0]}|${cell[2]}`, cell);
    lowest = Math.min(lowest, cell[1]);
  }

  const planes = [0];
  if (metadata.multiFloor) {
    const upper = floorBaseElevation(metadata, 2);
    if (lowest >= upper) planes.push(upper);
  }
  return planes.map((y) => ({
    y,
    live: true,
    cells: [...columns.values()].map((cell): Vec3 => [cell[0], y, cell[2]])
  }));
}

/**
 * Where every placed part sits over the floor beneath it.
 *
 * The same question the ghost's shadow answers, asked of a design that is
 * already built: at a glance, a run of tube 20 ft up says nothing about which
 * cells it crosses. Together these read as a plan of the system projected down
 * onto the floor it was built above.
 *
 * One plane per part rather than the ghost's two — the floor it stands over is
 * the grid it was placed on, and a second copy of every part on the ground
 * would double the marks in a finished design for no extra answer. Parts
 * sitting on that floor cast nothing: the client asked for this "if it's not
 * on the ground obviously".
 */
export function placedPartShadows(design: DesignState): FloorShadow[] {
  const planes = new Map<number, Map<string, Vec3>>();
  for (const part of design.parts) {
    const cells = partFootprint(part);
    if (cells.length === 0) continue;
    const lowest = Math.min(...cells.map((cell) => cell[1]));
    const y = floorBeneath(design.metadata, lowest);
    if (lowest <= y) continue;
    const columns = planes.get(y) ?? new Map<string, Vec3>();
    planes.set(y, columns);
    for (const cell of cells) columns.set(`${cell[0]}|${cell[2]}`, cell);
  }
  return [...planes.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, columns]) => ({
      y,
      live: false,
      cells: [...columns.values()].map((cell): Vec3 => [cell[0], y, cell[2]])
    }));
}

/** The floor a part at this elevation stands over. */
function floorBeneath(metadata: DesignMetadata, elevation: number): number {
  if (metadata.multiFloor) {
    const upper = floorBaseElevation(metadata, 2);
    if (elevation >= upper) return upper;
  }
  return 0;
}

/** The cells a placed part occupies, whatever kind of part it is. */
function partFootprint(part: Part): Vec3[] {
  switch (part.type) {
    case "blower":
    case "terminal":
      return [part.cell];
    case "tube":
      return tubeCells(part.from, part.to);
    case "bend":
      return bendFootprint(part);
  }
}

/** The cells an armed part would occupy, whatever kind of part it is. */
function ghostFootprint(ghost: Ghost): Vec3[] {
  switch (ghost.type) {
    case "blower":
    case "terminal":
      return [ghost.cell];
    case "tube":
      return tubeCells(ghost.from, ghost.to);
    case "bend":
      return bendFootprint({ id: "ghost", ...ghost });
    case "obstacle":
      return obstacleVolumeCells(ghost.min, ghost.max);
  }
}
