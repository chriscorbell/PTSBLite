import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import type { Plugin } from "vite";
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
    plugins: [react(), contentSecurityPolicy()]
  }
});

/**
 * Inject a Content-Security-Policy into the built renderer.
 *
 * Build only. The dev server needs inline scripts and a websocket for HMR, and
 * weakening the policy enough to allow those would mean shipping a policy that
 * permits what it is meant to forbid. The packaged app is what needs locking
 * down, and it loads everything from disk.
 *
 * `style-src` allows inline styles because several components render `<style>`
 * blocks and the whole UI is written with inline `style` props. `img-src` allows
 * `data:` for the canvas-generated label textures in the 3D viewport.
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // The renderer talks to the main process over IPC, never over the network.
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join("; ");

  return {
    name: "ptsbuilder:csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "</title>",
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`
      );
    }
  };
}
