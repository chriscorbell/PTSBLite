import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

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
    build: {
      rollupOptions: {
        input: resolve(__dirname, "index.html")
      }
    },
    plugins: [react()]
  }
});
