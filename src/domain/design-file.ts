import { designFromScene } from "@/domain/design-state";
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
export const APP_VERSION = "0.1.0";

export type DesignFile = {
  schemaVersion: string;
  appVersion: string;
  metadata: DesignMetadata;
  parts: Part[];
  obstacles: Obstacle[];
};

export type DeserializeResult = { ok: true; design: DesignState } | { ok: false; message: string };

export function serializeDesign(design: DesignState): DesignFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: APP_VERSION,
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
    return fail("Could not parse file — invalid JSON.");
  }
  if (!isRecord(raw)) return fail("File is not a valid design object.");

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

  const design = designFromScene({ parts, obstacles }, metadataResult.metadata);
  return { ok: true, design };
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
  if (typeof value.filename !== "string") return fail("metadata.filename must be a string.");
  if (typeof value.revision !== "string") return fail("metadata.revision must be a string.");
  return {
    ok: true,
    metadata: {
      filename: value.filename,
      revision: value.revision,
      // Forgiving migration: files saved before the build area was configurable
      // (or with a malformed area) fall back to the default, clamped to limits.
      buildArea: parseBuildArea(value.buildArea)
    }
  };
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
  return { ok: true, obstacle: { id: value.id, min: value.min, max: value.max } };
}

function clonePart(part: Part): Part {
  return JSON.parse(JSON.stringify(part)) as Part;
}

function cloneObstacle(obs: Obstacle): Obstacle {
  return { id: obs.id, min: [...obs.min] as Vec3, max: [...obs.max] as Vec3 };
}
