import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

// Root fallback config: keeps `eslint --fix` (run repo-wide by lint-staged
// on every commit) working for TS files outside apps/frontend, which has
// its own eslint.config.js with React-specific rules. `pnpm -r run lint`
// in CI still uses each package's own lint script (frontend: eslint,
// backend: oxlint), this file is only exercised by the pre-commit hook.
export default defineConfig([
  globalIgnores(["**/dist", "**/build", "**/node_modules", "**/prisma/migrations"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
]);
