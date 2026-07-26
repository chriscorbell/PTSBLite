import partsJson from "@/data/parts.json";
import type { Vec3 } from "@/types";
import { cellAt, cellKey, normalizeZero, vAdd, vScale } from "@/domain/vec3";

export type BendFootprint = {
  inDir: Vec3;
  outDir: Vec3;
  center: Vec3;
  exit: Vec3;
  cells: Vec3[];
  radius: number;
};

export type PartCatalogEntry = {
  type: string;
  name: string;
  partNo: string;
  color: string;
  cells?: number;
  ports?: number;
  arcLength?: number;
  bendFootprints?: BendFootprint[];
};

export class PartRegistry {
  private readonly entries: Readonly<Record<string, PartCatalogEntry>>;

  constructor(entries: Record<string, PartCatalogEntry>) {
    this.entries = Object.freeze({ ...entries });
  }

  has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.entries, key);
  }

  tryGet(key: string): PartCatalogEntry | undefined {
    return this.entries[key];
  }

  get(key: string): PartCatalogEntry {
    const entry = this.entries[key];
    if (!entry) throw new Error(`PartRegistry: unknown key "${key}"`);
    return entry;
  }

  keys(): string[] {
    return Object.keys(this.entries);
  }

  all(): PartCatalogEntry[] {
    return Object.values(this.entries);
  }
}

export function loadPartRegistry(entries: Record<string, PartCatalogEntry>): PartRegistry {
  const normalized: Record<string, PartCatalogEntry> = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry.type) throw new Error(`PartRegistry: entry "${key}" missing type`);
    if (!entry.partNo) throw new Error(`PartRegistry: entry "${key}" missing partNo`);
    if ("unitPrice" in entry) {
      // ADR-0003: the shipped catalog carries no prices, so a quote cannot be
      // built from invented ones. This guard used to require a numeric
      // unitPrice; it now refuses one, so the placeholders cannot come back by
      // way of a catalog edit.
      throw new Error(
        `PartRegistry: entry "${key}" carries a unitPrice. Prices are installer-entered (ADR-0003).`
      );
    }
    if (entry.type === "bend") {
      const bendFootprints = computeBendFootprints(entry);
      assertDeclaredCellCount(key, entry, bendFootprints);
      normalized[key] = { ...entry, bendFootprints };
    } else {
      normalized[key] = { ...entry };
    }
  }
  return new PartRegistry(normalized);
}

/**
 * Catch a catalog entry whose declared `cells` disagrees with the footprint the
 * geometry actually produces.
 *
 * `cells` is not decoration: `freePlacementFootprint` enforces it for blowers and
 * terminals. It was silently unchecked for bends, and had drifted — bend90
 * claimed 5 against an actual 7 — which is the kind of thing that stays harmless
 * right up until something starts trusting it. Per ADR-0001 the geometry wins,
 * so this reports the mismatch rather than deriving `cells` from it, which would
 * make the field unfalsifiable.
 */
function assertDeclaredCellCount(
  key: string,
  entry: PartCatalogEntry,
  footprints: BendFootprint[]
): void {
  if (typeof entry.cells !== "number" || footprints.length === 0) return;

  const actual = new Set(footprints.map((footprint) => footprintCellCount(footprint)));
  if (actual.has(entry.cells)) return;

  const found = [...actual].sort((a, b) => a - b).join(", ");
  throw new Error(
    `PartRegistry: entry "${key}" declares cells: ${entry.cells}, but its footprint occupies ${found}`
  );
}

/** Cells a bend occupies: its arc, plus the exit cell when the arc misses it. */
function footprintCellCount(footprint: BendFootprint): number {
  const cells = new Set(footprint.cells.map((cell) => cellKey(cell)));
  cells.add(cellKey(footprint.exit));
  return cells.size;
}

const PLANAR_DIRS: Vec3[] = [
  [1, 0, 0],
  [0, 0, 1],
  [-1, 0, 0],
  [0, 0, -1]
];

const VERTICAL_DIRS: Vec3[] = [
  [0, 1, 0],
  [0, -1, 0]
];

function rotateLeft([x, y, z]: Vec3): Vec3 {
  return [normalizeZero(-z), y, x];
}

function rotateRight([x, y, z]: Vec3): Vec3 {
  return [z, y, normalizeZero(-x)];
}

function arcCells(center: Vec3, radius: number, inDir: Vec3, outDir: Vec3): Vec3[] {
  const seen = new Set<string>();
  const cells: Vec3[] = [];
  for (let i = 0; i < 48; i++) {
    const t = i / 48;
    const ang = (Math.PI / 2) * t;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const point: Vec3 = [
      center[0] + radius * (-outDir[0] * c + inDir[0] * s),
      center[1] + radius * (-outDir[1] * c + inDir[1] * s),
      center[2] + radius * (-outDir[2] * c + inDir[2] * s)
    ];
    const cell = cellAt(point);
    const key = cellKey(cell);
    if (!seen.has(key)) {
      seen.add(key);
      cells.push(cell);
    }
  }
  return cells;
}

function buildFootprint(inDir: Vec3, outDir: Vec3, radius: number): BendFootprint {
  const center = vAdd([0.5, 0.5, 0.5], vScale(outDir, radius));
  const exit = vAdd(vScale(inDir, radius), vScale(outDir, radius));
  return {
    inDir,
    outDir,
    center: [center[0] - 0.5, center[1] - 0.5, center[2] - 0.5],
    exit,
    cells: arcCells(center, radius, inDir, outDir),
    radius
  };
}

function computeBendFootprints(entry: PartCatalogEntry): BendFootprint[] {
  const radius = entry.arcLength ? Number((entry.arcLength / (Math.PI / 2)).toFixed(2)) : 3;
  const footprints: BendFootprint[] = [];
  // Planar XZ pairs first (preserves historical ordering: each planar inDir picks
  // left then right horizontal exit before vertical alternatives).
  for (const inDir of PLANAR_DIRS) {
    footprints.push(buildFootprint(inDir, rotateLeft(inDir), radius));
    footprints.push(buildFootprint(inDir, rotateRight(inDir), radius));
    for (const outDir of VERTICAL_DIRS) {
      footprints.push(buildFootprint(inDir, outDir, radius));
    }
  }
  // Vertical entries with horizontal exits for routing back to the active plane.
  for (const inDir of VERTICAL_DIRS) {
    for (const outDir of PLANAR_DIRS) {
      footprints.push(buildFootprint(inDir, outDir, radius));
    }
  }
  return footprints;
}

export const partRegistry: PartRegistry = loadPartRegistry(partsJson);
