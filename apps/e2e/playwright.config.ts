import { defineConfig } from "@playwright/test";
import { baseUrl } from "./src/env";

export default defineConfig({
  testDir: "./tests",
  // Pure unit tests: run by `pnpm --filter e2e test:unit`, no servers needed.
  testIgnore: ["guard.spec.ts", "downloads.spec.ts"],
  globalSetup: "./src/global-setup.ts",
  // One worker, files in name order: every file shares the e2e-prueba
  // municipality (and the public consultation limit), so they run one at a time.
  workers: 1,
  fullyParallel: false,
  // No retries: SL-166 asks for runs that pass on their own, so a flaky
  // test has to show up as a failure.
  retries: 0,
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
