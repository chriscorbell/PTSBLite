import { BUILD_AREA, boundsFromBuildArea, clampRoomDims } from "@/domain/sparse-grid";
import type { BuildArea, DesignMetadata, Vec3 } from "@/types";

/**
 * The room, and its floors.
 *
 * A design's room is the space the visitor sized on the welcome screen: a
 * volume centered in the fixed build area, wrapped in 1 ft penetrable walls,
 * with the plenum and any floor separator spanning its footprint rather than
 * the whole build area (ADR-0017). Parts may be placed outside it — the walls
 * claim no grid cells, exactly like penetrable obstacles (ADR-0016).
 *
 * `metadata.room.height` always holds the per-floor height the visitor typed.
 * A two-floor room is twice that plus the separator, derived rather than
 * stored (ADR-0015), so the two heights cannot disagree.
 */

/** Thickness of the structural slab between the floors of a two-floor room. */
export const FLOOR_SEPARATOR_FEET = 1;

/** Thickness of a room's walls. */
export const ROOM_WALL_FEET = 1;

/** The room's footprint in cell coordinates, X/Z half-open like GridBounds. */
export type RoomRect = { xMin: number; xMax: number; zMin: number; zMax: number };

/**
 * The tallest room the build area can hold: its full height for one floor;
 * for two, both floors plus the separator must fit inside it.
 */
export function maxRoomHeightFeet(multiFloor: boolean): number {
  if (!multiFloor) return BUILD_AREA.height;
  return Math.floor((BUILD_AREA.height - FLOOR_SEPARATOR_FEET) / 2);
}

/**
 * Coerce typed room dimensions into ones the build area can hold. The single
 * checked path for every room that enters the model — the welcome screen and
 * the deserializer both come through here.
 */
export function clampRoom(room: Partial<BuildArea> | undefined, multiFloor: boolean): BuildArea {
  const dims = clampRoomDims(room);
  return { ...dims, height: Math.min(dims.height, maxRoomHeightFeet(multiFloor)) };
}

/** The room's overall height: one floor, or both plus the separator. */
export function roomHeightFeet(metadata: DesignMetadata): number {
  const { room, multiFloor } = metadata;
  return multiFloor ? room.height * 2 + FLOOR_SEPARATOR_FEET : room.height;
}

/**
 * Where the room's footprint sits: centered on the origin under the same
 * rule the build area itself uses, so a room the size of the build area
 * lands exactly on it.
 */
export function roomRect(metadata: DesignMetadata): RoomRect {
  const b = boundsFromBuildArea(metadata.room);
  return { xMin: b.xMin, xMax: b.xMax, zMin: b.zMin, zMax: b.zMax };
}

/** Whether a cell lies within the room's footprint, at any height. */
export function inRoomFootprint(rect: RoomRect, cell: Vec3): boolean {
  return cell[0] >= rect.xMin && cell[0] < rect.xMax && cell[2] >= rect.zMin && cell[2] < rect.zMax;
}

/**
 * Whether a box — inclusive cell bounds, as obstacles carry them — covers any
 * part of the room's footprint. A volume half in and half out counts as in.
 */
export function overlapsRoomFootprint(rect: RoomRect, min: Vec3, max: Vec3): boolean {
  return max[0] >= rect.xMin && min[0] < rect.xMax && max[2] >= rect.zMin && min[2] < rect.zMax;
}

/**
 * The room's four walls as inclusive cell boxes, 1 ft thick, inside the
 * room's own footprint ("shrinking to interior"), rising its full height.
 * Drawn like penetrable obstacles and, like them, claiming no grid cells:
 * tubes route through walls, and parts may sit inside them.
 */
export function roomWalls(metadata: DesignMetadata): Array<{ min: Vec3; max: Vec3 }> {
  const r = roomRect(metadata);
  const top = roomHeightFeet(metadata) - 1;
  const t = ROOM_WALL_FEET - 1;
  return [
    { min: [r.xMin, 0, r.zMin], max: [r.xMax - 1, top, r.zMin + t] },
    { min: [r.xMin, 0, r.zMax - 1 - t], max: [r.xMax - 1, top, r.zMax - 1] },
    { min: [r.xMin, 0, r.zMin + t + 1], max: [r.xMin + t, top, r.zMax - 2 - t] },
    { min: [r.xMax - 1 - t, 0, r.zMin + t + 1], max: [r.xMax - 1, top, r.zMax - 2 - t] }
  ];
}

/**
 * The Y level where the separator slab begins, or null for a single floor. The
 * slab spans one foot upward from here, across the room's footprint. It is
 * drawn in the viewport but deliberately occupies no grid cells: tubes
 * routinely penetrate a floor to reach the storey above, so it must not
 * collide like an obstacle.
 */
export function floorSeparatorY(metadata: DesignMetadata): number | null {
  return metadata.multiFloor ? metadata.room.height : null;
}

/** The elevation of a floor's own floor: the ground for 1, above the slab for 2. */
export function floorBaseElevation(metadata: DesignMetadata, floor: 1 | 2): number {
  return floor === 1 ? 0 : metadata.room.height + FLOOR_SEPARATOR_FEET;
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
 * two-floor room that is directly under the separator slab. Bands span the
 * room's footprint — `roomRect` — not the build area: outside the room there
 * is no drop ceiling to be above. The band is buildable; it restricts nothing
 * and occupies no cells.
 */
export function plenumBands(metadata: DesignMetadata): PlenumBand[] {
  const plenum = metadata.plenumHeightFeet;
  if (plenum === null) return [];
  const perFloor = metadata.room.height;
  // A plenum taller than the floor would swallow it; the band stops at the floor.
  const height = Math.min(plenum, perFloor);
  const bands: PlenumBand[] = [{ floor: 1, base: perFloor - height, top: perFloor }];
  if (metadata.multiFloor) {
    const base2 = floorBaseElevation(metadata, 2);
    bands.push({ floor: 2, base: base2 + perFloor - height, top: base2 + perFloor });
  }
  return bands;
}
