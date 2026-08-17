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

/** The elevation of a floor's own floor: the ground for 1, above the slab for 2. */
export function floorBaseElevation(metadata: DesignMetadata, floor: 1 | 2): number {
  return floor === 1 ? 0 : metadata.buildArea.height + FLOOR_SEPARATOR_FEET;
}

/**
 * Which floor an elevation belongs to. The separator layer counts as floor 1:
 * it is the first floor's ceiling, and a tube crossing it is still leaving
 * that floor.
 */
export function floorAtElevation(metadata: DesignMetadata, elevation: number): 1 | 2 {
  return elevation >= floorBaseElevation(metadata, 2) ? 2 : 1;
}

/** One floor's plenum: the Y range between its drop ceiling and its top. */
export type PlenumBand = { floor: 1 | 2; base: number; top: number };

/**
 * Where the plenum sits, one band per floor, or none when the design has no
 * plenum. The declared per-floor height *includes* the plenum (the welcome
 * screen says so), so each band occupies the top of its floor: on floor 1 of a
 * two-floor design that is directly under the separator slab. The band is
 * buildable — it restricts nothing and occupies no cells; it exists so the
 * space above the drop ceiling reads differently from the room below it.
 */
export function plenumBands(metadata: DesignMetadata): PlenumBand[] {
  const plenum = metadata.plenumHeightFeet;
  if (plenum === null) return [];
  const perFloor = metadata.buildArea.height;
  // A plenum taller than the floor would swallow it; the band stops at the floor.
  const height = Math.min(plenum, perFloor);
  const bands: PlenumBand[] = [{ floor: 1, base: perFloor - height, top: perFloor }];
  if (metadata.multiFloor) {
    const base2 = floorBaseElevation(metadata, 2);
    bands.push({ floor: 2, base: base2 + perFloor - height, top: base2 + perFloor });
  }
  return bands;
}
