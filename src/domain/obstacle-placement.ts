import {
  floorAtElevation,
  floorBaseElevation,
  overlapsRoomFootprint,
  roomRect
} from "@/domain/floors";
import { clampElevation } from "@/domain/sparse-grid";
import { addObstacle } from "@/domain/design-state";
import { obstacleVolumeBounds, obstacleVolumeCells } from "@/domain/occupant-footprints";
import type { BuildArea, DesignMetadata, DesignState, Ghost, Vec3 } from "@/types";

/**
 * Which kind of volume the obstacle tool draws. Impenetrable obstacles claim
 * grid cells, so placement and routing must avoid them; penetrable ones claim
 * none, so tubes pass through — see ADR-0016.
 */
export type ObstacleKind = "impenetrable" | "penetrable";

export const OBSTACLE_PLACEMENT_MESSAGES = {
  occupied: "Place obstacle on open grid cells.",
  outOfBounds: "Place inside the build area."
} as const;

export type PlaceObstacleVolumeResult =
  { ok: true; design: DesignState } | { ok: false; message: string; design: DesignState };

export type ObstaclePlacementDraft = {
  cornerA: Vec3;
  cornerB?: Vec3;
  baseY?: number;
  height?: number;
};

export type StartObstaclePlacementResult =
  { ok: true; draft: ObstaclePlacementDraft } | { ok: false; message: string };

export function startObstaclePlacement(
  design: DesignState,
  cornerA: Vec3,
  kind: ObstacleKind = "impenetrable"
): StartObstaclePlacementResult {
  if (!design.grid.withinBounds(cornerA)) {
    return { ok: false, message: OBSTACLE_PLACEMENT_MESSAGES.outOfBounds };
  }
  // An obstacle has a height, not an elevation: it stands on the floor of the
  // storey being worked on however high the placement plane has been nudged.
  // The draft used to start at the plane and carry a base stepper of its own,
  // which meant a shelf's marker read as its underside and the visitor had two
  // numbers to set where the real object has one.
  const anchor: Vec3 = [cornerA[0], obstacleBaseElevation(design.metadata, cornerA[1]), cornerA[2]];
  // A penetrable volume may legitimately be drawn through existing parts, so
  // only the impenetrable kind cares whether the corner cell is taken.
  if (kind === "impenetrable" && design.grid.query(anchor)) {
    return { ok: false, message: OBSTACLE_PLACEMENT_MESSAGES.occupied };
  }
  return { ok: true, draft: { cornerA: anchor } };
}

/** The floor an obstacle drawn while the plane is at `elevation` rests on. */
export function obstacleBaseElevation(metadata: DesignMetadata, elevation: number): number {
  return floorBaseElevation(metadata, floorAtElevation(metadata, elevation));
}

export function cancelObstaclePlacement(_draft: ObstaclePlacementDraft | null): null {
  return null;
}

/**
 * The draft a click at `cell` would start, before any click has been made.
 *
 * Until the first click the obstacle tool showed only a flat square on the
 * floor, so nothing on screen said the click would raise a standing volume, or
 * which storey's floor it would stand on. Previewing that volume is what the
 * client asked for: "let's add back in the preview of the obstacle cell before
 * first click".
 *
 * It anchors exactly as {@link startObstaclePlacement} does, so what is
 * previewed is what the click produces rather than a second, independently
 * derived answer. Null off the grid, where the highlight square goes out too.
 * Occupancy is deliberately not checked here: the square already lights over a
 * cell an impenetrable volume would be refused on, and the preview and the
 * square must not disagree about where a click lands.
 */
export function prospectiveObstacleDraft(
  design: DesignState,
  cell: Vec3
): ObstaclePlacementDraft | null {
  if (!design.grid.withinBounds(cell)) return null;
  return { cornerA: [cell[0], obstacleBaseElevation(design.metadata, cell[1]), cell[2]] };
}

export function obstaclePlacementGhost(
  draft: ObstaclePlacementDraft | null,
  currentCell: Vec3,
  kind: ObstacleKind = "impenetrable"
): Ghost | null {
  if (!draft) return null;
  const { min, max } = obstaclePlacementDraftBounds(draft, currentCell);
  // Same convention as Obstacle itself: the flag is present only when set.
  if (kind === "penetrable") return { type: "obstacle", min, max, penetrable: true };
  return { type: "obstacle", min, max };
}

export function obstaclePlacementDraftHasFootprint(
  draft: ObstaclePlacementDraft | null
): draft is ObstaclePlacementDraft & { cornerB: Vec3; baseY: number; height: number } {
  return !!draft?.cornerB && typeof draft.baseY === "number" && typeof draft.height === "number";
}

/**
 * Close the footprint on the second click. Both corners sit on the floor the
 * first one anchored to, so the volume starts one foot tall and grows upward
 * from the HUD.
 */
export function setObstaclePlacementFootprint(
  draft: ObstaclePlacementDraft,
  cornerB: Vec3
): ObstaclePlacementDraft {
  const baseY = draft.cornerA[1];
  return {
    cornerA: draft.cornerA,
    cornerB: [cornerB[0], baseY, cornerB[2]],
    baseY,
    height: 1
  };
}

/**
 * How tall a draft may grow.
 *
 * Inside the room, the ceiling of the storey it stands on: an obstacle drawn in
 * a 12 ft room stops at 12 ft rather than carrying on through the ceiling into
 * the space above. Outside the room there is no ceiling to stop at, so the
 * build area is the only limit. A footprint straddling a wall counts as inside,
 * since part of it would otherwise come through the ceiling.
 */
export function obstacleHeightLimit(
  draft: ObstaclePlacementDraft,
  metadata: DesignMetadata,
  area: BuildArea
): number {
  const baseY = draft.baseY ?? draft.cornerA[1];
  const { min, max } = obstaclePlacementDraftBounds(draft);
  const ceiling = overlapsRoomFootprint(roomRect(metadata), min, max)
    ? Math.min(area.height, storeyCeilingY(metadata, baseY))
    : area.height;
  return Math.max(1, ceiling - baseY);
}

/** Where the storey at `elevation` stops: its own floor plus the room's height. */
function storeyCeilingY(metadata: DesignMetadata, elevation: number): number {
  return obstacleBaseElevation(metadata, elevation) + metadata.room.height;
}

/**
 * Resize a draft, keeping it under whatever it has above it.
 *
 * The clamp lives here rather than in the HUD because the HUD used a hardcoded
 * 150 ft ceiling that the domain neither knew about nor agreed with: a design
 * 30 ft tall would happily offer a 150 ft obstacle, which `placeObstacleVolume`
 * then refused. A control must not advertise a value its domain will reject.
 */
export function resizeObstaclePlacementHeight(
  draft: ObstaclePlacementDraft,
  height: number,
  metadata: DesignMetadata,
  area: BuildArea
): ObstaclePlacementDraft {
  if (!obstaclePlacementDraftHasFootprint(draft)) return draft;
  const limit = obstacleHeightLimit(draft, metadata, area);
  return {
    ...draft,
    height: Math.min(limit, Math.max(1, Math.floor(height)))
  };
}

export function obstaclePlacementDraftBounds(
  draft: ObstaclePlacementDraft,
  currentCell?: Vec3
): { min: Vec3; max: Vec3 } {
  if (!obstaclePlacementDraftHasFootprint(draft)) {
    if (!currentCell) return obstacleVolumeBounds(draft.cornerA, draft.cornerA);
    // The drag draws on the floor the first corner anchored to; where the
    // pointer's own plane happens to be does not stretch the preview upward.
    const opposite: Vec3 = [currentCell[0], draft.cornerA[1], currentCell[2]];
    return obstacleVolumeBounds(draft.cornerA, opposite);
  }
  const cornerB = draft.cornerB;
  return {
    min: [
      Math.min(draft.cornerA[0], cornerB[0]),
      draft.baseY,
      Math.min(draft.cornerA[2], cornerB[2])
    ],
    max: [
      Math.max(draft.cornerA[0], cornerB[0]),
      draft.baseY + draft.height - 1,
      Math.max(draft.cornerA[2], cornerB[2])
    ]
  };
}

/**
 * Where a part aimed at `cell` comes to rest: on top of whatever solid volume
 * is already there, or at `cell` itself when nothing is.
 *
 * Aiming at an impenetrable obstacle used to be a flat refusal — the cells are
 * claimed, so nothing could go there. The client had built a shelf out of one
 * and wanted to stand a blower on it, which is what a solid volume in a room
 * is for. Stepping up onto it is the answer to the same gesture. The step
 * repeats so a stack of obstacles is climbed rather than only its first
 * volume.
 *
 * Impenetrable volumes only: a penetrable one claims no cells and exists to be
 * built through (ADR-0016). A clear cell, or a lift that would leave the build
 * area, comes back unchanged and is refused exactly as before.
 */
export function restOnObstacles(design: DesignState, cell: Vec3, area: BuildArea): Vec3 {
  let y = cell[1];
  // Each step clears at least one volume and cannot re-enter one it has passed,
  // so the obstacle count bounds the climb.
  for (let step = 0; step <= design.obstacles.length; step++) {
    const top = solidTopAt(design, cell[0], y, cell[2]);
    if (top === null) return y === cell[1] ? cell : [cell[0], y, cell[2]];
    y = top + 1;
    if (y > clampElevation(y, area)) return cell;
  }
  return cell;
}

/** The highest impenetrable obstacle covering this cell, or null if none does. */
function solidTopAt(design: DesignState, x: number, y: number, z: number): number | null {
  let top: number | null = null;
  for (const o of design.obstacles) {
    if (o.penetrable) continue;
    if (x < o.min[0] || x > o.max[0]) continue;
    if (y < o.min[1] || y > o.max[1]) continue;
    if (z < o.min[2] || z > o.max[2]) continue;
    if (top === null || o.max[1] > top) top = o.max[1];
  }
  return top;
}

export function placeObstacleVolume(
  design: DesignState,
  {
    id,
    cornerA,
    cornerB,
    kind = "impenetrable"
  }: {
    id: string;
    cornerA: Vec3;
    cornerB: Vec3;
    kind?: ObstacleKind;
  }
): PlaceObstacleVolumeResult {
  const penetrable = kind === "penetrable";
  const cells = obstacleVolumeCells(cornerA, cornerB);
  for (const cell of cells) {
    if (!design.grid.withinBounds(cell)) {
      return { ok: false, message: OBSTACLE_PLACEMENT_MESSAGES.outOfBounds, design };
    }
    if (!penetrable && design.grid.query(cell)) {
      return { ok: false, message: OBSTACLE_PLACEMENT_MESSAGES.occupied, design };
    }
  }

  const { min, max } = obstacleVolumeBounds(cornerA, cornerB);
  const obstacle = penetrable ? { id, min, max, penetrable } : { id, min, max };
  return {
    ok: true,
    design: addObstacle(design, obstacle)
  };
}
