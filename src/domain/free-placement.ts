import { partRegistry, type PartRegistry } from "@/domain/part-registry";
import { computeTopology } from "@/domain/topology";
import type { BlowerPart, DesignState, Ghost, Part, TerminalPart, Vec3 } from "@/types";
import { vEq, vNeg } from "@/domain/vec3";

export type FreePlacementType = "blower" | "terminal";

export type FreePlacementMemory = Record<FreePlacementType, Vec3>;

export type FreePlacementRotation = {
  horizontalSteps: number;
  verticalSteps: number;
};

export const FREE_PLACEMENT_DIRECTIONS: Vec3[] = [
  [1, 0, 0],
  [0, 0, 1],
  [-1, 0, 0],
  [0, 0, -1]
];

export const DEFAULT_FREE_PLACEMENT_ROTATION: FreePlacementRotation = {
  horizontalSteps: 0,
  verticalSteps: 0
};

export const DEFAULT_FREE_PLACEMENT_MEMORY: FreePlacementMemory = {
  blower: FREE_PLACEMENT_DIRECTIONS[0],
  terminal: FREE_PLACEMENT_DIRECTIONS[0]
};

export const FREE_PLACEMENT_MESSAGES = {
  occupied: "That cell is already occupied.",
  outOfBounds: "Place inside the build area.",
  obstacle: "Place on an open grid cell, not an obstacle."
} as const;

export type PlaceFreePartResult =
  | { ok: true; design: DesignState; part: BlowerPart | TerminalPart }
  | { ok: false; message: string };

function directionIndex(dir: Vec3): number {
  return FREE_PLACEMENT_DIRECTIONS.findIndex((candidate) => vEq(candidate, dir));
}

function modulo(n: number, d: number): number {
  return ((n % d) + d) % d;
}

export function rotateOrientation(base: Vec3, steps: number): Vec3 {
  const idx = directionIndex(base);
  if (idx < 0) return base;
  return FREE_PLACEMENT_DIRECTIONS[modulo(idx + steps, FREE_PLACEMENT_DIRECTIONS.length)];
}

export function rotateOrientationVertically(steps: number): Vec3 {
  return modulo(steps - 1, 2) === 0 ? [0, 1, 0] : [0, -1, 0];
}

export function resolveFreePlacementOrientation(
  base: Vec3,
  { horizontalSteps, verticalSteps }: FreePlacementRotation
): Vec3 {
  if (verticalSteps > 0) return rotateOrientationVertically(verticalSteps);
  if (horizontalSteps !== 0 && directionIndex(base) < 0) {
    return FREE_PLACEMENT_DIRECTIONS[modulo(horizontalSteps - 1, FREE_PLACEMENT_DIRECTIONS.length)];
  }
  return rotateOrientation(base, horizontalSteps);
}

export function rememberFreePlacementOrientation(
  memory: FreePlacementMemory,
  type: FreePlacementType,
  orientation: Vec3
): FreePlacementMemory {
  return { ...memory, [type]: orientation };
}

export function defaultFreePlacementOrientation(
  design: DesignState,
  type: FreePlacementType,
  cell: Vec3,
  memory: FreePlacementMemory
): Vec3 {
  const snapPort = computeTopology(design).openPortsNear(cell)[0];
  if (!snapPort) return memory[type];
  return type === "terminal" ? snapPort.dir : vNeg(snapPort.dir);
}

export function validateFreePlacementCell(
  design: DesignState,
  cell: Vec3
): { ok: true } | { ok: false; message: string } {
  if (!design.grid.withinBounds(cell)) {
    return { ok: false, message: FREE_PLACEMENT_MESSAGES.outOfBounds };
  }
  const occupant = design.grid.query(cell);
  if (!occupant) return { ok: true };
  if (design.obstacles.some((o) => o.id === occupant)) {
    return { ok: false, message: FREE_PLACEMENT_MESSAGES.obstacle };
  }
  return { ok: false, message: FREE_PLACEMENT_MESSAGES.occupied };
}

export function freePlacementFootprint(
  type: FreePlacementType,
  cell: Vec3,
  registry: PartRegistry = partRegistry
): Vec3[] {
  const cells = registry.get(type).cells ?? 1;
  if (cells !== 1) {
    throw new Error(
      `Free placement supports only 1-cell endpoint footprints; ${type} has ${cells}`
    );
  }
  return [cell];
}

export function freePlacementGhost({
  type,
  design,
  cell,
  memory,
  rotationSteps,
  verticalRotationSteps = 0
}: {
  type: FreePlacementType;
  design: DesignState;
  cell: Vec3;
  memory: FreePlacementMemory;
  rotationSteps: number;
  verticalRotationSteps?: number;
}): Ghost | null {
  for (const footprintCell of freePlacementFootprint(type, cell)) {
    if (!validateFreePlacementCell(design, footprintCell).ok) return null;
  }
  const orientation = resolveFreePlacementOrientation(
    defaultFreePlacementOrientation(design, type, cell, memory),
    {
      horizontalSteps: rotationSteps,
      verticalSteps: verticalRotationSteps
    }
  );
  if (type === "blower") return { type, cell, dir: orientation };
  return { type, cell, axis: orientation };
}

export function placeFreePart(
  design: DesignState,
  {
    id,
    type,
    cell,
    orientation
  }: {
    id: string;
    type: FreePlacementType;
    cell: Vec3;
    orientation: Vec3;
  }
): PlaceFreePartResult {
  const footprint = freePlacementFootprint(type, cell);
  for (const footprintCell of footprint) {
    const validity = validateFreePlacementCell(design, footprintCell);
    if (!validity.ok) return validity;
  }

  const part: Part =
    type === "blower"
      ? { id, type, cell, dir: orientation }
      : { id, type, cell, axis: orientation };
  const grid = design.grid.clone();
  for (const footprintCell of footprint) {
    grid.place(footprintCell, id);
  }

  return {
    ok: true,
    part,
    design: {
      ...design,
      parts: [...design.parts, part],
      grid
    }
  };
}
