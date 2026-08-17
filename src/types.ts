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
  | {
      type: "bend";
      entry: Vec3;
      exit: Vec3;
      center: Vec3;
      inDir: Vec3;
      outDir: Vec3;
      radius?: number;
    }
  | { type: "obstacle"; min: Vec3; max: Vec3 };

/**
 * The buildable volume for a design, in feet (1 cell = 1 ft). `width` is the X
 * span and `depth` the Z span of the ground footprint (centered on the origin);
 * `height` is how far the volume extends up from the ground plane (Y = 0).
 */
export type BuildArea = {
  width: number;
  depth: number;
  height: number;
};

export type DesignMetadata = {
  filename: string;
  revision: string;
  buildArea: BuildArea;
  /** Whether the project spans multiple floors. Asked at design setup; nothing
   * routes across floors yet. */
  multiFloor: boolean;
  /** Approximate plenum (drop ceiling) height in feet, or null when the space
   * has none. Asked at design setup; nothing places tube in the plenum yet. */
  plenumHeightFeet: number | null;
};

import type { SparseGrid } from "@/domain/sparse-grid";

export type DesignState = {
  parts: Part[];
  obstacles: Obstacle[];
  metadata: DesignMetadata;
  grid: SparseGrid;
};

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

/**
 * What the viewport and its HUD draw. Deliberately narrow: this began as a
 * prototype's grab-bag of every flag the mock UI needed, and nine of its twelve
 * fields were never read by anything.
 */
export type Scene = {
  parts: Part[];
  obstacles: Obstacle[];
  autoBuildJustRan?: boolean;
  autoBuildSummary?: AutoBuildSummary | null;
  hint?: Hint | null;
};

export type Warning = {
  id: string;
  level: "error" | "warn";
  title: string;
  detail: string;
};
