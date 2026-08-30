import { bendFootprint } from "@/domain/bend-placement";

import { obstacleVolumeCells } from "@/domain/obstacle-placement";
import { hasPedestal, pedestalCells } from "@/domain/pedestal";
import { boundsFromBuildArea, BUILD_AREA, SparseGrid } from "@/domain/sparse-grid";
import { cellKey, tubeCells } from "@/domain/vec3";
import type { DesignMetadata, DesignState, Obstacle, Part, Vec3 } from "@/types";

/**
 * Rebuilding a design from parts and obstacles, with the bounds and occupancy
 * rules enforced rather than assumed.
 *
 * `DesignState` carries a `SparseGrid` alongside its `parts` and `obstacles`,
 * and the two must agree — a part registered in one but not the other renders
 * and appears in the BOM but cannot be erased or collided with. CONTEXT.md names this
 * as the invariant that matters most in the codebase.
 *
 * Reconstruction used to degrade in two different unchosen ways. Out-of-bounds
 * cells, and already-occupied cells belonging to tubes, bends and obstacles,
 * were silently skipped by a `withinBounds`/`!query` guard, producing exactly
 * that split-brain state. Blower and terminal cells took a different path with
 * no occupancy guard at all, and `SparseGrid.place` throws on an occupied cell —
 * so a file holding two overlapping terminals did not degrade, it crashed the
 * load with an unhandled exception.
 *
 * One seam now decides, and it decides differently for the two kinds of
 * occupant, because they are different kinds of thing.
 *
 * **Parts are objects, and are strict.** A part outside the build area, or on
 * top of another part, is rejected. Neither is reachable by using the app, so a
 * file containing one is corrupt — and the alternative, registering the part in
 * `parts` but not in `grid`, is precisely the split-brain bug.
 *
 * **Obstacles are volumes, and are lenient.** CONTEXT.md is explicit that an
 * obstacle is not a part: it costs nothing, appears in no BOM, and exists only
 * to mark space as unavailable. Overlapping volumes therefore lose no
 * information — the union is exactly what the grid needs to represent, and
 * whichever obstacle claimed a cell first, the cell is occupied. Cells outside
 * the build area are clipped, since nothing can occupy them anyway.
 *
 * An obstacle overlapping a *part* is likewise accepted rather than rejected.
 * `validation.ts` already has a rule for it (`checkObstacleIntersections`, at
 * level "error"), which means the product intends that state to be
 * representable and flagged. Refusing to open the file would leave the user
 * unable to fix the very problem the validator would have told them about.
 */

/** The grid cells a part occupies. Must match what `reconstructDesign` registers. */
export function partCells(part: Part): Vec3[] {
  // A pedestal blower also holds the column of mast beneath it, down to the
  // floor. Uncounted in the BOM, but as solid as any other part on the grid.
  if (hasPedestal(part)) return [part.cell, ...pedestalCells(part.cell, part.pedestalFeet)];
  if (part.type === "blower" || part.type === "terminal") return [part.cell];
  if (part.type === "tube") return tubeCells(part.from, part.to);
  if (part.type === "bend") return bendFootprint(part);
  return [];
}

/** The grid cells an obstacle volume occupies. */
export function obstacleCells(obstacle: Obstacle): Vec3[] {
  return obstacleVolumeCells(obstacle.min, obstacle.max);
}

export type ReconstructionIssue = {
  /** Whether the rejected occupant was a part or an obstacle. */
  kind: "part" | "obstacle";
  /** `id` of the rejected occupant. */
  id: string;
  reason: "out-of-bounds" | "overlap";
  /** The first offending cell, for pointing a user or a test at it. */
  cell: Vec3;
  /** For `overlap`, the id of the occupant already holding `cell`. */
  occupiedBy?: string;
  /** Human-readable, suitable for surfacing directly. */
  message: string;
};

export type ReconstructResult =
  { ok: true; design: DesignState } | { ok: false; issues: ReconstructionIssue[] };

/**
 * Rebuild `parts`, `obstacles` and `grid` together, or report why not.
 *
 * Every offending occupant is reported, not just the first: a user opening a
 * corrupt file is better served by "these four parts are outside the build area"
 * than by discovering them one reopen at a time. A rejected occupant is skipped
 * so the scan can continue, which means later occupants are checked against the
 * cells that survived, not the ones that failed.
 */
export function reconstructDesign(
  scene: { parts?: Part[]; obstacles?: Obstacle[] },
  metadata: DesignMetadata
): ReconstructResult {
  const parts = scene.parts ?? [];
  const obstacles = scene.obstacles ?? [];
  const grid = new SparseGrid(boundsFromBuildArea(BUILD_AREA));
  const issues: ReconstructionIssue[] = [];

  // Parts first, and all-or-nothing: a part is only registered once its entire
  // footprint is known to be free, so a rejected part leaves no partial trace.
  for (const part of parts) {
    const cells = partCells(part);
    const issue = firstPartConflict(grid, part.id, cells);
    if (issue) {
      issues.push(issue);
      continue;
    }
    for (const cell of cells) grid.place(cell, part.id);
  }

  // Obstacles second, and per-cell: they mark space rather than occupy it, so a
  // cell already spoken for simply stays spoken for. A penetrable obstacle
  // marks nothing at all — staying out of the grid is what lets tubes route
  // through it (ADR-0016).
  for (const obstacle of obstacles) {
    if (obstacle.penetrable) continue;
    for (const cell of obstacleCells(obstacle)) {
      if (grid.withinBounds(cell) && grid.query(cell) === undefined) {
        grid.place(cell, obstacle.id);
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    design: {
      parts: parts.map(clone),
      obstacles: obstacles.map(clone),
      metadata,
      grid
    }
  };
}

/** The first cell of a part that is out of bounds or already taken. */
function firstPartConflict(
  grid: SparseGrid,
  id: string,
  cells: Vec3[]
): ReconstructionIssue | null {
  const seen = new Set<string>();
  for (const cell of cells) {
    if (!grid.withinBounds(cell)) {
      return {
        kind: "part",
        id,
        reason: "out-of-bounds",
        cell,
        message: `Part "${id}" lies outside the build area at ${cellKey(cell)}.`
      };
    }
    const occupiedBy = grid.query(cell);
    if (occupiedBy !== undefined) {
      return {
        kind: "part",
        id,
        reason: "overlap",
        cell,
        occupiedBy,
        message: `Part "${id}" overlaps "${occupiedBy}" at ${cellKey(cell)}.`
      };
    }
    // A self-overlapping footprint would pass both checks above and then throw
    // inside SparseGrid.place, which is the failure mode this module exists to
    // remove. Catch it here so it is reported like any other conflict.
    const key = cellKey(cell);
    if (seen.has(key)) {
      return {
        kind: "part",
        id,
        reason: "overlap",
        cell,
        occupiedBy: id,
        message: `Part "${id}" claims ${key} twice.`
      };
    }
    seen.add(key);
  }
  return null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
