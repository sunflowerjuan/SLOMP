import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      // Every source file counts, not only the ones a test imports: deleting a
      // test must lower the numbers instead of dropping its module from them.
      include: ['src/**/*.ts'],
      // Measured on 2026-10-27 (statements 83.11, branches 76.75, functions
      // 84.42, lines 83.83), rounded down minus 2 points (SL-168). Only
      // `test:cov` enforces them.
      thresholds: {
        statements: 81,
        branches: 74,
        functions: 82,
        lines: 81,
      },
    },
  },
});
