/**
 * Undo/redo history as a single reducer over one value.
 *
 * This replaced four hand-synchronised pieces of React state: a ref mirroring
 * the current design, two stack refs, and two booleans mirroring the stack
 * depths. Keeping them in step was manual, and the mirror ref had to be written
 * during render — unsafe under concurrent rendering, because React may render a
 * component and then throw the result away.
 *
 * Collapsing it here makes the transitions pure and testable, and means the
 * callbacks that drive history only need a stable `dispatch`.
 */
import { popUndo, pushUndo } from "@/domain/undo-history";
import type { DesignState } from "@/types";

export type DesignHistory = {
  /** The design currently on screen. */
  present: DesignState;
  /** Older designs, oldest first. */
  past: DesignState[];
  /** Designs undone away from, most recently undone last. */
  future: DesignState[];
};

export type DesignHistoryAction =
  /** Apply an edit as one undoable step. Discards the redo branch. */
  | { type: "commit"; design: DesignState }
  | { type: "undo" }
  /**
   * Swap the current design without touching either stack. For edits that are
   * not worth an undo step of their own — renaming the system, bumping the
   * revision — so the user's undo history is not diluted by cosmetic changes.
   */
  | { type: "replace-present"; design: DesignState }
  | { type: "redo" }
  /** Replace the design wholesale, such as restoring a session. Drops both stacks. */
  | { type: "reset"; design: DesignState };

export function initDesignHistory(design: DesignState): DesignHistory {
  return { present: design, past: [], future: [] };
}

export function canUndo(history: DesignHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: DesignHistory): boolean {
  return history.future.length > 0;
}

export function designHistoryReducer(
  history: DesignHistory,
  action: DesignHistoryAction
): DesignHistory {
  switch (action.type) {
    case "commit":
      return {
        present: action.design,
        past: pushUndo(history.past, history.present),
        future: []
      };

    case "replace-present":
      return { ...history, present: action.design };

    case "undo": {
      const popped = popUndo(history.past);
      if (!popped) return history;
      return {
        present: popped.entry,
        past: popped.rest,
        future: pushUndo(history.future, history.present)
      };
    }

    case "redo": {
      const popped = popUndo(history.future);
      if (!popped) return history;
      return {
        present: popped.entry,
        past: pushUndo(history.past, history.present),
        future: popped.rest
      };
    }

    case "reset":
      // Both stacks belong to the design being replaced.
      return initDesignHistory(action.design);
  }
}
