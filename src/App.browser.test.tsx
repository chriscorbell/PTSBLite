import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { serializeDesign } from "@/domain/design-file";
import { emptyDesign } from "@/domain/design-state";
import { webPlatform } from "@/platform/web";
import type { Part } from "@/types";

vi.mock("@/renderer/Viewport", () => ({
  Viewport: () => null
}));

const SESSION_KEY = "ptsblite:autosave:v1";
const UNREADABLE_KEY = "ptsblite:autosave:unreadable";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function storedDesign(): string {
  const blower: Part = { id: "b", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] };
  return JSON.stringify(serializeDesign({ ...emptyDesign(), parts: [blower] }, "test"));
}

async function renderApp() {
  const utils = render(<App platform={webPlatform()} />);
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

/** Accept the welcome setup form's defaults, for tests about the editor. */
function createFirstDesign() {
  fireEvent.click(screen.getByRole("button", { name: /Create design/ }));
}

describe("PTSBLite", () => {
  it("shows no money anywhere on screen", async () => {
    await renderApp();
    createFirstDesign();
    fireEvent.click(screen.getByRole("button", { name: "BOM" }));

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("$");
    expect(text).not.toMatch(/\bTax\b/);
    expect(text).not.toMatch(/\bSubtotal\b/);
    expect(text).not.toMatch(/Quote total/);
    expect(text).not.toMatch(/\bEACH\b/);
  });

  it("offers a BOM export", async () => {
    await renderApp();
    createFirstDesign();
    fireEvent.click(screen.getByRole("button", { name: "BOM" }));

    expect(screen.getByRole("button", { name: /Export PDF/ })).toBeTruthy();
  });

  it("uses the PTSBLite name", async () => {
    await renderApp();
    expect(document.body.textContent).toContain("PTSBLite");
  });
});

describe("picking up where you left off", () => {
  it("autosaves a changed design to localStorage without downloading a file", async () => {
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click");
    await renderApp();

    const dialog = screen.getByRole("dialog", { name: /Welcome to PTSBLite/ });
    fireEvent.change(within(dialog).getByLabelText("Width"), { target: { value: "40" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Create design/ }));

    await waitFor(() => {
      const saved = window.localStorage.getItem(SESSION_KEY);
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved ?? "") as { metadata: { buildArea: { width: number } } };
      expect(parsed.metadata.buildArea.width).toBe(40);
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("offers a stored design on the welcome screen and restores it", async () => {
    window.localStorage.setItem(SESSION_KEY, storedDesign());
    await renderApp();

    const dialog = screen.getByRole("dialog", { name: /Welcome back/ });
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue design/ }));

    fireEvent.click(screen.getByRole("button", { name: "BOM" }));
    const bom = document.querySelector(".bom")?.textContent ?? "";
    expect(bom).toMatch(/Blower Unit/);
    expect(screen.queryByRole("dialog", { name: /Welcome back/ })).toBeNull();
  });

  it("confirms before starting a new design, and can be backed out of", async () => {
    window.localStorage.setItem(SESSION_KEY, storedDesign());
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "New design" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep saved design" }));

    // Backing out returns to the choice, with the saved design untouched.
    expect(screen.getByRole("dialog", { name: /Welcome back/ })).toBeTruthy();
    expect(window.localStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it("backs out of the confirmation on Escape", async () => {
    window.localStorage.setItem(SESSION_KEY, storedDesign());
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "New design" }));
    const dialog = screen.getByRole("dialog", { name: /Start a new design/ });
    // Escape reaches a <dialog> as a cancel event, which is what Modal handles.
    fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));

    // Only this stage is escapable: the screens either side of it have nothing
    // to fall back to, so they deliberately ignore Escape.
    expect(screen.getByRole("dialog", { name: /Welcome back/ })).toBeTruthy();
  });

  it("keeps the stored design until a new one is actually created", async () => {
    window.localStorage.setItem(SESSION_KEY, storedDesign());
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "New design" }));
    fireEvent.click(screen.getByRole("button", { name: "Start new design" }));
    // Confirming only reaches the setup form; abandoning it by closing the tab
    // must still not lose the old design.
    expect(window.localStorage.getItem(SESSION_KEY)).not.toBeNull();

    createFirstDesign();
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("does not offer a stored design that holds no work", async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(serializeDesign(emptyDesign(), "t")));
    await renderApp();
    expect(screen.queryByRole("dialog", { name: /Welcome back/ })).toBeNull();
    expect(screen.getByRole("dialog", { name: /Welcome to PTSBLite/ })).toBeTruthy();
  });

  it("sets aside a payload it cannot read, and says so without jargon", async () => {
    window.localStorage.setItem(SESSION_KEY, "{ not json");
    await renderApp();

    const text = document.body.textContent ?? "";
    expect(text).toContain("could not be reopened");
    expect(text).not.toMatch(/schemaVersion|JSON|parse/i);
    expect(window.localStorage.getItem(UNREADABLE_KEY)).toBe("{ not json");
  });
});

describe("the welcome setup form", () => {
  it("asks for the required details on a first visit", async () => {
    await renderApp();

    const dialog = screen.getByRole("dialog", { name: /Welcome to PTSBLite/ });
    expect(within(dialog).getByLabelText("Width")).toBeTruthy();
    expect(within(dialog).getByLabelText("Add 2nd floor")).toBeTruthy();
    expect(within(dialog).getByLabelText("Plenum (drop ceiling)")).toBeTruthy();
    // The height input only appears once a plenum is declared.
    expect(within(dialog).queryByLabelText(/plenum height/i)).toBeNull();
  });

  it("stores the setup answers with the created design", async () => {
    await renderApp();

    const dialog = screen.getByRole("dialog", { name: /Welcome to PTSBLite/ });
    fireEvent.change(within(dialog).getByLabelText("Width"), { target: { value: "40" } });
    fireEvent.click(within(dialog).getByLabelText("Add 2nd floor"));
    fireEvent.click(within(dialog).getByLabelText("Plenum (drop ceiling)"));
    fireEvent.change(within(dialog).getByLabelText(/plenum height/i), { target: { value: "4" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Create design/ }));

    expect(screen.queryByRole("dialog", { name: /Welcome/ })).toBeNull();
    await waitFor(() => {
      const saved = window.localStorage.getItem(SESSION_KEY);
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved ?? "") as {
        metadata: {
          buildArea: { width: number };
          multiFloor: boolean;
          plenumHeightFeet: number | null;
        };
      };
      expect(parsed.metadata.buildArea.width).toBe(40);
      expect(parsed.metadata.multiFloor).toBe(true);
      expect(parsed.metadata.plenumHeightFeet).toBe(4);
    });
  });

  it("reopens as the setup form when starting a new design from the top bar", async () => {
    await renderApp();
    createFirstDesign();

    fireEvent.click(screen.getByRole("button", { name: /^File/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New" }));

    expect(screen.getByRole("dialog", { name: /New design/ })).toBeTruthy();
    expect(
      within(screen.getByRole("dialog", { name: /New design/ })).getByLabelText("Width")
    ).toBeTruthy();
  });
});
