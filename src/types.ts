export type Vec3 = [number, number, number];

export type ToolId = "cursor" | "blower" | "terminal" | "tube" | "bend" | "obstacle" | "erase";

export type BlowerPart = {
  id: string;
  type: "blower";
  cell: Vec3;
  dir: Vec3;
};

export type TerminalPart = {
  id: string;
  type: "terminal";
  cell: Vec3;
  axis: Vec3;
};

export type TubePart = {
  id: string;
  type: "tube";
  from: Vec3;
  to: Vec3;
  length?: number;
};

export type BendPart = {
  id: string;
  type: "bend";
  entry: Vec3;
  exit: Vec3;
  center: Vec3;
  inDir: Vec3;
  outDir: Vec3;
  radius?: number;
};

export type Part = BlowerPart | TerminalPart | TubePart | BendPart;

export type Obstacle = {
  id: string;
  min: Vec3;
  max: Vec3;
};

export type Ghost =
  | { type: "blower"; cell: Vec3; dir: Vec3 }
  | { type: "terminal"; cell: Vec3; axis: Vec3 }
  | { type: "tube"; from: Vec3; to: Vec3; blocked?: boolean; note?: string }
  | { type: "bend"; entry: Vec3; exit: Vec3; center: Vec3; inDir: Vec3; outDir: Vec3; radius?: number }
  | { type: "obstacle"; min: Vec3; max: Vec3 };

export type DesignMetadata = {
  filename: string;
  revision: string;
};

import type { SparseGrid } from "@/domain/sparse-grid";

export type DesignState = {
  parts: Part[];
  obstacles: Obstacle[];
  metadata: DesignMetadata;
  grid: SparseGrid;
};

export type Camera = { yaw: number; pitch: number; distance: number };

export type Hint = { title: string; body: string };

export type AutoBuildSummary = {
  /** Centerline feet of the parts auto-build placed. */
  lengthFeet: number;
  /** Number of bend parts placed. */
  bends: number;
  /** Obstacles in the design the route had to avoid. */
  obstacles: number;
  /** Human-readable optimization mode, e.g. "Fewest bends". */
  modeLabel: string;
  /** Port pairs auto-build could not route. */
  unrouted: number;
};

export type Scene = {
  label?: string;
  step?: number;
  parts: Part[];
  obstacles: Obstacle[];
  tool?: ToolId;
  ghost?: Ghost | null;
  bomOpen?: boolean;
  statusOpen?: boolean;
  export?: boolean;
  connected?: boolean;
  autoBuildJustRan?: boolean;
  autoBuildSummary?: AutoBuildSummary | null;
  hint?: Hint | null;
  camera?: Camera;
};

export type Warning = {
  id: string;
  level: "error" | "warn";
  title: string;
  detail: string;
};
