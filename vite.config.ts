import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
  plugins: [react()]
});
