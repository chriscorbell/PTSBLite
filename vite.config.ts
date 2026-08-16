import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// PTSBuilderLite is the repository's only application and deployment target.

const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as {
  version: string;
  description: string;
  repository: { url: string };
};
const repoUrl = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

/**
 * What this build calls itself.
 *
 * The commit identifies the exact static build that is deployed. Cloudflare
 * Pages supplies `CF_PAGES_COMMIT_SHA`; a local build falls back to git, and a
 * build with neither says so rather than inventing a number.
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
      "@": resolve(__dirname, "src")
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(buildId()),
    __APP_DESCRIPTION__: JSON.stringify(pkg.description),
    __GITHUB_URL__: JSON.stringify(repoUrl)
  },
  build: {
    outDir: "dist-lite",
    emptyOutDir: true
  },
  plugins: [react(), noCommercialCode()]
});

/**
 * Fail the build if commercial code reaches the public marketing app.
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
  const FORBIDDEN = [{ pattern: "/commercial/", why: "pricing or quote functionality" }];
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
          "PTSBuilderLite must contain no commercial code, but these " +
            `modules reached the bundle:\n${offenders.join("\n")}\n` +
            "See ADR-0011. Something on the app's import graph pulled them in."
        );
      }
    }
  };
}
