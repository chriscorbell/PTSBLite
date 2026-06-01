export type SaveDesignResult = {
  canceled: boolean;
  filePath: string | null;
  error?: string;
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

export type PTSBuilderApi = {
  platform: NodeJS.Platform;
  titleBarInset: number;
  titleBarRightInset: number;
  saveDesign: (jsonData: string) => Promise<SaveDesignResult>;
  openDesign: () => Promise<OpenDesignResult>;
  exportQuote: (pdfBase64: string) => Promise<ExportQuoteResult>;
  getSettings: () => Promise<GetSettingsResult>;
  setSettings: (jsonData: string) => Promise<SetSettingsResult>;
  openExternal: (url: string) => Promise<OpenExternalResult>;
  checkForUpdates: () => Promise<CheckForUpdatesResult>;
  getPendingUpdate: () => Promise<PendingUpdate | null>;
  quitAndInstall: () => Promise<void>;
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
