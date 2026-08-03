import { isSafeExternalUrl, type Platform } from "@/platform/types";

/**
 * The Electron host.
 *
 * The only module in `src/` that touches `window.ptsbuilder`. Everything else
 * goes through `Platform`, so the preload bridge has exactly one consumer and
 * the browser build has no reason to mention it at all.
 */
export function electronPlatform(): Platform {
  const api = window.ptsbuilder;
  if (!api) {
    // Reached only if the preload bridge failed to load, in which case saving,
    // opening, settings, updates and the close gate are all already gone.
    // Failing here says so once, rather than fourteen times in fourteen ways.
    throw new Error("PTSBuilder: the preload bridge is missing. The app cannot run without it.");
  }

  return {
    chrome: {
      titleBarInset: api.titleBarInset,
      titleBarRightInset: api.titleBarRightInset
    },

    documents: {
      kind: "files",
      save: async ({ json, path }) => {
        const result = await api.saveDesign({ json, filePath: path });
        return { canceled: result.canceled, path: result.filePath, error: result.error };
      },
      open: async () => {
        const result = await api.openDesign();
        return {
          canceled: result.canceled,
          path: result.filePath,
          contents: result.contents,
          error: result.error
        };
      }
    },

    settings: {
      load: async () => {
        const result = await api.getSettings();
        return { data: result.data, error: result.error };
      },
      save: async (json) => {
        const result = await api.setSettings(json);
        return { ok: result.ok, error: result.error };
      }
    },

    // Main shows the save dialog and picks the default name, so `suggestedName`
    // is not used here. It is part of the contract for the browser, where the
    // download filename is the only naming the user gets.
    savePdf: async (bytes) => {
      const result = await api.exportQuote(base64FromBytes(bytes));
      return { canceled: result.canceled, error: result.error };
    },

    openExternal: (url) => {
      if (!isSafeExternalUrl(url)) return;
      void api.openExternal(url);
    },

    updates: {
      check: () => api.checkForUpdates(),
      getPending: () => api.getPendingUpdate(),
      quitAndInstall: () => api.quitAndInstall(),
      onDownloaded: (callback) => api.onUpdateDownloaded(callback)
    },

    closeGate: {
      onRequested: (callback) => api.onCloseRequested(callback),
      confirm: () => api.confirmClose()
    }
  };
}

/**
 * Bytes to base64, chunked.
 *
 * Moved here from `quote-pdf.ts`, which had no business knowing how a host
 * wanted its bytes — and it is only Electron that wants them this way, because
 * they cross IPC as a string. The browser hands the same bytes to a `Blob`.
 *
 * Chunked because `String.fromCharCode(...bytes)` on a whole PDF spreads a
 * hundred thousand arguments across the stack and throws.
 */
function base64FromBytes(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(binary, "binary").toString("base64");
}
