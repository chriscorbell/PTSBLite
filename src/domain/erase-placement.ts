import { designFromScene } from "@/domain/design-state";
import type { DesignState, Obstacle, Part, TubePart, Vec3 } from "@/types";
import { cellAt, cellCenter, dirOf, tubeCells, vAdd, vEq } from "@/domain/vec3";

export const ERASE_EMPTY_MESSAGE = "Nothing to erase here.";

export type EraseResult =
  { ok: true; design: DesignState } | { ok: false; message: string; design: DesignState };

export function eraseAtCell(design: DesignState, cell: Vec3): EraseResult {
  const occupant = design.grid.query(cell);
  if (!occupant) {
    // Penetrable obstacles claim no grid cells, so they are found by
    // containment instead. A cell a part shares with one erases the part —
    // the occupant wins — and the obstacle goes by clicking any cell of it
    // that nothing else holds.
    const penetrable = design.obstacles.find(
      (candidate) => candidate.penetrable && obstacleContains(candidate, cell)
    );
    if (penetrable) {
      return eraseObstacle(design, penetrable);
    }
    return { ok: false, message: ERASE_EMPTY_MESSAGE, design };
  }

  const part = design.parts.find((candidate) => candidate.id === occupant);
  if (part) return erasePartAtCell(design, part, cell);

  const obstacle = design.obstacles.find((candidate) => candidate.id === occupant);
  if (obstacle) {
    return eraseObstacle(design, obstacle);
  }

  return { ok: false, message: ERASE_EMPTY_MESSAGE, design };
}

function erasePartAtCell(design: DesignState, part: Part, cell: Vec3): EraseResult {
  switch (part.type) {
    case "blower":
    case "terminal":
    case "bend":
      return eraseWholePart(design, part);
    case "tube":
      return eraseTubeCell(design, part, cell);
  }
}

function eraseWholePart(design: DesignState, part: Part): EraseResult {
  return {
    ok: true,
    design: designFromScene(
      {
        parts: design.parts.filter((candidate) => candidate.id !== part.id),
        obstacles: design.obstacles
      },
      design.metadata
    )
  };
}

function tubeDirection(part: TubePart): Vec3 {
  return dirOf(cellAt(part.from), cellAt(part.to));
}

function segmentPart(part: TubePart, id: string, cells: Vec3[]): TubePart {
  const dir = tubeDirection(part);
  return {
    ...part,
    id,
    from: cellCenter(cells[0]),
    to: cellCenter(vAdd(cells[cells.length - 1], dir)),
    length: cells.length
  };
}

function uniquePartId(existing: Set<string>, preferred: string): string {
  if (!existing.has(preferred)) {
    existing.add(preferred);
    return preferred;
  }
  let index = 1;
  while (existing.has(`${preferred}-${index}`)) index++;
  const id = `${preferred}-${index}`;
  existing.add(id);
  return id;
}

function eraseTubeCell(design: DesignState, part: TubePart, cell: Vec3): EraseResult {
  const cells = tubeCells(part.from, part.to);
  const erasedIndex = cells.findIndex((candidate) => vEq(candidate, cell));
  if (erasedIndex < 0) return { ok: false, message: ERASE_EMPTY_MESSAGE, design };

  const runs = [cells.slice(0, erasedIndex), cells.slice(erasedIndex + 1)].filter(
    (run) => run.length > 0
  );
  const existingIds = new Set(design.parts.map((candidate) => candidate.id));
  existingIds.delete(part.id);
  const replacementParts = runs.map((run, index) =>
    segmentPart(
      part,
      uniquePartId(existingIds, index === 0 ? part.id : `${part.id}-split-${index}`),
      run
    )
  );

  return {
    ok: true,
    design: designFromScene(
      {
        parts: design.parts.flatMap((candidate) =>
          candidate.id === part.id ? replacementParts : [candidate]
        ),
        obstacles: design.obstacles
      },
      design.metadata
    )
  };
}

function obstacleContains(obstacle: Obstacle, cell: Vec3): boolean {
  return (
    cell[0] >= Math.floor(obstacle.min[0]) &&
    cell[0] <= Math.floor(obstacle.max[0]) &&
    cell[1] >= Math.floor(obstacle.min[1]) &&
    cell[1] <= Math.floor(obstacle.max[1]) &&
    cell[2] >= Math.floor(obstacle.min[2]) &&
    cell[2] <= Math.floor(obstacle.max[2])
  );
}

function eraseObstacle(design: DesignState, obstacle: Obstacle): EraseResult {
  return {
    ok: true,
    // Reconstruct rather than editing the grid by hand. A surviving obstacle
    // may cover cells this one owned, and reconstruction assigns those cells
    // again so the obstacle union remains blocked.
    design: designFromScene(
      {
        parts: design.parts,
        obstacles: design.obstacles.filter((candidate) => candidate.id !== obstacle.id)
      },
      design.metadata
    )
  };
}
