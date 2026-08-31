import { partRegistry, type PartRegistry } from "@/domain/part-registry";
import { hasPedestal, pedestalCells } from "@/domain/pedestal";
import { terminalCells } from "@/domain/terminal";
import { cellAt, tubeCells, vAdd, vEq } from "@/domain/vec3";
import type { BendPart, Obstacle, Part, Vec3 } from "@/types";

function appendUniqueCell(cells: Vec3[], cell: Vec3): Vec3[] {
  return cells.some((candidate) => vEq(candidate, cell)) ? cells : [...cells, cell];
}

/** The grid cells a bend occupies. */
export function bendFootprint(part: BendPart, registry: PartRegistry = partRegistry): Vec3[] {
  const entry = cellAt(part.entry);
  const exit = cellAt(part.exit);
  const footprint = (registry.get("bend90").bendFootprints ?? []).find(
    (candidate) => vEq(candidate.inDir, part.inDir) && vEq(candidate.outDir, part.outDir)
  );
  if (!footprint) return [entry];
  return appendUniqueCell(
    footprint.cells.map((cell) => vAdd(entry, cell)),
    exit
  );
}

/** The grid cells a part occupies. */
export function partCells(part: Part): Vec3[] {
  if (hasPedestal(part)) return [part.cell, ...pedestalCells(part.cell, part.pedestalFeet)];
  switch (part.type) {
    case "blower":
      return [part.cell];
    case "terminal":
      return terminalCells(part.cell);
    case "tube":
      return tubeCells(part.from, part.to);
    case "bend":
      return bendFootprint(part);
  }
}

/** Inclusive integer bounds for a rectangular obstacle. */
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

/** Every grid cell inside an obstacle's inclusive bounds. */
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

/** The grid cells an obstacle covers, whether or not it claims them. */
export function obstacleCells(obstacle: Obstacle): Vec3[] {
  return obstacleVolumeCells(obstacle.min, obstacle.max);
}
