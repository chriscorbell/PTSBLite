import {
  designHistoryReducer,
  initDesignHistory,
  type DesignHistory,
  type DesignHistoryAction
} from "@/domain/design-history";
import { DEFAULT_FILENAME } from "@/domain/design-state";
import type { DesignState } from "@/types";

/**
 * One open document: its undo history, where it lives on disk, and whether it
 * has unsaved changes.
 *
 * These were three separate things — the history reducer, no path at all, and a
 * `dirty` boolean toggled by hand from a dozen unrelated callbacks. Any callback
 * that forgot to set it left the app believing work was saved when it was not,
 * which is the quiet half of issue #6.
 *
 * Dirty is now *derived*, from whether the design on screen is the same object
 * as the one last written to disk. Because designs are immutable and history
 * keeps references, that is both exact and free — and it gets the case a counter
 * gets wrong: edit, then undo back to where you saved, and the document is
 * genuinely clean again.
 *
 * Deliberately single-document. A project folder would change where this saves;
 * multiple windows would make it per-window. Neither changes the shape of what
 * is here, so neither is speculated about.
 */
export type DocumentSession = {
  history: DesignHistory;
  /** Absolute path this document was last saved to or opened from. */
  path: string | null;
  /** The exact design last written to or read from `path`. */
  saved: DesignState | null;
};

export type DocumentAction =
  | DesignHistoryAction
  /** A file was opened: it becomes the document, and it is clean. */
  | { type: "opened"; design: DesignState; path: string }
  /** The current design was written to `path`. */
  | { type: "saved"; path: string }
  /** Start over with an empty design and no path. */
  | { type: "new"; design: DesignState };

export function initDocumentSession(design: DesignState): DocumentSession {
  return { history: initDesignHistory(design), path: null, saved: design };
}

/** True when the design on screen differs from the one last saved. */
export function isDirty(session: DocumentSession): boolean {
  return session.history.present !== session.saved;
}

/** The current design. */
export function currentDesign(session: DocumentSession): DesignState {
  return session.history.present;
}

/**
 * What to show in the title bar and the system name field: the file's own name
 * once it has one, otherwise the design's metadata name.
 */
export function displayFilename(session: DocumentSession): string {
  if (session.path) return basename(session.path);
  return session.history.present.metadata.filename || DEFAULT_FILENAME;
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function documentSessionReducer(
  session: DocumentSession,
  action: DocumentAction
): DocumentSession {
  switch (action.type) {
    case "opened":
      return {
        history: initDesignHistory(action.design),
        path: action.path,
        saved: action.design
      };

    case "new":
      return initDocumentSession(action.design);

    case "saved":
      // The design on screen is now the one on disk. Identity is what makes
      // this work: nothing is copied, so `isDirty` is a reference comparison.
      return { ...session, path: action.path, saved: session.history.present };

    default:
      return { ...session, history: designHistoryReducer(session.history, action) };
  }
}
