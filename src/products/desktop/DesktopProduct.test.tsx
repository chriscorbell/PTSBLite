import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { DesktopProduct } from "@/products/desktop/DesktopProduct";
import type { Platform } from "@/platform/types";
import type { ViewportHandle, ViewportProps } from "@/renderer/Viewport";

// The real Viewport builds a WebGLRenderer, which happy-dom cannot provide.
// These tests are about prices, quotes and settings, none of which need a GPU.
const viewport = vi.hoisted(() => ({
  handle: { zoomBy: vi.fn(), resetView: vi.fn() } satisfies ViewportHandle
}));

vi.mock("@/renderer/Viewport", () => ({
  Viewport: (props: ViewportProps) => {
    if (props.ref && typeof props.ref === "object") {
      (props.ref as { current: ViewportHandle | null }).current = viewport.handle;
    }
    return null;
  }
}));

afterEach(() => {
  platform = null;
  vi.restoreAllMocks();
});

type BridgeStubs = {
  getSettings: Mock<() => Promise<{ data: unknown; error?: string }>>;
  setSettings: Mock<(json: string) => Promise<{ ok: boolean; error?: string }>>;
};

let platform: Platform | null = null;

/**
 * A desktop host. Only settings persistence and the PDF sink matter here; the
 * rest is present because the product queries it on mount.
 */
function stubBridge(overrides: Partial<BridgeStubs> = {}): BridgeStubs {
  const stubs: BridgeStubs = {
    getSettings: vi.fn().mockResolvedValue({ data: null }),
    setSettings: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides
  };
  platform = {
    chrome: { titleBarInset: 0, titleBarRightInset: 0 },
    documents: {
      kind: "files",
      save: vi.fn().mockResolvedValue({ canceled: true, path: null }),
      open: vi.fn().mockResolvedValue({ canceled: true, path: null, contents: null })
    },
    settings: {
      load: async () => {
        const r = await stubs.getSettings();
        return { data: r.data, error: r.error };
      },
      save: async (json) => stubs.setSettings(json)
    },
    savePdf: vi.fn().mockResolvedValue({ canceled: false }),
    openExternal: vi.fn(),
    updates: {
      check: vi.fn().mockResolvedValue({ status: "up-to-date" }),
      getPending: vi.fn().mockResolvedValue(null),
      quitAndInstall: vi.fn().mockResolvedValue(undefined),
      onDownloaded: () => () => undefined
    },
    closeGate: null
  };
  return stubs;
}

async function renderApp() {
  const utils = render(<DesktopProduct platform={platform as Platform} />);
  // The product queries persisted settings on mount; let that microtask settle
  // so the first assertion is not racing a state update.
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

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
