import { GROUND_PLANE_Y } from "@/domain/sparse-grid";
import { computeTopology, type Port, type Topology } from "@/domain/topology";
import type { DesignState, Ghost, TubePart, Vec3 } from "@/types";

export const TUBE_PLACEMENT_MESSAGE = "Place tube on a highlighted landing spot.";
export const TUBE_BLOCKED_MESSAGE = "Tube path is blocked.";

export type PlaceTubeResult =
  | { ok: true; design: DesignState; part: TubePart }
  | { ok: false; message: string };

type SourceSelection = { sourcePartId?: string };

function cellKey(cell: Vec3): string {
  return `${cell[0]},${cell[1]},${cell[2]}`;
}

export function tubeLandingCells(design: DesignState): Vec3[] {
  const seen = new Set<string>();
  const cells: Vec3[] = [];
  for (const port of computeTopology(design).openPorts()) {
    if (!validateTubeFootprint(design, port)) continue;
    const key = cellKey(port.cell);
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push(port.cell);
  }
  return cells;
}

function vecScale(dir: Vec3, n: number): Vec3 {
  return [dir[0] * n, dir[1] * n, dir[2] * n];
}

function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function cellCenter(cell: Vec3): Vec3 {
  return [cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5];
}

function selectPort(
  topology: Topology,
  cell: Vec3,
  selection: SourceSelection = {}
): Port | null {
  let candidates = topology.openPortsNear(cell);
  if (selection.sourcePartId) {
    const matchingLandingPorts = candidates.filter((port) => port.partId === selection.sourcePartId);
    candidates =
      matchingLandingPorts.length > 0
        ? matchingLandingPorts
        : topology.openPorts().filter((port) => port.partId === selection.sourcePartId);
    return candidates[0] ?? null;
  }
  if (candidates.length !== 1) return null;
  return candidates[0];
}

export function tubePlacementGhost(
  design: DesignState,
  cell: Vec3,
  selection: SourceSelection = {}
): Ghost | null {
  const port = selectPort(computeTopology(design), cell, selection);
  if (!port) return null;
  const length = effectiveTubeLength(port);
  if (!validateTubeFootprint(design, port, length)) return null;
  return {
    type: "tube",
    from: cellCenter(port.cell),
    to: cellCenter(vecAdd(port.cell, vecScale(port.dir, length)))
  };
}

export function tubeFootprint(port: Port, length = 6): Vec3[] {
  return Array.from({ length }, (_, index) => vecAdd(port.cell, vecScale(port.dir, index)));
}

function effectiveTubeLength(port: Port, requestedLength = 6): number {
  if (port.dir[1] >= 0) return requestedLength;
  return Math.min(requestedLength, Math.max(0, port.cell[1] - GROUND_PLANE_Y + 1));
}

function validateTubeFootprint(design: DesignState, port: Port, length = 6): boolean {
  const effectiveLength = effectiveTubeLength(port, length);
  if (effectiveLength < 1) return false;
  return tubeFootprint(port, effectiveLength).every(
    (cell) => design.grid.withinBounds(cell) && !design.grid.query(cell)
  );
}

function tubePartFromPort(id: string, port: Port, length = 6): TubePart {
  return {
    id,
    type: "tube",
    from: cellCenter(port.cell),
    to: cellCenter(vecAdd(port.cell, vecScale(port.dir, length))),
    length
  };
}

export function placeTube(
  design: DesignState,
  { id, cell, sourcePartId, length = 6 }: { id: string; cell: Vec3; sourcePartId?: string; length?: number }
): PlaceTubeResult {
  const port = selectPort(computeTopology(design), cell, { sourcePartId });
  if (!port) return { ok: false, message: TUBE_PLACEMENT_MESSAGE };
  if (length < 1 || length > 6 || !Number.isInteger(length)) {
    return { ok: false, message: TUBE_BLOCKED_MESSAGE };
  }
  const effectiveLength = effectiveTubeLength(port, length);
  if (!validateTubeFootprint(design, port, effectiveLength)) {
    return { ok: false, message: TUBE_BLOCKED_MESSAGE };
  }

  const part = tubePartFromPort(id, port, effectiveLength);
  const grid = design.grid.clone();
  for (const footprintCell of tubeFootprint(port, effectiveLength)) {
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
