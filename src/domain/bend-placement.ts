import { partRegistry, type BendFootprint, type PartRegistry } from "@/domain/part-registry";
import { addPart } from "@/domain/design-state";
import { computeTopology, type Port, type Topology } from "@/domain/topology";
import type { BendPart, DesignState, Ghost, Vec3 } from "@/types";
import { cellAt, cellCenter, cellKey, vAdd, vEq } from "@/domain/vec3";

export const BEND_PLACEMENT_MESSAGE = "Place bend on a highlighted landing spot.";
export const BEND_BLOCKED_MESSAGE = "Bend path is blocked.";

export type BendOrientation = {
  inDir: Vec3;
  outDir: Vec3;
  center: Vec3;
  exit: Vec3;
  cells: Vec3[];
  radius: number;
};

export type PlaceBendResult =
  { ok: true; design: DesignState; part: BendPart } | { ok: false; message: string };

type SourceSelection = { sourcePartId?: string };

type BendPreviewOptions = SourceSelection & { rotationIndex?: number };

function appendUniqueCell(cells: Vec3[], cell: Vec3): Vec3[] {
  return cells.some((candidate) => vEq(candidate, cell)) ? cells : [...cells, cell];
}

function bendEntry(registry: PartRegistry): BendFootprint[] {
  return registry.get("bend90").bendFootprints ?? [];
}

function selectPort(topology: Topology, cell: Vec3, selection: SourceSelection = {}): Port | null {
  let candidates = topology.openPortsNear(cell);
  if (selection.sourcePartId) {
    const matchingLandingPorts = candidates.filter(
      (port) => port.partId === selection.sourcePartId
    );
    candidates =
      matchingLandingPorts.length > 0
        ? matchingLandingPorts
        : topology.openPorts().filter((port) => port.partId === selection.sourcePartId);
    return candidates[0] ?? null;
  }
  if (candidates.length !== 1) return null;
  return candidates[0];
}

function toAbsoluteOrientation(port: Port, footprint: BendFootprint): BendOrientation {
  const exit = vAdd(port.cell, footprint.exit);
  return {
    inDir: footprint.inDir,
    outDir: footprint.outDir,
    center: vAdd(port.cell, footprint.center),
    exit,
    cells: appendUniqueCell(
      footprint.cells.map((cell) => vAdd(port.cell, cell)),
      exit
    ),
    radius: footprint.radius
  };
}

function orientationFits(design: DesignState, orientation: BendOrientation): boolean {
  return orientation.cells.every(
    (cell) => design.grid.withinBounds(cell) && !design.grid.query(cell)
  );
}

export function validBendOrientations(
  design: DesignState,
  cell: Vec3,
  selection: SourceSelection = {},
  registry: PartRegistry = partRegistry
): BendOrientation[] {
  return orientationsAtPort(design, computeTopology(design), cell, selection, registry);
}

/**
 * The same thing, against a topology the caller already has.
 *
 * `bendLandingCells` walks every open port, and calling the public form per
 * port recomputed the topology each time — quadratic in the number of open
 * ports, for a value that cannot change during the walk. Passing it through is
 * enough; nothing here needs a cache or invalidation rules.
 */
function orientationsAtPort(
  design: DesignState,
  topology: Topology,
  cell: Vec3,
  selection: SourceSelection,
  registry: PartRegistry
): BendOrientation[] {
  const port = selectPort(topology, cell, selection);
  if (!port) return [];
  return bendEntry(registry)
    .filter((footprint) => vEq(footprint.inDir, port.dir))
    .map((footprint) => toAbsoluteOrientation(port, footprint))
    .filter((orientation) => orientationFits(design, orientation));
}

export function bendLandingCells(design: DesignState): Vec3[] {
  const seen = new Set<string>();
  const cells: Vec3[] = [];
  const topology = computeTopology(design);
  for (const port of topology.openPorts()) {
    const orientations = orientationsAtPort(
      design,
      topology,
      port.cell,
      { sourcePartId: port.partId },
      partRegistry
    );
    if (orientations.length === 0) continue;
    const key = cellKey(port.cell);
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push(port.cell);
  }
  return cells;
}

function bendPartFromOrientation(
  id: string,
  orientation: BendOrientation,
  source?: "auto-build"
): BendPart {
  return {
    id,
    type: "bend",
    entry: cellCenter(orientation.cells[0]),
    exit: cellCenter(orientation.exit),
    center: cellCenter(cellAt(orientation.center)),
    inDir: orientation.inDir,
    outDir: orientation.outDir,
    radius: orientation.radius,
    ...(source ? { source } : {})
  };
}

export function bendPlacementGhost(
  design: DesignState,
  cell: Vec3,
  options: BendPreviewOptions = {}
): Ghost | null {
  const orientations = validBendOrientations(design, cell, options);
  if (orientations.length === 0) return null;
  const selected = orientations[(options.rotationIndex ?? 0) % orientations.length];
  return bendPartFromOrientation("ghost", selected);
}

export function placeBend(
  design: DesignState,
  {
    id,
    cell,
    sourcePartId,
    rotationIndex = 0,
    source
  }: {
    id: string;
    cell: Vec3;
    sourcePartId?: string;
    rotationIndex?: number;
    source?: "auto-build";
  }
): PlaceBendResult {
  const port = selectPort(computeTopology(design), cell, { sourcePartId });
  if (!port) return { ok: false, message: BEND_PLACEMENT_MESSAGE };

  const orientations = validBendOrientations(design, cell, { sourcePartId });
  if (orientations.length === 0) return { ok: false, message: BEND_BLOCKED_MESSAGE };

  const orientation = orientations[rotationIndex % orientations.length];
  const part = bendPartFromOrientation(id, orientation, source);

  return {
    ok: true,
    part,
    design: addPart(design, part)
  };
}
