import { describe, expect, it } from "vitest";
import { designFromScene, emptyDesign } from "@/domain/design-state";
import {
  displayFilename,
  documentSessionReducer,
  initDocumentSession,
  isDirty,
  type DocumentSession
} from "@/domain/document-session";
import type { DesignState, Part } from "@/types";

const BLOWER: Part = { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] };

function withBlower(): DesignState {
  return designFromScene({ parts: [BLOWER], obstacles: [] });
}

function fresh(): DocumentSession {
  return initDocumentSession(emptyDesign());
}

describe("DocumentSession dirty state", () => {
  it("starts clean", () => {
    expect(isDirty(fresh())).toBe(false);
  });

  it("becomes dirty on an edit", () => {
    const session = documentSessionReducer(fresh(), { type: "commit", design: withBlower() });
    expect(isDirty(session)).toBe(true);
  });

  it("becomes clean again once saved", () => {
    let session = documentSessionReducer(fresh(), { type: "commit", design: withBlower() });
    session = documentSessionReducer(session, { type: "saved", path: "/tmp/a.ptsb" });
    expect(isDirty(session)).toBe(false);
    expect(session.path).toBe("/tmp/a.ptsb");
  });

  it("is clean again after undoing back to the saved design", () => {
    // The case a dirty *counter* gets wrong. Deriving from the identity of the
    // saved design gets it right for free, because history keeps references and
    // designs are immutable.
    let session = documentSessionReducer(fresh(), { type: "commit", design: withBlower() });
    session = documentSessionReducer(session, { type: "undo" });
    expect(isDirty(session)).toBe(false);
  });

  it("is dirty again after redoing away from it", () => {
    let session = documentSessionReducer(fresh(), { type: "commit", design: withBlower() });
    session = documentSessionReducer(session, { type: "undo" });
    session = documentSessionReducer(session, { type: "redo" });
    expect(isDirty(session)).toBe(true);
  });

  it("treats a cosmetic metadata change as an edit", () => {
    // Renaming the system does not deserve an undo step, but it does mean the
    // file on disk no longer matches what is on screen.
    const session = documentSessionReducer(fresh(), {
      type: "replace-present",
      design: emptyDesign({ filename: "renamed.ptsb" })
    });
    expect(isDirty(session)).toBe(true);
  });
});

describe("DocumentSession lifecycle", () => {
  it("adopts the path and drops history when a file is opened", () => {
    let session = documentSessionReducer(fresh(), { type: "commit", design: withBlower() });
    session = documentSessionReducer(session, {
      type: "opened",
      design: withBlower(),
      path: "/designs/site.ptsb"
    });

    expect(session.path).toBe("/designs/site.ptsb");
    expect(isDirty(session)).toBe(false);
    // Both stacks belonged to the document that was replaced.
    expect(session.history.past).toEqual([]);
    expect(session.history.future).toEqual([]);
  });

  it("forgets the path on New, so the next save prompts", () => {
    let session = documentSessionReducer(fresh(), {
      type: "opened",
      design: withBlower(),
      path: "/designs/site.ptsb"
    });
    session = documentSessionReducer(session, { type: "new", design: emptyDesign() });

    expect(session.path).toBeNull();
    expect(isDirty(session)).toBe(false);
  });

  it("shows the file's own name once it has one", () => {
    const session = documentSessionReducer(fresh(), {
      type: "opened",
      design: withBlower(),
      path: "/designs/building-07.ptsb"
    });
    expect(displayFilename(session)).toBe("building-07.ptsb");
  });

  it("falls back to the design's metadata name before it is saved", () => {
    expect(displayFilename(initDocumentSession(emptyDesign()))).toBe("untitled.ptsb");
  });

  it("handles Windows separators in the displayed name", () => {
    const session = documentSessionReducer(fresh(), {
      type: "opened",
      design: withBlower(),
      path: "C:\\Users\\chris\\Designs\\wing-b.ptsb"
    });
    expect(displayFilename(session)).toBe("wing-b.ptsb");
  });
});
