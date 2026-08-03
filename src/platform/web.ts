import { isSafeExternalUrl, type Platform } from "@/platform/types";

/** One design, one origin. See ADR-0012. */
const SESSION_KEY = "ptsbuilder-lite:autosave:v1";
/**
 * Where a payload this build cannot read is set aside. Kept rather than
 * deleted: an unsupported schema usually means a rollback or a missed
 * migration, and a later deployment may be able to read what this one could not.
 */
const UNREADABLE_KEY = "ptsbuilder-lite:autosave:unreadable";

/**
 * The browser host.
 *
 * No files, no settings, no updater, no close gate. Those are `null` or a
 * `session` persistence kind rather than functions that quietly do nothing, so
 * the UI omits the controls instead of showing ones that lie.
 */
export function webPlatform(): Platform {
  return {
    // A browser tab owns no window controls, so there is nothing to leave clear
    // of. The renderer used to guess this from `navigator.platform` and would
    // have indented the top bar by 86px on a Mac, for a title bar that is not
    // there.
    chrome: { titleBarInset: 0, titleBarRightInset: 0 },

    documents: {
      kind: "session",
      load: () => storage()?.getItem(SESSION_KEY) ?? null,
      store: (json) => {
        const store = storage();
        if (!store) return { ok: false, error: "This browser is not storing data for this site." };
        try {
          store.setItem(SESSION_KEY, json);
          return { ok: true };
        } catch (err) {
          // Quota, or Safari refusing to write in private browsing. Either way
          // the caller keeps the design dirty and says so.
          return { ok: false, error: describeStorageError(err) };
        }
      },
      clear: () => storage()?.removeItem(SESSION_KEY),
      preserveUnreadable: () => {
        const store = storage();
        if (!store) return;
        const payload = store.getItem(SESSION_KEY);
        // Never overwrite an earlier backup: a second failure would otherwise
        // destroy the copy the first one preserved.
        if (payload !== null && store.getItem(UNREADABLE_KEY) === null) {
          store.setItem(UNREADABLE_KEY, payload);
        }
        store.removeItem(SESSION_KEY);
      }
    },

    // Every field of AppSettings — prices, tax rate, company, quote defaults —
    // exists to support the quote, which this product does not have.
    settings: null,

    // Not async: a download is started, not awaited. The browser gives no
    // completion signal and no way to know whether the user kept the file, so
    // this resolves as soon as the download has been handed over.
    savePdf: (bytes, suggestedName) => {
      // Copied into a fresh buffer because `Blob` will not take a Uint8Array
      // backed by a SharedArrayBuffer, and pdf-lib gives no guarantee either way.
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = suggestedName;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
        return Promise.resolve({ canceled: false });
      } finally {
        // Revoked on a later tick: Safari has historically cancelled the
        // download if the object URL disappears in the same one.
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    },

    openExternal: (url) => {
      if (!isSafeExternalUrl(url)) return;
      window.open(url, "_blank", "noopener,noreferrer");
    },

    // A reload is the update.
    updates: null,

    // `beforeunload` is the only thing a browser offers, its message cannot be
    // written or styled, and autosave means there is normally nothing to lose.
    // It is registered directly by the app, and only while a write is failing.
    closeGate: null
  };
}

/**
 * `localStorage` access can throw rather than return null — Safari in private
 * browsing historically did, and an iframe with third-party storage blocked
 * still does. Every caller here treats "no storage" the same as "nothing
 * stored", so the failure is worth flattening once.
 */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function describeStorageError(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return "This browser is out of storage for this site.";
  }
  return "This browser refused to store the design.";
}
