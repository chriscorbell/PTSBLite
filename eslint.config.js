import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },

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

  // Browser app globals plus the build-time defines from vite.config.
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
      // Errors, not warnings. These were temporarily downgraded while #20
      // introduced the linter, because the seven violations they found all
      // needed behaviour changes. #29 fixed every one, so they gate now.
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/refs": "error",
      "react-hooks/exhaustive-deps": "error"
    }
  },

  // Build config runs in Node.
  {
    files: ["*.config.ts", "*.config.js"],
    languageOptions: { globals: globals.node }
  },

  {
    rules: {
      // Prefix deliberately unused bindings with an underscore.
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
