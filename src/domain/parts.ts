import { partRegistry } from "@/domain/part-registry";
import { hasPedestal } from "@/domain/pedestal";
import { SPLIT_SLEEVE_KEY, splitSleeveCount } from "@/domain/split-sleeve";
import type { DesignState, Part } from "@/types";

export type { PartCatalogEntry } from "@/domain/part-registry";

/** Whether Auto-Build placed this part. What "Clear Auto-Build" removes. */
export function isAutoBuildPart(p: Part): boolean {
  return (p.type === "tube" || p.type === "bend") && p.source === "auto-build";
}

export function partLength(p: Part): number {
  switch (p.type) {
    case "tube": {
      const dx = p.to[0] - p.from[0];
      const dy = p.to[1] - p.from[1];
      const dz = p.to[2] - p.from[2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    case "bend":
      return (Math.PI * (p.radius ?? 3)) / 2;
    case "blower":
    case "terminal":
      return 0;
  }
}

function isDesignState(input: readonly Part[] | DesignState): input is DesignState {
  return !Array.isArray(input);
}

export function totalPathLength(input: readonly Part[] | DesignState): number {
  const parts = isDesignState(input) ? input.parts : input;
  return parts.reduce((a, p) => a + partLength(p), 0);
}

export function tubeFeet(input: readonly Part[] | DesignState): number {
  const parts = isDesignState(input) ? input.parts : input;
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
export function bomRows(input: readonly Part[] | DesignState): BomRow[] {
  const parts = isDesignState(input) ? input.parts : input;
  // The two blowers are separate catalog items, so they are separate rows. The
  // mast under a pedestal blower is not a row of its own and adds nothing to
  // the tube footage: it is how the unit is mounted, not part of the run (see
  // pedestal.ts and ADR-0020).
  const blowers = parts.filter((p) => p.type === "blower" && !hasPedestal(p)).length;
  const pedestalBlowers = parts.filter(hasPedestal).length;
  const terminals = parts.filter((p) => p.type === "terminal").length;
  const bends = parts.filter((p) => p.type === "bend").length;
  const ft = tubeFeet(parts);
  const cuts = parts.filter((p) => p.type === "tube" && partLength(p) < 6).length;
  const stock = Math.ceil(ft / 6);
  // Sleeves are counted, not placed: where two pieces meet, and every 6 ft
  // along anything longer than one stock length. See split-sleeve.ts.
  const sleeves = splitSleeveCount(parts);

  const row = (key: string, qty: number, note?: string): BomRow => {
    const { name, partNo } = partRegistry.get(key);
    return { key, name, partNo, qty, note };
  };

  return [
    row("blower", blowers),
    row("blowerPedestal", pedestalBlowers),
    row("terminal", terminals),
    row(
      "tube6",
      stock,
      cuts ? `${cuts} cut on-site · ${ft.toFixed(1)}ft total` : `${ft.toFixed(1)}ft total`
    ),
    row("bend90", bends),
    row(SPLIT_SLEEVE_KEY, sleeves)
  ];
}
