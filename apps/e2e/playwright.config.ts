import { defineConfig } from "@playwright/test";
import { baseUrl } from "./src/env";

export default defineConfig({
  testDir: "./tests",
  // Pure unit tests: run by `pnpm --filter e2e test:unit`, no servers needed.
  testIgnore: "guard.spec.ts",
  globalSetup: "./src/global-setup.ts",
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: baseUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
