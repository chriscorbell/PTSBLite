import type { DesignState, Ghost, Vec3 } from "@/types";

export const OBSTACLE_PLACEMENT_MESSAGES = {
  occupied: "Place obstacle on open grid cells.",
  outOfBounds: "Place inside the build area."
} as const;

export type PlaceObstacleVolumeResult =
  | { ok: true; design: DesignState }
  | { ok: false; message: string; design: DesignState };

export type ObstaclePlacementDraft = {
  cornerA: Vec3;
  cornerB?: Vec3;
  baseY?: number;
  height?: number;
};

export type StartObstaclePlacementResult =
  | { ok: true; draft: ObstaclePlacementDraft }
  | { ok: false; message: string };

export function startObstaclePlacement(
  design: DesignState,
  cornerA: Vec3
): StartObstaclePlacementResult {
  if (!design.grid.withinBounds(cornerA)) {
    return { ok: false, message: OBSTACLE_PLACEMENT_MESSAGES.outOfBounds };
  }
  if (design.grid.query(cornerA)) {
    return { ok: false, message: OBSTACLE_PLACEMENT_MESSAGES.occupied };
  }
  return { ok: true, draft: { cornerA } };
}

export function cancelObstaclePlacement(_draft: ObstaclePlacementDraft | null): null {
  return null;
}

export function obstaclePlacementGhost(
  draft: ObstaclePlacementDraft | null,
  currentCell: Vec3
): Ghost | null {
  if (!draft) return null;
  const { min, max } = obstaclePlacementDraftBounds(draft, currentCell);
  return { type: "obstacle", min, max };
}

export function obstaclePlacementDraftHasFootprint(
  draft: ObstaclePlacementDraft | null
): draft is ObstaclePlacementDraft & { cornerB: Vec3; baseY: number; height: number } {
  return !!draft?.cornerB && typeof draft.baseY === "number" && typeof draft.height === "number";
}

export function setObstaclePlacementFootprint(
  draft: ObstaclePlacementDraft,
  cornerB: Vec3
): ObstaclePlacementDraft {
  const { min, max } = obstacleVolumeBounds(draft.cornerA, cornerB);
  return {
    cornerA: [draft.cornerA[0], min[1], draft.cornerA[2]],
    cornerB: [cornerB[0], min[1], cornerB[2]],
    baseY: min[1],
    height: max[1] - min[1] + 1
  };
}

export function resizeObstaclePlacementHeight(
  draft: ObstaclePlacementDraft,
  height: number
): ObstaclePlacementDraft {
  if (!obstaclePlacementDraftHasFootprint(draft)) return draft;
  return {
    ...draft,
    height: Math.max(1, Math.floor(height))
  };
}

export function moveObstaclePlacementBase(
  draft: ObstaclePlacementDraft,
  baseY: number
): ObstaclePlacementDraft {
  if (!obstaclePlacementDraftHasFootprint(draft)) return draft;
  return {
    ...draft,
    baseY: Math.floor(baseY)
  };
}

export function obstaclePlacementDraftBounds(
  draft: ObstaclePlacementDraft,
  currentCell?: Vec3
): { min: Vec3; max: Vec3 } {
  if (!obstaclePlacementDraftHasFootprint(draft)) {
    if (!currentCell) return obstacleVolumeBounds(draft.cornerA, draft.cornerA);
    return obstacleVolumeBounds(draft.cornerA, currentCell);
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

export function obstacleVolumeBounds(cornerA: Vec3, cornerB: Vec3): { min: Vec3; max: Vec3 } {
  return {
    min: [
      Math.min(cornerA[0], cornerB[0]),
      Math.min(cornerA[1], cornerB[1]),
      Math.min(cornerA[2], cornerB[2])
    ],
    max: [
      Math.max(cornerA[0], cornerB[0]),
      Math.max(cornerA[1], cornerB[1]),
      Math.max(cornerA[2], cornerB[2])
    ]
  };
}

export function obstacleVolumeCells(cornerA: Vec3, cornerB: Vec3): Vec3[] {
  const { min, max } = obstacleVolumeBounds(cornerA, cornerB);
  const cells: Vec3[] = [];
  for (let x = min[0]; x <= max[0]; x++) {
    for (let y = min[1]; y <= max[1]; y++) {
      for (let z = min[2]; z <= max[2]; z++) {
        cells.push([x, y, z]);
      }
    }
  }
  return cells;
}

export function placeObstacleVolume(
  design: DesignState,
  {
    id,
    cornerA,
    cornerB
  }: {
    id: string;
    cornerA: Vec3;
    cornerB: Vec3;
  }
): PlaceObstacleVolumeResult {
  const cells = obstacleVolumeCells(cornerA, cornerB);
  for (const cell of cells) {
    if (!design.grid.withinBounds(cell)) {
      return { ok: false, message: OBSTACLE_PLACEMENT_MESSAGES.outOfBounds, design };
    }
    if (design.grid.query(cell)) {
      return { ok: false, message: OBSTACLE_PLACEMENT_MESSAGES.occupied, design };
    }
  }

  const grid = design.grid.clone();
  for (const cell of cells) {
    grid.place(cell, id);
  }
  const { min, max } = obstacleVolumeBounds(cornerA, cornerB);
  return {
    ok: true,
    design: {
      ...design,
      obstacles: [...design.obstacles, { id, min, max }],
      grid
    }
  };
}
