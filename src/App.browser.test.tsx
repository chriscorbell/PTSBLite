import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { serializeDesign } from "@/domain/design-file";
import { emptyDesign } from "@/domain/design-state";
import { webPlatform } from "@/platform/web";
import type { ViewportHandle, ViewportProps } from "@/renderer/Viewport";
import type { Part } from "@/types";

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

function openMenu(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.getAllByRole("menuitem").map((item) => item.textContent ?? "");
}

describe("PTSBuilderLite", () => {
  it("shows no money anywhere on screen", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "BOM" }));

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("$");
    expect(text).not.toMatch(/\bTax\b/);
    expect(text).not.toMatch(/\bSubtotal\b/);
    expect(text).not.toMatch(/Quote total/);
    expect(text).not.toMatch(/\bEACH\b/);
  });

  it("offers a BOM export and no quote export", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "BOM" }));

    expect(screen.getByRole("button", { name: /Export BOM PDF/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /quote/i })).toBeNull();
  });

  it("offers no file actions", async () => {
    await renderApp();
    expect(openMenu(/^File/)).toEqual(["New"]);
  });

  it("offers only design settings", async () => {
    await renderApp();
    expect(openMenu(/^Edit/)).toEqual(["Design Settings…"]);
  });

  it("uses the PTSBuilderLite name", async () => {
    await renderApp();
    expect(document.body.textContent).toContain("PTSBuilderLite");
  });

  it("identifies Kelly Tube Systems in the product description", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    expect(screen.getByRole("dialog", { name: /About PTSBuilderLite/ }).textContent).toContain(
      "Kelly Tube Systems"
    );
  });
});

describe("picking up where you left off", () => {
  it("autosaves a changed design to localStorage without downloading a file", async () => {
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click");
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: /^Edit/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Design Settings…" }));
    fireEvent.change(screen.getByLabelText("System name"), {
      target: { value: "Visitor layout" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const saved = window.localStorage.getItem(SESSION_KEY);
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved ?? "") as { metadata: { filename: string } };
      expect(parsed.metadata.filename).toBe("Visitor layout");
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("offers a stored design and restores it", async () => {
    window.localStorage.setItem(SESSION_KEY, storedDesign());
    await renderApp();

    const dialog = screen.getByRole("dialog", { name: /Pick up where you left off/ });
    fireEvent.click(within(dialog).getByRole("button", { name: /Restore it/ }));

    fireEvent.click(screen.getByRole("button", { name: "BOM" }));
    const bom = document.querySelector(".bom")?.textContent ?? "";
    expect(bom).toMatch(/Blower Unit/);
    expect(screen.queryByRole("dialog", { name: /Pick up where/ })).toBeNull();
  });

  it("discards the stored design when the visitor starts fresh", async () => {
    window.localStorage.setItem(SESSION_KEY, storedDesign());
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: /Start fresh/ }));
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("does not offer anything on a first visit", async () => {
    await renderApp();
    expect(screen.queryByRole("dialog", { name: /Pick up where/ })).toBeNull();
  });

  it("does not offer a stored design that holds no work", async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(serializeDesign(emptyDesign(), "t")));
    await renderApp();
    expect(screen.queryByRole("dialog", { name: /Pick up where/ })).toBeNull();
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
