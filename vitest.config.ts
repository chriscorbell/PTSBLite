import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// The renderer reads package metadata through build-time defines that
// electron.vite.config.ts injects. Component tests load those modules for real,
// so the same values have to exist here — sourced from package.json rather than
// duplicated, so the two configs cannot drift.
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as {
  version: string;
  description: string;
  repository: { url: string };
};

// Two projects so the domain suite keeps running in a bare Node environment (it
// is pure logic and there are ~200 of them, so the DOM would be dead weight),
// while component tests get happy-dom. Split by extension: .test.ts is domain,
// .test.tsx is UI.
//
// `src/platform/` is the exception and has to be named explicitly. It is not
// domain logic and it renders nothing, but it is the layer that talks to the
// browser — localStorage, Blob, object URLs — so its tests need a DOM despite
// having no JSX in them.
const PLATFORM_TESTS = "src/platform/**/*.test.ts";
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "shared")
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DESCRIPTION__: JSON.stringify(pkg.description),
    __GITHUB_URL__: JSON.stringify(pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, ""))
  },
  test: {
    globals: false,
    projects: [
      {
        extends: true,
        test: {
          name: "domain",
          environment: "node",
          include: ["src/**/*.test.ts", "electron/**/*.test.ts"],
          exclude: [PLATFORM_TESTS]
        }
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "happy-dom",
          include: ["src/**/*.test.tsx", PLATFORM_TESTS],
          setupFiles: ["./src/test/setup.ts"]
        }
      }
    ]
  }
});
