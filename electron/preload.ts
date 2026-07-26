import { contextBridge, ipcRenderer } from "electron";
import { windowChromeForPlatform } from "./window-chrome";
import { IPC, type PendingUpdate, type SaveDesignRequest } from "../shared/ipc";

const windowChrome = windowChromeForPlatform(process.platform);

const api = {
  platform: process.platform,
  titleBarInset: windowChrome.titleBarInset,
  titleBarRightInset: windowChrome.titleBarRightInset,
  saveDesign: (request: SaveDesignRequest) => ipcRenderer.invoke(IPC.designSave, request),
  openDesign: () => ipcRenderer.invoke(IPC.designOpen),
  exportQuote: (pdfBase64: string) => ipcRenderer.invoke(IPC.quoteExport, pdfBase64),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (jsonData: string) => ipcRenderer.invoke(IPC.settingsSet, jsonData),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.shellOpenExternal, url),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updateCheck),
  // Any update already downloaded before the renderer attached its listener.
  getPendingUpdate: () => ipcRenderer.invoke(IPC.updateGetPending),
  // Install the downloaded update and relaunch.
  quitAndInstall: () => ipcRenderer.invoke(IPC.updateQuitAndInstall),
  // Subscribe to "update finished downloading" pushes; returns an unsubscribe fn.
  onUpdateDownloaded: (callback: (info: PendingUpdate) => void) => {
    const listener = (_event: unknown, info: PendingUpdate) => callback(info);
    ipcRenderer.on(IPC.updateDownloaded, listener);
    return () => ipcRenderer.removeListener(IPC.updateDownloaded, listener);
  }
};

contextBridge.exposeInMainWorld("ptsbuilder", api);

export type PTSBuilderApi = typeof api;
