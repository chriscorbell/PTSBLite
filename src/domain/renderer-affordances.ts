import { partRegistry } from "@/domain/part-registry";
import { computeTopology, type Port } from "@/domain/topology";
import type { DesignState, Part, ToolId, Vec3 } from "@/types";

export const BUILD_VOLUME_HALF_EXTENT = 15;
export const BUILD_VOLUME_MAX_Y = 20;

export type PortMarker = {
  partId: string;
  index: number;
  cell: Vec3;
  dir: Vec3;
};

const PORT_GLOW_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(["tube", "bend"]);

export function openPortMarkers(design: DesignState, tool: ToolId): PortMarker[] {
  if (!PORT_GLOW_TOOLS.has(tool)) return [];
  const topology = computeTopology(design);
  return topology.openPorts().map((p) => portMarker(p));
}

function portMarker(p: Port): PortMarker {
  return { partId: p.partId, index: p.index, cell: p.from, dir: p.dir };
}

export type PartLabel = {
  partId: string;
  text: string;
  anchor: Vec3;
};

export function partLabels(design: DesignState): PartLabel[] {
  return design.parts.map((p) => ({
    partId: p.id,
    text: labelTextForPart(p),
    anchor: labelAnchor(p)
  }));
}

export function labelTextForPart(p: Part): string {
  switch (p.type) {
    case "blower":
      return partRegistry.get("blower").partNo;
    case "terminal":
      return partRegistry.get("terminal").partNo;
    case "tube":
      return partRegistry.get("tube6").partNo;
    case "bend":
      return partRegistry.get("bend90").partNo;
  }
}

function labelAnchor(p: Part): Vec3 {
  switch (p.type) {
    case "blower":
    case "terminal":
      return [p.cell[0] + 0.5, p.cell[1] + 1.4, p.cell[2] + 0.5];
    case "tube": {
      const mx = (p.from[0] + p.to[0]) / 2;
      const my = (p.from[1] + p.to[1]) / 2;
      const mz = (p.from[2] + p.to[2]) / 2;
      return [mx, my + 0.7, mz];
    }
    case "bend":
      return [p.center[0] + 0.5, p.center[1] + 1.0, p.center[2] + 0.5];
  }
}
