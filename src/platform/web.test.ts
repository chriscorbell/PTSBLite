import { beforeEach, describe, expect, it } from "vitest";
import { isSafeExternalUrl } from "@/platform/types";
import { webPlatform } from "@/platform/web";

const SESSION_KEY = "ptsbuilder-lite:autosave:v1";
const UNREADABLE_KEY = "ptsbuilder-lite:autosave:unreadable";

beforeEach(() => {
  window.localStorage.clear();
});

/**
 * Run `body` with `localStorage` replaced by one that throws on write.
 *
 * The whole object is swapped rather than `setItem` spied on. happy-dom's
 * storage does not survive a spy being installed and restored on it — writes
 * silently stop working for every test that follows, which shows up as a wrong
 * assertion somewhere unrelated rather than as an error here.
 */
function withFailingWrites(error: Error, body: () => void): void {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  const failing = {
    getItem: () => null,
    setItem: () => {
      throw error;
    },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: failing });
  try {
    body();
  } finally {
    if (original) Object.defineProperty(window, "localStorage", original);
  }
}

describe("web platform capabilities", () => {
  it("reports no window-chrome inset", () => {
    // A browser tab owns no title bar. The renderer used to guess this from
    // `navigator.platform` and would have indented the top bar by 86px on a Mac
    // for controls that are not there.
    expect(webPlatform().chrome).toEqual({ titleBarInset: 0, titleBarRightInset: 0 });
  });

  it("has no settings, updater or close gate", () => {
    const platform = webPlatform();
    // Null rather than no-op functions: the UI omits these controls instead of
    // rendering ones that do nothing.
    expect(platform.settings).toBeNull();
    expect(platform.updates).toBeNull();
    expect(platform.closeGate).toBeNull();
  });

  it("persists designs by session rather than by file", () => {
    expect(webPlatform().documents.kind).toBe("session");
  });
});

describe("session persistence", () => {
  function session() {
    const documents = webPlatform().documents;
    if (documents.kind !== "session") throw new Error("expected session persistence");
    return documents;
  }

  it("round-trips a stored design", () => {
    const store = session();
    expect(store.load()).toBeNull();
    expect(store.store('{"schemaVersion":"1"}')).toEqual({ ok: true });
    expect(store.load()).toBe('{"schemaVersion":"1"}');
  });

  it("clears the stored design", () => {
    const store = session();
    store.store("{}");
    store.clear();
    expect(store.load()).toBeNull();
  });

  it("reports a refused write rather than throwing", () => {
    const quota = new Error("full");
    quota.name = "QuotaExceededError";

    withFailingWrites(quota, () => {
      const result = session().store("{}");

      // The caller keeps the design dirty and says so, so a failed write is
      // never silent. Throwing here would take the placement down with it.
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toMatch(/out of storage/i);
    });
  });

  it("sets an unreadable payload aside instead of deleting it", () => {
    const store = session();
    store.store("not json");

    store.preserveUnreadable();

    // An unsupported schema usually means a rollback or a missed migration, so
    // a later deployment may be able to read what this one could not.
    expect(window.localStorage.getItem(UNREADABLE_KEY)).toBe("not json");
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("never overwrites an earlier backup", () => {
    const store = session();
    store.store("first failure");
    store.preserveUnreadable();
    store.store("second failure");

    store.preserveUnreadable();

    // A second failure must not destroy the copy the first one preserved.
    expect(window.localStorage.getItem(UNREADABLE_KEY)).toBe("first failure");
  });
});

describe("isSafeExternalUrl", () => {
  it("allows http and https", () => {
    expect(isSafeExternalUrl("https://example.com")).toBe(true);
    expect(isSafeExternalUrl("http://example.com")).toBe(true);
  });

  it("refuses schemes that execute or embed", () => {
    // The Electron main process already refuses these. The browser would
    // otherwise hand them straight to window.open.
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeExternalUrl("not a url")).toBe(false);
  });
});
