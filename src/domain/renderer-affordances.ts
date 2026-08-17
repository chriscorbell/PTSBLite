import { computeTopology, type Port } from "@/domain/topology";
import type { DesignState, ToolId, Vec3 } from "@/types";

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
