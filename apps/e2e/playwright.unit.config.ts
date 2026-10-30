import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["guard.spec.ts", "downloads.spec.ts"],
});
