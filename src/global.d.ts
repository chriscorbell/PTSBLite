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

export type PTSBuilderApi = {
  platform: NodeJS.Platform;
  titleBarInset: number;
  titleBarRightInset: number;
  saveDesign: (jsonData: string) => Promise<SaveDesignResult>;
  openDesign: () => Promise<OpenDesignResult>;
  exportQuote: (pdfBase64: string) => Promise<ExportQuoteResult>;
  getSettings: () => Promise<GetSettingsResult>;
  setSettings: (jsonData: string) => Promise<SetSettingsResult>;
};

declare global {
  interface Window {
    ptsbuilder?: PTSBuilderApi;
  }
}
