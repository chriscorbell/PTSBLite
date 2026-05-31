import { partRegistry, type PartRegistry } from "@/domain/part-registry";
import type { DesignState, Part, ToolId, Vec3 } from "@/types";

export type PortOwnerType = "blower" | "terminal" | "tube" | "bend";

export type Port = {
  partId: string;
  ownerType: PortOwnerType;
  index: number;
  from: Vec3;
  cell: Vec3;
  dir: Vec3;
};

function cellAt(v: Vec3): Vec3 {
  return [Math.floor(v[0]), Math.floor(v[1]), Math.floor(v[2])];
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function normalizeZero(n: number): number {
  return Object.is(n, -0) ? 0 : n;
}

function dirOf(a: Vec3, b: Vec3): Vec3 {
  return [sign(b[0] - a[0]), sign(b[1] - a[1]), sign(b[2] - a[2])];
}

function vAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vNeg(a: Vec3): Vec3 {
  return [normalizeZero(-a[0]), normalizeZero(-a[1]), normalizeZero(-a[2])];
}

function vEq(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function cellKey(v: Vec3): string {
  return `${v[0]},${v[1]},${v[2]}`;
}

function portKey(p: Port): string {
  return `${p.partId}:${p.index}`;
}

function catalogKey(part: Part): string {
  if (part.type === "tube") return "tube6";
  if (part.type === "bend") return "bend90";
  return part.type;
}

function assertCatalogPortCount(part: Part, ports: Port[], registry: PartRegistry): void {
  const expected = registry.get(catalogKey(part)).ports;
  if (typeof expected === "number" && ports.length !== expected) {
    throw new Error(
      `Topology: ${part.type} "${part.id}" computed ${ports.length} ports, expected ${expected}`
    );
  }
}

export function computePartPorts(part: Part, registry: PartRegistry = partRegistry): Port[] {
  let ports: Port[];
  switch (part.type) {
    case "blower": {
      const from = cellAt(part.cell);
      const dir = part.dir;
      ports = [
        { partId: part.id, ownerType: "blower", index: 0, from, cell: vAdd(from, dir), dir }
      ];
      break;
    }
    case "terminal": {
      const from = cellAt(part.cell);
      const axis = part.axis;
      ports = [
        {
          partId: part.id,
          ownerType: "terminal",
          index: 0,
          from,
          cell: vAdd(from, axis),
          dir: axis
        },
        {
          partId: part.id,
          ownerType: "terminal",
          index: 1,
          from,
          cell: vSub(from, axis),
          dir: vNeg(axis)
        }
      ];
      break;
    }
    case "tube": {
      const d = dirOf(part.from, part.to);
      const firstCell = cellAt(part.from);
      const toCell = cellAt(part.to);
      const lastCell = vSub(toCell, d);
      ports = [
        {
          partId: part.id,
          ownerType: "tube",
          index: 0,
          from: firstCell,
          cell: vSub(firstCell, d),
          dir: vNeg(d)
        },
        {
          partId: part.id,
          ownerType: "tube",
          index: 1,
          from: lastCell,
          cell: toCell,
          dir: d
        }
      ];
      break;
    }
    case "bend": {
      const entryFrom = cellAt(part.entry);
      const exitCell = cellAt(part.exit);
      ports = [
        {
          partId: part.id,
          ownerType: "bend",
          index: 0,
          from: entryFrom,
          cell: vSub(entryFrom, part.inDir),
          dir: vNeg(part.inDir)
        },
        {
          partId: part.id,
          ownerType: "bend",
          index: 1,
          from: exitCell,
          cell: vAdd(exitCell, part.outDir),
          dir: part.outDir
        }
      ];
      break;
    }
  }
  assertCatalogPortCount(part, ports, registry);
  return ports;
}

function computeConnectedKeys(ports: Port[]): Set<string> {
  const connected = new Set<string>();
  const byFrom = new Map<string, Port[]>();
  for (const p of ports) {
    const k = cellKey(p.from);
    const arr = byFrom.get(k);
    if (arr) arr.push(p);
    else byFrom.set(k, [p]);
  }
  for (const a of ports) {
    if (connected.has(portKey(a))) continue;
    const candidates = byFrom.get(cellKey(a.cell));
    if (!candidates) continue;
    for (const b of candidates) {
      if (b.partId === a.partId) continue;
      if (connected.has(portKey(b))) continue;
      if (!vEq(b.cell, a.from)) continue;
      if (!vEq(b.dir, vNeg(a.dir))) continue;
      connected.add(portKey(a));
      connected.add(portKey(b));
      break;
    }
  }
  return connected;
}

export class Topology {
  private readonly registry: PartRegistry;
  private readonly partPorts = new Map<string, Port[]>();
  private _ports: Port[] = [];
  private _connected = new Set<string>();

  constructor(items: Array<Part | Port> = [], registry: PartRegistry = partRegistry) {
    this.registry = registry;
    for (const item of items) {
      if (isPart(item)) {
        this.partPorts.set(item.id, computePartPorts(item, this.registry));
      } else {
        const existing = this.partPorts.get(item.partId);
        if (existing) existing.push(item);
        else this.partPorts.set(item.partId, [item]);
      }
    }
    this.rebuild();
  }

  ports(): Port[] {
    return this._ports.slice();
  }

  isConnected(p: Port): boolean {
    return this._connected.has(portKey(p));
  }

  openPorts(): Port[] {
    return this._ports.filter((p) => !this._connected.has(portKey(p)));
  }

  openPortsNear(cell: Vec3): Port[] {
    return this.openPorts().filter((p) => vEq(p.cell, cell));
  }

  addPart(part: Part): void {
    this.partPorts.set(part.id, computePartPorts(part, this.registry));
    this.rebuild();
  }

  removePart(partId: string): void {
    this.partPorts.delete(partId);
    this.rebuild();
  }

  private rebuild(): void {
    this._ports = [...this.partPorts.values()].flat();
    this._connected = computeConnectedKeys(this._ports);
  }
}

export function computeTopology(design: DesignState): Topology {
  return new Topology(design.parts);
}

function isPart(value: Part | Port): value is Part {
  return "type" in value;
}

export type SnapResolution =
  | { kind: "none" }
  | { kind: "one"; port: Port }
  | { kind: "multiple"; ports: Port[] };

export function resolveSnap(
  topology: Topology,
  hoverCell: Vec3,
  tool: ToolId
): SnapResolution {
  if (tool === "cursor" || tool === "erase" || tool === "blower" || tool === "obstacle") {
    return { kind: "none" };
  }
  const candidates = topology.openPortsNear(hoverCell);
  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length === 1) return { kind: "one", port: candidates[0] };
  return { kind: "multiple", ports: candidates };
}
