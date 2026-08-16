import { describe, expect, it } from "vitest";
import { serializeDesign } from "@/domain/design-file";
import { emptyDesign } from "@/domain/design-state";
import { isWorthKeeping, readStoredSession } from "@/domain/session-autosave";
import { expectGridMatchesDesign } from "@/test/design-invariants";
import type { DesignState, Part } from "@/types";

const blower: Part = { id: "b", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] };

function stored(design: DesignState): string {
  return JSON.stringify(serializeDesign(design, "test"));
}

describe("isWorthKeeping", () => {
  it("ignores the untouched design every visit starts from", () => {
    // Autosaving this would offer to restore nothing, and would overwrite real
    // work with a blank design on any visit abandoned immediately.
    expect(isWorthKeeping(emptyDesign())).toBe(false);
  });

  it("keeps a design with a part", () => {
    expect(isWorthKeeping({ ...emptyDesign(), parts: [blower] })).toBe(true);
  });

  it("keeps a design with only an obstacle", () => {
    const design = { ...emptyDesign(), obstacles: [{ id: "o", min: [0, 0, 0], max: [1, 1, 1] }] };
    expect(isWorthKeeping(design as DesignState)).toBe(true);
  });

  it("keeps metadata-only work", () => {
    // Setting the build area and naming the system before placing anything is
    // real work, and losing it because no part existed yet would be its own
    // small betrayal.
    const renamed = emptyDesign({ filename: "Ward 4 loop", revision: "0.1" });
    expect(isWorthKeeping(renamed)).toBe(true);

    const resized = emptyDesign();
    resized.metadata.buildArea = { width: 80, depth: 40, height: 14 };
    expect(isWorthKeeping(resized)).toBe(true);
  });
});

describe("readStoredSession", () => {
  it("reports nothing stored", () => {
    expect(readStoredSession(null)).toEqual({ status: "absent" });
  });

  it("restores a design that has work in it", () => {
    const result = readStoredSession(stored({ ...emptyDesign(), parts: [blower] }));
    expect(result.status).toBe("restorable");
    if (result.status !== "restorable") return;
    expect(result.design.parts).toHaveLength(1);
  });

  it("rebuilds the grid, so parts and occupancy cannot disagree", () => {
    // The invariant AGENTS.md calls the second most likely thing to get wrong.
    // It holds here for free: restoring goes through `deserializeDesign`, which
    // runs `reconstructDesign` rather than trusting the payload.
    const result = readStoredSession(stored({ ...emptyDesign(), parts: [blower] }));
    if (result.status !== "restorable") throw new Error("expected a restorable design");
    expectGridMatchesDesign(result.design);
  });

  it("treats a stored blank design as nothing to offer", () => {
    expect(readStoredSession(stored(emptyDesign()))).toEqual({ status: "absent" });
  });

  it("reports invalid JSON as unreadable rather than throwing", () => {
    const result = readStoredSession("{ not json");
    expect(result.status).toBe("unreadable");
  });

  it("reports a schema this build does not know as unreadable", () => {
    // A rollback, or a payload from a newer deployment. Neither is the
    // visitor's problem, and neither should be silently discarded.
    const future = JSON.parse(stored({ ...emptyDesign(), parts: [blower] })) as {
      schemaVersion: string;
    };
    future.schemaVersion = "99";
    const result = readStoredSession(JSON.stringify(future));
    expect(result.status).toBe("unreadable");
    if (result.status !== "unreadable") return;
    expect(result.reason).toMatch(/schemaVersion/i);
  });

  it("reports a design whose geometry does not rebuild as unreadable", () => {
    // Two parts in the same cell. `reconstructDesign` refuses it, so a payload
    // that would render and appear in the BOM but could not be erased never loads.
    const overlapping = JSON.parse(stored(emptyDesign())) as { parts: Part[] };
    overlapping.parts = [blower, { ...blower, id: "b2" }];
    expect(readStoredSession(JSON.stringify(overlapping)).status).toBe("unreadable");
  });
});
