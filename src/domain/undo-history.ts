/**
 * A bounded undo stack. The app keeps one snapshot of {@link DesignState} per
 * discrete user action (part/obstacle placement, erase, Auto-Build, clear) and
 * restores the previous snapshot on Ctrl/Cmd+Z. The stack is capped so a long
 * editing session can't grow memory without bound.
 */

export const DEFAULT_UNDO_LIMIT = 100;

/**
 * Append `entry` to the stack, dropping the oldest entries once `limit` is
 * exceeded. Returns a new array; the input is never mutated.
 */
export function pushUndo<T>(stack: readonly T[], entry: T, limit = DEFAULT_UNDO_LIMIT): T[] {
  if (limit <= 0) return [];
  const next = [...stack, entry];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/**
 * Remove and return the most recent entry alongside the remaining stack.
 * Returns null when there is nothing to undo.
 */
export function popUndo<T>(stack: readonly T[]): { entry: T; rest: T[] } | null {
  if (stack.length === 0) return null;
  return { entry: stack[stack.length - 1], rest: stack.slice(0, -1) };
}
