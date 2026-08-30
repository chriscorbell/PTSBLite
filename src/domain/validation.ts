import { partRegistry, type PartRegistry } from "@/domain/part-registry";
import { totalPathLength } from "@/domain/parts";
import { bendFootprint } from "@/domain/occupant-footprints";
import { hasPedestal, pedestalCells } from "@/domain/pedestal";
import { terminalCells } from "@/domain/terminal";
import { computeTopology } from "@/domain/topology";
import type { BlowerPart, DesignState, Obstacle, Part, TerminalPart, Vec3, Warning } from "@/types";
import { cellAt, tubeCells } from "@/domain/vec3";

export const MAX_CENTERLINE_FEET = 300;

function counted(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"} placed`;
}

export type ValidationRule = (design: DesignState, registry?: PartRegistry) => Warning[];

export const checkPathLength: ValidationRule = (design) => {
  const length = totalPathLength(design);
  if (length <= MAX_CENTERLINE_FEET) return [];
  return [
    {
      id: "path-length",
      level: "error",
      title: `Exceeds ${MAX_CENTERLINE_FEET}ft centerline`,
      detail: `System centerline is ${length.toFixed(1)}ft. Maximum is ${MAX_CENTERLINE_FEET}ft.`
    }
  ];
};

export const checkTerminalCount: ValidationRule = (design) => {
  const terminals = design.parts.filter((part) => part.type === "terminal");
  if (design.parts.length === 0 || terminals.length === 2) return [];
  return [
    {
      id: "terminal-count",
      level: "error",
      title: counted(terminals.length, "terminal"),
      detail: "Systems require exactly 2 terminals, one at each end of the run between the blowers."
    }
  ];
};

/**
 * A system is bounded by a blower at each end, so it takes two.
 *
 * This inverts the old rule, under which the second blower was the suspect one:
 * a system had a single blower with Terminal 1 seated on its outlet. The client
 * withdrew that (ADR-0019); one blower is now an incomplete system rather than
 * a complete one.
 */
export const checkBlowerCount: ValidationRule = (design) => {
  const blowers = design.parts.filter((part) => part.type === "blower");
  if (design.parts.length === 0 || blowers.length === 2) return [];
  return [
    {
      id: "blower-count",
      level: "error",
      title: counted(blowers.length, "blower"),
      detail: "Systems require exactly 2 blowers, one at each end of the system."
    }
  ];
};

/**
 * A finished system has no open ports at all.
 *
 * Both blowers close the chain, so every port on it meets another. Under the
 * old rule the far end stopped at Terminal 2 and its outer port was expected to
 * dangle, which is why this used to count open ports rather than requiring none.
 */
export const checkConnectivity: ValidationRule = (design) => {
  const terminals = design.parts.filter((part): part is TerminalPart => part.type === "terminal");
  const blowers = design.parts.filter((part): part is BlowerPart => part.type === "blower");
  if (terminals.length !== 2 || blowers.length !== 2) return [];
  if (computeTopology(design).openPorts().length === 0) return [];

  return [
    {
      id: "connectivity",
      level: "warn",
      title: "System not fully connected",
      detail:
        "There is a gap between endpoints. Connect the open port pairs or use Auto-Build to complete the route."
    }
  ];
};

export const checkObstacleIntersections: ValidationRule = (design, registry = partRegistry) => {
  // Passing through a penetrable obstacle is that kind's entire purpose, so
  // only the impenetrable ones can put a path in the wrong.
  const solid = design.obstacles.filter((obstacle) => !obstacle.penetrable);
  if (solid.length === 0) return [];
  const overlapping = design.parts.some((part) =>
    partFootprint(part, registry).some((cell) =>
      solid.some((obstacle) => obstacleContainsCell(obstacle, cell))
    )
  );
  if (!overlapping) return [];
  return [
    {
      id: "obstacle-intersection",
      level: "error",
      title: "Path passes through an obstacle",
      detail:
        "Move the obstacle or reroute the path so tubing and bends do not pass through obstacle cells."
    }
  ];
};

export const validationRules: ValidationRule[] = [
  checkPathLength,
  checkTerminalCount,
  checkBlowerCount,
  checkConnectivity,
  checkObstacleIntersections
];

export function validate(design: DesignState, registry: PartRegistry = partRegistry): Warning[] {
  return validationRules.flatMap((rule) => rule(design, registry));
}

function partFootprint(part: Part, registry: PartRegistry): Vec3[] {
  // The mast under a pedestal blower is drawn and occupies cells, so an
  // obstacle it passes through is as much a fault as one a tube passes through.
  if (hasPedestal(part)) {
    return [cellAt(part.cell), ...pedestalCells(cellAt(part.cell), part.pedestalFeet)];
  }
  if (part.type === "blower") return [cellAt(part.cell)];
  // Both feet of a terminal are solid, so an obstacle through either is a fault.
  if (part.type === "terminal") return terminalCells(cellAt(part.cell));
  if (part.type === "tube") return tubeCells(part.from, part.to);
  return bendFootprint(part, registry);
}

function obstacleContainsCell(obstacle: Obstacle, cell: Vec3): boolean {
  const min: Vec3 = [
    Math.floor(Math.min(obstacle.min[0], obstacle.max[0])),
    Math.floor(Math.min(obstacle.min[1], obstacle.max[1])),
    Math.floor(Math.min(obstacle.min[2], obstacle.max[2]))
  ];
  const max: Vec3 = [
    Math.floor(Math.max(obstacle.min[0], obstacle.max[0])),
    Math.floor(Math.max(obstacle.min[1], obstacle.max[1])),
    Math.floor(Math.max(obstacle.min[2], obstacle.max[2]))
  ];
  return (
    cell[0] >= min[0] &&
    cell[0] <= max[0] &&
    cell[1] >= min[1] &&
    cell[1] <= max[1] &&
    cell[2] >= min[2] &&
    cell[2] <= max[2]
  );
}
