import type { Vec3 } from "@/types";

/**
 * Half-extent of the buildable grid, in cells. Cells span [-HALF, HALF) on
 * every axis, matching the visible ground grid drawn in the viewport (whose
 * width is GRID_HALF_EXTENT * 2). Keep these in sync via this constant so
 * placement bounds never drift from what the user can see.
 */
export const GRID_HALF_EXTENT = 30;

/**
 * Lowest buildable Y. Nothing — manually placed or auto-routed — may occupy a
 * cell below this floor; it matches the visible ground plane in the viewport.
 */
export const GROUND_PLANE_Y = 0;

const HALF = GRID_HALF_EXTENT;

function cellKey(cell: Vec3): string {
  return `${cell[0]},${cell[1]},${cell[2]}`;
}

export class SparseGrid {
  private readonly cells = new Map<string, string>();

  clone(): SparseGrid {
    const next = new SparseGrid();
    for (const [key, occupant] of this.cells.entries()) {
      next.cells.set(key, occupant);
    }
    return next;
  }

  withinBounds(cell: Vec3): boolean {
    return (
      cell[0] >= -HALF && cell[0] < HALF &&
      cell[1] >= -HALF && cell[1] < HALF &&
      cell[2] >= -HALF && cell[2] < HALF
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
