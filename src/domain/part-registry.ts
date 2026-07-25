import partsJson from "@/data/parts.json";
import type { Vec3 } from "@/types";

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
  unitPrice: number;
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

export function loadPartRegistry(
  entries: Record<string, PartCatalogEntry>
): PartRegistry {
  const normalized: Record<string, PartCatalogEntry> = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry.type) throw new Error(`PartRegistry: entry "${key}" missing type`);
    if (!entry.partNo) throw new Error(`PartRegistry: entry "${key}" missing partNo`);
    if (typeof entry.unitPrice !== "number") {
      throw new Error(`PartRegistry: entry "${key}" missing numeric unitPrice`);
    }
    normalized[key] =
      entry.type === "bend"
        ? { ...entry, bendFootprints: computeBendFootprints(entry) }
        : { ...entry };
  }
  return new PartRegistry(normalized);
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

function vScale(v: Vec3, n: number): Vec3 {
  return [normalizeZero(v[0] * n), normalizeZero(v[1] * n), normalizeZero(v[2] * n)];
}

function vAdd(a: Vec3, b: Vec3): Vec3 {
  return [
    normalizeZero(a[0] + b[0]),
    normalizeZero(a[1] + b[1]),
    normalizeZero(a[2] + b[2])
  ];
}

function normalizeZero(n: number): number {
  return Object.is(n, -0) ? 0 : n;
}

function cellKey(cell: Vec3): string {
  return `${cell[0]},${cell[1]},${cell[2]}`;
}

function relativeCellAt(point: Vec3): Vec3 {
  return [Math.floor(point[0]), Math.floor(point[1]), Math.floor(point[2])];
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
    const cell = relativeCellAt(point);
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

export const partRegistry: PartRegistry = loadPartRegistry(
  partsJson
);
