import type { BuildArea, Vec3 } from "@/types";
import { cellKey } from "@/domain/vec3";

/**
 * Lowest buildable Y. Nothing — manually placed or auto-routed — may occupy a
 * cell below this floor; it matches the visible ground plane in the viewport.
 */
export const GROUND_PLANE_Y = 0;

/**
 * Default build area for new designs and for files saved before the build area
 * was configurable. 60×60 ft footprint with 30 ft of height preserves the
 * historical buildable range (the old grid was a symmetric ±30 cube, but only
 * the at-or-above-ground portion was ever usable).
 */
/**
 * The build area: the volume every design exists in, fixed at 300 x 300 x 100 ft
 * (ADR-0017). Not configurable — what a visitor sizes on the welcome screen is
 * their *room*, which sits centered inside this. Parts may be placed anywhere
 * in the build area, inside the room or out.
 */
export const BUILD_AREA: BuildArea = { width: 300, depth: 300, height: 100 };

/**
 * What the setup form starts on. The client's figures: a 60 x 40 ft room at a
 * 12 ft ceiling is the shape of the job he sizes most often, and a form that
 * opens on it is one most visitors can accept unchanged.
 */
export const DEFAULT_ROOM: BuildArea = { width: 40, depth: 60, height: 12 };

/**
 * Sane bounds for the room a visitor can type, in feet. A guard rail, not a
 * fact from the PTS spec — the authoritative constants are the ones ADR-0001
 * lists. The maxima are the build area itself: a room may fill it entirely.
 * A two-floor room is further capped so both floors and the separator fit
 * inside the build area; that cap needs the floor constants, so it lives in
 * floors.ts (`clampRoom`) rather than here.
 */
export const ROOM_LIMITS = {
  width: { min: 4, max: BUILD_AREA.width },
  depth: { min: 4, max: BUILD_AREA.depth },
  height: { min: 2, max: BUILD_AREA.height }
} as const;

/**
 * Clamp a Y level to the build area's buildable range.
 *
 * The range is `[GROUND_PLANE_Y, height - 1]`: `boundsFromBuildArea` makes
 * `yMax` exclusive, so the topmost occupiable cell is one below it. Used by the
 * placement elevation and by the obstacle base/height steppers, both of which
 * previously carried their own hardcoded limits that disagreed with the build
 * area and with each other.
 */
export function clampElevation(y: number, area: BuildArea): number {
  if (!Number.isFinite(y)) return GROUND_PLANE_Y;
  return Math.min(area.height - 1, Math.max(GROUND_PLANE_Y, Math.floor(y)));
}

/** Half-open cell ranges [min, max) per axis. */
export type GridBounds = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
};

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Coerce (possibly partial/invalid) room dimensions into whole feet within
 * limits. Dimension bounds only — the two-floor height cap is `clampRoom` in
 * floors.ts, which every real caller goes through.
 */
export function clampRoomDims(room: Partial<BuildArea> | undefined): BuildArea {
  const L = ROOM_LIMITS;
  return {
    width: clampInt(room?.width ?? NaN, L.width.min, L.width.max, DEFAULT_ROOM.width),
    depth: clampInt(room?.depth ?? NaN, L.depth.min, L.depth.max, DEFAULT_ROOM.depth),
    height: clampInt(room?.height ?? NaN, L.height.min, L.height.max, DEFAULT_ROOM.height)
  };
}

/**
 * Derive cell bounds from a build area. The footprint (X/Z) is centered on the
 * origin; the volume rises from the ground plane (Y = 0) up to `height`.
 */
export function boundsFromBuildArea(area: BuildArea): GridBounds {
  const halfX = Math.floor(area.width / 2);
  const halfZ = Math.floor(area.depth / 2);
  return {
    xMin: -halfX,
    xMax: area.width - halfX,
    yMin: GROUND_PLANE_Y,
    yMax: GROUND_PLANE_Y + area.height,
    zMin: -halfZ,
    zMax: area.depth - halfZ
  };
}

export class SparseGrid {
  private readonly cells = new Map<string, string>();
  private readonly bounds: GridBounds;

  constructor(bounds: GridBounds = boundsFromBuildArea(BUILD_AREA)) {
    this.bounds = bounds;
  }

  clone(): SparseGrid {
    const next = new SparseGrid(this.bounds);
    for (const [key, occupant] of this.cells.entries()) {
      next.cells.set(key, occupant);
    }
    return next;
  }

  withinBounds(cell: Vec3): boolean {
    const b = this.bounds;
    return (
      cell[0] >= b.xMin &&
      cell[0] < b.xMax &&
      cell[1] >= b.yMin &&
      cell[1] < b.yMax &&
      cell[2] >= b.zMin &&
      cell[2] < b.zMax
    );
  }

  place(cell: Vec3, occupant: string): void {
    if (!this.withinBounds(cell)) {
      throw new Error(`SparseGrid: out of bounds ${cellKey(cell)}`);
    }
    const k = cellKey(cell);
    if (this.cells.has(k)) {
      throw new Error(`SparseGrid: cell ${k} already occupied by "${this.cells.get(k)}"`);
    }
    this.cells.set(k, occupant);
  }

  remove(cell: Vec3): void {
    this.cells.delete(cellKey(cell));
  }

  query(cell: Vec3): string | undefined {
    return this.cells.get(cellKey(cell));
  }

  neighbors(cell: Vec3): Vec3[] {
    const [x, y, z] = cell;
    const candidates: Vec3[] = [
      [x + 1, y, z],
      [x - 1, y, z],
      [x, y + 1, z],
      [x, y - 1, z],
      [x, y, z + 1],
      [x, y, z - 1]
    ];
    return candidates.filter((c) => this.withinBounds(c));
  }
}
