import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { serializeDesign } from "@/domain/design-file";
import { emptyDesign } from "@/domain/design-state";
import { webPlatform } from "@/platform/web";
import { ROOM_LIMITS } from "@/domain/sparse-grid";
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
      const parsed = JSON.parse(saved ?? "") as { metadata: { room: { width: number } } };
      expect(parsed.metadata.room.width).toBe(40);
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
    fireEvent.click(screen.getByRole("button", { name: "Keep current design" }));

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
    expect(within(dialog).getByLabelText(/Add 2nd floor/)).toBeTruthy();
    expect(within(dialog).getByLabelText("Plenum (drop ceiling)")).toBeTruthy();
    // The height input only appears once a plenum is declared.
    expect(within(dialog).queryByLabelText(/plenum height/i)).toBeNull();
  });

  it("explains each field where the field is, not in a warning box", async () => {
    await renderApp();
    const dialog = screen.getByRole("dialog", { name: /Welcome to PTSBLite/ });

    // The amber warning box is gone; what it said now sits beside the control
    // it constrains, and what is left is a neutral note about scale.
    expect(within(dialog).getByText(/Floor to ceiling, including plenum/i)).toBeTruthy();
    expect(
      within(dialog)
        .getByLabelText(/Add 2nd floor/)
        .closest("label")?.textContent
    ).toMatch(/Structural ceiling\/floor between them is 1 ft thick/i);
    expect(within(dialog).getByText(/Maximum build area is 300 × 300 × 100 ft/i)).toBeTruthy();
    expect(within(dialog).queryByText(/1 grid cell = 1 ft/i)).toBeNull();
  });

  it("asks for a room rather than a build area, and never for a name", async () => {
    await renderApp();
    const dialog = screen.getByRole("dialog", { name: /Welcome to PTSBLite/ });

    expect(within(dialog).getByText("Building or room size")).toBeTruthy();
    // Designs carry no name any more, so the form must not collect one.
    expect(within(dialog).queryByLabelText(/company name/i)).toBeNull();
    expect(within(dialog).queryByLabelText(/system name/i)).toBeNull();
    // The unit belongs in the box, so no label repeats it.
    expect(within(dialog).queryByText(/\(feet\)/i)).toBeNull();
  });

  it("stores the setup answers with the created design", async () => {
    await renderApp();

    const dialog = screen.getByRole("dialog", { name: /Welcome to PTSBLite/ });
    fireEvent.change(within(dialog).getByLabelText("Width"), { target: { value: "40" } });
    fireEvent.click(within(dialog).getByLabelText(/Add 2nd floor/));
    fireEvent.click(within(dialog).getByLabelText("Plenum (drop ceiling)"));
    fireEvent.change(within(dialog).getByLabelText(/plenum height/i), { target: { value: "4" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Create design/ }));

    expect(screen.queryByRole("dialog", { name: /Welcome/ })).toBeNull();
    await waitFor(() => {
      const saved = window.localStorage.getItem(SESSION_KEY);
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved ?? "") as {
        metadata: {
          room: { width: number };
          multiFloor: boolean;
          plenumHeightFeet: number | null;
        };
      };
      expect(parsed.metadata.room.width).toBe(40);
      expect(parsed.metadata.multiFloor).toBe(true);
      expect(parsed.metadata.plenumHeightFeet).toBe(4);
    });
  });

  // Reported by the client on Safari, reproduced in every browser: the field
  // clamped on every keystroke, so it rewrote numbers the visitor was still
  // typing. The limits still apply -- they just wait until the field is left.
  describe("typing a build-area dimension", () => {
    async function widthField() {
      await renderApp();
      const dialog = screen.getByRole("dialog", { name: /Welcome to PTSBLite/ });
      return within(dialog).getByLabelText<HTMLInputElement>("Width");
    }

    it("keeps a value whose first digit is below the minimum", async () => {
      const width = await widthField();

      // "1" of an intended "12" used to become the 4 ft minimum on the spot,
      // leaving "42" once the second digit landed.
      fireEvent.change(width, { target: { value: "1" } });
      expect(width.value).toBe("1");
      fireEvent.change(width, { target: { value: "12" } });
      expect(width.value).toBe("12");
    });

    it("keeps a value passing through above the maximum", async () => {
      const width = await widthField();

      fireEvent.change(width, { target: { value: "600" } });
      expect(width.value).toBe("600");
    });

    it("lets the field be emptied", async () => {
      const width = await widthField();

      fireEvent.change(width, { target: { value: "" } });
      expect(width.value).toBe("");
    });

    it("applies the limits when the field is left", async () => {
      const width = await widthField();

      fireEvent.change(width, { target: { value: "9999" } });
      fireEvent.blur(width);
      expect(width.value).toBe(String(ROOM_LIMITS.width.max));

      fireEvent.change(width, { target: { value: "1" } });
      fireEvent.blur(width);
      expect(width.value).toBe("4");
    });

    it("restores the last good value when an emptied field is left", async () => {
      const width = await widthField();

      fireEvent.change(width, { target: { value: "45" } });
      fireEvent.change(width, { target: { value: "" } });
      fireEvent.blur(width);
      expect(width.value).toBe("45");
    });

    it("carries the typed dimensions into the created design", async () => {
      await renderApp();
      const dialog = screen.getByRole("dialog", { name: /Welcome to PTSBLite/ });
      fireEvent.change(within(dialog).getByLabelText("Width"), { target: { value: "12" } });
      fireEvent.change(within(dialog).getByLabelText("Length"), { target: { value: "150" } });
      fireEvent.change(within(dialog).getByLabelText("Height"), { target: { value: "8" } });
      fireEvent.click(within(dialog).getByRole("button", { name: /Create design/ }));

      await waitFor(() => {
        const saved = window.localStorage.getItem(SESSION_KEY);
        expect(saved).not.toBeNull();
        const parsed = JSON.parse(saved ?? "") as {
          metadata: { room: { width: number; depth: number; height: number } };
        };
        expect(parsed.metadata.room).toEqual({ width: 12, depth: 150, height: 8 });
      });
    });
  });

  it("reopens as the setup form when starting a new design from the top bar", async () => {
    await renderApp();
    createFirstDesign();

    fireEvent.click(screen.getByRole("button", { name: /^New$/ }));

    expect(screen.getByRole("dialog", { name: /New design/ })).toBeTruthy();
    expect(
      within(screen.getByRole("dialog", { name: /New design/ })).getByLabelText("Width")
    ).toBeTruthy();
  });
});
