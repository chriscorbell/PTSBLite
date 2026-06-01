import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  deserializeDesign,
  serializeDesign
} from "@/domain/design-file";
import { designFromScene, emptyDesign } from "@/domain/design-state";
import type { BendPart, BlowerPart, Scene, TerminalPart, TubePart } from "@/types";

const FULL_SCENE: Scene = {
  parts: [
    { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] } as BlowerPart,
    { id: "t1", type: "terminal", cell: [10, 0, 0], axis: [1, 0, 0] } as TerminalPart,
    { id: "st1", type: "tube", from: [1, 0, 0], to: [7, 0, 0], length: 6 } as TubePart,
    {
      id: "bn1",
      type: "bend",
      entry: [7.5, 0.5, 0.5],
      exit: [10.5, 0.5, 3.5],
      center: [7.5, 0.5, 3.5],
      inDir: [1, 0, 0],
      outDir: [0, 0, 1],
      radius: 3
    } as BendPart
  ],
  obstacles: [{ id: "o1", min: [2, 0, 2], max: [4, 1, 4] }]
};

describe("serializeDesign", () => {
  it("includes schemaVersion and appVersion headers", () => {
    const file = serializeDesign(emptyDesign());
    expect(file.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(typeof file.appVersion).toBe("string");
    expect(file.appVersion.length).toBeGreaterThan(0);
  });

  it("serializes parts, obstacles, and metadata", () => {
    const design = designFromScene(FULL_SCENE, { filename: "house.ptsb", revision: "0.3" });
    const file = serializeDesign(design);
    expect(file.parts).toHaveLength(4);
    expect(file.obstacles).toHaveLength(1);
    expect(file.metadata).toEqual({ filename: "house.ptsb", revision: "0.3" });
  });

  it("produces JSON-stringifiable output (no live grid handle)", () => {
    const design = designFromScene(FULL_SCENE);
    const file = serializeDesign(design);
    const text = JSON.stringify(file);
    const parsed = JSON.parse(text);
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.parts).toHaveLength(4);
  });
});

describe("deserializeDesign", () => {
  it("roundtrips a full design preserving parts, obstacles, and metadata", () => {
    const original = designFromScene(FULL_SCENE, { filename: "house.ptsb", revision: "0.3" });
    const text = JSON.stringify(serializeDesign(original));
    const result = deserializeDesign(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.parts).toEqual(original.parts);
    expect(result.design.obstacles).toEqual(original.obstacles);
    expect(result.design.metadata).toEqual(original.metadata);
  });

  it("rebuilds the grid from serialized parts and obstacles", () => {
    const original = designFromScene(FULL_SCENE);
    const text = JSON.stringify(serializeDesign(original));
    const result = deserializeDesign(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.grid.query([0, 0, 0])).toBe("b1");
    expect(result.design.grid.query([10, 0, 0])).toBe("t1");
    expect(result.design.grid.query([2, 0, 2])).toBe("o1");
  });

  it("rejects unparseable JSON", () => {
    const result = deserializeDesign("{not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/parse|invalid/i);
  });

  it("rejects missing schemaVersion", () => {
    const result = deserializeDesign(JSON.stringify({ parts: [], obstacles: [], metadata: { filename: "x", revision: "1" } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/schemaVersion/i);
  });

  it("rejects wrong schemaVersion", () => {
    const result = deserializeDesign(
      JSON.stringify({ schemaVersion: "99", appVersion: "0.1.0", parts: [], obstacles: [], metadata: { filename: "x", revision: "1" } })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/schema|version/i);
  });

  it("rejects missing parts array", () => {
    const result = deserializeDesign(
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, appVersion: "0.1.0", obstacles: [], metadata: { filename: "x", revision: "1" } })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/parts/i);
  });

  it("rejects part with invalid type", () => {
    const result = deserializeDesign(
      JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appVersion: "0.1.0",
        parts: [{ id: "x1", type: "wormhole", cell: [0, 0, 0] }],
        obstacles: [],
        metadata: { filename: "x", revision: "1" }
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/type|part/i);
  });

  it("rejects blower with non-tuple cell", () => {
    const result = deserializeDesign(
      JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appVersion: "0.1.0",
        parts: [{ id: "b1", type: "blower", cell: [0, 0], dir: [1, 0, 0] }],
        obstacles: [],
        metadata: { filename: "x", revision: "1" }
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/cell|blower|tuple/i);
  });

  it("rejects obstacle missing min/max", () => {
    const result = deserializeDesign(
      JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appVersion: "0.1.0",
        parts: [],
        obstacles: [{ id: "o1", min: [0, 0, 0] }],
        metadata: { filename: "x", revision: "1" }
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/obstacle|max/i);
  });

  it("rejects metadata missing filename", () => {
    const result = deserializeDesign(
      JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appVersion: "0.1.0",
        parts: [],
        obstacles: [],
        metadata: { revision: "1" }
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/filename|metadata/i);
  });
});
