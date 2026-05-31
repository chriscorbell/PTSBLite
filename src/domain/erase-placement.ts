import { bendFootprint } from "@/domain/bend-placement";
import type { DesignState, Obstacle, Part, TubePart, Vec3 } from "@/types";

export const ERASE_EMPTY_MESSAGE = "Nothing to erase here.";

export type EraseResult =
  | { ok: true; design: DesignState }
  | { ok: false; message: string; design: DesignState };

export function eraseAtCell(design: DesignState, cell: Vec3): EraseResult {
  const occupant = design.grid.query(cell);
  if (!occupant) {
    return { ok: false, message: ERASE_EMPTY_MESSAGE, design };
  }

  const part = design.parts.find((candidate) => candidate.id === occupant);
  if (part?.type === "blower" || part?.type === "terminal") {
    return eraseWholePart(design, part, [part.cell]);
  }
  if (part?.type === "tube") {
    return eraseTubeCell(design, part, cell);
  }
  if (part?.type === "bend") {
    return eraseWholePart(design, part, bendFootprint(part));
  }

  const obstacle = design.obstacles.find((candidate) => candidate.id === occupant);
  if (obstacle) {
    return eraseObstacle(design, obstacle);
  }

  return { ok: false, message: ERASE_EMPTY_MESSAGE, design };
}

function eraseWholePart(design: DesignState, part: Part, cells: Vec3[]): EraseResult {
  const grid = design.grid.clone();
  for (const footprintCell of cells) {
    grid.remove(footprintCell);
  }
  return {
    ok: true,
    design: {
      ...design,
      parts: design.parts.filter((candidate) => candidate.id !== part.id),
      grid
    }
  };
}

function cellAt(v: Vec3): Vec3 {
  return [Math.floor(v[0]), Math.floor(v[1]), Math.floor(v[2])];
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function tubeDirection(part: TubePart): Vec3 {
  const start = cellAt(part.from);
  const end = cellAt(part.to);
  return [sign(end[0] - start[0]), sign(end[1] - start[1]), sign(end[2] - start[2])];
}

function vAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vScale(v: Vec3, n: number): Vec3 {
  return [v[0] * n, v[1] * n, v[2] * n];
}

function vEq(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function cellCenter(cell: Vec3): Vec3 {
  return [cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5];
}

function tubeCells(part: TubePart): Vec3[] {
  const start = cellAt(part.from);
  const end = cellAt(part.to);
  const dir = tubeDirection(part);
  const length = Math.max(
    Math.abs(end[0] - start[0]),
    Math.abs(end[1] - start[1]),
    Math.abs(end[2] - start[2])
  );
  return Array.from({ length }, (_, i) => vAdd(start, vScale(dir, i)));
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
  const cells = tubeCells(part);
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

  const grid = design.grid.clone();
  for (const footprintCell of cells) {
    grid.remove(footprintCell);
  }
  for (const replacement of replacementParts) {
    for (const footprintCell of tubeCells(replacement)) {
      grid.place(footprintCell, replacement.id);
    }
  }

  return {
    ok: true,
    design: {
      ...design,
      parts: design.parts.flatMap((candidate) =>
        candidate.id === part.id ? replacementParts : [candidate]
      ),
      grid
    }
  };
}

function obstacleCells(obstacle: Obstacle): Vec3[] {
  const [x0, y0, z0] = obstacle.min.map(Math.floor);
  const [x1, y1, z1] = obstacle.max.map(Math.floor);
  const cells: Vec3[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        cells.push([x, y, z]);
      }
    }
  }
  return cells;
}

function eraseObstacle(design: DesignState, obstacle: Obstacle): EraseResult {
  const grid = design.grid.clone();
  for (const footprintCell of obstacleCells(obstacle)) {
    grid.remove(footprintCell);
  }
  return {
    ok: true,
    design: {
      ...design,
      obstacles: design.obstacles.filter((candidate) => candidate.id !== obstacle.id),
      grid
    }
  };
}
