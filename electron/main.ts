import { app, BrowserWindow, dialog, ipcMain, nativeImage } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { autoUpdater } from "electron-updater";
import { windowChromeForPlatform } from "./window-chrome";

// App icons live under <project>/build/ (icon.ico / icon.icns / icon.png).
// getAppPath() resolves to the project root in dev and the app dir when packaged.
const iconFile = (name: string) => join(app.getAppPath(), "build", name);
// Windows prefers the multi-size .ico for the taskbar/title bar; Linux uses PNG.
// (macOS ignores BrowserWindow.icon and uses the dock icon / packaged .icns.)
const WINDOW_ICON = process.platform === "win32" ? iconFile("icon.ico") : iconFile("icon.png");

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

// Drives the macOS menu-bar name, app switcher, About panel, and default window
// title. Without this an unpackaged dev run reports the binary's name ("Electron").
app.setName("PTSBuilder");

// Global app settings (pricing, tax, quote defaults) persist machine-wide, not in
// any single design file. They live alongside Electron's other per-user app data.
const settingsFilePath = () => join(app.getPath("userData"), "settings.json");

function timestampedFilename(ext: string, date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `ptsbuilder_${stamp}.${ext}`;
}

// Self-update via GitHub releases (electron-updater reads the publish config
// baked into app-update.yml at build time). Only wired for platforms where it
// works without a paid code-signing certificate:
//   - Windows (NSIS): updates apply unsigned; SmartScreen only warns on the
//     first manual download, not on app-delivered updates.
//   - Linux AppImage: self-updates in place. Flatpak (sandboxed, managed by
//     flathub) and any non-AppImage launch are skipped.
//   - macOS: skipped — Squirrel.Mac requires a Developer ID signature.
function autoUpdateSupported(): boolean {
  if (isDev || !app.isPackaged) return false;
  if (process.platform === "darwin") return false;
  if (process.platform === "linux" && !process.env.APPIMAGE) return false;
  return true;
}

function initAutoUpdate(): void {
  if (!autoUpdateSupported()) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", (info) => {
    const promptRestart = async () => {
      const win = BrowserWindow.getAllWindows()[0];
      const options = {
        type: "info" as const,
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Update ready",
        message: `PTSBuilder ${info.version} has been downloaded.`,
        detail: "Restart to finish installing. The update will also apply automatically next time you quit."
      };
      const { response } = win
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options);
      if (response === 0) autoUpdater.quitAndInstall();
    };
    void promptRestart();
  });

  autoUpdater.on("error", (err) => {
    // Never surface update failures to the user; just log for diagnostics.
    console.error("[auto-update] error:", err == null ? "unknown" : (err.stack ?? err).toString());
  });

  // autoDownload handles fetching; we prompt on `update-downloaded`. Failures
  // (offline, no release yet) are non-fatal.
  autoUpdater.checkForUpdates().catch((err) => {
    console.error("[auto-update] check failed:", err);
  });
}

function createWindow(): void {
  const {
    titleBarInset: _titleBarInset,
    titleBarRightInset: _titleBarRightInset,
    ...windowChrome
  } = windowChromeForPlatform(process.platform);
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    title: "PTSBuilder",
    icon: WINDOW_ICON,
    backgroundColor: "#161A21",
    show: false,
    ...windowChrome,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Keep the OS window title fixed; ignore the renderer document's <title>.
  mainWindow.on("page-title-updated", (event) => event.preventDefault());

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("design:save", async (_event, jsonData: string) => {
    const result = await dialog.showSaveDialog({
      title: "Save PTSBuilder Design",
      defaultPath: timestampedFilename("json"),
      filters: [{ name: "PTSBuilder Design", extensions: ["json"] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true, filePath: null };
    }

    try {
      await writeFile(result.filePath, jsonData, "utf-8");
      return { canceled: false, filePath: result.filePath };
    } catch (err) {
      return { canceled: false, filePath: null, error: String(err) };
    }
  });

  ipcMain.handle("design:open", async () => {
    const result = await dialog.showOpenDialog({
      title: "Open PTSBuilder Design",
      properties: ["openFile"],
      filters: [{ name: "PTSBuilder Design", extensions: ["json"] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, filePath: null, contents: null };
    }

    const filePath = result.filePaths[0];
    try {
      const contents = await readFile(filePath, "utf-8");
      return { canceled: false, filePath, contents };
    } catch (err) {
      return { canceled: false, filePath, contents: null, error: String(err) };
    }
  });

  ipcMain.handle("settings:get", async () => {
    try {
      const contents = await readFile(settingsFilePath(), "utf-8");
      return { data: JSON.parse(contents) as unknown };
    } catch (err) {
      // Missing file on first run is expected — report no data, not an error.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { data: null };
      }
      return { data: null, error: String(err) };
    }
  });

  ipcMain.handle("settings:set", async (_event, jsonData: string) => {
    try {
      await writeFile(settingsFilePath(), jsonData, "utf-8");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("quote:export", async (_event, pdfBase64: string) => {
    const result = await dialog.showSaveDialog({
      title: "Export PDF Quote",
      defaultPath: timestampedFilename("pdf"),
      filters: [{ name: "PDF Quote", extensions: ["pdf"] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true, filePath: null };
    }

    try {
      const buffer = Buffer.from(pdfBase64, "base64");
      await writeFile(result.filePath, buffer);
      return { canceled: false, filePath: result.filePath };
    } catch (err) {
      return { canceled: false, filePath: null, error: String(err) };
    }
  });

  // macOS ignores BrowserWindow.icon; set the dock icon explicitly (mainly so the
  // unpackaged dev run shows our icon instead of the default Electron one).
  if (process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(iconFile("icon.png"));
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }

  createWindow();
  initAutoUpdate();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
