import { describe, expect, it } from "vitest";
import { PartRegistry, loadPartRegistry, partRegistry } from "@/domain/part-registry";

describe("PartRegistry", () => {
  it("loads the bundled KEL2020 catalog", () => {
    expect(partRegistry.has("blower")).toBe(true);
    expect(partRegistry.has("terminal")).toBe(true);
    expect(partRegistry.has("tube6")).toBe(true);
    expect(partRegistry.has("bend90")).toBe(true);
  });

  it("returns typed catalog entries by key", () => {
    const blower = partRegistry.get("blower");
    expect(blower.type).toBe("blower");
    expect(blower.partNo).toBe("KEL-BL-2020-A");
    expect(blower.unitPrice).toBeGreaterThan(0);
  });

  it("throws on unknown keys", () => {
    expect(() => partRegistry.get("missing")).toThrow(/unknown key/i);
  });

  it("tryGet returns undefined for unknown keys", () => {
    expect(partRegistry.tryGet("missing")).toBeUndefined();
  });

  it("lists every catalog key", () => {
    const keys = partRegistry.keys();
    expect(keys).toContain("blower");
    expect(keys).toContain("bend90");
    expect(keys.length).toBe(partRegistry.all().length);
  });

  it("precomputes bend footprints for every perpendicular 90 degree orientation, including vertical exits", () => {
    const bend = partRegistry.get("bend90");

    expect(bend.bendFootprints).toHaveLength(24);
    const pairs = new Set(
      bend.bendFootprints?.map((f) => `${f.inDir.join(",")} -> ${f.outDir.join(",")}`)
    );
    // existing planar pairs survive
    expect(pairs.has("1,0,0 -> 0,0,1")).toBe(true);
    expect(pairs.has("0,0,-1 -> -1,0,0")).toBe(true);
    // vertical exits are now enumerated for horizontal entries
    expect(pairs.has("1,0,0 -> 0,1,0")).toBe(true);
    expect(pairs.has("1,0,0 -> 0,-1,0")).toBe(true);
    expect(pairs.has("0,0,1 -> 0,1,0")).toBe(true);
    // horizontal exits are enumerated for vertical entries
    expect(pairs.has("0,1,0 -> 1,0,0")).toBe(true);
    expect(pairs.has("0,-1,0 -> 0,0,-1")).toBe(true);
    expect(bend.bendFootprints?.every((f) => f.cells.some((cell) => cell.join(",") === "0,0,0"))).toBe(true);
    expect(bend.bendFootprints?.every((f) => f.cells.length > 1)).toBe(true);
  });

  it("constructs cleanly from an in-memory record", () => {
    const r = loadPartRegistry({
      sample: {
        type: "blower",
        name: "Sample",
        partNo: "SMP-1",
        unitPrice: 10,
        color: "#000000"
      }
    });
    expect(r.get("sample").name).toBe("Sample");
  });

  it("rejects entries missing required fields", () => {
    expect(() =>
      loadPartRegistry({
        broken: {
          type: "",
          name: "Broken",
          partNo: "X",
          unitPrice: 1,
          color: "#000"
        }
      })
    ).toThrow(/missing type/i);
    expect(() =>
      loadPartRegistry({
        broken: {
          type: "x",
          name: "Broken",
          partNo: "",
          unitPrice: 1,
          color: "#000"
        }
      })
    ).toThrow(/missing partNo/i);
  });

  it("freezes its entry map", () => {
    const r = new PartRegistry({
      a: { type: "x", name: "A", partNo: "A-1", unitPrice: 1, color: "#000" }
    });
    expect(() => {
      (r as unknown as { entries: Record<string, unknown> }).entries.b = {};
    }).toThrow();
  });
});
