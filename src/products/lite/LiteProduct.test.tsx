import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { webPlatform } from "@/platform/web";
import { LiteProduct } from "@/products/lite/LiteProduct";
import type { ViewportHandle, ViewportProps } from "@/renderer/Viewport";

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

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

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
