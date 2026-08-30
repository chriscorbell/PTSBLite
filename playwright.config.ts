import { defineConfig } from "@playwright/test";

// The smoke suite runs against the production build — the same artifact the
// deploy ships — because that is what the manual "check it in a real browser"
// step in CLAUDE.md was guarding. CI builds in its own step, so the server
// command skips the rebuild there.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure"
  },
  webServer: {
    command: process.env.CI
      ? "pnpm run preview --port 4173 --strictPort"
      : "pnpm run build && pnpm run preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
