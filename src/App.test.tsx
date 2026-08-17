import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Vec3 } from "@/types";
import type { ViewportProps } from "@/renderer/Viewport";
import type { Platform } from "@/platform/types";

// The real Viewport builds a WebGLRenderer, which happy-dom cannot provide. It
// is also the only part of the tree that needs a GPU, so mocking just this
// component leaves every other piece of the app under test for real. The mock
// captures its props so tests can drive placement the way the 3D canvas would.
const viewport = vi.hoisted(() => ({
  props: null as ViewportProps | null
}));

vi.mock("@/renderer/Viewport", () => ({
  Viewport: (props: ViewportProps) => {
    viewport.props = props;
    return null;
  }
}));

afterEach(() => {
  viewport.props = null;
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
    savePdf: vi.fn().mockResolvedValue({})
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

describe("penetrable obstacles", () => {
  it("offers the kind selector while the obstacle tool is armed, and commits the choice", async () => {
    await renderApp();

    // No selector until the tool is armed.
    expect(screen.queryByRole("button", { name: "Penetrable" })).toBeNull();
    fireEvent.keyDown(window, { key: "o" });
    fireEvent.click(screen.getByRole("button", { name: "Penetrable" }));

    clickCell([0, 0, 0]);
    clickCell([2, 0, 2]);
    act(() => placeButton()?.click());

    const obstacles = viewport.props?.scene.obstacles ?? [];
    expect(obstacles).toHaveLength(1);
    expect(obstacles[0]).toMatchObject({ penetrable: true });

    // The next draft keeps the choice; switching back is explicit.
    expect(
      screen
        .getByRole<HTMLButtonElement>("button", { name: "Penetrable" })
        .getAttribute("aria-pressed")
    ).toBe("true");
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

describe("a two-floor design", () => {
  it("gives the viewport the doubled volume and the separator level", async () => {
    await renderApp();

    // Reopen the setup form via File → New and ask for a second floor.
    fireEvent.click(screen.getByRole("button", { name: /^File/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New" }));
    fireEvent.click(screen.getByLabelText("Add 2nd floor"));
    fireEvent.click(screen.getByRole("button", { name: /Create design/ }));

    // Default height 30 per floor: 61 ft in all, slab starting at Y = 30.
    expect(viewport.props?.buildArea).toMatchObject({ height: 61 });
    expect(viewport.props?.separatorY).toBe(30);
  });

  it("passes no separator for a single-floor design", async () => {
    await renderApp();
    expect(viewport.props?.buildArea).toMatchObject({ height: 30 });
    expect(viewport.props?.separatorY).toBeNull();
    // No second floor: no selector, and the floor keys do nothing.
    expect(screen.queryByRole("button", { name: "Floor 2" })).toBeNull();
    fireEvent.keyDown(window, { key: "2" });
    expect(viewport.props?.activeElevation).toBe(0);
  });

  it("jumps the placement plane between floors by key and by selector", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^File/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New" }));
    fireEvent.click(screen.getByLabelText("Add 2nd floor"));
    fireEvent.click(screen.getByRole("button", { name: /Create design/ }));

    fireEvent.keyDown(window, { key: "2" });
    expect(viewport.props?.activeElevation).toBe(31);
    expect(viewport.props?.activeFloor).toBe(2);
    // The camera follows the floor, or the new plane is edge-on and unclickable.
    expect(viewport.props?.focusY).toBe(31);

    fireEvent.click(screen.getByRole("button", { name: "Floor 1" }));
    expect(viewport.props?.activeElevation).toBe(0);
    expect(viewport.props?.activeFloor).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Floor 2" }));
    expect(viewport.props?.activeElevation).toBe(31);
  });

  it("hands the viewport the plenum bands a design declares", async () => {
    await renderApp();
    expect(viewport.props?.plenumBands).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: /^File/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New" }));
    fireEvent.click(screen.getByLabelText("Add 2nd floor"));
    fireEvent.click(screen.getByLabelText("Plenum (drop ceiling)"));
    fireEvent.change(screen.getByLabelText(/plenum height/i), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /Create design/ }));

    // Default 30 ft floors: bands under the slab at 30 and at floor 2's top.
    expect(viewport.props?.plenumBands).toEqual([
      { floor: 1, base: 26, top: 30 },
      { floor: 2, base: 57, top: 61 }
    ]);
  });

  it("shows the elevation beside the armed tool", async () => {
    await renderApp();

    fireEvent.keyDown(window, { key: "o" });
    fireEvent.keyDown(window, { key: "]" });
    fireEvent.keyDown(window, { key: "]" });

    expect(screen.getByText(/EL 2 ft/)).toBeTruthy();
  });
});

describe("Auto-Build", () => {
  it("paints the routing state before the search blocks the thread", async () => {
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: /^Auto-Build$/ }));

    // The regression this guards: the search used to run synchronously in the
    // same tick, so React batched the pending state away and it never rendered.
    expect(screen.getByRole("button", { name: /^Routing/ })).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Auto-Build$/ })).toBeTruthy();
    });
  });

  it("clears exactly the parts a run added, and only offers to when there are some", async () => {
    await renderApp();
    const partCount = () =>
      (document.querySelector(".status-bar")?.textContent ?? "").match(/PARTS(\d+)/)?.[1];
    const clearButton = () =>
      screen.getByRole<HTMLButtonElement>("button", { name: "Clear Auto-Build" });

    // Nothing routed yet: the rail button is present but cannot be used.
    expect(clearButton().disabled).toBe(true);

    // A blower and its two terminals, placed the way the 3D canvas would.
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(screen.getByRole("button", { name: "Blower Unit" }));
    clickCell([0, 0, 0]);
    fireEvent.click(screen.getByRole("button", { name: "Terminal Station" }));
    clickCell([0, 1, 0]); // Terminal 1, flush on the blower's upward outlet.
    clickCell([6, 0, 0]); // Terminal 2, free-placed down the run.
    expect(partCount()).toBe("3");

    fireEvent.click(screen.getByRole("button", { name: /^Auto-Build$/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Auto-Build$/ })).toBeTruthy();
    });
    const routed = Number(partCount());
    expect(routed).toBeGreaterThan(3);

    // Clearing asks first, like the rail's other destructive buttons.
    expect(clearButton().disabled).toBe(false);
    fireEvent.click(clearButton());
    const dialog = screen.getByRole("dialog", { name: "Clear Auto-Build" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear Auto-Build" }));

    // The manual parts survive; the routed tubes and bends are gone, undoably.
    expect(partCount()).toBe("3");
    act(() => undoButton().click());
    expect(Number(partCount())).toBe(routed);
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
