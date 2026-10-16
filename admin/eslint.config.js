import js from "@eslint/js";
import globals from "globals";
import path from "node:path";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import { defineConfig, globalIgnores } from "eslint/config";

// 余白に使える段階(0, 4, 8, 16, 24, 32px)。@themeで絞るとherouiの部品が崩れるので、lintで絞る(ADR 0005)
const spacingSteps = ["0", "1", "2", "4", "6", "8"];
// 余白のクラス(p, px, mt, gap-x, space-yなど)
const spacingUtilities = "p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            {
              // p-[19px]など。data-[state=open]:のようなvariantの[]は対象外
              pattern: "\\[[^\\]]*\\](?!:)",
              message: "任意の値は使わない(ADR 0005)",
            },
            {
              pattern: `^(?:.*:)?!?-?(?:${spacingUtilities})-(?!(?:${spacingSteps.join("|")})!?$)\\d+(?:\\.\\d+)?!?$`,
              message: `余白の段階は${spacingSteps.join(", ")}だけを使う(ADR 0005)`,
            },
          ],
        },
      ],
    },
    settings: {
      "better-tailwindcss": {
        entryPoint: path.resolve(import.meta.dirname, "src/index.css"),
      },
    },
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      betterTailwindcss.configs.correctness,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
]);
