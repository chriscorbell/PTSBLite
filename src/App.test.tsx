import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { serializeDesign } from "@/domain/design-file";
import { designFromScene } from "@/domain/design-state";
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
  platform = null;
  vi.restoreAllMocks();
});

async function renderApp() {
  const App = (await import("@/App")).default;
  const utils = render(<App platform={platform ?? stubPlatform()} />);
  // The app queries persisted settings on mount; let that microtask settle so
  // the first assertion is not racing a state update.
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

/**
 * The host the next `renderApp()` will be given. Set by `stubBridge`, which most
 * tests do not need — those get the defaults below.
 */
let platform: Platform | null = null;

/**
 * Install a fake host. App queries settings and pending updates on mount, so
 * every stub needs those present or the component fails to render for reasons
 * unrelated to the test.
 *
 * Override keys keep the old bridge names because that is what the assertions
 * read; what changed is that they are wired into a `Platform` rather than onto
 * `window`.
 */
type BridgeStubs = {
  getSettings: Mock<() => Promise<{ data: unknown; error?: string }>>;
  setSettings: Mock<(json: string) => Promise<{ ok: boolean; error?: string }>>;
  saveDesign: Mock<
    (request: { json: string; filePath?: string | null }) => Promise<{
      canceled: boolean;
      filePath: string | null;
      error?: string;
    }>
  >;
  openDesign: Mock<
    () => Promise<{
      canceled: boolean;
      filePath: string | null;
      contents: string | null;
      error?: string;
    }>
  >;
  exportQuote: Mock<(bytes: Uint8Array, name: string) => Promise<{ canceled: boolean }>>;
  onUpdateDownloaded: Mock<(cb: (info: { version: string }) => void) => () => void>;
  getPendingUpdate: Mock<() => Promise<{ version: string } | null>>;
  onCloseRequested: (cb: () => void) => () => void;
  confirmClose: Mock<() => Promise<void>>;
};

function stubBridge(overrides: Partial<BridgeStubs> = {}): BridgeStubs {
  const stubs: BridgeStubs = {
    getSettings: vi.fn().mockResolvedValue({ data: null }),
    setSettings: vi.fn().mockResolvedValue({ ok: true }),
    saveDesign: vi.fn().mockResolvedValue({ canceled: true, filePath: null }),
    openDesign: vi.fn().mockResolvedValue({ canceled: true, filePath: null, contents: null }),
    exportQuote: vi.fn().mockResolvedValue({ canceled: false }),
    onUpdateDownloaded: vi.fn().mockReturnValue(() => undefined),
    getPendingUpdate: vi.fn().mockResolvedValue(null),
    onCloseRequested: () => () => undefined,
    confirmClose: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };

  platform = {
    chrome: { titleBarInset: 0, titleBarRightInset: 0 },
    documents: {
      kind: "files",
      save: async (request) => {
        const r = await stubs.saveDesign({ json: request.json, filePath: request.path });
        return { canceled: r.canceled, path: r.filePath ?? null, error: r.error };
      },
      open: async () => {
        const r = await stubs.openDesign();
        return {
          canceled: r.canceled,
          path: r.filePath ?? null,
          contents: r.contents ?? null,
          error: r.error
        };
      }
    },
    settings: {
      load: async () => {
        const r = await stubs.getSettings();
        return { data: r.data, error: r.error };
      },
      save: async (json) => stubs.setSettings(json)
    },
    savePdf: async (bytes, name) => stubs.exportQuote(bytes, name),
    openExternal: vi.fn(),
    updates: {
      check: vi.fn().mockResolvedValue({ status: "up-to-date" }),
      getPending: () => stubs.getPendingUpdate(),
      quitAndInstall: vi.fn().mockResolvedValue(undefined),
      onDownloaded: (cb) => stubs.onUpdateDownloaded(cb)
    },
    closeGate: {
      onRequested: (cb) => stubs.onCloseRequested(cb),
      confirm: () => stubs.confirmClose()
    }
  };
  return stubs;
}

/** A host with every default, for the tests that do not care which. */
function stubPlatform(): Platform {
  stubBridge();
  return platform as Platform;
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

describe("opening a design", () => {
  /** Answer the app's own unsaved-changes dialog. */
  function answerUnsavedPrompt(discard: boolean) {
    const dialog = screen.getByRole("dialog");
    const name = discard ? "Discard and open" : "Cancel";
    fireEvent.click(within(dialog).getByRole("button", { name }));
  }

  function stubOpenDesign(contents: string) {
    const openDesign = vi.fn().mockResolvedValue({
      canceled: false,
      filePath: "/tmp/incoming.ptsb",
      contents
    });
    stubBridge({ openDesign });
    return openDesign;
  }

  function chooseFileOpen() {
    fireEvent.click(screen.getByRole("button", { name: /^File/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Open/ }));
  }

  it("leaves the current design alone when the unsaved-changes prompt is declined", async () => {
    const openDesign = stubOpenDesign("{}");
    await renderApp();

    fireEvent.keyDown(window, { key: "o" });
    clickCell([0, 0, 0]);
    clickCell([2, 0, 2]);
    act(() => placeButton()?.click());
    expect(canUndo()).toBe(true);

    chooseFileOpen();
    answerUnsavedPrompt(false);

    expect(openDesign).not.toHaveBeenCalled();
    expect(canUndo()).toBe(true);
  });

  it("discards the undo history of the design being replaced", async () => {
    const incoming = serializeDesign(
      designFromScene(
        { parts: [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }], obstacles: [] },
        { filename: "incoming.ptsb", revision: "2" }
      ),
      "9.9.9"
    );
    stubOpenDesign(JSON.stringify(incoming));

    await renderApp();

    // Build up some history first, so we can prove it gets dropped.
    fireEvent.keyDown(window, { key: "o" });
    clickCell([0, 0, 0]);
    clickCell([2, 0, 2]);
    act(() => placeButton()?.click());
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(true);

    // No unsaved-changes prompt here, and that is the point: undoing back to
    // where the document was last saved makes it genuinely clean again, which a
    // dirty *counter* would have got wrong.
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

describe("saving a design", () => {
  function stubSaveDesign(filePath = "/designs/site.ptsb") {
    const saveDesign = vi.fn().mockResolvedValue({ canceled: false, filePath });
    stubBridge({ saveDesign });
    return saveDesign;
  }

  function chooseFileMenu(item: RegExp) {
    fireEvent.click(screen.getByRole("button", { name: /^File/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: item }));
  }

  function placeSomething() {
    fireEvent.keyDown(window, { key: "o" });
    clickCell([0, 0, 0]);
    clickCell([2, 0, 2]);
    act(() => placeButton()?.click());
  }

  it("prompts on the first save, then writes straight to the same file", async () => {
    // Save used to call showSaveDialog every time, so every save was a Save As
    // and the file on disk multiplied (issue #7).
    const saveDesign = stubSaveDesign();
    await renderApp();
    placeSomething();

    chooseFileMenu(/^Save$/);
    await waitFor(() => expect(saveDesign).toHaveBeenCalledTimes(1));
    expect(saveDesign.mock.calls[0][0]).toMatchObject({ filePath: null });

    placeSomething();
    chooseFileMenu(/^Save$/);
    await waitFor(() => expect(saveDesign).toHaveBeenCalledTimes(2));
    expect(saveDesign.mock.calls[1][0]).toMatchObject({ filePath: "/designs/site.ptsb" });
  });

  it("always prompts for Save As, even once the document has a home", async () => {
    const saveDesign = stubSaveDesign();
    await renderApp();
    placeSomething();

    chooseFileMenu(/^Save$/);
    await waitFor(() => expect(saveDesign).toHaveBeenCalledTimes(1));

    chooseFileMenu(/Save As/);
    await waitFor(() => expect(saveDesign).toHaveBeenCalledTimes(2));
    expect(saveDesign.mock.calls[1][0]).toMatchObject({ filePath: null });
  });

  it("shows the saved filename and marks unsaved work", async () => {
    stubSaveDesign();
    await renderApp();

    expect(screen.getByTitle("untitled.ptsb")).toBeTruthy();

    placeSomething();
    expect(screen.getByTitle("untitled.ptsb •")).toBeTruthy();

    chooseFileMenu(/^Save$/);
    await waitFor(() => expect(screen.getByTitle("site.ptsb")).toBeTruthy());
  });

  it("guards New behind a confirmation when there is unsaved work", async () => {
    stubBridge();
    await renderApp();
    placeSomething();
    expect(canUndo()).toBe(true);

    chooseFileMenu(/^New$/);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(canUndo()).toBe(true);

    chooseFileMenu(/^New$/);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Discard and start over" })
    );
    expect(canUndo()).toBe(false);
  });
});

describe("closing the window", () => {
  /** Capture the callback main would invoke when the user hits the close button. */
  function stubCloseHandshake() {
    let requestClose: (() => void) | null = null;
    const confirmClose = vi.fn().mockResolvedValue(undefined);
    stubBridge({
      confirmClose,
      onCloseRequested: (cb: () => void) => {
        requestClose = cb;
        return () => {
          requestClose = null;
        };
      }
    });
    return { confirmClose, close: () => act(() => requestClose?.()) };
  }

  it("closes straight away when there is nothing to lose", async () => {
    const { confirmClose, close } = stubCloseHandshake();
    await renderApp();

    close();

    expect(confirmClose).toHaveBeenCalledTimes(1);
  });

  it("asks first when there is unsaved work, and stays open if declined", async () => {
    // Main vetoes its own close event and waits for this answer, so declining
    // simply means never answering — the window stays open (issue #6).
    const { confirmClose, close } = stubCloseHandshake();
    await renderApp();

    fireEvent.keyDown(window, { key: "o" });
    clickCell([0, 0, 0]);
    clickCell([2, 0, 2]);
    act(() => placeButton()?.click());

    close();
    expect(confirmClose).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(confirmClose).not.toHaveBeenCalled();
  });

  it("closes once the user confirms discarding the work", async () => {
    const { confirmClose, close } = stubCloseHandshake();
    await renderApp();

    fireEvent.keyDown(window, { key: "o" });
    clickCell([0, 0, 0]);
    clickCell([2, 0, 2]);
    act(() => placeButton()?.click());

    close();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Discard and close" })
    );

    expect(confirmClose).toHaveBeenCalledTimes(1);
  });
});

describe("settings persistence", () => {
  /** The error flash is the app's one channel for "that did not work". */
  function flashText() {
    return document.body.textContent ?? "";
  }

  it("says so when settings cannot be written", async () => {
    // Settings hold the only copy of prices and the tax rate, so a silent
    // failure means the next launch blocks quote export with no explanation
    // (issue #73).
    const setSettings = vi.fn().mockResolvedValue({ ok: false, error: "EACCES" });
    stubBridge({ setSettings });
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: /^Edit/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Quote/ }));
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => expect(setSettings).toHaveBeenCalled());
    await waitFor(() => expect(flashText()).toContain("Settings not saved"));
    expect(flashText()).toContain("EACCES");
  });

  it("says so when saved settings cannot be read", async () => {
    // Distinct from a first run, which reports no data and no error. Showing
    // defaults silently would invite re-entering prices that are still on disk.
    stubBridge({ getSettings: vi.fn().mockResolvedValue({ data: null, error: "EIO" }) });
    await renderApp();

    await waitFor(() => expect(flashText()).toContain("Could not read saved settings"));
  });

  it("stays quiet on a first run, where there is simply no file yet", async () => {
    stubBridge({ getSettings: vi.fn().mockResolvedValue({ data: null }) });
    await renderApp();

    expect(flashText()).not.toContain("Could not read");
  });
});

describe("the quote export gate", () => {
  const PRICED = {
    pricing: { blower: 4250, terminal: 1850, tube6: 78, bend90: 142 },
    taxRate: 0.0825,
    company: {
      name: "Tube Co",
      tagline: "PTS",
      address: "1 Way",
      phone: "555",
      email: "a@b.co"
    },
    quote: {
      billTo: { name: "Acme", lines: ["Attn"] },
      project: { name: "P", lines: [] },
      quoteNumber: "Q-1",
      notes: "Terms."
    }
  };

  function openExport() {
    fireEvent.click(screen.getByRole("button", { name: "BOM" }));
    fireEvent.click(screen.getByRole("button", { name: /Export PDF quote/ }));
  }

  it("refuses to quote from a fresh install and names what is missing", async () => {
    // The commercial guarantee from ADR-0003: the app ships no prices, no tax
    // rate and no company details, so a fresh install cannot produce a quote
    // containing invented money.
    stubBridge();
    await renderApp();

    openExport();

    const dialog = screen.getByRole("dialog", { name: /Finish setup/ });
    const text = dialog.textContent ?? "";
    expect(text).toContain("Company name");
    expect(text).toContain("Tax rate");
    expect(text).toMatch(/Price for/);
    // There is no way from here to a PDF.
    expect(within(dialog).queryByRole("button", { name: /Download/ })).toBeNull();
  });

  it("offers the settings screen that fixes each blocker", async () => {
    stubBridge();
    await renderApp();

    openExport();
    const dialog = screen.getByRole("dialog", { name: /Finish setup/ });

    expect(within(dialog).getByRole("button", { name: /Open Company settings/ })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Open Pricing settings/ })).toBeTruthy();
  });

  it("shows the quote once every value has been entered", async () => {
    stubBridge({ getSettings: vi.fn().mockResolvedValue({ data: PRICED }) });
    await renderApp();

    openExport();

    expect(screen.getByRole("dialog", { name: /Quote preview/ })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /Finish setup/ })).toBeNull();
  });
});
