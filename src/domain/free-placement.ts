import { partRegistry, type PartRegistry } from "@/domain/part-registry";
import { addPart } from "@/domain/design-state";
import { pedestalCells, pedestalHeightAt } from "@/domain/pedestal";
import { TERMINAL_HEIGHT_CELLS, terminalCells } from "@/domain/terminal";
import { computeTopology } from "@/domain/topology";
import type {
  BlowerPart,
  DesignMetadata,
  DesignState,
  Ghost,
  Part,
  TerminalPart,
  Vec3
} from "@/types";
import { cellKey, vEq, vNeg } from "@/domain/vec3";

/**
 * The three things that place freely. A blower with a pedestal is a blower —
 * it drives the same air, closes the same end of a system and carries the same
 * `type` once placed — so it snaps, turns and validates identically. What sets
 * it apart is the mast it grows underneath when it is raised off the floor,
 * which is geometry rather than behaviour. See pedestal.ts.
 */
export type FreePlacementType = "blower" | "blowerPedestal" | "terminal";

export type FreePlacementMemory = Record<FreePlacementType, Vec3>;

/** The two ghost shapes free placement can produce, and no others. Both kinds
 * of blower preview as one: a pedestal is a taller drawing of a blower, not a
 * different part. */
export type FreePlacementGhost = Extract<Ghost, { type: "blower" | "terminal" }>;

/** How many times `R` has been pressed since the tool was armed. */
export type FreePlacementRotation = number;

export const DEFAULT_FREE_PLACEMENT_ROTATION: FreePlacementRotation = 0;

/** Straight up. */
export const UP: Vec3 = [0, 1, 0];

/**
 * Every orientation `R` cycles through, in order.
 *
 * Up first, because that is where a part starts, then the four horizontal
 * headings. Down is deliberately absent: the client's rule is that "for this
 * version of the app, the hole will never face down".
 *
 * This replaced a pair of independent counters — `R` turning within the four
 * horizontal headings and shift-`R` toggling up/down — under which a blower
 * that had been turned sideways could never be pointed back up.
 */
export const FREE_PLACEMENT_ORIENTATIONS: Vec3[] = [
  UP,
  [1, 0, 0],
  [0, 0, 1],
  [-1, 0, 0],
  [0, 0, -1]
];

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
  blowerPedestal: UP,
  terminal: UP
};

export const FREE_PLACEMENT_MESSAGES = {
  occupied: "That cell is already occupied.",
  outOfBounds: "Place inside the build area.",
  obstacle: "Place on an open grid cell, not an obstacle.",
  // The mast has to reach the floor, so a pedestal blower is refused for
  // something in the column beneath it as well as in its own cell. Said
  // separately because "that cell is already occupied" points at the wrong
  // cell — the one under the cursor is free, and the blocked one is below it.
  pedestalBlocked: "The pedestal cannot reach the floor — something is in the way.",
  // Same reasoning one cell in the other direction: a terminal stands 2 ft
  // tall, so the cell above the cursor has to be free — and out at the top of
  // the build area there is no cell above it at all.
  terminalHeadroom: `A terminal stands ${TERMINAL_HEIGHT_CELLS}ft tall — there is no room above that cell.`,
  // And once R has turned it onto its side the second foot is beside the
  // cursor rather than above it, so the message has to point somewhere else.
  // Naming the direction is what stops it reading as a repeat of the last one.
  terminalClearance: `A terminal turned on its side is ${TERMINAL_HEIGHT_CELLS}ft long — there is no room beside that cell.`
} as const;

export type PlaceFreePartResult =
  | { ok: true; design: DesignState; part: BlowerPart | TerminalPart }
  | { ok: false; message: string };

function orientationIndex(dir: Vec3): number {
  return FREE_PLACEMENT_ORIENTATIONS.findIndex((candidate) => vEq(candidate, dir));
}

function modulo(n: number, d: number): number {
  return ((n % d) + d) % d;
}

/**
 * Turn an orientation `steps` places around the ring. Negative steps go back,
 * which is what shift-`R` does.
 *
 * An orientation the ring does not hold — a part snapped to a downward-facing
 * port, say — enters the ring at the top on the first press rather than being
 * stuck, so a rotate key never appears to do nothing.
 */
export function rotateOrientation(base: Vec3, steps: number): Vec3 {
  if (steps === 0) return base;
  const index = orientationIndex(base);
  if (index < 0) return FREE_PLACEMENT_ORIENTATIONS[modulo(steps - 1, LENGTH)];
  return FREE_PLACEMENT_ORIENTATIONS[modulo(index + steps, LENGTH)];
}

const LENGTH = FREE_PLACEMENT_ORIENTATIONS.length;

export function resolveFreePlacementOrientation(base: Vec3, steps: FreePlacementRotation): Vec3 {
  return rotateOrientation(base, steps);
}

/**
 * The orientation an armed part would be set down in: where it would snap, or
 * what it was last turned to, carried `steps` further round the ring.
 *
 * Worked out on its own rather than read off the ghost, because a terminal's
 * footprint now depends on it: the ghost is refused when the cells that
 * orientation needs are taken, and the click that follows still has to report
 * *which* orientation was refused rather than fall back to a different one and
 * name the wrong blocked cell.
 */
export function freePlacementOrientation(
  design: DesignState,
  type: FreePlacementType,
  cell: Vec3,
  memory: FreePlacementMemory,
  rotationSteps: FreePlacementRotation
): Vec3 {
  return resolveFreePlacementOrientation(
    defaultFreePlacementOrientation(design, type, cell, memory),
    rotationSteps
  );
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

/**
 * The cells a free-placed part would claim: the one under the cursor, plus, for
 * a pedestal blower, the mast beneath it down to the floor.
 *
 * `metadata` is what tells the mast where the floor is — the ground on floor 1,
 * the slab on floor 2 — so it is an argument rather than an assumption.
 */
export function freePlacementFootprint(
  type: FreePlacementType,
  cell: Vec3,
  metadata: DesignMetadata,
  orientation: Vec3,
  registry: PartRegistry = partRegistry
): Vec3[] {
  const body = freePlacementBody(type, cell, orientation, registry);
  if (type !== "blowerPedestal") return body;
  return [...body, ...pedestalCells(cell, pedestalHeightAt(metadata, cell))];
}

/**
 * The unit itself, before anything it grows: one cell for a blower, two end to
 * end for a terminal, along whichever way it is turned (terminal.ts).
 *
 * The catalog's declared `cells` is checked against that rather than assumed,
 * for the reason `assertDeclaredCellCount` gives for bends: the field is load
 * bearing, and a catalog edit that disagreed with the geometry used to pass
 * unnoticed. The mast under a pedestal blower is deliberately outside the
 * check — it is how the unit is mounted, not part of the unit, and its length
 * depends on where it stands.
 */
function freePlacementBody(
  type: FreePlacementType,
  cell: Vec3,
  orientation: Vec3,
  registry: PartRegistry
): Vec3[] {
  const cells = type === "terminal" ? terminalCells(cell, orientation) : [cell];
  const declared = registry.get(type).cells ?? 1;
  if (cells.length !== declared) {
    throw new Error(
      `Free placement: ${type} occupies ${cells.length} cells but the catalog declares ${declared}`
    );
  }
  return cells;
}

/**
 * Whether the whole footprint is free, naming the part of it that is blocked
 * when the blocked cell is not the one under the cursor: reporting "that cell
 * is already occupied" would point at the wrong square, since the cell being
 * pointed at is the one that is free.
 */
function validateFreePlacementFootprint(
  design: DesignState,
  type: FreePlacementType,
  cell: Vec3,
  orientation: Vec3
): { ok: true } | { ok: false; message: string } {
  const ownCell = validateFreePlacementCell(design, cell);
  if (!ownCell.ok) return ownCell;
  if (type === "terminal") {
    const [, second] = terminalCells(cell, orientation);
    if (!validateFreePlacementCell(design, second).ok) {
      return {
        ok: false,
        message:
          second[1] === cell[1]
            ? FREE_PLACEMENT_MESSAGES.terminalClearance
            : FREE_PLACEMENT_MESSAGES.terminalHeadroom
      };
    }
    return { ok: true };
  }
  const [, ...mast] = freePlacementFootprint(type, cell, design.metadata, orientation);
  for (const mastCell of mast) {
    if (!validateFreePlacementCell(design, mastCell).ok) {
      return { ok: false, message: FREE_PLACEMENT_MESSAGES.pedestalBlocked };
    }
  }
  return { ok: true };
}

export function freePlacementGhost({
  type,
  design,
  cell,
  memory,
  rotationSteps
}: {
  type: FreePlacementType;
  design: DesignState;
  cell: Vec3;
  memory: FreePlacementMemory;
  rotationSteps: number;
}): FreePlacementGhost | null {
  // Orientation first: a terminal turned on its side claims a different pair of
  // cells from one standing up, so which cells have to be free is not known
  // until the ghost knows which way it is facing.
  const orientation = freePlacementOrientation(design, type, cell, memory, rotationSteps);
  if (!validateFreePlacementFootprint(design, type, cell, orientation).ok) return null;
  if (type === "terminal") return { type, cell, axis: orientation };
  if (type === "blower") return { type, cell, dir: orientation };
  return {
    type: "blower",
    cell,
    dir: orientation,
    pedestalFeet: pedestalHeightAt(design.metadata, cell)
  };
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
  const validity = validateFreePlacementFootprint(design, type, cell, orientation);
  if (!validity.ok) return validity;
  const part: Part =
    type === "terminal"
      ? { id, type, cell, axis: orientation }
      : type === "blower"
        ? { id, type, cell, dir: orientation }
        : {
            id,
            type: "blower",
            cell,
            dir: orientation,
            pedestalFeet: pedestalHeightAt(design.metadata, cell)
          };
  return {
    ok: true,
    part,
    design: addPart(design, part)
  };
}

/**
 * The cells the viewport highlights when a blower or terminal is armed: every
 * open port's landing cell.
 *
 * Both endpoint kinds snap the same way, so both light up the same cells.
 * Before anything is placed there are no open ports and nothing lights up,
 * which is correct — the first blower goes down in open space.
 */
export function freePlacementLandingCells(design: DesignState): Vec3[] {
  const seen = new Set<string>();
  const cells: Vec3[] = [];
  for (const port of computeTopology(design).openPorts()) {
    if (!validateFreePlacementCell(design, port.cell).ok) continue;
    const key = cellKey(port.cell);
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push(port.cell);
  }
  return cells;
}
