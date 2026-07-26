/**
 * The contract between the Electron main process and the renderer.
 *
 * Both sides import this, which is the point. The channel names were eleven
 * string literals written out twice — once in `main.ts`, once in `preload.ts` —
 * with nothing checking that the two spellings matched. The result shapes were
 * worse: `main.ts` returned object literals and the renderer declared what it
 * expected to receive, and no type connected the two, so a handler could change
 * its return shape and only a runtime `undefined` would say so.
 *
 * Kept deliberately small: channel names, the payloads that cross them, and
 * nothing else. This is a contract, not a framework.
 */

export const IPC = {
  designSave: "design:save",
  designOpen: "design:open",
  quoteExport: "quote:export",
  settingsGet: "settings:get",
  settingsSet: "settings:set",
  shellOpenExternal: "shell:open-external",
  updateCheck: "update:check",
  updateGetPending: "update:get-pending",
  updateQuitAndInstall: "update:quit-and-install",
  /** Main → renderer push, not an invoke. */
  updateDownloaded: "update:downloaded"
} as const;

export type SaveDesignResult = {
  canceled: boolean;
  filePath: string | null;
  error?: string;
};

/**
 * Where a save should go. Omitting `filePath` prompts, which is what Save As
 * and a first save do; supplying one writes straight there, which is what Save
 * does once the document has a home.
 */
export type SaveDesignRequest = {
  json: string;
  filePath?: string | null;
};

export type OpenDesignResult = {
  canceled: boolean;
  filePath: string | null;
  contents: string | null;
  error?: string;
};

export type ExportQuoteResult = {
  canceled: boolean;
  filePath: string | null;
  error?: string;
};

export type GetSettingsResult = {
  data: unknown;
  error?: string;
};

export type SetSettingsResult = {
  ok: boolean;
  error?: string;
};

export type OpenExternalResult = {
  ok: boolean;
  error?: string;
};

export type CheckForUpdatesResult =
  // Self-updating platform: a newer build is downloading in the background.
  | { status: "available"; version: string }
  // Platform without self-update: a newer build exists; download it by hand.
  | { status: "manual"; version: string; url: string }
  | { status: "up-to-date" }
  | { status: "error" };

export type PendingUpdate = {
  version: string;
};

/**
 * What each invoke channel resolves to. `main.ts` types its handlers against
 * this, so a handler that stops matching its declared result is a compile
 * error rather than a surprise in the renderer.
 */
export type IpcResults = {
  [IPC.designSave]: SaveDesignResult;
  [IPC.designOpen]: OpenDesignResult;
  [IPC.quoteExport]: ExportQuoteResult;
  [IPC.settingsGet]: GetSettingsResult;
  [IPC.settingsSet]: SetSettingsResult;
  [IPC.shellOpenExternal]: OpenExternalResult;
  [IPC.updateCheck]: CheckForUpdatesResult;
  [IPC.updateGetPending]: PendingUpdate | null;
  [IPC.updateQuitAndInstall]: void;
};
