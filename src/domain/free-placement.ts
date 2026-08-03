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

/** Straight up. Not one of `FREE_PLACEMENT_DIRECTIONS`, which are the four horizontal headings. */
export const UP: Vec3 = [0, 1, 0];

/**
 * Which way a blower or terminal faces before anyone rotates it.
 *
 * Vertical, because a tube system is mostly risers: a blower sits on the floor
 * blowing up and a terminal takes its delivery from above far more often than
 * either points sideways. R still cycles the four horizontal headings, and
 * `resolveFreePlacementOrientation` already handles a base that is not one of
 * them — the first press lands on +X.
 *
 * This is a placement default, not a spec fact. Nothing in ADR-0001 constrains
 * which way a port may face.
 */
export const DEFAULT_FREE_PLACEMENT_MEMORY: FreePlacementMemory = {
  blower: UP,
  terminal: UP
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

/**
 * Shift-R alternates between facing up and facing down.
 *
 * The first press goes *down*, because up is now where a part starts
 * (`DEFAULT_FREE_PLACEMENT_MEMORY`). Sending it up first would make the first
 * press of a rotate key appear to do nothing.
 */
export function rotateOrientationVertically(steps: number): Vec3 {
  return modulo(steps, 2) === 1 ? [0, -1, 0] : [0, 1, 0];
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
