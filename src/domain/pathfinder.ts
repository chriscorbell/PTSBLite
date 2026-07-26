import { placeBend, validBendOrientations } from "@/domain/bend-placement";
import { partRegistry, type BendFootprint } from "@/domain/part-registry";
import { totalPathLength } from "@/domain/parts";
import { GROUND_PLANE_Y } from "@/domain/sparse-grid";
import { placeTube } from "@/domain/tube-placement";
import { computeTopology, type Port } from "@/domain/topology";
import { MAX_CENTERLINE_FEET } from "@/domain/validation";
import type { BlowerPart, DesignState, Part, Vec3 } from "@/types";
import { cellKey, manhattan, vAdd, vEq, vNeg, vScale } from "@/domain/vec3";

export const PATHFINDER_NO_ROUTE_MESSAGE = "No route exists between the open ports.";
export const PATHFINDER_SEARCH_LIMIT_MESSAGE =
  "Routing gave up before finding a path. Try moving the endpoints closer or clearing obstacles.";

export type OptimizationMode = "shortest" | "fewest-bends";

export const DEFAULT_OPTIMIZATION_MODE: OptimizationMode = "shortest";

const FEWEST_BENDS_PENALTY = 12;

export type UnroutedPair = {
  source: Port;
  target: Port;
  /**
   * `no-route` means the search proved there is no path. `search-limit` means it
   * hit MAX_ROUTE_EXPANSIONS first and gave up, which is a different thing to
   * tell the user: a different layout might still route.
   */
  reason: "no-route" | "over-budget" | "search-limit";
};

export type AutoBuildOptions = {
  maxBudgetFeet?: number;
  mode?: OptimizationMode;
  /**
   * Cap on A* expansions per search. Exposed mainly so tests can drive the
   * give-up path deterministically instead of building a layout large enough to
   * exhaust the default budget.
   */
  maxExpansions?: number;
};

type RouteState = {
  cell: Vec3;
  dir: Vec3;
};

type StraightEdge = {
  kind: "straight";
  from: RouteState;
  to: RouteState;
};

type BendEdge = {
  kind: "bend";
  from: RouteState;
  to: RouteState;
  outDir: Vec3;
};

type RouteEdge = StraightEdge | BendEdge;

type PlannedRoute = {
  cost: number;
  searchCost: number;
  edges: RouteEdge[];
  source: Port;
  target: Port;
};

export type AutoBuildPathResult =
  | { ok: true; design: DesignState; parts: Part[]; cost: number; unroutedPairs: UnroutedPair[] }
  | { ok: false; reason: "no-route" | "search-limit"; message: string };

const SEARCH_MARGIN = 12;
const MAX_ROUTE_EXPANSIONS = 120_000;

type OpenRouteEntry = {
  state: RouteState;
  priority: number;
  searchCost: number;
  sequence: number;
};

function compareOpenEntries(a: OpenRouteEntry, b: OpenRouteEntry): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.searchCost !== b.searchCost) return a.searchCost - b.searchCost;
  return a.sequence - b.sequence;
}

function pushOpenEntry(heap: OpenRouteEntry[], entry: OpenRouteEntry): void {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compareOpenEntries(heap[parent], entry) <= 0) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = entry;
}

function popOpenEntry(heap: OpenRouteEntry[]): OpenRouteEntry | undefined {
  if (heap.length === 0) return undefined;
  const root = heap[0];
  const last = heap.pop();
  if (!last || heap.length === 0) return root;

  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;

    const smallerChild =
      right < heap.length && compareOpenEntries(heap[right], heap[left]) < 0 ? right : left;
    if (compareOpenEntries(last, heap[smallerChild]) <= 0) break;
    heap[index] = heap[smallerChild];
    index = smallerChild;
  }
  heap[index] = last;
  return root;
}

function stateKey(state: RouteState): string {
  return `${cellKey(state.cell)}|${cellKey(state.dir)}`;
}

function isTurn(a: Vec3, b: Vec3): boolean {
  return !vEq(a, b) && !vEq(a, vNeg(b));
}

function inSearchBounds(cell: Vec3, source: Port, target: Port): boolean {
  const xs = [source.cell[0], target.from[0], target.cell[0]];
  const ys = [source.cell[1], target.from[1], target.cell[1]];
  const zs = [source.cell[2], target.from[2], target.cell[2]];
  return (
    cell[0] >= Math.min(...xs) - SEARCH_MARGIN &&
    cell[0] <= Math.max(...xs) + SEARCH_MARGIN &&
    cell[1] >= Math.min(...ys) - SEARCH_MARGIN &&
    cell[1] <= Math.max(...ys) + SEARCH_MARGIN &&
    cell[2] >= Math.min(...zs) - SEARCH_MARGIN &&
    cell[2] <= Math.max(...zs) + SEARCH_MARGIN
  );
}

function bendEntries(): BendFootprint[] {
  return partRegistry.get("bend90").bendFootprints ?? [];
}

function bendCells(entryCell: Vec3, footprint: BendFootprint): Vec3[] {
  const cells = footprint.cells.map((cell) => vAdd(entryCell, cell));
  const exit = vAdd(entryCell, footprint.exit);
  return cells.some((cell) => vEq(cell, exit)) ? cells : [...cells, exit];
}

function cellIsOpenForRoute(design: DesignState, cell: Vec3, goalCell: Vec3): boolean {
  if (!design.grid.withinBounds(cell)) return false;
  if (cell[1] < GROUND_PLANE_Y) return false;
  if (vEq(cell, goalCell)) return true;
  return !design.grid.query(cell);
}

function bendFits(design: DesignState, entryCell: Vec3, footprint: BendFootprint): boolean {
  return bendCells(entryCell, footprint).every(
    (cell) =>
      design.grid.withinBounds(cell) && cell[1] >= GROUND_PLANE_Y && !design.grid.query(cell)
  );
}

function arcCost(): number {
  return partRegistry.get("bend90").arcLength ?? 4.71;
}

function neighbors(
  design: DesignState,
  state: RouteState,
  source: Port,
  target: Port,
  mode: OptimizationMode
): Array<{ state: RouteState; edge: RouteEdge; cost: number; searchCost: number }> {
  const goalCell = target.from;
  if (!cellIsOpenForRoute(design, state.cell, goalCell) && !vEq(state.cell, source.cell)) {
    return [];
  }

  const result: Array<{ state: RouteState; edge: RouteEdge; cost: number; searchCost: number }> =
    [];
  const straightCell = vAdd(state.cell, state.dir);
  if (
    design.grid.withinBounds(state.cell) &&
    !design.grid.query(state.cell) &&
    cellIsOpenForRoute(design, straightCell, goalCell) &&
    inSearchBounds(straightCell, source, target)
  ) {
    const to = { cell: straightCell, dir: state.dir };
    result.push({
      state: to,
      edge: { kind: "straight", from: state, to },
      cost: 1,
      searchCost: 1
    });
  }

  const arc = arcCost();
  const bendSearchCost = mode === "fewest-bends" ? arc + FEWEST_BENDS_PENALTY : arc;
  for (const footprint of bendEntries()) {
    if (!vEq(footprint.inDir, state.dir)) continue;
    if (!isTurn(state.dir, footprint.outDir)) continue;
    if (!bendFits(design, state.cell, footprint)) continue;

    const exitCell = vAdd(state.cell, footprint.exit);
    const exitPortCell = vAdd(exitCell, footprint.outDir);
    if (!cellIsOpenForRoute(design, exitPortCell, goalCell)) continue;
    if (!inSearchBounds(exitPortCell, source, target)) continue;

    const to = { cell: exitPortCell, dir: footprint.outDir };
    result.push({
      state: to,
      edge: { kind: "bend", from: state, to, outDir: footprint.outDir },
      cost: arc,
      searchCost: bendSearchCost
    });
  }
  return result;
}

/** A search either finds a route, proves there is none, or runs out of budget. */
type RouteOutcome =
  { kind: "route"; route: PlannedRoute } | { kind: "no-route" } | { kind: "search-limit" };

function routeBetween(
  design: DesignState,
  source: Port,
  target: Port,
  mode: OptimizationMode,
  maxExpansions: number
): RouteOutcome {
  const goal: RouteState = { cell: target.from, dir: vNeg(target.dir) };
  const start: RouteState = { cell: source.cell, dir: source.dir };
  const open: OpenRouteEntry[] = [];
  let sequence = 0;
  pushOpenEntry(open, {
    state: start,
    priority: manhattan(start.cell, goal.cell),
    searchCost: 0,
    sequence: sequence++
  });
  const searchCostByKey = new Map<string, number>([[stateKey(start), 0]]);
  const geomCostByKey = new Map<string, number>([[stateKey(start), 0]]);
  const cameFrom = new Map<string, { previous: string; edge: RouteEdge }>();
  let expansions = 0;

  while (open.length > 0 && expansions < maxExpansions) {
    const current = popOpenEntry(open);
    if (!current) break;
    const currentKey = stateKey(current.state);
    const currentSearchCost = searchCostByKey.get(currentKey);
    const currentGeomCost = geomCostByKey.get(currentKey);
    if (currentSearchCost === undefined || currentGeomCost === undefined) continue;
    if (current.searchCost !== currentSearchCost) continue;
    expansions++;

    if (vEq(current.state.cell, goal.cell) && vEq(current.state.dir, goal.dir)) {
      return {
        kind: "route",
        route: {
          cost: currentGeomCost,
          searchCost: currentSearchCost,
          edges: reconstructEdges(cameFrom, currentKey),
          source,
          target
        }
      };
    }

    for (const next of neighbors(design, current.state, source, target, mode)) {
      const nextKey = stateKey(next.state);
      const nextSearchCost = currentSearchCost + next.searchCost;
      if (nextSearchCost >= (searchCostByKey.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      searchCostByKey.set(nextKey, nextSearchCost);
      geomCostByKey.set(nextKey, currentGeomCost + next.cost);
      cameFrom.set(nextKey, { previous: currentKey, edge: next.edge });
      pushOpenEntry(open, {
        state: next.state,
        priority: nextSearchCost + manhattan(next.state.cell, goal.cell),
        searchCost: nextSearchCost,
        sequence: sequence++
      });
    }
  }

  // Exhausting the open set proves no route exists; stopping on the expansion
  // budget does not.
  return expansions >= maxExpansions ? { kind: "search-limit" } : { kind: "no-route" };
}

function reconstructEdges(
  cameFrom: Map<string, { previous: string; edge: RouteEdge }>,
  endKey: string
): RouteEdge[] {
  const edges: RouteEdge[] = [];
  let cursor = endKey;
  while (cameFrom.has(cursor)) {
    const step = cameFrom.get(cursor);
    if (!step) break;
    edges.push(step.edge);
    cursor = step.previous;
  }
  return edges.reverse();
}

function nearestBlowerDistance(design: DesignState, cell: Vec3): number {
  const blowers = design.parts.filter((part): part is BlowerPart => part.type === "blower");
  if (blowers.length === 0) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (const blower of blowers) {
    const dist = manhattan(cell, blower.cell);
    if (dist < best) best = dist;
  }
  return best;
}

function orientPorts(design: DesignState, a: Port, b: Port): { source: Port; target: Port } {
  const distA = nearestBlowerDistance(design, a.cell);
  const distB = nearestBlowerDistance(design, b.cell);
  if (distA !== distB) {
    return distA < distB ? { source: a, target: b } : { source: b, target: a };
  }
  const keyA = `${a.partId}:${a.index}`;
  const keyB = `${b.partId}:${b.index}`;
  return keyA <= keyB ? { source: a, target: b } : { source: b, target: a };
}

function pickClosestPair(pool: Port[]): { a: Port; b: Port } | null {
  let best: { i: number; j: number; dist: number } | null = null;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      if (pool[i].partId === pool[j].partId) continue;
      const dist = manhattan(pool[i].cell, pool[j].cell);
      if (!best || dist < best.dist) {
        best = { i, j, dist };
      }
    }
  }
  if (!best) return null;
  return { a: pool[best.i], b: pool[best.j] };
}

function planBestRoute(
  design: DesignState,
  oriented: { source: Port; target: Port },
  pool: Port[],
  mode: OptimizationMode,
  maxExpansions: number
): { best: PlannedBest | null; hitSearchLimit: boolean } {
  const sourceOptions = pool.filter((p) => p.partId === oriented.source.partId);
  const targetOptions = pool.filter((p) => p.partId === oriented.target.partId);
  let best: PlannedBest | null = null;
  // Ports are directional, so routing s->t and t->s can genuinely differ; both
  // orientations are tried and the cheaper wins.
  let hitSearchLimit = false;

  for (const s of sourceOptions) {
    for (const t of targetOptions) {
      if (s.partId === t.partId) continue;
      const candidates: PlannedBest[] = [];
      for (const [from, to, outcome] of [
        [s, t, routeBetween(design, s, t, mode, maxExpansions)] as const,
        [t, s, routeBetween(design, t, s, mode, maxExpansions)] as const
      ]) {
        if (outcome.kind === "route")
          candidates.push({ route: outcome.route, source: from, target: to });
        else if (outcome.kind === "search-limit") hitSearchLimit = true;
      }
      for (const candidate of candidates) {
        if (!best || candidate.route.searchCost < best.route.searchCost) {
          best = candidate;
        }
      }
    }
  }
  return { best, hitSearchLimit };
}

function nextRouteId(existing: Set<string>): string {
  let index = 1;
  while (existing.has(`auto-${index}`)) index++;
  const id = `auto-${index}`;
  existing.add(id);
  return id;
}

type PlannedBest = { route: PlannedRoute; source: Port; target: Port };

type CommitRouteResult =
  { ok: true; design: DesignState; parts: Part[]; cost: number } | { ok: false };

function commitRoute(design: DesignState, route: PlannedRoute): CommitRouteResult {
  let currentDesign = design;
  let currentCell = route.source.cell;
  let currentPartId = route.source.partId;
  const placed: Part[] = [];
  const existingIds = new Set(design.parts.map((part) => part.id));

  for (let i = 0; i < route.edges.length; i++) {
    const edge = route.edges[i];
    if (edge.kind === "straight") {
      let runLength = 0;
      const dir = edge.from.dir;
      while (route.edges[i]?.kind === "straight" && vEq(route.edges[i].from.dir, dir)) {
        runLength++;
        i++;
      }
      i--;

      while (runLength > 0) {
        const length = runLength >= 6 ? 6 : 1;
        const result = placeTube(currentDesign, {
          id: nextRouteId(existingIds),
          cell: currentCell,
          sourcePartId: currentPartId,
          length
        });
        if (!result.ok) return { ok: false };
        currentDesign = result.design;
        placed.push(result.part);
        currentPartId = result.part.id;
        const placedLength = result.part.length ?? length;
        currentCell = vAdd(currentCell, vScale(dir, placedLength));
        runLength -= placedLength;
      }
      continue;
    }

    const orientations = validBendOrientations(currentDesign, currentCell, {
      sourcePartId: currentPartId
    });
    const rotationIndex = orientations.findIndex((orientation) =>
      vEq(orientation.outDir, edge.outDir)
    );
    if (rotationIndex < 0) {
      return { ok: false };
    }

    const result = placeBend(currentDesign, {
      id: nextRouteId(existingIds),
      cell: currentCell,
      sourcePartId: currentPartId,
      rotationIndex
    });
    if (!result.ok) return { ok: false };
    currentDesign = result.design;
    placed.push(result.part);
    currentPartId = result.part.id;
    currentCell = edge.to.cell;
  }

  return { ok: true, design: currentDesign, parts: placed, cost: route.cost };
}

export function autoBuildOpenPortPair(
  design: DesignState,
  options: AutoBuildOptions = {}
): AutoBuildPathResult {
  const budget = options.maxBudgetFeet ?? MAX_CENTERLINE_FEET;
  const mode = options.mode ?? DEFAULT_OPTIMIZATION_MODE;
  const maxExpansions = options.maxExpansions ?? MAX_ROUTE_EXPANSIONS;
  const existingLength = totalPathLength(design);

  let currentDesign = design;
  let pool = computeTopology(design).openPorts();
  const allParts: Part[] = [];
  const unroutedPairs: UnroutedPair[] = [];
  let addedCost = 0;

  while (pool.length >= 2) {
    const closest = pickClosestPair(pool);
    if (!closest) break;
    const oriented = orientPorts(currentDesign, closest.a, closest.b);
    const { best, hitSearchLimit } = planBestRoute(
      currentDesign,
      oriented,
      pool,
      mode,
      maxExpansions
    );
    if (!best) {
      unroutedPairs.push({
        source: oriented.source,
        target: oriented.target,
        reason: hitSearchLimit ? "search-limit" : "no-route"
      });
      pool = pool.filter((p) => p !== oriented.source && p !== oriented.target);
      continue;
    }
    if (existingLength + addedCost + best.route.cost > budget) {
      unroutedPairs.push({ source: best.source, target: best.target, reason: "over-budget" });
      pool = pool.filter((p) => p !== best.source && p !== best.target);
      continue;
    }
    const result = commitRoute(currentDesign, best.route);
    if (!result.ok) {
      unroutedPairs.push({ source: best.source, target: best.target, reason: "no-route" });
      pool = pool.filter((p) => p !== best.source && p !== best.target);
      continue;
    }
    currentDesign = result.design;
    allParts.push(...result.parts);
    addedCost += result.cost;
    pool = pool.filter((p) => p !== best.source && p !== best.target);
  }

  if (allParts.length === 0) {
    // Only claim no route exists when the search actually proved it. If any pair
    // stopped on the expansion budget, nothing was proved and saying otherwise
    // sends the user looking for a layout problem that may not be there.
    const gaveUp = unroutedPairs.some((pair) => pair.reason === "search-limit");
    return gaveUp
      ? { ok: false, reason: "search-limit", message: PATHFINDER_SEARCH_LIMIT_MESSAGE }
      : { ok: false, reason: "no-route", message: PATHFINDER_NO_ROUTE_MESSAGE };
  }

  return {
    ok: true,
    design: currentDesign,
    parts: allParts,
    cost: addedCost,
    unroutedPairs
  };
}
