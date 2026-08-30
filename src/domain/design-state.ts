import { SparseGrid, boundsFromBuildArea, BUILD_AREA } from "@/domain/sparse-grid";
import { reconstructDesign } from "@/domain/design-reconstruction";
import { clampRoom } from "@/domain/floors";
import { obstacleCells, partCells } from "@/domain/occupant-footprints";
import { cellKey } from "@/domain/vec3";
import type { DesignMetadata, DesignState, Obstacle, Part, Scene, Vec3 } from "@/types";

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
  const multiFloor = meta?.multiFloor ?? false;
  return {
    room: clampRoom(meta?.room, multiFloor),
    multiFloor,
    plenumHeightFeet: meta?.plenumHeightFeet ?? null
  };
}

export function emptyDesign(meta?: Partial<DesignMetadata>): DesignState {
  const metadata = withMetadata(meta);
  return {
    parts: [],
    obstacles: [],
    metadata,
    grid: new SparseGrid(boundsFromBuildArea(BUILD_AREA))
  };
}

function mutableGrid(design: DesignState): SparseGrid {
  if (!(design.grid instanceof SparseGrid)) {
    throw new Error("DesignState grid was not created by the design module.");
  }
  return design.grid;
}

function assertNewOccupantId(design: DesignState, id: string): void {
  if (
    design.parts.some((part) => part.id === id) ||
    design.obstacles.some((obstacle) => obstacle.id === id)
  ) {
    throw new Error(`DesignState already contains occupant "${id}".`);
  }
}

function placeCells(grid: SparseGrid, cells: readonly Vec3[], id: string): void {
  const seen = new Set<string>();
  for (const cell of cells) {
    if (!grid.withinBounds(cell)) {
      throw new Error(
        `DesignState cannot place "${id}" outside the build area at ${cellKey(cell)}.`
      );
    }
    const key = cellKey(cell);
    if (seen.has(key)) {
      throw new Error(`DesignState occupant "${id}" claims ${key} twice.`);
    }
    seen.add(key);
    const occupiedBy = grid.query(cell);
    if (occupiedBy !== undefined) {
      throw new Error(`DesignState cannot place "${id}" over "${occupiedBy}" at ${key}.`);
    }
  }
  for (const cell of cells) grid.place(cell, id);
}

/** Add one already-validated part and register its complete footprint. */
export function addPart(design: DesignState, part: Part): DesignState {
  assertNewOccupantId(design, part.id);
  const grid = mutableGrid(design).clone();
  placeCells(grid, partCells(part), part.id);
  return { ...design, parts: [...design.parts, part], grid };
}

/** Add one already-validated obstacle and register it when it is impenetrable. */
export function addObstacle(design: DesignState, obstacle: Obstacle): DesignState {
  assertNewOccupantId(design, obstacle.id);
  const cells = obstacleCells(obstacle);
  for (const cell of cells) {
    if (!design.grid.withinBounds(cell)) {
      throw new Error(
        `DesignState cannot place "${obstacle.id}" outside the build area at ${cellKey(cell)}.`
      );
    }
  }
  const grid = mutableGrid(design).clone();
  if (!obstacle.penetrable) placeCells(grid, cells, obstacle.id);
  return { ...design, obstacles: [...design.obstacles, obstacle], grid };
}

/** Replace one part, rebuilding occupancy so legal obstacle overlaps survive. */
export function replacePart(
  design: DesignState,
  partId: string,
  replacements: readonly Part[]
): DesignState {
  if (!design.parts.some((part) => part.id === partId)) {
    throw new Error(`DesignState cannot replace missing part "${partId}".`);
  }
  return designFromKnownScene(
    {
      parts: design.parts.flatMap((part) => (part.id === partId ? replacements : [part])),
      obstacles: design.obstacles
    },
    design.metadata
  );
}

/** Remove one part and rebuild occupancy around any legal obstacle overlaps. */
export function removePart(design: DesignState, partId: string): DesignState {
  if (!design.parts.some((part) => part.id === partId)) {
    throw new Error(`DesignState cannot remove missing part "${partId}".`);
  }
  return designFromKnownScene(
    {
      parts: design.parts.filter((part) => part.id !== partId),
      obstacles: design.obstacles
    },
    design.metadata
  );
}

/** Remove one obstacle, rebuilding the union claimed by any that survive. */
export function removeObstacle(design: DesignState, obstacleId: string): DesignState {
  if (!design.obstacles.some((obstacle) => obstacle.id === obstacleId)) {
    throw new Error(`DesignState cannot remove missing obstacle "${obstacleId}".`);
  }
  return designFromKnownScene(
    {
      parts: design.parts,
      obstacles: design.obstacles.filter((obstacle) => obstacle.id !== obstacleId)
    },
    design.metadata
  );
}

function designFromKnownScene(scene: Scene, metadata: DesignMetadata): DesignState {
  const result = reconstructDesign(scene, metadata);
  if (!result.ok) {
    throw new Error(
      `DesignState change produced an invalid design: ${result.issues.map((i) => i.message).join(" ")}`
    );
  }
  return result.design;
}

/**
 * Rebuild a design from a scene that is *already known to be valid* — clearing
 * parts, clearing obstacles, applying a build-area change to parts already
 * filtered to fit.
 *
 * Throws if that assumption is wrong, because it would mean a bug here rather
 * than bad input. Use `reconstructDesign` directly for anything originating
 * outside the app, such as a file being opened; it reports instead of throwing.
 * There is deliberately one rebuilding implementation and no second,
 * permissive path.
 */
export function designFromScene(scene: Scene, meta?: Partial<DesignMetadata>): DesignState {
  return designFromKnownScene(scene, withMetadata(meta));
}
