import { floorSeparatorY, plenumBands, roomRect } from "@/domain/floors";
import { computeTopology, type Port } from "@/domain/topology";
import type { DesignState, Part, ToolId, Vec3 } from "@/types";

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
