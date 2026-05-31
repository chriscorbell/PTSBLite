import {
  freePlacementGhost,
  placeFreePart,
  validateFreePlacementCell,
  type FreePlacementMemory,
  type PlaceFreePartResult
} from "@/domain/free-placement";
import { computeTopology } from "@/domain/topology";
import type { BlowerPart, DesignState, Ghost, TerminalPart, Vec3 } from "@/types";

export type TerminalOneLanding = {
  cell: Vec3;
  axis: Vec3;
};

export type TerminalPlacementMode =
  | { kind: "terminal-1"; landing: TerminalOneLanding }
  | { kind: "terminal-2" }
  | { kind: "needs-blower" };

export const TERMINAL_ONE_MESSAGE = "Place Terminal 1 on the highlighted blower-outlet cell.";

function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function firstBlower(design: DesignState): BlowerPart | undefined {
  return design.parts.find((part): part is BlowerPart => part.type === "blower");
}

function vecEq(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function cellKey(cell: Vec3): string {
  return `${cell[0]},${cell[1]},${cell[2]}`;
}

function hasTerminalOne(design: DesignState, landing: TerminalOneLanding): boolean {
  return design.parts.some(
    (part): part is TerminalPart =>
      part.type === "terminal" && vecEq(part.cell, landing.cell) && vecEq(part.axis, landing.axis)
  );
}

export function terminalOneLanding(design: DesignState): TerminalOneLanding | null {
  const blower = firstBlower(design);
  if (!blower) return null;
  return {
    cell: vecAdd(blower.cell, blower.dir),
    axis: blower.dir
  };
}

export function terminalPlacementMode(design: DesignState): TerminalPlacementMode {
  const landing = terminalOneLanding(design);
  if (!landing) return { kind: "needs-blower" };
  if (hasTerminalOne(design, landing)) return { kind: "terminal-2" };
  return { kind: "terminal-1", landing };
}

export function terminalPlacementGhost({
  design,
  cell,
  memory,
  rotationSteps,
  verticalRotationSteps = 0
}: {
  design: DesignState;
  cell: Vec3;
  memory: FreePlacementMemory;
  rotationSteps: number;
  verticalRotationSteps?: number;
}): Ghost | null {
  const mode = terminalPlacementMode(design);
  if (mode.kind === "terminal-2") {
    return freePlacementGhost({
      type: "terminal",
      design,
      cell,
      memory,
      rotationSteps,
      verticalRotationSteps
    });
  }
  if (mode.kind !== "terminal-1" || !vecEq(cell, mode.landing.cell)) return null;
  if (!validateFreePlacementCell(design, mode.landing.cell).ok) return null;
  return { type: "terminal", cell: mode.landing.cell, axis: mode.landing.axis };
}

export function terminalLandingCells(design: DesignState): Vec3[] {
  const mode = terminalPlacementMode(design);
  if (mode.kind === "terminal-1") {
    return validateFreePlacementCell(design, mode.landing.cell).ok ? [mode.landing.cell] : [];
  }
  if (mode.kind !== "terminal-2") return [];

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

export function placeTerminal(
  design: DesignState,
  {
    id,
    cell,
    memory,
    rotationSteps,
    verticalRotationSteps = 0
  }: {
    id: string;
    cell: Vec3;
    memory: FreePlacementMemory;
    rotationSteps: number;
    verticalRotationSteps?: number;
  }
): PlaceFreePartResult {
  const mode = terminalPlacementMode(design);
  if (mode.kind === "needs-blower") {
    return { ok: false, message: "Place a blower before Terminal 1." };
  }
  if (mode.kind === "terminal-1") {
    if (!vecEq(cell, mode.landing.cell)) {
      return { ok: false, message: TERMINAL_ONE_MESSAGE };
    }
    return placeFreePart(design, {
      id,
      type: "terminal",
      cell: mode.landing.cell,
      orientation: mode.landing.axis
    });
  }
  const ghost = terminalPlacementGhost({
    design,
    cell,
    memory,
    rotationSteps,
    verticalRotationSteps
  });
  return placeFreePart(design, {
    id,
    type: "terminal",
    cell,
    orientation: ghost?.type === "terminal" ? ghost.axis : memory.terminal
  });
}
