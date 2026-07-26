export type {
  CheckForUpdatesResult,
  ExportQuoteResult,
  GetSettingsResult,
  OpenDesignResult,
  OpenExternalResult,
  PendingUpdate,
  SaveDesignRequest,
  SaveDesignResult,
  SetSettingsResult
} from "@shared/ipc";

import type {
  CheckForUpdatesResult,
  ExportQuoteResult,
  GetSettingsResult,
  OpenDesignResult,
  OpenExternalResult,
  PendingUpdate,
  SaveDesignResult,
  SetSettingsResult
} from "@shared/ipc";

export type PTSBuilderApi = {
  platform: NodeJS.Platform;
  titleBarInset: number;
  titleBarRightInset: number;
  saveDesign: (request: SaveDesignRequest) => Promise<SaveDesignResult>;
  openDesign: () => Promise<OpenDesignResult>;
  exportQuote: (pdfBase64: string) => Promise<ExportQuoteResult>;
  getSettings: () => Promise<GetSettingsResult>;
  setSettings: (jsonData: string) => Promise<SetSettingsResult>;
  openExternal: (url: string) => Promise<OpenExternalResult>;
  checkForUpdates: () => Promise<CheckForUpdatesResult>;
  getPendingUpdate: () => Promise<PendingUpdate | null>;
  quitAndInstall: () => Promise<void>;
  /** Subscribe to main's "may I close?" question; returns an unsubscribe fn. */
  onCloseRequested: (callback: () => void) => () => void;
  /** Tell main the window may close now. */
  confirmClose: () => Promise<void>;
  onUpdateDownloaded: (callback: (info: PendingUpdate) => void) => () => void;
};

declare global {
  interface Window {
    ptsbuilder?: PTSBuilderApi;
  }

  // Injected at build time by Vite `define` (see electron.vite.config.ts).
  const __APP_VERSION__: string;
  const __APP_DESCRIPTION__: string;
  const __GITHUB_URL__: string;
}
