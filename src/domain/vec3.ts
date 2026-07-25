/**
 * Canonical integer-grid vector helpers.
 *
 * These were previously redefined privately in nine domain modules — around 40
 * definitions of a dozen operations. The copies had also drifted on negative
 * zero: some normalized it, some did not.
 *
 * That drift was a consistency problem rather than a live bug. `-0` is invisible
 * to everything this codebase does with cells: `String(-0) === "0"` so `cellKey`
 * is unaffected, `-0 === 0` so `vEq` is unaffected, and `JSON.stringify` writes
 * it as `0` so saved designs are unaffected. Only `Object.is` can see it, and
 * nothing uses `Object.is` except `normalizeZero` itself.
 *
 * Normalization is kept — uniformly, in every producer — because it costs
 * nothing and removes a difference that reads like it ought to matter. `cellKey`
 * deliberately skips it: it runs in the A* inner loop and, per the above, could
 * not observe `-0` anyway.
 */
import type { Vec3 } from "@/types";

/** Collapse `-0` to `0`, so arithmetic output is canonical. */
export function normalizeZero(n: number): number {
  return Object.is(n, -0) ? 0 : n;
}

export function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

export function vAdd(a: Vec3, b: Vec3): Vec3 {
  return [normalizeZero(a[0] + b[0]), normalizeZero(a[1] + b[1]), normalizeZero(a[2] + b[2])];
}

export function vSub(a: Vec3, b: Vec3): Vec3 {
  return [normalizeZero(a[0] - b[0]), normalizeZero(a[1] - b[1]), normalizeZero(a[2] - b[2])];
}

export function vScale(v: Vec3, n: number): Vec3 {
  return [normalizeZero(v[0] * n), normalizeZero(v[1] * n), normalizeZero(v[2] * n)];
}

export function vNeg(v: Vec3): Vec3 {
  return [normalizeZero(-v[0]), normalizeZero(-v[1]), normalizeZero(-v[2])];
}

export function vEq(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Unit step from `a` towards `b` on each axis; zero on axes that do not differ. */
export function dirOf(a: Vec3, b: Vec3): Vec3 {
  return [sign(b[0] - a[0]), sign(b[1] - a[1]), sign(b[2] - a[2])];
}

export function manhattan(a: Vec3, b: Vec3): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

/** The grid cell containing a (possibly fractional) point. */
export function cellAt(v: Vec3): Vec3 {
  return [Math.floor(v[0]), Math.floor(v[1]), Math.floor(v[2])];
}

/** The center of a cell — where part endpoints are stored and meshes are drawn. */
export function cellCenter(cell: Vec3): Vec3 {
  return [cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5];
}

/**
 * Map key for a cell. Callers must pass normalized components; every producer in
 * this module does. Kept free of normalization because it runs in hot loops.
 */
export function cellKey(cell: Vec3): string {
  return `${cell[0]},${cell[1]},${cell[2]}`;
}

/**
 * The cells a straight tube occupies, walking from `from` toward `to`. The end
 * cell is excluded: a tube's `to` is the open port beyond its last occupied cell.
 */
export function tubeCells(from: Vec3, to: Vec3): Vec3[] {
  const start = cellAt(from);
  const end = cellAt(to);
  const dir = dirOf(start, end);
  const length = Math.max(
    Math.abs(end[0] - start[0]),
    Math.abs(end[1] - start[1]),
    Math.abs(end[2] - start[2])
  );
  return Array.from({ length }, (_, i) => vAdd(start, vScale(dir, i)));
}
