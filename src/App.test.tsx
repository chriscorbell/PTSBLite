import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Vec3 } from "@/types";
import type { ViewportHandle, ViewportProps } from "@/renderer/Viewport";
import type { Platform } from "@/platform/types";

// The real Viewport builds a WebGLRenderer, which happy-dom cannot provide. It
// is also the only part of the tree that needs a GPU, so mocking just this
// component leaves every other piece of the app under test for real. The mock
// captures its props so tests can drive placement the way the 3D canvas would.
const viewport = vi.hoisted(() => ({
  props: null as ViewportProps | null,
  handle: { zoomBy: vi.fn(), resetView: vi.fn() } satisfies ViewportHandle
}));

vi.mock("@/renderer/Viewport", () => ({
  Viewport: (props: ViewportProps) => {
    viewport.props = props;
    // React 19 passes `ref` as an ordinary prop. Fulfilling it is what lets a
    // test observe the camera commands at all: they used to travel over an
    // untyped window CustomEvent that nothing could see (issue #19).
    if (props.ref && typeof props.ref === "object") {
      (props.ref as { current: ViewportHandle | null }).current = viewport.handle;
    }
    return null;
  }
}));

afterEach(() => {
  viewport.props = null;
  viewport.handle.zoomBy.mockClear();
  viewport.handle.resetView.mockClear();
  vi.restoreAllMocks();
});

async function renderApp() {
  const App = (await import("@/App")).default;
  const utils = render(<App platform={stubPlatform()} />);
  await act(async () => {
    await Promise.resolve();
  });
  // Every visit opens on the welcome setup form; these tests are about the
  // editor behind it, so accept the defaults.
  fireEvent.click(screen.getByRole("button", { name: /Create design/ }));
  return utils;
}

function stubPlatform(): Platform {
  return {
    session: {
      load: () => null,
      store: () => ({ ok: true }),
      clear: () => undefined,
      preserveUnreadable: () => undefined
    },
    savePdf: vi.fn().mockResolvedValue({}),
    openExternal: vi.fn()
  };
}

/** Click the grid at `cell`, as the 3D viewport would on a left click. */
function clickCell(cell: Vec3) {
  const onPlace = viewport.props?.onPlace;
  if (!onPlace) throw new Error("Viewport received no onPlace handler");
  act(() => {
    onPlace(cell);
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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Auto-build$/ })).toBeTruthy();
    });
  });
});

describe("left rail accessibility", () => {
  it("gives every icon-only rail control an accessible name", async () => {
    await renderApp();

    // These carried their label only in a hover tooltip, which no assistive
    // technology reads and no keyboard user can summon (issue #33).
    expect(screen.getByRole("button", { name: "Build" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear All Parts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear All Obstacles" })).toBeTruthy();
  });

  it("reports which tool is active rather than only colouring it", async () => {
    await renderApp();

    const select = screen.getByRole("button", { name: "Select" });
    expect(select.getAttribute("aria-pressed")).toBe("true");

    fireEvent.keyDown(window, { key: "o" });
    expect(screen.getByRole("button", { name: "Obstacle" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(select.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the closed build drawer out of the tab order", async () => {
    const { container } = await renderApp();

    // aria-hidden alone left these focusable, which is a violation rather than
    // a preference: hidden content must not be reachable by Tab (issue #47).
    const drawer = container.querySelector('[role="menu"]');
    expect(drawer).toBeTruthy();
    expect(drawer?.hasAttribute("inert")).toBe(true);
    expect(drawer?.hasAttribute("aria-hidden")).toBe(false);
  });
});

describe("camera controls", () => {
  it("reaches the viewport through its typed handle", async () => {
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(viewport.handle.zoomBy).toHaveBeenCalledWith(-0.2);

    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(viewport.handle.zoomBy).toHaveBeenCalledWith(0.25);

    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(viewport.handle.resetView).toHaveBeenCalledTimes(1);
  });

  it("dispatches nothing on window", async () => {
    // The regression: these commands were global CustomEvents, invisible to
    // TypeScript and to this suite, between two components that are siblings.
    const dispatch = vi.spyOn(window, "dispatchEvent");
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));

    const custom = dispatch.mock.calls.filter(([event]) => event.type.startsWith("ptsb-"));
    expect(custom).toEqual([]);
  });
});
