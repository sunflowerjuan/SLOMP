import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        // No type-aware rules run here (tseslint.configs.recommended, not
        // recommendedTypeChecked), so no tsconfig is ever needed. Without
        // an explicit tsconfigRootDir, @typescript-eslint/parser
        // auto-detects one per file and errors ("multiple candidate
        // TSConfigRootDirs") as soon as a single eslint run (lint-staged,
        // on every commit) touches files under both apps/frontend and
        // apps/backend, since each resolves to a different tsconfig.json.
        projectService: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
])
