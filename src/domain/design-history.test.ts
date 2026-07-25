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

/** Distinguishable stand-ins; the reducer never inspects the design itself. */
function design(filename: string): DesignState {
  return emptyDesign({ filename, revision: "1" });
}

const reduce = (history: DesignHistory, ...actions: Parameters<typeof designHistoryReducer>[1][]) =>
  actions.reduce(designHistoryReducer, history);

const names = (designs: DesignState[]) => designs.map((d) => d.metadata.filename);

describe("designHistoryReducer", () => {
  it("starts with nothing to undo or redo", () => {
    const history = initDesignHistory(design("a"));

    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("moves the previous design onto the past when committing", () => {
    const history = reduce(initDesignHistory(design("a")), { type: "commit", design: design("b") });

    expect(history.present.metadata.filename).toBe("b");
    expect(names(history.past)).toEqual(["a"]);
    expect(canUndo(history)).toBe(true);
  });

  it("round-trips through undo and redo", () => {
    const start = reduce(initDesignHistory(design("a")), { type: "commit", design: design("b") });

    const undone = reduce(start, { type: "undo" });
    expect(undone.present.metadata.filename).toBe("a");
    expect(canUndo(undone)).toBe(false);
    expect(canRedo(undone)).toBe(true);

    const redone = reduce(undone, { type: "redo" });
    expect(redone.present.metadata.filename).toBe("b");
    expect(canRedo(redone)).toBe(false);
  });

  it("discards the redo branch when a new edit follows an undo", () => {
    const history = reduce(
      initDesignHistory(design("a")),
      { type: "commit", design: design("b") },
      { type: "undo" },
      { type: "commit", design: design("c") }
    );

    expect(history.present.metadata.filename).toBe("c");
    expect(canRedo(history)).toBe(false);
    expect(names(history.past)).toEqual(["a"]);
  });

  it("is a no-op when there is nothing to undo or redo", () => {
    const history = initDesignHistory(design("a"));

    expect(designHistoryReducer(history, { type: "undo" })).toBe(history);
    expect(designHistoryReducer(history, { type: "redo" })).toBe(history);
  });

  it("drops both stacks on reset, since they belong to the replaced document", () => {
    const history = reduce(
      initDesignHistory(design("a")),
      { type: "commit", design: design("b") },
      { type: "undo" },
      { type: "reset", design: design("opened") }
    );

    expect(history.present.metadata.filename).toBe("opened");
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("preserves undo order across several commits", () => {
    const history = reduce(
      initDesignHistory(design("a")),
      { type: "commit", design: design("b") },
      { type: "commit", design: design("c") }
    );

    expect(names(history.past)).toEqual(["a", "b"]);
    expect(reduce(history, { type: "undo" }).present.metadata.filename).toBe("b");
    expect(reduce(history, { type: "undo" }, { type: "undo" }).present.metadata.filename).toBe("a");
  });
});

describe("replace-present", () => {
  it("swaps the design without adding an undo step", () => {
    const history = reduce(
      initDesignHistory(design("a")),
      { type: "commit", design: design("b") },
      { type: "replace-present", design: design("b-renamed") }
    );

    // Cosmetic edits should not dilute the user's undo history.
    expect(history.present.metadata.filename).toBe("b-renamed");
    expect(names(history.past)).toEqual(["a"]);
    expect(canRedo(history)).toBe(false);
  });

  it("leaves an existing redo branch intact", () => {
    const history = reduce(
      initDesignHistory(design("a")),
      { type: "commit", design: design("b") },
      { type: "undo" },
      { type: "replace-present", design: design("a-renamed") }
    );

    expect(canRedo(history)).toBe(true);
  });
});
