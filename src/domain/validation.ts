import { partRegistry, type PartRegistry } from "@/domain/part-registry";
import { totalPathLength } from "@/domain/parts";
import { bendFootprint } from "@/domain/bend-placement";
import { computeTopology } from "@/domain/topology";
import type { BlowerPart, DesignState, Obstacle, Part, TerminalPart, Vec3, Warning } from "@/types";
import { cellAt, tubeCells, vAdd, vEq } from "@/domain/vec3";

export const MAX_CENTERLINE_FEET = 300;

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
      title: `${terminals.length} terminals placed`,
      detail:
        "Systems require exactly 2 terminals: Terminal 1 inline with the blower and Terminal 2 at the far end."
    }
  ];
};

export const checkBlowerTerminalAdjacency: ValidationRule = (design) => {
  const terminals = design.parts.filter((part): part is TerminalPart => part.type === "terminal");
  if (design.parts.length === 0 || terminals.length !== 2) return [];
  if (findTerminalOne(design)) return [];
  return [
    {
      id: "blower-terminal-adjacency",
      level: "error",
      title: "Blower not adjacent to Terminal 1",
      detail:
        "Place Terminal 1 directly adjacent to the blower outlet with zero tubing between them."
    }
  ];
};

export const checkConnectivity: ValidationRule = (design) => {
  const terminals = design.parts.filter((part): part is TerminalPart => part.type === "terminal");
  if (terminals.length !== 2) return [];
  const terminalOne = findTerminalOne(design);
  if (!terminalOne) return [];

  const terminalTwo = terminals.find((terminal) => terminal.id !== terminalOne.id);
  if (!terminalTwo) return [];

  const openPorts = computeTopology(design).openPorts();
  const terminalTwoOpenPorts = openPorts.filter((port) => port.partId === terminalTwo.id);
  const unexpectedOpenPorts = openPorts.filter((port) => port.partId !== terminalTwo.id);
  if (unexpectedOpenPorts.length === 0 && terminalTwoOpenPorts.length === 1) return [];

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
  if (design.obstacles.length === 0) return [];
  const overlapping = design.parts.some((part) =>
    partFootprint(part, registry).some((cell) =>
      design.obstacles.some((obstacle) => obstacleContainsCell(obstacle, cell))
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
  checkBlowerTerminalAdjacency,
  checkConnectivity,
  checkObstacleIntersections
];

export function validate(design: DesignState, registry: PartRegistry = partRegistry): Warning[] {
  return validationRules.flatMap((rule) => rule(design, registry));
}

function findTerminalOne(design: DesignState): TerminalPart | undefined {
  const blowers = design.parts.filter((part): part is BlowerPart => part.type === "blower");
  for (const blower of blowers) {
    const terminalCell = vAdd(blower.cell, blower.dir);
    const terminalOne = design.parts.find(
      (part): part is TerminalPart =>
        part.type === "terminal" && vEq(part.cell, terminalCell) && vEq(part.axis, blower.dir)
    );
    if (terminalOne) return terminalOne;
  }
  return undefined;
}

function partFootprint(part: Part, registry: PartRegistry): Vec3[] {
  if (part.type === "blower" || part.type === "terminal") return [cellAt(part.cell)];
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
