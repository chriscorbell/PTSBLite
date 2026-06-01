import { contextBridge, ipcRenderer } from "electron";
import { windowChromeForPlatform } from "./window-chrome";

const windowChrome = windowChromeForPlatform(process.platform);

const api = {
  platform: process.platform,
  titleBarInset: windowChrome.titleBarInset,
  titleBarRightInset: windowChrome.titleBarRightInset,
  saveDesign: (jsonData: string) => ipcRenderer.invoke("design:save", jsonData),
  openDesign: () => ipcRenderer.invoke("design:open"),
  exportQuote: (pdfBase64: string) => ipcRenderer.invoke("quote:export", pdfBase64),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (jsonData: string) => ipcRenderer.invoke("settings:set", jsonData),
  openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  // Any update already downloaded before the renderer attached its listener.
  getPendingUpdate: () => ipcRenderer.invoke("update:get-pending"),
  // Install the downloaded update and relaunch.
  quitAndInstall: () => ipcRenderer.invoke("update:quit-and-install"),
  // Subscribe to "update finished downloading" pushes; returns an unsubscribe fn.
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const listener = (_event: unknown, info: { version: string }) => callback(info);
    ipcRenderer.on("update:downloaded", listener);
    return () => ipcRenderer.removeListener("update:downloaded", listener);
  }
};

contextBridge.exposeInMainWorld("ptsbuilder", api);

export type PTSBuilderApi = typeof api;
