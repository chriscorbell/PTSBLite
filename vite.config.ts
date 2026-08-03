import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// PTSBuilderLite: the browser build. PTSBuilder's Electron build is configured
// separately in electron.vite.config.ts; the two share `src/` but not an entry
// point, and nothing reachable from this one is commercial.

const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as {
  version: string;
  description: string;
  repository: { url: string };
};
const repoUrl = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

/**
 * What this build calls itself.
 *
 * Not `package.json`'s version. That only moves when a desktop release tag is
 * cut, and desktop releases are paused while Lite deploys on every push to
 * `main` — so it would name a build from weeks ago. The commit is the only
 * thing that identifies what is actually deployed. Cloudflare Pages supplies
 * `CF_PAGES_COMMIT_SHA`; a local build falls back to git, and a build with
 * neither says so rather than inventing a number.
 */
function buildId(): string {
  const fromPages = process.env.CF_PAGES_COMMIT_SHA;
  if (fromPages) return fromPages.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  root: ".",
  publicDir: resolve(__dirname, "web-public"),
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "shared")
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(buildId()),
    __APP_DESCRIPTION__: JSON.stringify(pkg.description),
    __GITHUB_URL__: JSON.stringify(repoUrl)
  },
  build: {
    outDir: "dist-lite",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "index-lite.html")
    }
  },
  plugins: [react(), noCommercialCode(), emitAsIndexHtml()]
});

/**
 * Fail the build if anything commercial or Electron-only reaches the bundle.
 *
 * This is the enforcement behind ADR-0011. PTSBuilderLite must be unable to
 * show a price, and the guarantee is that the modules which know what a price
 * is are not in the artifact — checked against the module graph Rollup actually
 * emitted, not against what the source appears to import.
 *
 * A string search of the built output was considered and rejected: minification
 * removes the module names, `$` occurs in unrelated dependency code, and a
 * computed currency string would evade it.
 */
function noCommercialCode(): Plugin {
  const FORBIDDEN = [
    { pattern: "/commercial/", why: "prices, quote readiness and the quote PDF" },
    { pattern: "/platform/electron", why: "the Electron preload bridge" }
  ];
  return {
    name: "ptsbuilder:no-commercial-code",
    apply: "build",
    generateBundle() {
      const offenders: string[] = [];
      for (const id of this.getModuleIds()) {
        const normalized = id.replace(/\\/g, "/");
        for (const { pattern, why } of FORBIDDEN) {
          if (normalized.includes(pattern)) {
            offenders.push(`  ${normalized.replace(resolve(__dirname), "")}  (${why})`);
          }
        }
      }
      if (offenders.length > 0) {
        this.error(
          "PTSBuilderLite must contain no commercial or Electron code, but these " +
            `modules reached the bundle:\n${offenders.join("\n")}\n` +
            "See ADR-0011. Something on the Lite entry's import graph pulled them in."
        );
      }
    }
  };
}

/**
 * Emit `index-lite.html` as `index.html`.
 *
 * The entry has to be named distinctly in the repository root so it does not
 * collide with Electron's `index.html`, but a static host needs to serve it as
 * the directory index.
 */
function emitAsIndexHtml(): Plugin {
  return {
    name: "ptsbuilder:emit-as-index",
    apply: "build",
    // Renamed in the bundle rather than on disk afterwards. A `closeBundle`
    // hook doing `renameSync` still runs when an earlier hook has failed the
    // build, and its ENOENT then buries the error that actually mattered.
    //
    // `order: "post"` because Vite's own html plugin emits the document in
    // `generateBundle` as well, and without it this runs first and finds
    // nothing to rename.
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const entry = Object.keys(bundle).find((name) => name.endsWith("index-lite.html"));
        if (!entry) return;
        const asset = bundle[entry];
        asset.fileName = "index.html";
        bundle["index.html"] = asset;
        delete bundle[entry];
      }
    }
  };
}
