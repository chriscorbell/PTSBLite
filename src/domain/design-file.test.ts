import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  deserializeDesign,
  serializeDesign,
  type SerializedDesign
} from "@/domain/design-file";
import { designFromScene, emptyDesign } from "@/domain/design-state";
import { DEFAULT_ROOM } from "@/domain/sparse-grid";
import type { Scene } from "@/types";

const FULL_SCENE: Scene = {
  parts: [
    { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
    { id: "t1", type: "terminal", cell: [10, 0, 0], axis: [1, 0, 0] },
    { id: "st1", type: "tube", from: [1, 0, 0], to: [7, 0, 0], length: 6 },
    {
      id: "bn1",
      type: "bend",
      entry: [7.5, 0.5, 0.5],
      exit: [10.5, 0.5, 3.5],
      center: [7.5, 0.5, 3.5],
      inDir: [1, 0, 0],
      outDir: [0, 0, 1],
      radius: 3
    }
  ],
  obstacles: [{ id: "o1", min: [2, 0, 2], max: [4, 1, 4] }]
};

// Explicit rather than imported from the build: the point of the argument is
// that serialization does not source the version itself.
const TEST_APP_VERSION = "9.9.9";

describe("serializeDesign", () => {
  it("includes schemaVersion and appVersion headers", () => {
    const payload = serializeDesign(emptyDesign(), TEST_APP_VERSION);
    expect(payload.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(payload.appVersion).toBe(TEST_APP_VERSION);
  });

  it("serializes parts, obstacles, and metadata", () => {
    const design = designFromScene(FULL_SCENE);
    const payload = serializeDesign(design, TEST_APP_VERSION);
    expect(payload.parts).toHaveLength(4);
    expect(payload.obstacles).toHaveLength(1);
    expect(payload.metadata).toEqual({
      room: DEFAULT_ROOM,
      multiFloor: false,
      plenumHeightFeet: null
    });
  });

  it("produces JSON-stringifiable output (no live grid handle)", () => {
    const design = designFromScene(FULL_SCENE);
    const payload = serializeDesign(design, TEST_APP_VERSION);
    const text = JSON.stringify(payload);
    const parsed = JSON.parse(text) as SerializedDesign;
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.parts).toHaveLength(4);
  });
});

describe("deserializeDesign", () => {
  it("roundtrips a full design preserving parts, obstacles, and metadata", () => {
    const original = designFromScene(FULL_SCENE);
    const text = JSON.stringify(serializeDesign(original, TEST_APP_VERSION));
    const result = deserializeDesign(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.parts).toEqual(original.parts);
    expect(result.design.obstacles).toEqual(original.obstacles);
    expect(result.design.metadata).toEqual(original.metadata);
  });

  it("rebuilds the grid from serialized parts and obstacles", () => {
    const original = designFromScene(FULL_SCENE);
    const text = JSON.stringify(serializeDesign(original, TEST_APP_VERSION));
    const result = deserializeDesign(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.grid.query([0, 0, 0])).toBe("b1");
    expect(result.design.grid.query([10, 0, 0])).toBe("t1");
    expect(result.design.grid.query([2, 0, 2])).toBe("o1");
  });

  it("roundtrips a custom room", () => {
    const original = designFromScene(FULL_SCENE, {
      room: { width: 40, depth: 80, height: 12 }
    });
    const result = deserializeDesign(JSON.stringify(serializeDesign(original, TEST_APP_VERSION)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.metadata.room).toEqual({ width: 40, depth: 80, height: 12 });
  });

  it("roundtrips a penetrable obstacle, whose cells stay free after restore", () => {
    const original = designFromScene({
      parts: [],
      obstacles: [{ id: "o1", min: [2, 0, 2], max: [4, 2, 4], penetrable: true }]
    });
    const result = deserializeDesign(JSON.stringify(serializeDesign(original, TEST_APP_VERSION)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.obstacles[0]).toMatchObject({ id: "o1", penetrable: true });
    // Restored the same way it was placed: no grid claim, so tubes route through.
    expect(result.design.grid.query([3, 1, 3])).toBeUndefined();
  });

  it("roundtrips a pedestal blower, mast cells and all", () => {
    const original = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [2, 3, 2], dir: [0, 1, 0], pedestalFeet: 3 }],
      obstacles: []
    });
    const result = deserializeDesign(JSON.stringify(serializeDesign(original, TEST_APP_VERSION)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.parts[0]).toMatchObject({ pedestalFeet: 3 });
    // The mast is registered on restore too, or the reloaded design would show
    // tube nothing could collide with.
    expect(result.design.grid.query([2, 0, 2])).toBe("b1");
  });

  it("reads a mast height it cannot represent as a plain blower", () => {
    // Presence of the field is what marks the variant, so a payload claiming a
    // negative or fractional mast must not create one the app cannot draw.
    const payload = JSON.parse(
      JSON.stringify(
        serializeDesign(
          designFromScene({
            parts: [{ id: "b1", type: "blower", cell: [2, 0, 2], dir: [0, 1, 0] }],
            obstacles: []
          }),
          TEST_APP_VERSION
        )
      )
    ) as { parts: Array<Record<string, unknown>> };
    payload.parts[0].pedestalFeet = -2;

    const result = deserializeDesign(JSON.stringify(payload));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("pedestalFeet" in result.design.parts[0]).toBe(false);
  });

  it("roundtrips the Auto-Build mark and ignores any other source value", () => {
    const marked = JSON.parse(
      JSON.stringify(serializeDesign(designFromScene(FULL_SCENE), TEST_APP_VERSION))
    ) as { parts: Array<Record<string, unknown>> };
    marked.parts.find((p) => p.type === "tube")!.source = "auto-build";
    marked.parts.find((p) => p.type === "bend")!.source = "wormhole";

    const result = deserializeDesign(JSON.stringify(marked));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tube = result.design.parts.find((p) => p.type === "tube");
    const bend = result.design.parts.find((p) => p.type === "bend");
    expect(tube).toMatchObject({ source: "auto-build" });
    // An unrecognized provenance is dropped, not preserved as a mystery value.
    expect(bend && "source" in bend).toBe(false);

    const reserialized = serializeDesign(result.design, TEST_APP_VERSION);
    expect(reserialized.parts.find((p) => p.type === "tube")).toMatchObject({
      source: "auto-build"
    });
  });

  it("restores a two-floor design with a part on the second floor", () => {
    // The part sits above the single-floor ceiling; only the doubled volume
    // that multiFloor implies can hold it, so the restore path must derive it.
    const original = designFromScene(
      { parts: [{ id: "b1", type: "blower", cell: [0, 35, 0], dir: [1, 0, 0] }], obstacles: [] },
      { multiFloor: true }
    );
    const result = deserializeDesign(JSON.stringify(serializeDesign(original, TEST_APP_VERSION)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.grid.query([0, 35, 0])).toBe("b1");
  });

  it("roundtrips the welcome screen's setup answers", () => {
    const original = designFromScene(FULL_SCENE, { multiFloor: true, plenumHeightFeet: 2.5 });
    const result = deserializeDesign(JSON.stringify(serializeDesign(original, TEST_APP_VERSION)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.metadata.multiFloor).toBe(true);
    expect(result.design.metadata.plenumHeightFeet).toBe(2.5);
  });

  it("defaults fields added since a design was saved", () => {
    // A v1 payload written before the build area and setup answers existed.
    const legacy = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: "0.1.0",
      metadata: { systemName: "old.ptsb" },
      parts: [],
      obstacles: []
    };
    const result = deserializeDesign(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.metadata.room).toEqual(DEFAULT_ROOM);
    expect(result.design.metadata.multiFloor).toBe(false);
    expect(result.design.metadata.plenumHeightFeet).toBeNull();
  });

  it("rejects unparseable JSON", () => {
    const result = deserializeDesign("{not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/parse|invalid/i);
  });

  it("rejects missing schemaVersion", () => {
    const result = deserializeDesign(
      JSON.stringify({ parts: [], obstacles: [], metadata: { systemName: "x" } })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/schemaVersion/i);
  });

  it("rejects wrong schemaVersion", () => {
    const result = deserializeDesign(
      JSON.stringify({
        schemaVersion: "99",
        appVersion: "0.1.0",
        parts: [],
        obstacles: [],
        metadata: { systemName: "x" }
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/schema|version/i);
  });

  it("rejects missing parts array", () => {
    const result = deserializeDesign(
      JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appVersion: "0.1.0",
        obstacles: [],
        metadata: { systemName: "x" }
      })
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
        metadata: { systemName: "x" }
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
        metadata: { systemName: "x" }
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
        metadata: { systemName: "x" }
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/obstacle|max/i);
  });

  it("restores a payload whose metadata is empty", () => {
    // Metadata is forgiving throughout: a payload missing every field restores
    // under the defaults rather than refusing to open at all.
    const result = deserializeDesign(
      JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appVersion: "0.1.0",
        parts: [],
        obstacles: [],
        metadata: {}
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.metadata.room).toEqual(DEFAULT_ROOM);
  });

  it("reads a room stored under the old buildArea key", () => {
    // What the room was called when it was the whole build area. A design
    // saved then keeps its dimensions rather than reverting to the default.
    const result = deserializeDesign(
      JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appVersion: "0.1.0",
        parts: [],
        obstacles: [],
        metadata: { systemName: "x", buildArea: { width: 40, depth: 80, height: 12 } }
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.metadata.room).toEqual({ width: 40, depth: 80, height: 12 });
  });

  it("caps a stored two-floor room the build area cannot hold", () => {
    // 100 ft per floor cannot stack twice inside the 100 ft build area; the
    // room restores at the tallest height that fits rather than refusing.
    const result = deserializeDesign(
      JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appVersion: "0.1.0",
        parts: [],
        obstacles: [],
        metadata: { room: { width: 40, depth: 40, height: 100 }, multiFloor: true }
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.metadata.room.height).toBe(49);
  });

  it("ignores names left in a payload from when designs had them", () => {
    // Designs carry no name any more. A stored one is simply dropped, and the
    // rest of the payload still restores.
    const result = deserializeDesign(
      JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appVersion: "0.1.0",
        parts: [],
        obstacles: [],
        metadata: { filename: "House", systemName: "West Wing", companyName: "Acme" }
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.metadata).toEqual({
      room: DEFAULT_ROOM,
      multiFloor: false,
      plenumHeightFeet: null
    });
  });
});
