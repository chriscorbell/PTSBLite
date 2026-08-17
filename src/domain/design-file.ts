import { DEFAULT_COMPANY_NAME, DEFAULT_SYSTEM_NAME } from "@/domain/design-state";
import { reconstructDesign } from "@/domain/design-reconstruction";
import { clampBuildArea } from "@/domain/sparse-grid";
import type {
  BendPart,
  BlowerPart,
  BuildArea,
  DesignMetadata,
  DesignState,
  Obstacle,
  Part,
  TerminalPart,
  TubePart,
  Vec3
} from "@/types";

export const CURRENT_SCHEMA_VERSION = "1";

export type SerializedDesign = {
  schemaVersion: string;
  appVersion: string;
  metadata: DesignMetadata;
  parts: Part[];
  obstacles: Obstacle[];
};

export type DeserializeResult = { ok: true; design: DesignState } | { ok: false; message: string };

/**
 * `appVersion` is stamped on the stored payload for provenance. It is a
 * required argument rather
 * than a module constant because the domain layer has no business reading the
 * bundler's build defines, and because the constant it replaced had drifted to
 * three releases stale without anything noticing.
 */
export function serializeDesign(design: DesignState, appVersion: string): SerializedDesign {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion,
    metadata: { ...design.metadata },
    parts: design.parts.map(clonePart),
    obstacles: design.obstacles.map(cloneObstacle)
  };
}

export function deserializeDesign(text: string): DeserializeResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("Could not parse stored design — invalid JSON.");
  }
  if (!isRecord(raw)) return fail("Stored value is not a valid design object.");

  if (typeof raw.schemaVersion !== "string") {
    return fail("Missing schemaVersion field.");
  }
  if (raw.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return fail(
      `Unsupported schemaVersion "${raw.schemaVersion}" (expected "${CURRENT_SCHEMA_VERSION}").`
    );
  }

  const metadataResult = parseMetadata(raw.metadata);
  if (!metadataResult.ok) return metadataResult;

  if (!Array.isArray(raw.parts)) return fail("Missing or invalid parts array.");
  const parts: Part[] = [];
  for (let i = 0; i < raw.parts.length; i++) {
    const partResult = parsePart(raw.parts[i], i);
    if (!partResult.ok) return partResult;
    parts.push(partResult.part);
  }

  if (!Array.isArray(raw.obstacles)) return fail("Missing or invalid obstacles array.");
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < raw.obstacles.length; i++) {
    const obstacleResult = parseObstacle(raw.obstacles[i], i);
    if (!obstacleResult.ok) return obstacleResult;
    obstacles.push(obstacleResult.obstacle);
  }

  // Geometry is checked here rather than assumed. A stored design whose parts fall
  // outside the build area or land on top of each other used to load anyway,
  // with those parts present in `parts` but missing from `grid` — visible and
  // listed in the BOM, but impossible to erase or collide with. Reporting beats
  // repairing: the payload says something the app cannot represent, and silently
  // dropping part of a stored design is worse than declining to restore it.
  const rebuilt = reconstructDesign({ parts, obstacles }, metadataResult.metadata);
  if (!rebuilt.ok) {
    const [first, ...rest] = rebuilt.issues;
    const more = rest.length > 0 ? ` (and ${rest.length} more)` : "";
    return fail(`${first.message}${more}`);
  }
  return { ok: true, design: rebuilt.design };
}

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function parseMetadata(
  value: unknown
): { ok: true; metadata: DesignMetadata } | { ok: false; message: string } {
  if (!isRecord(value)) return fail("Missing metadata object.");
  return {
    ok: true,
    metadata: {
      // Names are forgiving like every other metadata field below. `filename`
      // is what the system name was called before the company name joined it,
      // and is still read so designs saved under the old key keep their name.
      companyName: typeof value.companyName === "string" ? value.companyName : DEFAULT_COMPANY_NAME,
      systemName: parseName(value.systemName) ?? parseName(value.filename) ?? DEFAULT_SYSTEM_NAME,
      // Forgiving migration: designs saved before the build area was configurable
      // (or with a malformed area) fall back to the default, clamped to limits.
      buildArea: parseBuildArea(value.buildArea),
      // Same forgiveness for the setup answers, which designs saved before the
      // welcome screen do not carry.
      multiFloor: value.multiFloor === true,
      plenumHeightFeet:
        typeof value.plenumHeightFeet === "number" &&
        Number.isFinite(value.plenumHeightFeet) &&
        value.plenumHeightFeet > 0
          ? value.plenumHeightFeet
          : null
    }
  };
}

/** A stored name, or null when absent or blank so a fallback can take over. */
function parseName(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function parseBuildArea(value: unknown): BuildArea {
  const partial = isRecord(value)
    ? {
        width: typeof value.width === "number" ? value.width : undefined,
        depth: typeof value.depth === "number" ? value.depth : undefined,
        height: typeof value.height === "number" ? value.height : undefined
      }
    : undefined;
  return clampBuildArea(partial);
}

function parsePart(
  value: unknown,
  index: number
): { ok: true; part: Part } | { ok: false; message: string } {
  if (!isRecord(value)) return fail(`parts[${index}] is not an object.`);
  if (typeof value.id !== "string") return fail(`parts[${index}].id must be a string.`);
  const id = value.id;
  switch (value.type) {
    case "blower": {
      if (!isVec3(value.cell)) return fail(`parts[${index}] blower.cell must be a 3-tuple.`);
      if (!isVec3(value.dir)) return fail(`parts[${index}] blower.dir must be a 3-tuple.`);
      const part: BlowerPart = { id, type: "blower", cell: value.cell, dir: value.dir };
      return { ok: true, part };
    }
    case "terminal": {
      if (!isVec3(value.cell)) return fail(`parts[${index}] terminal.cell must be a 3-tuple.`);
      if (!isVec3(value.axis)) return fail(`parts[${index}] terminal.axis must be a 3-tuple.`);
      const part: TerminalPart = { id, type: "terminal", cell: value.cell, axis: value.axis };
      return { ok: true, part };
    }
    case "tube": {
      if (!isVec3(value.from)) return fail(`parts[${index}] tube.from must be a 3-tuple.`);
      if (!isVec3(value.to)) return fail(`parts[${index}] tube.to must be a 3-tuple.`);
      const part: TubePart = { id, type: "tube", from: value.from, to: value.to };
      if (typeof value.length === "number") part.length = value.length;
      // Forgiving: any other value means a manual part to this build.
      if (value.source === "auto-build") part.source = "auto-build";
      return { ok: true, part };
    }
    case "bend": {
      if (!isVec3(value.entry)) return fail(`parts[${index}] bend.entry must be a 3-tuple.`);
      if (!isVec3(value.exit)) return fail(`parts[${index}] bend.exit must be a 3-tuple.`);
      if (!isVec3(value.center)) return fail(`parts[${index}] bend.center must be a 3-tuple.`);
      if (!isVec3(value.inDir)) return fail(`parts[${index}] bend.inDir must be a 3-tuple.`);
      if (!isVec3(value.outDir)) return fail(`parts[${index}] bend.outDir must be a 3-tuple.`);
      const part: BendPart = {
        id,
        type: "bend",
        entry: value.entry,
        exit: value.exit,
        center: value.center,
        inDir: value.inDir,
        outDir: value.outDir
      };
      if (typeof value.radius === "number") part.radius = value.radius;
      if (value.source === "auto-build") part.source = "auto-build";
      return { ok: true, part };
    }
    default:
      return fail(`parts[${index}] has unknown type "${String(value.type)}".`);
  }
}

function parseObstacle(
  value: unknown,
  index: number
): { ok: true; obstacle: Obstacle } | { ok: false; message: string } {
  if (!isRecord(value)) return fail(`obstacles[${index}] is not an object.`);
  if (typeof value.id !== "string") return fail(`obstacles[${index}].id must be a string.`);
  if (!isVec3(value.min)) return fail(`obstacles[${index}].min must be a 3-tuple.`);
  if (!isVec3(value.max)) return fail(`obstacles[${index}].max must be a 3-tuple.`);
  const obstacle: Obstacle = { id: value.id, min: value.min, max: value.max };
  // Forgiving: anything but true reads as the impenetrable kind.
  if (value.penetrable === true) obstacle.penetrable = true;
  return { ok: true, obstacle };
}

function clonePart(part: Part): Part {
  return JSON.parse(JSON.stringify(part)) as Part;
}

function cloneObstacle(obs: Obstacle): Obstacle {
  const cloned: Obstacle = { id: obs.id, min: [...obs.min] as Vec3, max: [...obs.max] as Vec3 };
  if (obs.penetrable) cloned.penetrable = true;
  return cloned;
}
