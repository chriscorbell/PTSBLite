export type Vec3 = readonly [number, number, number];

export type ToolId =
  "cursor" | "blower" | "blowerPedestal" | "terminal" | "tube" | "bend" | "obstacle" | "erase";

export type BlowerPart = {
  readonly id: string;
  readonly type: "blower";
  readonly cell: Vec3;
  readonly dir: Vec3;
  /** Height of the mast under a blower placed with a pedestal, in feet. Absent
   * on a plain blower; 0 on a pedestal blower standing on the floor. Drawn and
   * occupying grid cells, but counted in no BOM row and no centerline — see
   * pedestal.ts and ADR-0020. */
  readonly pedestalFeet?: number;
};

export type TerminalPart = {
  readonly id: string;
  readonly type: "terminal";
  readonly cell: Vec3;
  readonly axis: Vec3;
};

export type TubePart = {
  readonly id: string;
  readonly type: "tube";
  readonly from: Vec3;
  readonly to: Vec3;
  readonly length?: number;
  /** Set when Auto-Build placed this part; absent on manual placement. What
   * "Clear Auto-Build" filters on, so it is serialized with the design. */
  readonly source?: "auto-build";
};

export type BendPart = {
  readonly id: string;
  readonly type: "bend";
  readonly entry: Vec3;
  readonly exit: Vec3;
  readonly center: Vec3;
  readonly inDir: Vec3;
  readonly outDir: Vec3;
  readonly radius?: number;
  /** Set when Auto-Build placed this part; absent on manual placement. */
  readonly source?: "auto-build";
};

export type Part = BlowerPart | TerminalPart | TubePart | BendPart;

export type Obstacle = {
  readonly id: string;
  readonly min: Vec3;
  readonly max: Vec3;
  /** A penetrable obstacle is a volume tubes may pass through — a wall with
   * penetrations, a soft ceiling. It claims no grid cells, so placement and
   * routing ignore it entirely. Absent means impenetrable, which blocks both. */
  readonly penetrable?: boolean;
};

export type Ghost =
  | { type: "blower"; cell: Vec3; dir: Vec3; pedestalFeet?: number }
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
  | { type: "obstacle"; min: Vec3; max: Vec3; penetrable?: boolean };

/**
 * The buildable volume for a design, in feet (1 cell = 1 ft). `width` is the X
 * span and `depth` the Z span of the ground footprint (centered on the origin);
 * `height` is how far the volume extends up from the ground plane (Y = 0).
 */
export type BuildArea = {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
};

export type DesignMetadata = {
  /**
   * The room this system is built in and around: per-floor height and a
   * footprint centered in the fixed build area (`BUILD_AREA`). What the
   * welcome screen sizes; walls, plenum and floors derive from it in
   * floors.ts. Parts may be placed outside it.
   */
  readonly room: BuildArea;
  /** Whether the project spans multiple floors. Asked at design setup; nothing
   * routes across floors yet. */
  readonly multiFloor: boolean;
  /** Approximate plenum (drop ceiling) height in feet, or null when the space
   * has none. Asked at design setup; nothing places tube in the plenum yet. */
  readonly plenumHeightFeet: number | null;
};

import type { ReadonlySparseGrid } from "@/domain/sparse-grid";

export type DesignState = {
  readonly parts: readonly Part[];
  readonly obstacles: readonly Obstacle[];
  readonly metadata: DesignMetadata;
  readonly grid: ReadonlySparseGrid;
};

/**
 * What Auto-Build carried its horizontal runs under: the design's plenum, the
 * room's own ceiling, or the ghost ceiling a room too tall for either is routed
 * beneath.
 */
export type RunBandKind = "plenum" | "ceiling" | "ghost-ceiling" | "outside";

export type AutoBuildSummary = {
  /** Centerline feet of the parts Auto-Build placed. */
  lengthFeet: number;
  /** Number of bend parts placed. */
  bends: number;
  /** Obstacles in the design the route had to avoid. */
  obstacles: number;
  /** Port pairs Auto-Build could not route. */
  unrouted: number;
  /** Where the runs were carried, which the box explains to the visitor. */
  runBand: RunBandKind;
};

/**
 * What the viewport and its HUD draw. Deliberately narrow: this began as a
 * prototype's grab-bag of every flag the mock UI needed, and nine of its twelve
 * fields were never read by anything.
 */
export type Scene = {
  readonly parts: readonly Part[];
  readonly obstacles: readonly Obstacle[];
  autoBuildJustRan?: boolean;
  autoBuildSummary?: AutoBuildSummary | null;
};

export type Warning = {
  id: string;
  level: "error" | "warn";
  title: string;
  detail: string;
};
