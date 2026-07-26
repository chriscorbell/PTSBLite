import { expect } from "vitest";
import { obstacleCells, partCells } from "@/domain/design-reconstruction";
import { cellKey } from "@/domain/vec3";
import type { DesignState } from "@/types";

/**
 * Assert that a design's `grid` agrees with its `parts` and `obstacles`.
 *
 * CONTEXT.md names this as the invariant that matters most in this codebase: a
 * part present in `parts` but absent from `grid` renders and gets priced, yet
 * cannot be erased or collided with. It was previously held by hand in every
 * module that adds or removes an occupant, and by nothing else.
 *
 * Three checks, and the third is the one that catches a botched erase:
 *
 * 1. **Every part cell is registered to that part.** Parts are objects; one that
 *    does not own its own footprint is the split-brain bug itself.
 * 2. **Every obstacle cell is occupied by something.** Obstacles are volumes
 *    marking space unavailable, so overlapping obstacles — and an obstacle over
 *    a part, which `validation.ts` flags rather than forbids — legitimately
 *    leave a cell owned by someone else. What matters is that it is spoken for.
 * 3. **No cell claims to belong to a part in this design unless that part's
 *    footprint contains it.** A cell still attributed to an erased or moved part
 *    is a leak in the other direction.
 *
 * Cells owned by an id that is *not* in the design are deliberately ignored.
 * Placement tests routinely seed the grid with opaque occupants — `"blocker"`,
 * `"riser"`, `"o1"` — to mean "something is in the way" without constructing a
 * whole part. That is legitimate scaffolding, and this assertion has no business
 * ruling on occupants the design does not claim.
 */
export function expectGridMatchesDesign(design: DesignState): void {
  const { grid, parts, obstacles } = design;

  const footprints = new Map<string, Set<string>>();

  for (const part of parts) {
    const keys = new Set<string>();
    for (const cell of partCells(part)) {
      const owner = grid.query(cell);
      expect(
        owner,
        `part "${part.id}" occupies ${cellKey(cell)} but the grid says ${String(owner)}`
      ).toBe(part.id);
      keys.add(cellKey(cell));
    }
    footprints.set(part.id, keys);
  }

  for (const obstacle of obstacles) {
    for (const cell of obstacleCells(obstacle)) {
      if (!grid.withinBounds(cell)) continue; // clipped to the build area
      expect(
        grid.query(cell),
        `obstacle "${obstacle.id}" covers ${cellKey(cell)} but the grid says it is free`
      ).toBeDefined();
    }
  }

  for (const [key, owner] of gridEntries(design)) {
    const footprint = footprints.get(owner);
    if (!footprint) continue; // not a part of this design; see the note above
    expect(
      footprint.has(key),
      `grid cell ${key} is still attributed to part "${owner}", which no longer covers it`
    ).toBe(true);
  }
}

/**
 * `SparseGrid` keeps its cells private, which is right — nothing in the app
 * enumerates them. Only this assertion needs to, to find cells still attributed
 * to a part that has moved on.
 */
function gridEntries(design: DesignState): Array<[string, string]> {
  const cells = (design.grid as unknown as { cells: Map<string, string> }).cells;
  return [...cells.entries()];
}
