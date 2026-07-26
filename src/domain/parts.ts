import { unitPriceFor } from "@/domain/app-settings";
import { partRegistry, type PartCatalogEntry } from "@/domain/part-registry";
import type { DesignState, Part } from "@/types";

/** Catalog entry with its unit price replaced by the effective (override-aware) price. */
function pricedEntry(registryKey: string): PartCatalogEntry {
  const entry = partRegistry.get(registryKey);
  return { ...entry, unitPrice: unitPriceFor(registryKey, entry.unitPrice) };
}

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

export type BomRow = PartCatalogEntry & {
  key: string;
  qty: number;
  note?: string;
};

export function bomRows(input: Part[] | DesignState): BomRow[] {
  const parts = Array.isArray(input) ? input : input.parts;
  const blowers = parts.filter((p) => p.type === "blower").length;
  const terminals = parts.filter((p) => p.type === "terminal").length;
  const bends = parts.filter((p) => p.type === "bend").length;
  const ft = tubeFeet(parts);
  const cuts = parts.filter((p) => p.type === "tube" && partLength(p) < 6).length;
  const stock = Math.ceil(ft / 6);
  return [
    { key: "blower", ...pricedEntry("blower"), qty: blowers },
    { key: "terminal", ...pricedEntry("terminal"), qty: terminals },
    {
      key: "tube",
      ...pricedEntry("tube6"),
      qty: stock,
      note: cuts ? `${cuts} cut on-site · ${ft.toFixed(1)}ft total` : `${ft.toFixed(1)}ft total`
    },
    { key: "bend", ...pricedEntry("bend90"), qty: bends }
  ];
}
