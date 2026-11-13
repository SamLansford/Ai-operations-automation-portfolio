import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "website.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: ".local-reports/browser.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:4174",
    env: { PORT: "4174" },
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },

  ],
});
