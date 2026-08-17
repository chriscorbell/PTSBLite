import type { BuildArea, DesignMetadata } from "@/types";

/**
 * Floors. A design is one floor unless its metadata says `multiFloor`, in which
 * case the same footprint repeats one storey up, above a structural slab.
 *
 * `metadata.buildArea.height` always holds the per-floor height the visitor
 * typed at setup. The taller two-floor volume is derived here rather than
 * stored, so the serialized format did not change when floors arrived, and a
 * design cannot be saved with the two heights disagreeing.
 */

/** Thickness of the structural slab between the floors of a two-floor design. */
export const FLOOR_SEPARATOR_FEET = 1;

/**
 * The volume the design can actually build in: the stored build area for a
 * single floor, or twice the height plus the separator for two.
 */
export function effectiveBuildArea(metadata: DesignMetadata): BuildArea {
  const { buildArea, multiFloor } = metadata;
  if (!multiFloor) return buildArea;
  return { ...buildArea, height: buildArea.height * 2 + FLOOR_SEPARATOR_FEET };
}

/**
 * The Y level where the separator slab begins, or null for a single floor. The
 * slab spans one foot upward from here. It is drawn in the viewport but
 * deliberately occupies no grid cells: tubes routinely penetrate a floor to
 * reach the storey above, so it must not collide like an obstacle.
 */
export function floorSeparatorY(metadata: DesignMetadata): number | null {
  return metadata.multiFloor ? metadata.buildArea.height : null;
}
