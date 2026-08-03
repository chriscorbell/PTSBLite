import { fireEvent, render, screen, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeDesign } from "@/domain/design-file";
import { emptyDesign } from "@/domain/design-state";
import { webPlatform } from "@/platform/web";
import { LiteProduct } from "@/products/lite/LiteProduct";
import type { ViewportHandle, ViewportProps } from "@/renderer/Viewport";
import type { Part } from "@/types";

// happy-dom has no WebGL. None of these assertions are about the 3D view.
vi.mock("@/renderer/Viewport", () => ({
  Viewport: (props: ViewportProps) => {
    if (props.ref && typeof props.ref === "object") {
      (props.ref as { current: ViewportHandle | null }).current = {
        zoomBy: vi.fn(),
        resetView: vi.fn()
      };
    }
    return null;
  }
}));

const SESSION_KEY = "ptsbuilder-lite:autosave:v1";
const UNREADABLE_KEY = "ptsbuilder-lite:autosave:unreadable";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

/** A design with a blower in it, as an autosave payload would hold. */
function storedDesign(): string {
  const blower: Part = { id: "b", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] };
  return JSON.stringify(serializeDesign({ ...emptyDesign(), parts: [blower] }, "test"));
}

async function renderLite() {
  const utils = render(<LiteProduct platform={webPlatform()} />);
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

function openMenu(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.getAllByRole("menuitem").map((item) => item.textContent ?? "");
}

describe("PTSBuilderLite", () => {
  it("shows no money anywhere on screen", async () => {
    // The defining constraint. Asserted against the rendered page rather than
    // against the components, because the guarantee is about what a visitor
    // can see (ADR-0011).
    await renderLite();
    fireEvent.click(screen.getByRole("button", { name: "BOM" }));

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("$");
    expect(text).not.toMatch(/\bTax\b/);
    expect(text).not.toMatch(/\bSubtotal\b/);
    expect(text).not.toMatch(/Quote total/);
    expect(text).not.toMatch(/\bEACH\b/);
  });

  it("offers a BOM export and no quote export", async () => {
    await renderLite();
    fireEvent.click(screen.getByRole("button", { name: "BOM" }));

    expect(screen.getByRole("button", { name: /Export BOM PDF/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /quote/i })).toBeNull();
  });

  it("offers no file actions, because there are no files", async () => {
    // The browser build autosaves a session. Rendering Open or Save would be
    // offering something the host cannot do.
    await renderLite();

    const items = openMenu(/^File/);
    expect(items).toEqual(["New"]);
  });

  it("offers only the design's own settings", async () => {
    await renderLite();

    const items = openMenu(/^Edit/);
    expect(items).toEqual(["Design Settings…"]);
  });

  it("calls itself PTSBuilderLite", async () => {
    await renderLite();
    expect(document.body.textContent).toContain("PTSBuilderLite");
  });
});

describe("picking up where you left off", () => {
  it("offers a stored design and restores it", async () => {
    window.localStorage.setItem(SESSION_KEY, storedDesign());
    await renderLite();

    const dialog = screen.getByRole("dialog", { name: /Pick up where you left off/ });
    fireEvent.click(within(dialog).getByRole("button", { name: /Restore it/ }));

    // The restored design is on screen: the BOM counts the blower it contained.
    fireEvent.click(screen.getByRole("button", { name: "BOM" }));
    const bom = document.querySelector(".bom")?.textContent ?? "";
    expect(bom).toMatch(/Blower Unit/);
    expect(screen.queryByRole("dialog", { name: /Pick up where/ })).toBeNull();
  });

  it("discards the stored design when the visitor starts fresh", async () => {
    window.localStorage.setItem(SESSION_KEY, storedDesign());
    await renderLite();

    fireEvent.click(screen.getByRole("button", { name: /Start fresh/ }));

    // Offering it again next visit would make the answer meaningless.
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("does not offer anything on a first visit", async () => {
    await renderLite();
    expect(screen.queryByRole("dialog", { name: /Pick up where/ })).toBeNull();
  });

  it("does not offer a stored design that holds no work", async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(serializeDesign(emptyDesign(), "t")));
    await renderLite();
    expect(screen.queryByRole("dialog", { name: /Pick up where/ })).toBeNull();
  });

  it("sets aside a payload it cannot read, and says so without jargon", async () => {
    window.localStorage.setItem(SESSION_KEY, "{ not json");
    await renderLite();

    const text = document.body.textContent ?? "";
    expect(text).toContain("could not be reopened");
    // No schema versions, no JSON, no error codes in front of a visitor.
    expect(text).not.toMatch(/schemaVersion|JSON|parse/i);
    // Kept rather than dropped: a later deployment may manage what this could not.
    expect(window.localStorage.getItem(UNREADABLE_KEY)).toBe("{ not json");
  });
});
