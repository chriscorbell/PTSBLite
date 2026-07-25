import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeDesign } from "@/domain/design-file";
import { designFromScene } from "@/domain/design-state";
import type { Vec3 } from "@/types";
import type { ViewportProps } from "@/renderer/Viewport";

// The real Viewport builds a WebGLRenderer, which happy-dom cannot provide. It
// is also the only part of the tree that needs a GPU, so mocking just this
// component leaves every other piece of the app under test for real. The mock
// captures its props so tests can drive placement the way the 3D canvas would.
const viewport = vi.hoisted(() => ({ props: null as ViewportProps | null }));

vi.mock("@/renderer/Viewport", () => ({
  Viewport: (props: ViewportProps) => {
    viewport.props = props;
    return null;
  }
}));

afterEach(() => {
  viewport.props = null;
  delete (window as { ptsbuilder?: unknown }).ptsbuilder;
  vi.restoreAllMocks();
});

async function renderApp() {
  const App = (await import("@/App")).default;
  const utils = render(<App />);
  // The app queries persisted settings on mount; let that microtask settle so
  // the first assertion is not racing a state update.
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

/** Click the grid at `cell`, as the 3D viewport would on a left click. */
function clickCell(cell: Vec3) {
  const onPlace = viewport.props?.onPlace;
  if (!onPlace) throw new Error("Viewport received no onPlace handler");
  act(() => {
    onPlace(cell, new MouseEvent("click"));
  });
}

const undoButton = () => screen.getByRole("button", { name: "Undo" });
const redoButton = () => screen.getByRole("button", { name: "Redo" });

// The toolbar buttons mirror the history stack depths, which is the state these
// tests are really about. Plain `disabled` checks avoid pulling in jest-dom.
const canUndo = () => !(undoButton() as HTMLButtonElement).disabled;
const canRedo = () => !(redoButton() as HTMLButtonElement).disabled;

/** The obstacle HUD's commit button, present only once a draft has a footprint. */
const placeButton = () => screen.queryByRole("button", { name: "Place" });

describe("tool selection by keyboard", () => {
  it("switches tools with the documented shortcuts and reports the active tool", async () => {
    await renderApp();

    // Cursor is the default, and the tool pill is hidden while it is active.
    expect(screen.queryByText("Obstacle volume")).not.toBeTruthy();

    fireEvent.keyDown(window, { key: "o" });
    expect(screen.getByText("Obstacle volume")).toBeTruthy();

    fireEvent.keyDown(window, { key: "x" });
    expect(screen.getByText("Erase")).toBeTruthy();

    fireEvent.keyDown(window, { key: "v" });
    expect(screen.queryByText("Erase")).not.toBeTruthy();
  });

  it("returns to the cursor tool on Escape", async () => {
    await renderApp();

    fireEvent.keyDown(window, { key: "o" });
    expect(screen.getByText("Obstacle volume")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Obstacle volume")).not.toBeTruthy();
  });

  it("ignores shortcuts typed into text inputs", async () => {
    await renderApp();
    const input = document.createElement("input");
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: "o" });

    expect(screen.queryByText("Obstacle volume")).not.toBeTruthy();
    input.remove();
  });
});

describe("undo and redo history", () => {
  it("records a placement as one undoable step and restores it on redo", async () => {
    await renderApp();

    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);

    // Obstacles take two clicks: base corner, then the opposite corner.
    fireEvent.keyDown(window, { key: "o" });
    clickCell([0, 0, 0]);
    clickCell([2, 0, 2]);
    act(() => placeButton()?.click());

    expect(canUndo()).toBe(true);
    expect(canRedo()).toBe(false);

    fireEvent.keyDown(window, { key: "v" });
    act(() => undoButton().click());

    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(true);

    act(() => redoButton().click());

    expect(canUndo()).toBe(true);
    expect(canRedo()).toBe(false);
  });

  it("undoes with Cmd/Ctrl+Z and redoes with Shift+Cmd/Ctrl+Z", async () => {
    await renderApp();

    fireEvent.keyDown(window, { key: "o" });
    clickCell([0, 0, 0]);
    clickCell([1, 0, 1]);
    act(() => placeButton()?.click());
    expect(canUndo()).toBe(true);

    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(true);

    fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });
    expect(canUndo()).toBe(true);
  });

  it("clears a new edit's redo branch", async () => {
    await renderApp();

    fireEvent.keyDown(window, { key: "o" });
    clickCell([0, 0, 0]);
    clickCell([1, 0, 1]);
    act(() => placeButton()?.click());
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(canRedo()).toBe(true);

    // A fresh edit after an undo must discard the redo branch.
    clickCell([4, 0, 4]);
    clickCell([5, 0, 5]);
    act(() => placeButton()?.click());

    expect(canRedo()).toBe(false);
  });
});

describe("in-flight interactions", () => {
  it("cancels a half-built obstacle when the tool changes", async () => {
    await renderApp();

    fireEvent.keyDown(window, { key: "o" });
    clickCell([0, 0, 0]);
    clickCell([2, 0, 2]);
    expect(placeButton()).toBeTruthy();

    fireEvent.keyDown(window, { key: "x" });

    expect(placeButton()).not.toBeTruthy();
    expect(canUndo()).toBe(false);
  });

  it("cancels a half-built obstacle on Escape without committing it", async () => {
    await renderApp();

    fireEvent.keyDown(window, { key: "o" });
    clickCell([0, 0, 0]);
    clickCell([2, 0, 2]);
    expect(placeButton()).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(placeButton()).not.toBeTruthy();
    expect(canUndo()).toBe(false);
  });
});

describe("opening a design", () => {
  // handleOpen still guards unsaved changes with window.confirm, which happy-dom
  // does not implement (#6 tracks replacing it with the in-app ConfirmDialog that
  // every other destructive action already uses). Stub it until then.
  function stubConfirm(answer: boolean) {
    const confirm = vi.fn().mockReturnValue(answer);
    Object.defineProperty(window, "confirm", { value: confirm, configurable: true, writable: true });
    return confirm;
  }

  function stubOpenDesign(contents: string) {
    const openDesign = vi.fn().mockResolvedValue({
      canceled: false,
      filePath: "/tmp/incoming.ptsb",
      contents
    });
    (window as { ptsbuilder?: unknown }).ptsbuilder = {
      getSettings: vi.fn().mockResolvedValue({ data: null }),
      openDesign,
      onUpdateDownloaded: vi.fn().mockReturnValue(() => undefined),
      getPendingUpdate: vi.fn().mockResolvedValue(null)
    };
    return openDesign;
  }

  function chooseFileOpen() {
    fireEvent.click(screen.getByRole("button", { name: /^File/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Open/ }));
  }

  it("leaves the current design alone when the unsaved-changes prompt is declined", async () => {
    const openDesign = stubOpenDesign("{}");
    const confirm = stubConfirm(false);
    await renderApp();

    fireEvent.keyDown(window, { key: "o" });
    clickCell([0, 0, 0]);
    clickCell([2, 0, 2]);
    act(() => placeButton()?.click());
    expect(canUndo()).toBe(true);

    chooseFileOpen();

    expect(confirm).toHaveBeenCalled();
    expect(openDesign).not.toHaveBeenCalled();
    expect(canUndo()).toBe(true);
  });

  it("discards the undo history of the design being replaced", async () => {
    const incoming = serializeDesign(
      designFromScene(
        { parts: [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }], obstacles: [] },
        { filename: "incoming.ptsb", revision: "2" }
      )
    );
    stubOpenDesign(JSON.stringify(incoming));
    stubConfirm(true);

    await renderApp();

    // Build up some history first, so we can prove it gets dropped.
    fireEvent.keyDown(window, { key: "o" });
    clickCell([0, 0, 0]);
    clickCell([2, 0, 2]);
    act(() => placeButton()?.click());
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(true);

    chooseFileOpen();

    // Both stacks belong to the previous document and must not survive it.
    await waitFor(() => {
      expect(canRedo()).toBe(false);
    });
    expect(canUndo()).toBe(false);
  });
});

describe("the placement ghost", () => {
  // The ghost is derived during render rather than stored in state. These assert
  // on the prop the Viewport actually receives, which is the whole contract.
  const ghost = () => viewport.props?.ghost ?? null;

  function hover(cell: Vec3) {
    const onHover = viewport.props?.onHover;
    if (!onHover) throw new Error("Viewport received no onHover handler");
    act(() => onHover(cell));
  }

  it("shows no ghost for the cursor tool", async () => {
    await renderApp();
    hover([0, 0, 0]);

    expect(ghost()).toBeNull();
  });

  it("tracks the hovered cell while placing an obstacle", async () => {
    await renderApp();
    fireEvent.keyDown(window, { key: "o" });
    clickCell([0, 0, 0]);

    hover([3, 0, 4]);
    expect(ghost()).toMatchObject({ type: "obstacle" });

    // Derived, so moving the cursor re-renders it with no effect round-trip.
    hover([5, 0, 6]);
    expect(ghost()).toMatchObject({ type: "obstacle", max: [5, 0, 6] });
  });

  it("clears the ghost when the tool changes", async () => {
    await renderApp();
    fireEvent.keyDown(window, { key: "o" });
    // The obstacle ghost only exists once a first corner anchors the draft.
    clickCell([0, 0, 0]);
    hover([2, 0, 2]);
    expect(ghost()).not.toBeNull();

    fireEvent.keyDown(window, { key: "v" });
    expect(ghost()).toBeNull();
  });

  it("clears the ghost on Escape", async () => {
    await renderApp();
    fireEvent.keyDown(window, { key: "o" });
    // The obstacle ghost only exists once a first corner anchors the draft.
    clickCell([0, 0, 0]);
    hover([2, 0, 2]);
    expect(ghost()).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(ghost()).toBeNull();
  });
});

describe("auto-build feedback", () => {
  it("paints the routing state before the search blocks the thread", async () => {
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: /^Auto-build$/ }));

    // The regression this guards: the search used to run synchronously in the
    // same tick, so React batched the pending state away and it never rendered.
    expect(screen.getByRole("button", { name: /^Routing/ })).toBeTruthy();
    expect(viewport.props?.autoBuildPulse).toBe(true);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Auto-build$/ })).toBeTruthy();
    });
    expect(viewport.props?.autoBuildPulse).toBe(false);
  });
});
