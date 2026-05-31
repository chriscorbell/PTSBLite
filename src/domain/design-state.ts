import { SparseGrid } from "@/domain/sparse-grid";
import { bendFootprint } from "@/domain/bend-placement";
import type { DesignMetadata, DesignState, Obstacle, Part, Scene, Vec3 } from "@/types";

export const DEFAULT_FILENAME = "untitled.kel2020";
export const DEFAULT_REVISION = "0.1";

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function withMetadata(meta?: Partial<DesignMetadata>): DesignMetadata {
  return {
    filename: meta?.filename ?? DEFAULT_FILENAME,
    revision: meta?.revision ?? DEFAULT_REVISION
  };
}

function cellAt(v: Vec3): Vec3 {
  return [Math.floor(v[0]), Math.floor(v[1]), Math.floor(v[2])];
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function tubeCells(from: Vec3, to: Vec3): Vec3[] {
  const start = cellAt(from);
  const end = cellAt(to);
  const dir: Vec3 = [sign(end[0] - start[0]), sign(end[1] - start[1]), sign(end[2] - start[2])];
  const length = Math.max(
    Math.abs(end[0] - start[0]),
    Math.abs(end[1] - start[1]),
    Math.abs(end[2] - start[2])
  );
  return Array.from({ length }, (_, i) => [
    start[0] + dir[0] * i,
    start[1] + dir[1] * i,
    start[2] + dir[2] * i
  ]);
}

function buildGrid(parts: Part[], obstacles: Obstacle[]): SparseGrid {
  const grid = new SparseGrid();
  for (const p of parts) {
    if (p.type === "blower" || p.type === "terminal") {
      const cell = p.cell as Vec3;
      if (grid.withinBounds(cell)) grid.place(cell, p.id);
    } else if (p.type === "tube") {
      for (const cell of tubeCells(p.from, p.to)) {
        if (grid.withinBounds(cell) && !grid.query(cell)) grid.place(cell, p.id);
      }
    } else if (p.type === "bend") {
      for (const cell of bendFootprint(p)) {
        if (grid.withinBounds(cell) && !grid.query(cell)) grid.place(cell, p.id);
      }
    }
  }
  for (const obs of obstacles) {
    const [x0, y0, z0] = obs.min.map(Math.floor);
    const [x1, y1, z1] = obs.max.map(Math.floor);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const cell: Vec3 = [x, y, z];
          if (grid.withinBounds(cell) && !grid.query(cell)) {
            grid.place(cell, obs.id);
          }
        }
      }
    }
  }
  return grid;
}

export function emptyDesign(meta?: Partial<DesignMetadata>): DesignState {
  return {
    parts: [],
    obstacles: [],
    metadata: withMetadata(meta),
    grid: new SparseGrid()
  };
}

export function designFromScene(scene: Scene, meta?: Partial<DesignMetadata>): DesignState {
  const parts = cloneJson(scene.parts ?? []);
  const obstacles = cloneJson(scene.obstacles ?? []);
  return {
    parts,
    obstacles,
    metadata: withMetadata(meta),
    grid: buildGrid(parts, obstacles)
  };
}
