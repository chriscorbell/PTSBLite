import { describe, expect, it } from "vitest";
import { DEFAULT_UNDO_LIMIT, popUndo, pushUndo } from "@/domain/undo-history";

describe("undo-history", () => {
  it("pushes entries without mutating the input stack", () => {
    const stack = [1, 2];
    const next = pushUndo(stack, 3);
    expect(next).toEqual([1, 2, 3]);
    expect(stack).toEqual([1, 2]);
  });

  it("drops the oldest entries once the limit is exceeded", () => {
    const next = pushUndo([1, 2, 3], 4, 3);
    expect(next).toEqual([2, 3, 4]);
  });

  it("returns an empty stack when the limit is non-positive", () => {
    expect(pushUndo([1, 2], 3, 0)).toEqual([]);
  });

  it("defaults to a bounded limit", () => {
    let stack: number[] = [];
    for (let i = 0; i < DEFAULT_UNDO_LIMIT + 25; i++) stack = pushUndo(stack, i);
    expect(stack.length).toBe(DEFAULT_UNDO_LIMIT);
    expect(stack[stack.length - 1]).toBe(DEFAULT_UNDO_LIMIT + 24);
    expect(stack[0]).toBe(25);
  });

  it("pops the most recent entry and returns the remaining stack", () => {
    const result = popUndo([1, 2, 3]);
    expect(result).toEqual({ entry: 3, rest: [1, 2] });
  });

  it("returns null when there is nothing to undo", () => {
    expect(popUndo([])).toBeNull();
  });

  it("round-trips push then pop back to the original stack", () => {
    const base = ["a", "b"];
    const pushed = pushUndo(base, "c");
    const popped = popUndo(pushed);
    expect(popped?.entry).toBe("c");
    expect(popped?.rest).toEqual(base);
  });
});
