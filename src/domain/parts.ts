import { partRegistry } from "@/domain/part-registry";
import type { DesignState, Part } from "@/types";

export type { PartCatalogEntry } from "@/domain/part-registry";

export function partLength(p: Part): number {
  if (p.type === "tube") {
    const dx = p.to[0] - p.from[0];
    const dy = p.to[1] - p.from[1];
    const dz = p.to[2] - p.from[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  if (p.type === "bend") {
    return (Math.PI * (p.radius ?? 3)) / 2;
  }
  return 0;
}

export function totalPathLength(input: Part[] | DesignState): number {
  const parts = Array.isArray(input) ? input : input.parts;
  return parts.reduce((a, p) => a + partLength(p), 0);
}

export function tubeFeet(input: Part[] | DesignState): number {
  const parts = Array.isArray(input) ? input : input.parts;
  return parts
    .filter((p): p is Extract<Part, { type: "tube" }> => p.type === "tube")
    .reduce((a, p) => a + partLength(p), 0);
}

/**
 * One line of the bill of materials: what the design needs, and how many.
 *
 * Deliberately carries no price or other commercial data. See ADR-0011.
 */
export type BomRow = {
  /** Registry key this row counts, e.g. "tube6". */
  key: string;
  name: string;
  partNo: string;
  qty: number;
  note?: string;
};

/**
 * The bill of materials for a design.
 *
 * A pure function of the parts, and of nothing else. Prices are not part of the
 * product or this model.
 */
export function bomRows(input: Part[] | DesignState): BomRow[] {
  const parts = Array.isArray(input) ? input : input.parts;
  const blowers = parts.filter((p) => p.type === "blower").length;
  const terminals = parts.filter((p) => p.type === "terminal").length;
  const bends = parts.filter((p) => p.type === "bend").length;
  const ft = tubeFeet(parts);
  const cuts = parts.filter((p) => p.type === "tube" && partLength(p) < 6).length;
  const stock = Math.ceil(ft / 6);

  const row = (key: string, qty: number, note?: string): BomRow => {
    const { name, partNo } = partRegistry.get(key);
    return { key, name, partNo, qty, note };
  };

  return [
    row("blower", blowers),
    row("terminal", terminals),
    row(
      "tube6",
      stock,
      cuts ? `${cuts} cut on-site · ${ft.toFixed(1)}ft total` : `${ft.toFixed(1)}ft total`
    ),
    row("bend90", bends)
  ];
}
