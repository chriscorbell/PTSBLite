import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// Surface package metadata to the renderer (shown in the About modal) so we have
// a single source of truth instead of hand-maintained constants.
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as {
  version: string;
  description: string;
  repository: { url: string };
};
// Normalize the npm repository URL (may carry a `git+` prefix / `.git` suffix)
// into a plain browsable https URL.
const repoUrl = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "electron/main.ts"),
        formats: ["cjs"]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "electron/preload.ts"),
        formats: ["cjs"]
      }
    }
  },
  renderer: {
    root: ".",
    resolve: {
      alias: {
        "@": resolve(__dirname, "src")
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_DESCRIPTION__: JSON.stringify(pkg.description),
      __GITHUB_URL__: JSON.stringify(repoUrl)
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "index.html")
      }
    },
    plugins: [react()]
  }
});
