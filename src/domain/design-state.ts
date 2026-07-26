import {
  SparseGrid,
  boundsFromBuildArea,
  clampBuildArea,
  DEFAULT_BUILD_AREA
} from "@/domain/sparse-grid";
import { obstacleCells, partCells, reconstructDesign } from "@/domain/design-reconstruction";
import type { BuildArea, DesignMetadata, DesignState, Obstacle, Part, Scene } from "@/types";

export const DEFAULT_FILENAME = "untitled.ptsb";
export const DEFAULT_REVISION = "0.1";

/** `p` for a part, `o` for an obstacle. Both are grid occupants. */
export type OccupantPrefix = "p" | "o";

/**
 * A fresh id for a part or an obstacle.
 *
 * Parts and obstacles share one occupant namespace, so the candidate is checked
 * against both lists rather than trusted. A duplicate id would be both a
 * duplicate React key and a collision in the `SparseGrid`, breaking the
 * parts-agree-with-grid invariant that the rest of the domain relies on — a
 * random id makes that unlikely, not impossible, and the check costs nothing at
 * these list sizes.
 *
 * `randomId` is injectable so the retry path can be tested without waiting for a
 * UUID to collide.
 */
export function newOccupantId(
  design: DesignState,
  prefix: OccupantPrefix,
  randomId: () => string = () => crypto.randomUUID()
): string {
  for (;;) {
    const id = prefix + randomId();
    const taken =
      design.parts.some((part) => part.id === id) ||
      design.obstacles.some((obstacle) => obstacle.id === id);
    if (!taken) return id;
  }
}

function withMetadata(meta?: Partial<DesignMetadata>): DesignMetadata {
  return {
    filename: meta?.filename ?? DEFAULT_FILENAME,
    revision: meta?.revision ?? DEFAULT_REVISION,
    buildArea: meta?.buildArea ? clampBuildArea(meta.buildArea) : { ...DEFAULT_BUILD_AREA }
  };
}

/**
 * Keep only the parts whose entire footprint fits within `buildArea`. Used when
 * the user shrinks the build area: anything now outside the bounds is dropped.
 */
export function partsWithinBuildArea(parts: Part[], buildArea: BuildArea): Part[] {
  const grid = new SparseGrid(boundsFromBuildArea(buildArea));
  return parts.filter((part) => partCells(part).every((cell) => grid.withinBounds(cell)));
}

/**
 * Obstacles that keep at least one cell inside `buildArea`. One that keeps none
 * disappears entirely when the area shrinks; one that keeps some is clipped by
 * `reconstructDesign`. Used to tell the user what a shrink will cost them.
 */
export function obstaclesWithinBuildArea(obstacles: Obstacle[], buildArea: BuildArea): Obstacle[] {
  const grid = new SparseGrid(boundsFromBuildArea(buildArea));
  return obstacles.filter((obstacle) => obstacleCells(obstacle).some((c) => grid.withinBounds(c)));
}

export function emptyDesign(meta?: Partial<DesignMetadata>): DesignState {
  const metadata = withMetadata(meta);
  return {
    parts: [],
    obstacles: [],
    metadata,
    grid: new SparseGrid(boundsFromBuildArea(metadata.buildArea))
  };
}

/**
 * Rebuild a design from a scene that is *already known to be valid* — clearing
 * parts, clearing obstacles, applying a build-area change to parts already
 * filtered to fit.
 *
 * Throws if that assumption is wrong, because it would mean a bug here rather
 * than bad input. Use `reconstructDesign` directly for anything originating
 * outside the app, such as a file being opened; it reports instead of throwing.
 * There is deliberately one implementation and no second, permissive path.
 */
export function designFromScene(scene: Scene, meta?: Partial<DesignMetadata>): DesignState {
  const result = reconstructDesign(scene, withMetadata(meta));
  if (!result.ok) {
    throw new Error(
      `designFromScene received an invalid scene: ${result.issues.map((i) => i.message).join(" ")}`
    );
  }
  return result.design;
}
