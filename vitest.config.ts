import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "electron/**/*.test.ts"]
  }
});
