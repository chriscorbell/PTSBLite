/**
 * What the app needs from the thing it is running inside.
 *
 * PTSBuilder runs in Electron, where it has native dialogs, a settings file, an
 * updater and a window whose close it can veto. PTSBuilderLite runs in a browser
 * tab, where it has none of those. Rather than ask `window.ptsbuilder` whether
 * it exists at fourteen call sites and degrade differently at each one, the
 * differences are collected here and each product supplies one implementation.
 *
 * Capabilities a host genuinely lacks are `null`, not no-op functions. A no-op
 * `openDesign` would leave an Open menu item that does nothing; `documents.kind`
 * and a `null` `updates` make the absence something the compiler can see, so the
 * UI can omit the control instead of rendering one that lies.
 */

export type SaveDesignResult = {
  canceled: boolean;
  /** Where it was written. `null` when nothing was. */
  path: string | null;
  error?: string;
};

export type OpenDesignResult = {
  canceled: boolean;
  path: string | null;
  contents: string | null;
  error?: string;
};

export type SavePdfResult = {
  canceled: boolean;
  error?: string;
};

export type LoadSettingsResult = {
  /** Parsed JSON, or `null` when nothing has been saved yet. */
  data: unknown;
  error?: string;
};

export type SaveSettingsResult = {
  ok: boolean;
  error?: string;
};

/**
 * Where a save should go. Omitting `path` prompts, which is what Save As and a
 * first save do; supplying one writes straight there, which is what Save does
 * once the document has a home.
 */
export type SaveDesignRequest = {
  json: string;
  path?: string | null;
};

/**
 * How designs persist. A discriminated union rather than optional methods,
 * because the two hosts do genuinely different things and the compiler should
 * force both to be handled.
 *
 * `files` — named documents the user saves, opens and keeps.
 * `session` — one design, autosaved, restored on the next visit. No file, no
 * path, no Save. See ADR-0012.
 */
export type DocumentPersistence =
  | {
      kind: "files";
      save: (request: SaveDesignRequest) => Promise<SaveDesignResult>;
      open: () => Promise<OpenDesignResult>;
    }
  | {
      kind: "session";
      /** The stored design, or `null` when there is none. */
      load: () => string | null;
      store: (json: string) => SessionStoreResult;
      clear: () => void;
      /**
       * Set aside a payload this build cannot read, so a later one may still
       * recover it. Never overwrites an existing backup.
       */
      preserveUnreadable: () => void;
    };

export type SessionStoreResult = { ok: true } | { ok: false; error: string };

export type SettingsStore = {
  load: () => Promise<LoadSettingsResult>;
  save: (json: string) => Promise<SaveSettingsResult>;
};

export type UpdateInfo = { version: string };

export type UpdateCheckResult =
  | { status: "available"; version: string }
  | { status: "manual"; version: string; url: string }
  | { status: "up-to-date" }
  | { status: "error" };

export type UpdateChannel = {
  check: () => Promise<UpdateCheckResult>;
  /** An update that finished downloading before anything subscribed. */
  getPending: () => Promise<UpdateInfo | null>;
  quitAndInstall: () => Promise<void>;
  /** Returns an unsubscribe function. */
  onDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
};

/**
 * The host asks before closing, because only the app knows whether there is
 * unsaved work. `null` where the host cannot ask — a browser tab closes when it
 * closes.
 */
export type CloseGate = {
  /** Subscribe to the host's "may I close?" question. Returns an unsubscribe. */
  onRequested: (callback: () => void) => () => void;
  /** Tell the host it may close now. */
  confirm: () => Promise<void>;
};

export type Platform = {
  /**
   * Space to leave clear of the host's own window controls, in pixels. Zero in
   * a browser, where the page owns none of the chrome around it.
   */
  chrome: { titleBarInset: number; titleBarRightInset: number };
  documents: DocumentPersistence;
  /** `null` where the product has no global settings to persist. */
  settings: SettingsStore | null;
  savePdf: (bytes: Uint8Array, suggestedName: string) => Promise<SavePdfResult>;
  openExternal: (url: string) => void;
  /** `null` where the host cannot update itself. */
  updates: UpdateChannel | null;
  /** `null` where the host cannot ask before closing. */
  closeGate: CloseGate | null;
};

/**
 * Links are opened by the host, so a bad scheme is worth refusing here rather
 * than in each implementation. `javascript:` and `data:` URLs are the reason
 * this exists; the Electron main process already refuses them, and the browser
 * implementation would otherwise hand them straight to `window.open`.
 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
