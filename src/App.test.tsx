import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Vec3 } from "@/types";
import type { ViewportProps } from "@/renderer/Viewport";
import type { Platform } from "@/platform/types";
import { DEFAULT_ROOM } from "@/domain/sparse-grid";
import { MAX_RUN_HEIGHT_FEET } from "@/domain/pathfinder";

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

/** Arm the blower, which has no keyboard shortcut: it lives in the Build drawer. */
function armBlower() {
  fireEvent.click(screen.getByRole("button", { name: "Build" }));
  fireEvent.click(screen.getByRole("button", { name: "Blower Unit" }));
}

describe("tool selection by keyboard", () => {
  it("switches tools with the documented shortcuts and reports the active tool", async () => {
    await renderApp();

    // Cursor is the default, and the tool pill is hidden while it is active.
    expect(screen.queryByText("Obstacle volume")).not.toBeTruthy();

    fireEvent.keyDown(window, { key: "o" });
    expect(screen.getByText("Obstacle volume")).toBeTruthy();

    // Scoped to the tool pill: the controls legend also names the erase tool,
    // and it is on screen whatever tool is armed.
    const pill = { selector: ".active-tool-bar__tool" };
    fireEvent.keyDown(window, { key: "x" });
    expect(screen.getByText("Erase", pill)).toBeTruthy();

    fireEvent.keyDown(window, { key: "v" });
    expect(screen.queryByText("Erase", pill)).not.toBeTruthy();
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

    // Reopen the setup form via New and ask for a second floor.
    fireEvent.click(screen.getByRole("button", { name: /^New$/ }));
    fireEvent.click(screen.getByLabelText(/Add 2nd floor/));
    fireEvent.click(screen.getByRole("button", { name: /Create design/ }));

    // The slab starts at the top of floor 1, and the viewport's volume is the
    // fixed build area regardless — floors live in the room, not the volume.
    const { width, depth, height } = DEFAULT_ROOM;
    expect(viewport.props?.buildArea).toMatchObject({ width: 300, depth: 300, height: 100 });
    expect(viewport.props?.separatorY).toBe(height);
    expect(viewport.props?.roomRect).toEqual({
      xMin: -width / 2,
      xMax: width / 2,
      zMin: -depth / 2,
      zMax: depth / 2
    });
    // Four penetrable walls, spanning both floors of the room and the slab.
    expect(viewport.props?.roomWalls).toHaveLength(4);
    expect(viewport.props?.roomWalls?.every((w) => w.max[1] === height * 2)).toBe(true);
  });

  it("passes no separator for a single-floor design", async () => {
    await renderApp();
    expect(viewport.props?.buildArea).toMatchObject({ height: 100 });
    expect(viewport.props?.separatorY).toBeNull();
    // No second floor: no selector, and the floor keys do nothing.
    expect(screen.queryByRole("button", { name: "Floor 2" })).toBeNull();
    fireEvent.keyDown(window, { key: "2" });
    expect(viewport.props?.activeElevation).toBe(0);
  });

  it("jumps the placement plane between floors by key and by selector", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^New$/ }));
    fireEvent.click(screen.getByLabelText(/Add 2nd floor/));
    fireEvent.click(screen.getByRole("button", { name: /Create design/ }));

    // Floor 2 starts one slab above floor 1's ceiling.
    const floorTwo = DEFAULT_ROOM.height + 1;
    fireEvent.keyDown(window, { key: "2" });
    expect(viewport.props?.activeElevation).toBe(floorTwo);
    expect(viewport.props?.activeFloor).toBe(2);
    // The camera follows the floor, or the new plane is edge-on and unclickable.
    expect(viewport.props?.focusY).toBe(floorTwo);

    fireEvent.click(screen.getByRole("button", { name: "Floor 1" }));
    expect(viewport.props?.activeElevation).toBe(0);
    expect(viewport.props?.activeFloor).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Floor 2" }));
    expect(viewport.props?.activeElevation).toBe(floorTwo);
  });

  it("hands the viewport the plenum bands a design declares", async () => {
    await renderApp();
    expect(viewport.props?.plenumBands).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: /^New$/ }));
    fireEvent.click(screen.getByLabelText(/Add 2nd floor/));
    fireEvent.click(screen.getByLabelText("Plenum (drop ceiling)"));
    fireEvent.change(screen.getByLabelText(/plenum height/i), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /Create design/ }));

    // A 4 ft band at the top of each floor: under the slab, and under the
    // room's own ceiling.
    const perFloor = DEFAULT_ROOM.height;
    const floorTwoBase = perFloor + 1;
    expect(viewport.props?.plenumBands).toEqual([
      { floor: 1, base: perFloor - 4, top: perFloor },
      { floor: 2, base: floorTwoBase + perFloor - 4, top: floorTwoBase + perFloor }
    ]);
  });

  it("labels heights only while a placement tool is armed", async () => {
    await renderApp();

    // Nothing armed: no markers, and no ghost height to label.
    expect(viewport.props?.heightMarkers).toEqual([]);
    expect(viewport.props?.ghostHeight).toBeNull();

    armBlower();
    fireEvent.keyDown(window, { key: "]" });
    expect(viewport.props?.ghostHeight).toBe(1);

    // Back to the cursor and the scene goes quiet again.
    fireEvent.keyDown(window, { key: "v" });
    expect(viewport.props?.heightMarkers).toEqual([]);
    expect(viewport.props?.ghostHeight).toBeNull();
  });

  it("ticks the View menu to match the screen, and lets the tick be driven", async () => {
    await renderApp();
    const openViewMenu = () => fireEvent.click(screen.getByRole("button", { name: /^View$/ }));
    const markersItem = () => screen.getByRole("menuitemcheckbox", { name: /Height markers/ });

    // Nothing armed, so nothing labelled, and the menu reads that back.
    openViewMenu();
    expect(markersItem().getAttribute("aria-checked")).toBe("false");

    // Ticking it overrides the app: markers on with only the cursor armed.
    fireEvent.click(markersItem());
    expect(viewport.props?.heightMarkers?.length).toBeGreaterThan(0);

    // Arming the obstacle tool is the next automatic toggle, so the app has the
    // say again — and the tick follows what it decided rather than sitting on
    // the old override.
    fireEvent.keyDown(window, { key: "o" });
    openViewMenu();
    expect(markersItem().getAttribute("aria-checked")).toBe("true");

    // Which can be overridden in turn, the other way.
    fireEvent.click(markersItem());
    expect(viewport.props?.heightMarkers).toEqual([]);

    // Back to the cursor: another automatic toggle, and markers go quiet on
    // their own rather than staying off because someone said so earlier.
    fireEvent.keyDown(window, { key: "v" });
    openViewMenu();
    expect(markersItem().getAttribute("aria-checked")).toBe("false");
    fireEvent.click(markersItem());
    expect(viewport.props?.heightMarkers?.length).toBeGreaterThan(0);
  });

  it("shows the elevation beside the armed tool", async () => {
    await renderApp();

    armBlower();
    fireEvent.keyDown(window, { key: "]" });
    fireEvent.keyDown(window, { key: "]" });

    expect(screen.getByText(/EL 2 ft/)).toBeTruthy();
  });

  it("offers the elevation keys only where they still do something", async () => {
    // The client's complaint: the obstacle tool advertised [ and ] in both the
    // controls legend and the tool pill, after its volume stopped following the
    // placement plane.
    await renderApp();
    const legend = () => within(document.getElementById("controls-legend-list") as HTMLElement);

    armBlower();
    expect(legend().queryByText("Elevation")).toBeTruthy();
    expect(screen.queryByText("elevation")).toBeTruthy();

    fireEvent.keyDown(window, { key: "o" });
    expect(legend().queryByText("Elevation")).toBeNull();
    expect(screen.queryByText("elevation")).toBeNull();
    // Where the volume will stand is still reported; only the dead keys go.
    expect(screen.getByText(/EL 0 ft/)).toBeTruthy();

    // Back to a tool the keys move, and they are offered again.
    armBlower();
    expect(legend().queryByText("Elevation")).toBeTruthy();
  });

  it("offers the rotate keys only where they still turn something", async () => {
    // The client's second pass over the same complaint: having lost [ and ],
    // the obstacle tool went on advertising R / ⇧R, which turns nothing on a
    // volume drawn corner to corner.
    await renderApp();
    const legend = () => within(document.getElementById("controls-legend-list") as HTMLElement);

    armBlower();
    expect(legend().queryByText("Rotate")).toBeTruthy();
    expect(screen.queryByText("rotate")).toBeTruthy();

    fireEvent.keyDown(window, { key: "o" });
    expect(legend().queryByText("Rotate")).toBeNull();
    expect(screen.queryByText("rotate")).toBeNull();

    // Back to a tool the keys turn, and they are offered again.
    armBlower();
    expect(legend().queryByText("Rotate")).toBeTruthy();
  });

  it("reads the floor, not the plane, while the obstacle tool is armed", async () => {
    // An obstacle stands on the floor of the storey being worked on, so the
    // pill would be lying if it echoed a plane the volume ignores.
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^New$/ }));
    fireEvent.click(screen.getByLabelText(/Add 2nd floor/));
    fireEvent.click(screen.getByRole("button", { name: /Create design/ }));

    fireEvent.keyDown(window, { key: "o" });
    fireEvent.keyDown(window, { key: "]" });
    fireEvent.keyDown(window, { key: "]" });
    expect(screen.getByText(/EL 0 ft/)).toBeTruthy();

    // Upstairs it reads that floor's own floor.
    fireEvent.click(screen.getByRole("button", { name: "Floor 2" }));
    expect(screen.getByText(new RegExp(`EL ${DEFAULT_ROOM.height + 1} ft`))).toBeTruthy();
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

  it("says where it carried the run, in the client's words", async () => {
    // Two lines he wrote himself. The plenum one whenever the design has a
    // plenum, and the 12 ft one only when the ghost ceiling is what capped the
    // route, so the visitor knows a taller rise is theirs to build by hand. A
    // third, ours, for a system built where there is no ceiling at all.
    const routeAThreePartSystem = async (originX = 0, originZ = 0) => {
      fireEvent.click(screen.getByRole("button", { name: "Build" }));
      fireEvent.click(screen.getByRole("button", { name: "Blower Unit" }));
      clickCell([originX, 0, originZ]);
      fireEvent.click(screen.getByRole("button", { name: "Terminal Station" }));
      clickCell([originX, 1, originZ]);
      clickCell([originX + 12, 0, originZ]);
      fireEvent.click(screen.getByRole("button", { name: /^Auto-Build$/ }));
      await waitFor(() => {
        expect(screen.getByText(/Auto-Build complete/)).toBeTruthy();
      });
    };

    // The form's own defaults: a 12 ft room with no plenum, which runs under
    // its own ceiling and needs no explaining.
    await renderApp();
    await routeAThreePartSystem();
    expect(screen.queryByText(/favors plenum/)).not.toBeTruthy();
    expect(screen.queryByText(/stops at/)).not.toBeTruthy();

    // The same system in a room with a plenum.
    fireEvent.click(screen.getByRole("button", { name: /^New$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start new design" }));
    fireEvent.click(screen.getByLabelText("Plenum (drop ceiling)"));
    fireEvent.click(screen.getByRole("button", { name: /Create design/ }));
    await routeAThreePartSystem();

    expect(screen.getByText("Auto-build favors plenum when available")).toBeTruthy();
    expect(screen.queryByText(/stops at/)).not.toBeTruthy();

    // And in a 30 ft room with no plenum, where 12 ft is as high as it goes.
    fireEvent.click(screen.getByRole("button", { name: /^New$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start new design" }));
    fireEvent.change(screen.getByLabelText("Height"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /Create design/ }));
    await routeAThreePartSystem();

    expect(screen.queryByText(/favors plenum/)).not.toBeTruthy();
    expect(
      screen.getByText(
        `Autobuild stops at ${MAX_RUN_HEIGHT_FEET}ft - please try building manually if you need more rise.`
      )
    ).toBeTruthy();

    // And the same system built well clear of a 40 x 60 room that has a plenum.
    // Nothing stands under a ceiling and nothing routes through one, so the
    // plenum does not apply however good it would have been (ADR-0024).
    fireEvent.click(screen.getByRole("button", { name: /^New$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start new design" }));
    fireEvent.click(screen.getByLabelText("Plenum (drop ceiling)"));
    fireEvent.click(screen.getByRole("button", { name: /Create design/ }));
    await routeAThreePartSystem(60, 60);

    expect(screen.queryByText(/favors plenum/)).not.toBeTruthy();
    expect(
      screen.getByText(`Nothing under a ceiling - auto-build runs at ${MAX_RUN_HEIGHT_FEET}ft.`)
    ).toBeTruthy();
  });

  it("clears exactly the parts a run added, and only offers to when there are some", async () => {
    await renderApp();
    const partCount = () =>
      (document.querySelector(".status-bar")?.textContent ?? "").match(/PARTS(\d+)/)?.[1];
    // The clearing actions live in the erase drawer, which has to be opened.
    const clearButton = () => {
      fireEvent.click(screen.getByRole("button", { name: "Erase" }));
      return screen.getByRole<HTMLButtonElement>("button", { name: /Clear Auto-Build/ });
    };

    // Nothing routed yet: the action is listed but cannot be used.
    expect(clearButton().disabled).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });

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

    // Clearing asks first, like the drawer's other destructive actions.
    const armed = clearButton();
    expect(armed.disabled).toBe(false);
    fireEvent.click(armed);
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
    expect(screen.getByRole("button", { name: "Obstacle" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erase" })).toBeTruthy();

    // The clearing actions moved into the erase drawer, where they carry a
    // visible label rather than an icon and a tooltip.
    fireEvent.click(screen.getByRole("button", { name: "Erase" }));
    expect(screen.getByRole("button", { name: /Clear all parts/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Clear all obstacles/ })).toBeTruthy();
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
