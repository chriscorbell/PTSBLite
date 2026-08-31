import { placeBend, validBendOrientations } from "@/domain/bend-placement";
import {
  floorBaseElevation,
  inRoomFootprint,
  inRoomVolume,
  plenumBands,
  roomRect,
  type RoomRect
} from "@/domain/floors";
import { partCells } from "@/domain/occupant-footprints";
import { partRegistry, type BendFootprint } from "@/domain/part-registry";
import { totalPathLength } from "@/domain/parts";
import { BUILD_AREA, boundsFromBuildArea, GROUND_PLANE_Y } from "@/domain/sparse-grid";
import { placeTube } from "@/domain/tube-placement";
import { computeTopology, type Port, type Topology } from "@/domain/topology";
import { MAX_CENTERLINE_FEET } from "@/domain/validation";
import type { BlowerPart, DesignMetadata, DesignState, Part, RunBandKind, Vec3 } from "@/types";
import { cellKey, manhattan, vAdd, vEq, vNeg, vScale } from "@/domain/vec3";

export const PATHFINDER_NO_ROUTE_MESSAGE = "No route exists between the open ports.";
export const PATHFINDER_SEARCH_LIMIT_MESSAGE =
  "Routing gave up before finding a path. Try moving the endpoints closer or clearing obstacles.";

/**
 * Search-cost penalties. They decide which route wins, but never touch the
 * geometric cost: what counts against the centerline budget is always the real
 * feet of tube and bend arc actually placed.
 *
 * A bend costs its arc length plus {@link BEND_SEARCH_PENALTY}, so a route only
 * turns when turning genuinely pays. This replaced a user-facing choice between
 * a "shortest path" mode (no penalty) and a "fewest bends" mode (penalty 12)
 * with one behavior between the two.
 */
const BEND_SEARCH_PENALTY = 6;

/**
 * How much straight run a bend stands in for: 3 ft of approach and 3 ft of
 * departure, from the spec's 3 ft bend radius (ADR-0001).
 */
const BEND_SPAN_FEET = 6;

/**
 * The run band bias. Each horizontal foot outside the band counts triple, so a
 * horizontal run belongs in the band unless something makes it impossible.
 *
 * A bend outside the band is charged for the run it stands in for, and this
 * is why. The figure used to be a flat 9 against the 12 that six out-of-band
 * feet cost, which made turning *cheaper than going straight* out there: a bend
 * is also 4.71 ft of arc where the 6 ft it replaces would be 6, so each turn
 * paid for itself twice over. A diagonal accordingly came back as a staircase
 * of ten bends rather than an L with three, which is what the client meant by
 * "it seems to want to build systems with shortest possible distance, but needs
 * to be least bends". Deriving it keeps the two from drifting apart again.
 */
const OUT_OF_BAND_STRAIGHT_PENALTY = 2;
const OUT_OF_BAND_BEND_PENALTY = OUT_OF_BAND_STRAIGHT_PENALTY * BEND_SPAN_FEET;

/**
 * What a vertical foot costs the search — almost nothing, and deliberately.
 *
 * The client's rule is that the plenum is used whenever there is one, at any
 * ceiling height: "always prefer the plenum when there is one", with no room
 * height above which climbing stops being worth it. A riser charged by the foot
 * cannot express that. It made the band a preference the room could outvote: in
 * a 30 ft room the band sits 27 ft up, the 54 ft of riser cost more than the
 * out-of-band penalty on a 40 ft run saved, and the route stayed on the floor —
 * the identical route to switching the plenum off.
 *
 * So the climb is priced at a tie-breaker rather than a cost: of two routes
 * that both ride the band, the one that climbs less wins, but no climb the
 * build area can hold outvotes a single foot of band. The bound is what keeps
 * that true — the shortest run worth banding is 1 ft, which saves
 * `OUT_OF_BAND_STRAIGHT_PENALTY`, against a riser of at most
 * `2 * BUILD_AREA.height` feet up and down again.
 *
 * The geometric cost of a vertical foot is still a foot: the centerline budget
 * is charged real tube, and only the search is biased.
 */
const VERTICAL_STEP_COST = 0.005;

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
  | {
      ok: true;
      design: DesignState;
      parts: Part[];
      cost: number;
      unroutedPairs: UnroutedPair[];
      /** What the horizontal runs were routed under, for the summary box. */
      runBand: RunBandKind;
    }
  | { ok: false; reason: "no-route" | "search-limit"; message: string };

const SEARCH_MARGIN = 12;
const MAX_ROUTE_EXPANSIONS = 120_000;

/**
 * What the search expects to pay for one more foot toward the goal.
 *
 * A* only searches quickly while its estimate of the work remaining grows about
 * as fast as the real cost does. Plain Manhattan distance did, once — every
 * straight step cost exactly 1. The band bias broke that: a horizontal step
 * outside the band now costs `1 + OUT_OF_BAND_STRAIGHT_PENALTY`, so the
 * estimate under-stated the remainder of an out-of-band route threefold, the
 * search degenerated towards Dijkstra, and two terminals 48 ft apart in an
 * ordinary 60 ft room exhausted the expansion budget and routed nothing at all.
 *
 * Charging the estimate what the steps actually cost restores the guidance.
 * Vertical travel is rated at `VERTICAL_STEP_COST`, the same near-nothing the
 * steps themselves cost: rating a riser any higher than it is charged would
 * talk the search out of the climb into the band, which is the one move the
 * bias exists to encourage.
 *
 * `horizontalStepCost` is therefore the rate charged *at this cell*, not one
 * rate for the whole search. Charging the penalized rate everywhere made the
 * estimate three times too big inside the plenum, where a horizontal foot is
 * charged 1 — and an over-estimate does not merely cost accuracy, it reorders
 * the search. A bend covers seven feet of displacement, so an over-stated
 * estimate falls by 21 for the 10.71 the bend costs, while a straight step
 * falls by 3 for 1: turning looked like progress and going straight looked like
 * delay. Auto-Build answered the diagonal of the default room with a
 * twelve-bend staircase through the plenum where three bends do, which is what
 * the client meant by "the goal of auto-build is to build with the fewest
 * BENDS in a system, not shortest total length".
 *
 * Rating each cell at what that cell charges puts the two back in proportion:
 * inside the band a straight step is free in estimate terms and a bend costs
 * 3.71, outside it a straight step is free and a bend costs 1.71. Both prefer
 * the straight, which is the whole requirement. It is still not an
 * under-estimate — a cell outside the band that could reach it is rated as if
 * it could not — so a route is not guaranteed to be the cheapest; that
 * over-statement is what keeps the search fast, and it errs toward the band,
 * which is the direction the client wants it to err in.
 */
function remainingCostEstimate(cell: Vec3, goal: Vec3, horizontalStepCost: number): number {
  const horizontal = Math.abs(cell[0] - goal[0]) + Math.abs(cell[2] - goal[2]);
  const vertical = Math.abs(cell[1] - goal[1]);
  return horizontal * horizontalStepCost + vertical * VERTICAL_STEP_COST;
}

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

function inSearchBounds(
  cell: Vec3,
  source: Port,
  target: Port,
  reach: { yMin: number; yMax: number }
): boolean {
  const xs = [source.cell[0], target.from[0], target.cell[0]];
  const ys = [source.cell[1], target.from[1], target.cell[1]];
  const zs = [source.cell[2], target.from[2], target.cell[2]];
  return (
    cell[0] >= Math.min(...xs) - SEARCH_MARGIN &&
    cell[0] <= Math.max(...xs) + SEARCH_MARGIN &&
    cell[1] >= Math.min(Math.min(...ys) - SEARCH_MARGIN, reach.yMin) &&
    cell[1] <= Math.max(Math.max(...ys) + SEARCH_MARGIN, reach.yMax) &&
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

function bendFits(design: DesignState, cells: Vec3[]): boolean {
  return cells.every(
    (cell) =>
      design.grid.withinBounds(cell) && cell[1] >= GROUND_PLANE_Y && !design.grid.query(cell)
  );
}

/**
 * How high a run climbs on its own when the room offers nothing to run under.
 * The client's rule for a room with no plenum: at 12 ft or lower the run rides
 * next to the ceiling, and in a taller room 12 ft is treated as a "ghost"
 * ceiling and the run stays there. Anyone who needs more rise than that builds
 * it by hand, which is what the "Auto-Build complete" box says.
 *
 * A client rule, not a figure from the PTS specification (ADR-0001).
 */
export const MAX_RUN_HEIGHT_FEET = 12;

/**
 * Where a horizontal run belongs: one band per floor, plus the footprint they
 * span and which of the client's cases produced them.
 *
 * A band is a volume, not a Y range — a cell outside the room at drop-ceiling
 * height is just open air, and the bias must not credit it. Every design has a
 * band: the plenum when there is one, and the ceiling or the ghost ceiling when
 * there is not. A system that never touches the building gets the outdoor band
 * instead — see {@link outsideRunBandVolume}.
 */
type RunBand = { floor: 1 | 2; base: number; top: number };
type RunBandVolume = { kind: RunBandKind; rect: RoomRect; bands: RunBand[] };

export function runBandVolume(metadata: DesignMetadata): RunBandVolume {
  const rect = roomRect(metadata);
  const plenum = plenumBands(metadata);
  if (plenum.length > 0) return { kind: "plenum", rect, bands: plenum };

  // No plenum: the foot of air directly under the ceiling, or under the ghost
  // ceiling in a room too tall for the real one.
  const perFloor = metadata.room.height;
  const runHeight = Math.min(perFloor, MAX_RUN_HEIGHT_FEET);
  const floors: Array<1 | 2> = metadata.multiFloor ? [1, 2] : [1];
  return {
    kind: perFloor > MAX_RUN_HEIGHT_FEET ? "ghost-ceiling" : "ceiling",
    rect,
    bands: floors.map((floor) => {
      const top = floorBaseElevation(metadata, floor) + runHeight;
      return { floor, base: top - 1, top };
    })
  };
}

/**
 * The band for a system that never touches the building: the foot below
 * {@link MAX_RUN_HEIGHT_FEET}, spanning the whole build area rather than the
 * room's footprint. The client's rule — "If a system is 100% *outside* ...
 * default linear run heights to 12 ft" — with no ceiling anywhere to measure
 * against, so the room's own height gets no say.
 */
function outsideRunBandVolume(): RunBandVolume {
  const b = boundsFromBuildArea(BUILD_AREA);
  return {
    kind: "outside",
    rect: { xMin: b.xMin, xMax: b.xMax, zMin: b.zMin, zMax: b.zMax },
    bands: [{ floor: 1, base: MAX_RUN_HEIGHT_FEET - 1, top: MAX_RUN_HEIGHT_FEET }]
  };
}

/**
 * Whether any of these parts stands inside the building. The client draws the
 * line at touching it at all: "If a system is built with any part under a
 * ceiling, _OR_ an auto-build path routes through a building ... always obey
 * routing through the plenum."
 */
function touchesBuilding(metadata: DesignMetadata, parts: readonly Part[]): boolean {
  return parts.some((part) => partCells(part).some((cell) => inRoomVolume(metadata, cell)));
}

function inRunBand(volume: RunBandVolume, cell: Vec3): boolean {
  if (!inRoomFootprint(volume.rect, cell)) return false;
  return volume.bands.some((band) => cell[1] >= band.base && cell[1] < band.top);
}

/**
 * The Y levels the search must be allowed to reach for the band to be usable at
 * all. Search bounds are otherwise drawn around the endpoints, and a band 27 ft
 * above two floor-level ports sat outside them: no cost model can prefer a
 * route the search cannot see.
 */
function bandReach(volume: RunBandVolume): { yMin: number; yMax: number } {
  return {
    yMin: Math.min(...volume.bands.map((band) => band.base)),
    yMax: Math.max(...volume.bands.map((band) => band.top - 1))
  };
}

function arcCost(): number {
  return partRegistry.get("bend90").arcLength ?? 4.71;
}

function neighbors(
  design: DesignState,
  state: RouteState,
  source: Port,
  target: Port,
  band: RunBandVolume,
  reach: { yMin: number; yMax: number }
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
    inSearchBounds(straightCell, source, target, reach)
  ) {
    const horizontal = state.dir[1] === 0;
    const penalized = horizontal && !inRunBand(band, straightCell);
    const to = { cell: straightCell, dir: state.dir };
    result.push({
      state: to,
      edge: { kind: "straight", from: state, to },
      cost: 1,
      searchCost: horizontal
        ? 1 + (penalized ? OUT_OF_BAND_STRAIGHT_PENALTY : 0)
        : VERTICAL_STEP_COST
    });
  }

  const arc = arcCost();
  for (const footprint of bendEntries()) {
    if (!vEq(footprint.inDir, state.dir)) continue;
    if (!isTurn(state.dir, footprint.outDir)) continue;
    const cells = bendCells(state.cell, footprint);
    if (!bendFits(design, cells)) continue;

    const exitCell = vAdd(state.cell, footprint.exit);
    const exitPortCell = vAdd(exitCell, footprint.outDir);
    if (!cellIsOpenForRoute(design, exitPortCell, goalCell)) continue;
    if (!inSearchBounds(exitPortCell, source, target, reach)) continue;

    // A bend counts as in the band when any of its cells is: the bend that
    // climbs out of a riser into the band straddles the boundary, and charging
    // it would tax exactly the turn the bias exists to encourage.
    const penalized = !cells.some((cell) => inRunBand(band, cell));
    const to = { cell: exitPortCell, dir: footprint.outDir };
    result.push({
      state: to,
      edge: { kind: "bend", from: state, to, outDir: footprint.outDir },
      cost: arc,
      searchCost: arc + BEND_SEARCH_PENALTY + (penalized ? OUT_OF_BAND_BEND_PENALTY : 0)
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
  band: RunBandVolume,
  maxExpansions: number
): RouteOutcome {
  const goal: RouteState = { cell: target.from, dir: vNeg(target.dir) };
  const start: RouteState = { cell: source.cell, dir: source.dir };
  const reach = bandReach(band);
  // What a horizontal foot is charged where the search currently stands.
  const horizontalStepCost = (cell: Vec3): number =>
    inRunBand(band, cell) ? 1 : 1 + OUT_OF_BAND_STRAIGHT_PENALTY;
  const open: OpenRouteEntry[] = [];
  let sequence = 0;
  pushOpenEntry(open, {
    state: start,
    priority: remainingCostEstimate(start.cell, goal.cell, horizontalStepCost(start.cell)),
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

    for (const next of neighbors(design, current.state, source, target, band, reach)) {
      const nextKey = stateKey(next.state);
      const nextSearchCost = currentSearchCost + next.searchCost;
      if (nextSearchCost >= (searchCostByKey.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      searchCostByKey.set(nextKey, nextSearchCost);
      geomCostByKey.set(nextKey, currentGeomCost + next.cost);
      cameFrom.set(nextKey, { previous: currentKey, edge: next.edge });
      pushOpenEntry(open, {
        state: next.state,
        priority:
          nextSearchCost +
          remainingCostEstimate(next.state.cell, goal.cell, horizontalStepCost(next.state.cell)),
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

/**
 * The two open ports worth joining next: the closest pair that are not already
 * two ends of the same run.
 *
 * The run check is what stops Auto-Build eating its own tail. Manually running
 * tube out of Terminal 2 leaves that stub's free end and the terminal's own
 * outer port close together, and closer to each other than either is to the
 * blower side of the system — so raw proximity joined the stub back into the
 * terminal it came from, in a U-turn of four bends, and left the far side of
 * the system unconnected. The client saw exactly that: manual tubing on the
 * "A" side worked and the same tubing on the "B" side did not.
 */
/**
 * The open ports Auto-Build could actually build from.
 *
 * A port's cell is where the next part would go, and some of them are nowhere:
 * a terminal standing on the floor faces up, so its other port points down into
 * a cell at Y = -1 that no part can ever occupy. Left in the pool such a port
 * competes for pairing on distance like any other, wins when it happens to be
 * nearest, routes nowhere, and takes the pairing that would have worked down
 * with it.
 */
function reachablePorts(design: DesignState, ports: Port[]): Port[] {
  return ports.filter((port) => design.grid.withinBounds(port.cell));
}

function pickClosestPair(pool: Port[], topology: Topology): { a: Port; b: Port } | null {
  let best: { i: number; j: number; dist: number } | null = null;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      if (topology.runOf(pool[i].partId) === topology.runOf(pool[j].partId)) continue;
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
  band: RunBandVolume,
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
        [s, t, routeBetween(design, s, t, band, maxExpansions)] as const,
        [t, s, routeBetween(design, t, s, band, maxExpansions)] as const
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
        // Full stock lengths, then the remainder as one cut piece. Cutting the
        // remainder into 1 ft pieces would place the same footage, but each
        // abutment between them is a real joint, and a joint earns a split
        // sleeve — so a 4 ft rise came back wearing a sleeve every foot.
        const length = Math.min(runLength, 6);
        const result = placeTube(currentDesign, {
          id: nextRouteId(existingIds),
          cell: currentCell,
          sourcePartId: currentPartId,
          length,
          source: "auto-build"
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
      rotationIndex,
      source: "auto-build"
    });
    if (!result.ok) return { ok: false };
    currentDesign = result.design;
    placed.push(result.part);
    currentPartId = result.part.id;
    currentCell = edge.to.cell;
  }

  return { ok: true, design: currentDesign, parts: placed, cost: route.cost };
}

/**
 * Auto-Build, once, under one band.
 *
 * The band is fixed for the whole build rather than chosen per pair, because
 * the client's rule is about the system: one run touching the building puts
 * every run under the plenum rules.
 */
function buildUnderBand(
  design: DesignState,
  band: RunBandVolume,
  budget: number,
  maxExpansions: number
): AutoBuildPathResult {
  const existingLength = totalPathLength(design);

  let currentDesign = design;
  let topology = computeTopology(design);
  let pool = reachablePorts(design, topology.openPorts());
  const allParts: Part[] = [];
  const unroutedPairs: UnroutedPair[] = [];
  let addedCost = 0;

  while (pool.length >= 2) {
    const closest = pickClosestPair(pool, topology);
    if (!closest) break;
    const oriented = orientPorts(currentDesign, closest.a, closest.b);
    const { best, hitSearchLimit } = planBestRoute(
      currentDesign,
      oriented,
      pool,
      band,
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
    // The route just placed merged two runs into one, so the next pair has to
    // be chosen against the design as it now stands.
    topology = computeTopology(currentDesign);
    pool = reachablePorts(currentDesign, pool);
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
    unroutedPairs,
    runBand: band.kind
  };
}

export function autoBuildOpenPortPair(
  design: DesignState,
  options: AutoBuildOptions = {}
): AutoBuildPathResult {
  const budget = options.maxBudgetFeet ?? MAX_CENTERLINE_FEET;
  const maxExpansions = options.maxExpansions ?? MAX_ROUTE_EXPANSIONS;

  // Which band applies is the client's two-part test, and its second half is
  // only answerable once the routes exist: a system whose parts all stand
  // outdoors may still route straight through the building — two terminals
  // either side of one — and that puts it back under the plenum rules. So
  // build it outdoors and look; the reroute costs a second search only in the
  // case that fails, which is the case he called unlikely.
  if (!touchesBuilding(design.metadata, design.parts)) {
    const outdoors = buildUnderBand(design, outsideRunBandVolume(), budget, maxExpansions);
    if (outdoors.ok && !touchesBuilding(design.metadata, outdoors.parts)) return outdoors;
  }

  return buildUnderBand(design, runBandVolume(design.metadata), budget, maxExpansions);
}
