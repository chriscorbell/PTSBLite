import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  designHistoryReducer,
  initDesignHistory,
  type DesignHistory
} from "@/domain/design-history";
import { emptyDesign } from "@/domain/design-state";
import type { DesignState } from "@/types";

/**
 * Distinguishable stand-ins; the reducer never inspects the design itself, so
 * any field that survives `emptyDesign` will do as a marker. Room width is the
 * one that reads clearly in a failure message.
 */
function design(marker: number): DesignState {
  return emptyDesign({ room: { width: marker, depth: 20, height: 10 } });
}

const reduce = (history: DesignHistory, ...actions: Parameters<typeof designHistoryReducer>[1][]) =>
  actions.reduce(designHistoryReducer, history);

const names = (designs: DesignState[]) => designs.map((d) => d.metadata.room.width);

describe("designHistoryReducer", () => {
  it("starts with nothing to undo or redo", () => {
    const history = initDesignHistory(design(4));

    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("moves the previous design onto the past when committing", () => {
    const history = reduce(initDesignHistory(design(4)), { type: "commit", design: design(5) });

    expect(history.present.metadata.room.width).toBe(5);
    expect(names(history.past)).toEqual([4]);
    expect(canUndo(history)).toBe(true);
  });

  it("round-trips through undo and redo", () => {
    const start = reduce(initDesignHistory(design(4)), { type: "commit", design: design(5) });

    const undone = reduce(start, { type: "undo" });
    expect(undone.present.metadata.room.width).toBe(4);
    expect(canUndo(undone)).toBe(false);
    expect(canRedo(undone)).toBe(true);

    const redone = reduce(undone, { type: "redo" });
    expect(redone.present.metadata.room.width).toBe(5);
    expect(canRedo(redone)).toBe(false);
  });

  it("discards the redo branch when a new edit follows an undo", () => {
    const history = reduce(
      initDesignHistory(design(4)),
      { type: "commit", design: design(5) },
      { type: "undo" },
      { type: "commit", design: design(6) }
    );

    expect(history.present.metadata.room.width).toBe(6);
    expect(canRedo(history)).toBe(false);
    expect(names(history.past)).toEqual([4]);
  });

  it("is a no-op when there is nothing to undo or redo", () => {
    const history = initDesignHistory(design(4));

    expect(designHistoryReducer(history, { type: "undo" })).toBe(history);
    expect(designHistoryReducer(history, { type: "redo" })).toBe(history);
  });

  it("drops both stacks on reset, since they belong to the replaced document", () => {
    const history = reduce(
      initDesignHistory(design(4)),
      { type: "commit", design: design(5) },
      { type: "undo" },
      { type: "reset", design: design(99) }
    );

    expect(history.present.metadata.room.width).toBe(99);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("preserves undo order across several commits", () => {
    const history = reduce(
      initDesignHistory(design(4)),
      { type: "commit", design: design(5) },
      { type: "commit", design: design(6) }
    );

    expect(names(history.past)).toEqual([4, 5]);
    expect(reduce(history, { type: "undo" }).present.metadata.room.width).toBe(5);
    expect(reduce(history, { type: "undo" }, { type: "undo" }).present.metadata.room.width).toBe(4);
  });
});
