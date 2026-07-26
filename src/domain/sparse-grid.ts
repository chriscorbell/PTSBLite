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
export const DEFAULT_BUILD_AREA: BuildArea = { width: 60, depth: 60, height: 30 };

/** Sane bounds for the configurable build area, in feet. */
export const BUILD_AREA_LIMITS = {
  width: { min: 4, max: 200 },
  depth: { min: 4, max: 200 },
  height: { min: 2, max: 100 }
} as const;

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

/** Coerce a (possibly partial/invalid) build area into whole feet within limits. */
export function clampBuildArea(area: Partial<BuildArea> | undefined): BuildArea {
  const L = BUILD_AREA_LIMITS;
  return {
    width: clampInt(area?.width ?? NaN, L.width.min, L.width.max, DEFAULT_BUILD_AREA.width),
    depth: clampInt(area?.depth ?? NaN, L.depth.min, L.depth.max, DEFAULT_BUILD_AREA.depth),
    height: clampInt(area?.height ?? NaN, L.height.min, L.height.max, DEFAULT_BUILD_AREA.height)
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

  constructor(bounds: GridBounds = boundsFromBuildArea(DEFAULT_BUILD_AREA)) {
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
