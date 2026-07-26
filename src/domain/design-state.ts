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
