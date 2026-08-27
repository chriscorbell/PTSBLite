import { bendFootprint } from "@/domain/bend-placement";
import { floorBaseElevation, floorSeparatorY, plenumBands, roomRect } from "@/domain/floors";
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

  const rect = roomRect(design.metadata);
  // The corner nearest the opening camera, so structural labels read at a
  // glance. The far corner put them at the top of the frame, where the HUD's
  // own banners sit over the canvas and hid them entirely.
  const cornerX = rect.xMax;
  const cornerZ = rect.zMax;
  for (const band of plenumBands(design.metadata)) {
    markers.push({
      key: `plenum-${band.floor}`,
      at: [cornerX, band.base, cornerZ],
      feet: band.base
    });
  }
  const separator = floorSeparatorY(design.metadata);
  if (separator !== null) {
    markers.push({ key: "separator", at: [cornerX, separator, cornerZ], feet: separator });
  }
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

/** Cells to shade on one horizontal plane, directly beneath an armed part. */
export type FloorShadow = { y: number; cells: Vec3[] };

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
    cells: [...columns.values()].map((cell): Vec3 => [cell[0], y, cell[2]])
  }));
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
