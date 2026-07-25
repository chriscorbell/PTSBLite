import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from "electron";
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

// Set once electron-updater finishes downloading an update. The renderer draws
// the on-brand "update ready" prompt; we stash the version here because the
// download can finish before the renderer mounts its listener (the renderer
// also queries `update:get-pending` on startup to catch that race).
let pendingUpdate: { version: string } | null = null;

function initAutoUpdate(): void {
  if (!autoUpdateSupported()) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", (info) => {
    pendingUpdate = { version: info.version };
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("update:downloaded", pendingUpdate);
    }
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

// Where users on platforms without self-update (macOS, non-AppImage Linux) can
// grab a fresh build by hand. /releases/latest skips drafts and prereleases,
// matching electron-builder's `releaseType: release`.
const RELEASES_LATEST_URL = "https://github.com/chriscorbell/PTSBuilder/releases/latest";
const LATEST_RELEASE_API = "https://api.github.com/repos/chriscorbell/PTSBuilder/releases/latest";

// Compare x.y.z versions numerically; pre-release suffixes are ignored. Returns
// true when `latest` is strictly ahead of `current`.
function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

// Fetch the latest published release tag from the GitHub API (no auth needed for
// a public repo). Throws on network/HTTP failure so callers can report an error.
async function latestPublishedVersion(): Promise<string> {
  const res = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "PTSBuilder" }
  });
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
  const data = (await res.json()) as { tag_name?: string };
  if (!data.tag_name) throw new Error("latest release has no tag_name");
  return data.tag_name.replace(/^v/, "");
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
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
}

void app.whenReady().then(() => {
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

  // Open a URL in the user's default browser. Only http(s) links are honored so
  // a compromised renderer can't ask the OS to launch arbitrary schemes.
  ipcMain.handle("shell:open-external", async (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, error: `Refusing to open non-web URL: ${parsed.protocol}` };
      }
      await shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Renderer asks on mount whether an update already finished downloading
  // before its `update:downloaded` listener was attached.
  ipcMain.handle("update:get-pending", () => pendingUpdate);

  // Renderer's "Restart now" button: install the downloaded update and relaunch.
  // Args are (isSilent, isForceRunAfter): silent because our NSIS installer is
  // one-click/per-user (no prompts), and force-run so the app reopens after the
  // unattended install.
  ipcMain.handle("update:quit-and-install", () => {
    autoUpdater.quitAndInstall(true, true);
  });

  // Manual "Check for Updates" trigger from the About modal.
  ipcMain.handle("update:check", async () => {
    // Platforms without self-update (macOS, non-AppImage Linux): ask GitHub
    // directly and, if a newer release exists, point the user at the download
    // page so they can update by hand.
    if (!autoUpdateSupported()) {
      try {
        const latest = await latestPublishedVersion();
        if (isNewerVersion(latest, app.getVersion())) {
          return { status: "manual" as const, version: latest, url: RELEASES_LATEST_URL };
        }
        return { status: "up-to-date" as const };
      } catch (err) {
        console.error("[auto-update] manual GitHub check failed:", err);
        return { status: "error" as const };
      }
    }

    // Supported platforms: a found update auto-downloads and the
    // `update-downloaded` listener prompts the restart.
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.isUpdateAvailable) {
        return { status: "available" as const, version: result.updateInfo.version };
      }
      return { status: "up-to-date" as const };
    } catch (err) {
      console.error("[auto-update] manual check failed:", err);
      return { status: "error" as const };
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
