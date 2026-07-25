import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["out/**", "dist/**", "release/**", "node_modules/**"] },

  js.configs.recommended,
  // Type-aware rules: worth the slower run here because the interesting bugs in
  // this codebase (unawaited IPC promises, unsafe casts around Three.js objects)
  // are only visible with type information.
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },

  // Renderer: browser globals plus the build-time defines from electron.vite.config.
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        __APP_VERSION__: "readonly",
        __APP_DESCRIPTION__: "readonly",
        __GITHUB_URL__: "readonly"
      }
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Warnings, not errors, on purpose. These three flag real design problems
      // in App.tsx, StatusBar.tsx and Viewport.tsx, but every fix is a behaviour
      // change that deserves its own review rather than being smuggled into the
      // commit that introduced the linter. Tracked in #29 — promote to "error"
      // once that lands.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/exhaustive-deps": "warn"
    }
  },

  // Main process, preload, and build config all run in Node.
  {
    files: ["electron/**/*.ts", "*.config.ts", "*.config.js"],
    languageOptions: { globals: globals.node }
  },

  {
    rules: {
      // Match the existing convention of prefixing deliberately unused bindings
      // with an underscore (see the destructuring in electron/main.ts).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }
      ]
    }
  },

  // Config files are not part of the app's type-checked program.
  {
    files: ["*.config.js"],
    extends: [tseslint.configs.disableTypeChecked]
  }
);
