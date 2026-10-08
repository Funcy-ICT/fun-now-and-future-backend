import js from "@eslint/js";
import globals from "globals";
import path from "node:path";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import tailwind from "eslint-plugin-tailwindcss";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      tailwindcss: tailwind,
    },
    rules: {
      ...tailwind.configs.recommended.rules,
    },
    settings: {
      tailwindcss: {
        cssConfigPath: path.resolve(import.meta.dirname, "src/index.css"),
      },
    },
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
]);
