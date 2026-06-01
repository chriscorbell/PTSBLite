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
  checkForUpdates: () => ipcRenderer.invoke("update:check")
};

contextBridge.exposeInMainWorld("ptsbuilder", api);

export type PTSBuilderApi = typeof api;
